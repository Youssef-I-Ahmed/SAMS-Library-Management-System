"""Ollama (free local models) integration tests against a SIMULATED Ollama server that implements the documented
/api/embed and /api/chat request/response shapes. It is NOT a real model: it proves our client code, configuration, fallbacks
and pipeline wiring, not model quality. The real run is `python scripts/free_local_check.py` on a machine with Ollama."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from src.rag.llm import LLMError, OllamaProvider, get_provider
from src.retrieval.embeddings import HashingEmbedder, OllamaEmbedder, describe_embedder, get_embedder, is_neural
from src.service import build_services
from tests.conftest import make_settings
from tests.integration.test_neural_pipeline import ConceptEmbedder

SEEN: list[dict] = []


class FakeOllama(BaseHTTPRequestHandler):
    models = {"bge-m3"}
    chat_reply = "إجابة تجريبية [R1]"
    concept = ConceptEmbedder()

    def log_message(self, *a):  # silence
        pass

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        SEEN.append({"path": self.path, "auth": self.headers.get("authorization"), "body": body})
        if self.path == "/api/embed":
            if body["model"] not in self.models:
                return self._send(404, {"error": f"model '{body['model']}' not found, try pulling it first"})
            return self._send(200, {"model": body["model"], "embeddings": [self.concept._enc(t).tolist() for t in body["input"]]})
        if self.path == "/api/chat":
            if body["model"] not in self.models | {"qwen2.5"}:
                return self._send(404, {"error": "model not found"})
            return self._send(200, {"model": body["model"], "message": {"role": "assistant", "content": self.chat_reply}, "done": True})
        self._send(404, {})


@pytest.fixture()
def ollama():
    SEEN.clear()
    srv = HTTPServer(("127.0.0.1", 0), FakeOllama)
    t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_ollama_embedder_protocol_and_flags(ollama):
    e = OllamaEmbedder("bge-m3", ollama)
    assert e.model_id == "ollama:bge-m3" and is_neural(e) and e.dim == ConceptEmbedder.dim
    v = e.encode_passages(["البنوك", "banks", "x"])
    assert v.shape == (3, e.dim) and abs(float(v[0] @ v[1]) - 1.0) < 1e-5          # same concept AR/EN (simulated)
    d = describe_embedder(e)
    assert d["semantic"] and d["active_backend"] == "ollama" and d["model_source"] == "ollama"
    assert any(s["path"] == "/api/embed" and s["auth"] is None for s in SEEN)        # no credentials needed


def test_pipeline_with_ollama_embedder_cross_lingual_and_names_complete(ollama, tmp_path, records):
    st = make_settings(tmp_path, embedding_backend="ollama", embedding_model="bge-m3", ollama_url=ollama)
    emb = get_embedder(st)
    assert isinstance(emb, OllamaEmbedder)
    s = build_services(st, load=False, embedder=emb)
    s.indexer.full_rebuild(records); s.engine.load()
    assert s.indexer.verify_consistency()["ok"]
    got = [h.record_id for h in s.engine.search("information security banks", "hybrid", page_size=10).hits]
    assert "16" in got[:5]
    assert s.engine.search("كريم فؤاد", "supervisor").total == 130           # exact names stay complete


def test_missing_model_or_server_falls_back_with_actionable_reason(ollama, tmp_path):
    e = get_embedder(make_settings(tmp_path, embedding_backend="ollama", embedding_model="nope", ollama_url=ollama))
    assert isinstance(e, HashingEmbedder) and "ollama pull nope" in e.fallback_reason
    e2 = get_embedder(make_settings(tmp_path, embedding_backend="ollama", ollama_url="http://127.0.0.1:9"))
    assert isinstance(e2, HashingEmbedder) and e2.fallback_reason


def test_ollama_llm_provider_request_shape_parse_and_errors(ollama, tmp_path):
    st = make_settings(tmp_path, llm_provider="ollama", llm_model="qwen2.5", ollama_url=ollama, llm_num_ctx=4096, llm_max_retries=0)
    p = get_provider(st)
    assert isinstance(p, OllamaProvider) and p.base_url == ollama and not st.llm_api_key
    r = p.generate("sys", "user question", max_tokens=77, temperature=0.0)
    assert r.text == FakeOllama.chat_reply and r.provider == "ollama"
    sent = [s for s in SEEN if s["path"] == "/api/chat"][0]
    assert sent["auth"] is None and sent["body"]["stream"] is False
    assert sent["body"]["options"] == {"temperature": 0.0, "num_predict": 77, "num_ctx": 4096}
    assert [m["role"] for m in sent["body"]["messages"]] == ["system", "user"]
    bad = get_provider(make_settings(tmp_path, llm_provider="ollama", llm_model="missing", ollama_url=ollama, llm_max_retries=0))
    with pytest.raises(LLMError) as ei:
        bad.generate("s", "u")
    assert ei.value.kind == "model_not_found"   # HTTP 404 = model not pulled (kind introduced in the Gemini error-mapping fix)
    off = get_provider(make_settings(tmp_path, llm_provider="ollama", llm_model="m", ollama_url="http://127.0.0.1:9", llm_max_retries=0))
    with pytest.raises(LLMError):
        off.generate("s", "u")
    with pytest.raises(LLMError) as ei2:
        get_provider(make_settings(tmp_path, llm_provider="ollama", llm_model="", ollama_url=ollama)).generate("s", "u")
    assert ei2.value.kind == "not_configured"
