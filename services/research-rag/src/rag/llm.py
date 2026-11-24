"""Configurable LLM providers (Gemini, OpenAI-compatible, Anthropic) with timeouts, retries and typed errors.

No provider SDKs are required: plain HTTPS via httpx. API keys come from settings/env only and are sent in
headers (never in URLs), and are never logged.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from src.config.settings import Settings

log = logging.getLogger("rag.llm")


class LLMError(Exception):
    """kind: not_configured | timeout | rate_limit | auth | model_not_found | provider | malformed | blocked"""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


LLM_HINTS = {
    "not_configured": ("The language model is not configured, so the system is running in retrieval-only mode. To enable "
                       "generated answers set LLM_PROVIDER (gemini | openai | anthropic), LLM_MODEL and LLM_API_KEY in the "
                       "environment (or Streamlit secrets) and restart. Never put the key in code or Git."),
    "auth": "The LLM provider rejected the API key. Check LLM_API_KEY and that it may use LLM_MODEL.",
    "rate_limit": "The LLM provider is rate-limiting requests. Wait and retry, or check the provider quota.",
    "timeout": "The LLM provider did not answer in time. Retry, or raise LLM_TIMEOUT_S.",
    "model_not_found": "The LLM provider does not know the model in LLM_MODEL (or your key cannot use it). Gemini: set LLM_MODEL=auto or pick an id from the status tab's model list. Ollama: run `ollama pull <model>`.",
    "provider": "The LLM provider returned an error. Check LLM_MODEL / LLM_BASE_URL and the provider status page.",
    "malformed": "The LLM provider returned an unreadable response; no generated answer was used.",
    "blocked": "The LLM provider blocked the request (safety filter); no generated answer was used.",
}


def llm_hint(kind: str) -> str:
    return LLM_HINTS.get(kind, "The language model call failed; no generated answer was used.")


def _error_detail(resp) -> str:
    """Short, secret-free error text from a provider response. Providers differ: Gemini/OpenAI send
    {"error": {"message": ...}}, Ollama sends {"error": "model ... not found"}, proxies may send plain text."""
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:300]
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        err = err.get("message", "")
    return str(err if err is not None else "")[:300]


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    latency_ms: int


class LLMProvider:
    name = "base"

    def __init__(self, model: str, api_key: str, base_url: str, timeout: float, max_retries: int,
                 transport: httpx.BaseTransport | None = None):
        self.model, self.api_key, self.base_url = model, api_key, base_url.rstrip("/")
        self.timeout, self.max_retries, self.transport = timeout, max_retries, transport

    # subclasses implement
    def _request(self, system: str, user: str, max_tokens: int, temperature: float) -> tuple[str, dict, dict]:
        raise NotImplementedError

    def _parse(self, data: dict) -> str:
        raise NotImplementedError

    def generate(self, system: str, user: str, max_tokens: int = 1024, temperature: float = 0.1) -> LLMResult:
        if not self.api_key and self.name not in ("openai", "ollama"):  # local OpenAI-compatible servers may not need a key
            raise LLMError("not_configured", "LLM_API_KEY is not set")
        if not self.model:
            raise LLMError("not_configured", "LLM_MODEL is not set")
        if self.model == "auto" and hasattr(self, "_resolve_auto_model"):
            self._resolve_auto_model()          # replaces "auto" by a concrete model id the key can use
        t0 = time.time()
        last: LLMError | None = None
        for attempt in range(self.max_retries + 1):
            try:
                url, headers, body = self._request(system, user, max_tokens, temperature)
                with httpx.Client(timeout=self.timeout, transport=self.transport) as c:
                    resp = c.post(url, headers=headers, json=body)
                if resp.status_code == 429:
                    raise LLMError("rate_limit", "provider rate limit (HTTP 429)")
                if resp.status_code in (401, 403):
                    raise LLMError("auth", f"provider rejected credentials (HTTP {resp.status_code})")
                if resp.status_code == 404:
                    details = _error_detail(resp)
                    raise LLMError("model_not_found", f"provider returned HTTP 404; details: {details}")

                if resp.status_code == 400 and "api key" in resp.text[:2000].lower():   # Gemini reports a bad key as HTTP 400
                    raise LLMError("auth", "provider rejected the API key (HTTP 400)")
                if resp.status_code >= 500:
                    raise LLMError("provider", f"provider error (HTTP {resp.status_code})")
                if resp.status_code >= 400:
                    raise LLMError("provider", f"provider returned HTTP {resp.status_code}")
                try:
                    data = resp.json()
                except ValueError as e:
                    raise LLMError("malformed", "provider returned non-JSON body") from e
                text = self._parse(data)
                if not text or not text.strip():
                    raise LLMError("malformed", "provider returned an empty answer")
                return LLMResult(text.strip(), self.name, self.model, int((time.time() - t0) * 1000))
            except httpx.TimeoutException:
                last = LLMError("timeout", f"provider timed out after {self.timeout}s")
            except httpx.HTTPError as e:
                last = LLMError("provider", f"network error: {type(e).__name__}")
            except LLMError as e:
                last = e
                if e.kind in ("auth", "malformed", "blocked", "not_configured", "model_not_found"):
                    break  # not retryable
            if attempt < self.max_retries:
                time.sleep(min(0.5 * (2 ** attempt), 4.0))
        assert last is not None
        log.warning("LLM call failed provider=%s kind=%s", self.name, last.kind)
        raise last


# Models supported by the Gemini Interactions API (not merely models.list / generateContent).
# Keep this allowlist aligned with Google's Interactions API model documentation.
_GEMINI_INTERACTIONS_MODELS = {
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-4-argon",
    "gemini-4-carbon",
    "gemini-4-hydrogen",
    "gemini-4-neon",
    "gemini-omni-1.1-flash",
    "gemini-omni-1.2-flash",
    "gemini-omni-flash-preview",
}


def pick_gemini_model(models: list[dict]) -> str | None:
    """Pick the newest preferred Flash model that is listed AND supported by Interactions API."""
    visible = {str(m.get("name", "")).removeprefix("models/") for m in models}
    preferred = ("gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
                 "gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite")
    return next((model for model in preferred if model in visible and model in _GEMINI_INTERACTIONS_MODELS), None)


class GeminiProvider(LLMProvider):
    name = "gemini"

    def _resolve_auto_model(self) -> None:
        """LLM_MODEL=auto: choose a listed model supported by the Interactions API."""
        base = self.base_url or "https://generativelanguage.googleapis.com"
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as c:
                r = c.get(f"{base}/v1beta/models?pageSize=200", headers={"x-goog-api-key": self.api_key})
        except httpx.HTTPError as e:
            raise LLMError("provider", f"could not list Gemini models: {type(e).__name__}") from e
        if r.status_code in (401, 403) or (r.status_code == 400 and "api key" in r.text[:2000].lower()):
            raise LLMError("auth", "provider rejected the API key while listing models")
        if r.status_code >= 400:
            raise LLMError("provider", f"model listing returned HTTP {r.status_code}")
        chosen = pick_gemini_model(r.json().get("models", []))
        if not chosen:
            raise LLMError("model_not_found", "no Gemini Interactions API model from the supported model list is visible to this key")
        self.model = chosen

    def _request(self, system, user, max_tokens, temperature):
        base = self.base_url or "https://generativelanguage.googleapis.com"
        url = f"{base}/v1beta/interactions"
        headers = {"x-goog-api-key": self.api_key, "content-type": "application/json"}
        # store=false is intentional: project queries and model outputs are not retained server-side.
        body = {
            "model": self.model,
            "input": user,
            "system_instruction": system,
            "generation_config": {"temperature": temperature, "max_output_tokens": max_tokens},
            "store": False,
        }
        return url, headers, body

    def _parse(self, data):
        status = data.get("status")
        if status == "failed":
            detail = data.get("error") or data.get("message") or "Gemini interaction failed"
            if isinstance(detail, dict):
                detail = detail.get("message") or str(detail)
            low = str(detail).lower()
            if "safety" in low or "blocked" in low:
                raise LLMError("blocked", "prompt blocked by provider safety filter")
            raise LLMError("provider", f"Gemini interaction failed: {str(detail)[:250]}")
        texts = []
        for step in data.get("steps", []) if isinstance(data.get("steps", []), list) else []:
            if step.get("type") != "model_output":
                continue
            for item in step.get("content", []) if isinstance(step.get("content", []), list) else []:
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    texts.append(item["text"])
        if not texts:
            # Some API response variants expose a convenience top-level output_text field.
            direct = data.get("output_text")
            if isinstance(direct, str):
                texts.append(direct)
        if not texts:
            raise LLMError("malformed", "unexpected Gemini Interactions response shape or no text output")
        return "".join(texts)


class OpenAICompatProvider(LLMProvider):
    name = "openai"

    def _request(self, system, user, max_tokens, temperature):
        base = self.base_url or "https://api.openai.com/v1"
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        body = {"model": self.model, "temperature": temperature, "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        return f"{base}/chat/completions", headers, body

    def _parse(self, data):
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError("malformed", "unexpected OpenAI-compatible response shape") from e


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def _request(self, system, user, max_tokens, temperature):
        base = self.base_url or "https://api.anthropic.com"
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        body = {"model": self.model, "max_tokens": max_tokens, "temperature": temperature, "system": system,
                "messages": [{"role": "user", "content": user}]}
        return f"{base}/v1/messages", headers, body

    def _parse(self, data):
        try:
            return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
        except (KeyError, TypeError) as e:
            raise LLMError("malformed", "unexpected Anthropic response shape") from e


class OllamaProvider(LLMProvider):
    """Free local models through Ollama's native /api/chat (no API key). Sets num_ctx explicitly."""
    name = "ollama"
    num_ctx = 8192

    def _request(self, system, user, max_tokens, temperature):
        base = self.base_url or "http://localhost:11434"
        body = {"model": self.model, "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": self.num_ctx},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        return f"{base}/api/chat", {"content-type": "application/json"}, body

    def _parse(self, data):
        try:
            return data["message"]["content"] or ""
        except (KeyError, TypeError) as e:
            raise LLMError("malformed", "unexpected Ollama response shape") from e


def get_provider(s: Settings, transport: httpx.BaseTransport | None = None) -> LLMProvider | None:
    cls = {"gemini": GeminiProvider, "openai": OpenAICompatProvider, "anthropic": AnthropicProvider,
           "ollama": OllamaProvider}.get(s.llm_provider)
    if cls is None:
        return None
    base = s.llm_base_url or (s.ollama_url if s.llm_provider == "ollama" else "")
    p = cls(s.llm_model, s.llm_api_key, base, s.llm_timeout_s, s.llm_max_retries, transport)
    if isinstance(p, OllamaProvider):
        p.num_ctx = s.llm_num_ctx
    return p
