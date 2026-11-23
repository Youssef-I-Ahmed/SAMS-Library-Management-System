import httpx
import pytest

from src.rag.llm import AnthropicProvider, GeminiProvider, LLMError, OpenAICompatProvider, get_provider
from tests.conftest import make_settings


def mk(cls, handler, retries=0, key="SECRET-KEY"):
    return cls("m-1", key, "", 5, retries, httpx.MockTransport(handler))


def test_gemini_request_shape_and_parse():
    seen = {}

    def h(req: httpx.Request):
        seen["url"], seen["headers"], seen["body"] = str(req.url), req.headers, req.read()
        return httpx.Response(200, json={"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": "answer [R1]"}]}]})
    r = mk(GeminiProvider, h).generate("sys", "user")
    assert r.text == "answer [R1]" and r.provider == "gemini"
    assert "SECRET-KEY" not in seen["url"] and seen["headers"]["x-goog-api-key"] == "SECRET-KEY"   # key only in header
    assert str(seen["url"]).endswith("/v1beta/interactions")
    assert b"system_instruction" in seen["body"] and b"store" in seen["body"] and b"false" in seen["body"]


def test_openai_compatible_and_anthropic_parse():
    ok = mk(OpenAICompatProvider, lambda r: httpx.Response(200, json={"choices": [{"message": {"content": " hi "}}]})).generate("s", "u")
    assert ok.text == "hi"
    an = mk(AnthropicProvider, lambda r: httpx.Response(200, json={"content": [{"type": "text", "text": "yo"}]})).generate("s", "u")
    assert an.text == "yo"


@pytest.mark.parametrize("status,kind", [(429, "rate_limit"), (401, "auth"), (403, "auth"), (500, "provider"), (400, "provider"), (404, "model_not_found")])
def test_http_errors_map_to_typed_errors(status, kind):
    with pytest.raises(LLMError) as e:
        mk(OpenAICompatProvider, lambda r: httpx.Response(status, json={})).generate("s", "u")
    assert e.value.kind == kind


def test_timeout_and_network_errors():
    def boom(req):
        raise httpx.ReadTimeout("slow")
    with pytest.raises(LLMError) as e:
        mk(OpenAICompatProvider, boom).generate("s", "u")
    assert e.value.kind == "timeout"

    def net(req):
        raise httpx.ConnectError("down")
    with pytest.raises(LLMError) as e:
        mk(OpenAICompatProvider, net).generate("s", "u")
    assert e.value.kind == "provider"


def test_retries_on_rate_limit_then_succeeds_but_not_on_auth(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    calls = {"n": 0}

    def flaky(req):
        calls["n"] += 1
        return httpx.Response(429) if calls["n"] < 3 else httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})
    assert mk(OpenAICompatProvider, flaky, retries=2).generate("s", "u").text == "ok" and calls["n"] == 3
    calls["n"] = 0

    def auth(req):
        calls["n"] += 1
        return httpx.Response(401)
    with pytest.raises(LLMError):
        mk(OpenAICompatProvider, auth, retries=3).generate("s", "u")
    assert calls["n"] == 1


@pytest.mark.parametrize("resp", [
    httpx.Response(200, text="<html>not json</html>"),
    httpx.Response(200, json={"unexpected": 1}),
    httpx.Response(200, json={"choices": [{"message": {"content": "   "}}]}),
])
def test_malformed_or_empty_responses(resp):
    with pytest.raises(LLMError) as e:
        mk(OpenAICompatProvider, lambda r: resp).generate("s", "u")
    assert e.value.kind == "malformed"


def test_gemini_blocked_prompt():
    with pytest.raises(LLMError) as e:
        mk(GeminiProvider, lambda r: httpx.Response(200, json={"status": "failed", "error": {"message": "safety blocked"}})).generate("s", "u")
    assert e.value.kind == "blocked"


def test_not_configured_and_factory(tmp_path):
    with pytest.raises(LLMError) as e:
        GeminiProvider("m", "", "", 5, 0).generate("s", "u")
    assert e.value.kind == "not_configured"
    with pytest.raises(LLMError):
        GeminiProvider("", "k", "", 5, 0).generate("s", "u")
    assert get_provider(make_settings(tmp_path)) is None
    p = get_provider(make_settings(tmp_path, llm_provider="anthropic", llm_model="x", llm_api_key="k"))
    assert isinstance(p, AnthropicProvider)
    assert "topsecret" not in repr(make_settings(tmp_path, llm_api_key="topsecret"))          # secrets are not in repr/logs


def test_gemini_bad_key_reported_as_400_maps_to_auth_and_is_not_retried():
    calls = []
    def h(r):
        calls.append(1)
        return httpx.Response(400, json={"error": {"status": "INVALID_ARGUMENT", "message": "API key not valid. Please pass a valid API key."}})
    with pytest.raises(LLMError) as e:
        mk(GeminiProvider, h, retries=2).generate("s", "u")
    assert e.value.kind == "auth" and len(calls) == 1 and "SECRET-KEY" not in str(e.value)


def test_unknown_gemini_model_is_not_retried_and_has_actionable_hint():
    from src.rag.llm import llm_hint
    calls = []
    def h(r):
        calls.append(1)
        return httpx.Response(404, json={"error": {"message": "models/x is not found"}})
    with pytest.raises(LLMError) as e:
        mk(GeminiProvider, h, retries=2).generate("s", "u")
    assert e.value.kind == "model_not_found" and len(calls) == 1 and "LLM_MODEL" in llm_hint(e.value.kind)


def test_gemini_auto_model_picks_interactions_flash_and_uses_it():
    models = {"models": [
        {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-3.8-flash", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-3.8-flash-lite-tts", "supportedGenerationMethods": ["generateContent"]},
    ]}
    seen = []
    def h(r):
        seen.append(str(r.url))
        if r.url.path.endswith("/models"):
            return httpx.Response(200, json=models)
        return httpx.Response(200, json={"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": "ok"}]}]})
    p = GeminiProvider("auto", "SECRET-KEY", "", 5, 0, httpx.MockTransport(h))
    assert p.generate("s", "u").text == "ok" and p.model == "gemini-3.8-flash"
    assert any(u.endswith("/v1beta/interactions") for u in seen)


def test_gemini_auto_model_errors_are_typed():
    mk_t = lambda h: GeminiProvider("auto", "SECRET-KEY", "", 5, 0, httpx.MockTransport(h))
    with pytest.raises(LLMError) as e:
        mk_t(lambda r: httpx.Response(400, json={"error": {"message": "API key not valid"}})).generate("s", "u")
    assert e.value.kind == "auth"
    with pytest.raises(LLMError) as e:
        mk_t(lambda r: httpx.Response(200, json={"models": [{"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]}]})).generate("s", "u")
    assert e.value.kind == "model_not_found"
