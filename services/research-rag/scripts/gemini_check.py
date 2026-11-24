#!/usr/bin/env python
"""Live Gemini Interactions API check. Reads secrets from .env; never prints the API key.

Run: python scripts/gemini_check.py [--model gemini-3.8-flash]
Exit 0 = both real text-generation calls succeeded; 1 = configuration/provider failure;
2 = network blocked. This does not test retrieval or embeddings.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.config.settings import get_settings
from src.rag.llm import GeminiProvider, LLMError, _GEMINI_INTERACTIONS_MODELS


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="", help="model override; otherwise LLM_MODEL from .env")
    args = ap.parse_args()
    s = get_settings()
    key = s.llm_api_key
    model = args.model or s.llm_model or "auto"
    def line(status: str, what: str, extra: str = "") -> None:
        print(f"[{status:7}] {what}" + (f" - {extra}" if extra else ""), flush=True)
    if not key:
        line("FAIL", "1. LLM_API_KEY", "not set in .env / environment")
        return 1
    line("PASS", "1. LLM_API_KEY present", f"{len(key)} characters (value not shown)")
    if model == "auto":
        model = "gemini-3.8-flash"
        line("PASS", "2. Automatic model selection", model)
    elif model not in _GEMINI_INTERACTIONS_MODELS:
        line("FAIL", "2. Model selection", f"{model!r} is not in the supported Interactions API model set")
        return 1
    else:
        line("PASS", "2. Model selection", f"{model} is an Interactions API model")
    provider = GeminiProvider(model, key, s.llm_base_url, s.llm_timeout_s, s.llm_max_retries)
    rc = 0
    for label, question in (("3. Arabic generation", "ما هي عاصمة مصر؟"),
                            ("4. English generation", "What is the capital of Egypt?")):
        try:
            result = provider.generate("Answer in one short sentence, in the language of the question.", question,
                                       max_tokens=64, temperature=0.0)
            line("PASS", label, f"{result.latency_ms} ms; reply: {result.text[:120]!r}")
        except LLMError as exc:
            kind = "BLOCKED" if exc.kind in {"timeout", "provider"} and "network" in str(exc).lower() else "FAIL"
            line(kind, label, f"{exc.kind}: {exc}")
            rc = 1
    print(f"\nConfigured test model: {model}")
    return rc

if __name__ == "__main__":
    raise SystemExit(main())
