"""Configuration and startup behaviour: defaults, fallbacks, friendly configuration errors."""
import logging

import pytest

from src.config.settings import Settings
from src.rag.llm import LLM_HINTS, LLMError, get_provider, llm_hint
from src.retrieval.embeddings import HashingEmbedder, describe_embedder, get_embedder
from src.service import build_services
from tests.conftest import make_settings


def test_defaults_are_safe():
    s = Settings(_env_file=None)
    assert s.llm_provider == "none" and s.rag_include_students is False and s.auth_disabled is False
    assert s.cors_origins in ("", [], None) or not s.cors_origins
    assert s.pilot_admin_password in (None, "")           # no default admin password anywhere
    assert s.semantic_min_score >= 0.3 and s.min_query_chars >= 2


def test_neural_backend_unavailable_falls_back_to_hashing_with_reason(caplog):
    s = Settings(_env_file=None, embedding_backend="sentence-transformers", embedding_model="no/such-model-xyz")
    with caplog.at_level(logging.WARNING):
        emb = get_embedder(s)
    info = describe_embedder(emb, s.embedding_backend, emb.fallback_reason)
    assert isinstance(emb, HashingEmbedder) and info["active_backend"] == "hashing" and info["requested_backend"] == "sentence-transformers"
    assert info["semantic"] is False and info["cross_lingual"] is False and info["fallback_reason"]
    assert "NOT semantic" in info["note"] and "falling back" in caplog.text


def test_service_starts_and_reports_the_active_mode_after_fallback(tmp_path):
    s = make_settings(tmp_path, embedding_backend="sentence-transformers", embedding_model="no/such-model-xyz")
    svc = build_services(s, load=False)
    assert svc.indexer.status()["embedding_mode"]["active_backend"] == "hashing"


@pytest.mark.parametrize("kind", list(LLM_HINTS))
def test_every_llm_failure_kind_has_an_actionable_message(kind):
    msg = llm_hint(kind)
    assert len(msg) > 30 and "LLM" in msg or "language model" in msg.lower()


def test_missing_key_gives_actionable_error_and_retrieval_only_answer(tmp_path, records):
    s = make_settings(tmp_path, llm_provider="gemini", llm_model="gemini-x", llm_api_key="")
    svc = build_services(s, load=False)
    svc.indexer.full_rebuild(records); svc.engine.load()
    from src.rag.answer import AnswerService
    r = AnswerService(svc.engine, get_provider(s), s).ask("ما المشاريع عن الاندماج المصرفى؟")
    if r.llm is not None:                      # topical route reached the provider -> not_configured
        assert r.status == "llm_unavailable" and "LLM_API_KEY" in " ".join(r.warnings)
    with pytest.raises(LLMError) as e:
        get_provider(s).generate("s", "u")
    assert e.value.kind == "not_configured"


def test_ready_reports_retrieval_only_and_embedding_mode(client):
    j = client.get("/ready").json()
    assert j["retrieval_only"] is True and j["llm_provider"] == "none"
    assert j["embedding"]["semantic"] is False and "NOT semantic" in j["embedding"]["note"]
