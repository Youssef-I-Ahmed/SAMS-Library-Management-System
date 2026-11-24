"""Neural-embedding PIPELINE tests.

IMPORTANT: no real multilingual model could be downloaded in the build environment (huggingface.co is blocked), so
these tests use a SYNTHETIC TEST DOUBLE (`ConceptEmbedder`: hand-written bilingual concept lexicon, model id 'st:...').
They prove the plumbing - re-indexing when the embedder changes, cross-lingual retrieval *when the embedder supports it*,
hybrid fusion, the neural score floor, and that exact name/title search stays complete - NOT the quality of any real model.
"""
from __future__ import annotations

import sys
import types

import numpy as np
import pytest

from src.data.normalize_ar import search_terms
from src.retrieval.embeddings import HashingEmbedder, SentenceTransformerEmbedder, describe_embedder, get_embedder, is_neural
from src.service import build_services
from tests.conftest import make_settings

CONCEPTS = [
    {"امن", "وامن", "security", "الامان"},
    {"البنوك", "بنوك", "بنك", "المصرفي", "المصرفيه", "bank", "banks", "banking"},
    {"استثمار", "الاستثمار", "investment", "investing", "funds", "صناديق"},
    {"التسويق", "تسويق", "marketing", "advertisement"},
    {"social", "media", "التواصل"},
    {"consumer", "المستهلك", "buying"},
    {"البترول", "بترول", "الغاز", "energy", "oil", "الطاقه"},
    {"حاسب", "المعلومات", "معلومات", "information", "internet", "online", "system", "computer"},
]


class ConceptEmbedder:
    """SYNTHETIC cross-lingual test double (see module docstring)."""
    model_id = "st:test-concept-double"
    model_source = "test_double"
    dim = len(CONCEPTS) + 64

    def fit(self, texts): ...
    def get_state(self): return None
    def set_state(self, s): ...

    def _enc(self, text):
        v = np.zeros(self.dim, dtype=np.float32)
        for t in search_terms(text):
            hit = False
            for i, c in enumerate(CONCEPTS):
                if t in c:
                    v[i] += 1.0; hit = True
            if not hit:
                v[len(CONCEPTS) + (sum(map(ord, t)) % 64)] += 0.05      # tiny unrelated-word noise
        n = np.linalg.norm(v)
        return v / n if n else v

    def encode_passages(self, texts): return np.stack([self._enc(t) for t in texts]).astype(np.float32)
    def encode_query(self, text): return self._enc(text).astype(np.float32)


@pytest.fixture()
def neural_svc(tmp_path, records):
    (tmp_path / "neural").mkdir()
    s = build_services(make_settings(tmp_path / "neural"), load=False, embedder=ConceptEmbedder())
    s.indexer.full_rebuild(records)
    s.engine.load()
    return s


def ids(r):
    return [h.record_id for h in r.hits]


def test_describe_marks_semantic_only_for_neural_ids():
    d = describe_embedder(ConceptEmbedder())
    assert d["semantic"] and d["cross_lingual"] and d["active_backend"] == "sentence-transformers"
    h = describe_embedder(HashingEmbedder(64))
    assert not h["semantic"] and not h["cross_lingual"] and "NOT semantic" in h["note"]
    assert is_neural(ConceptEmbedder()) and not is_neural(HashingEmbedder(64))


def test_cross_lingual_semantic_finds_arabic_record_from_english_query_and_hashing_cannot(neural_svc, svc):
    q = "information security banks"
    got = ids(neural_svc.engine.search(q, "semantic", page_size=10))
    assert "16" in got[:3]                                  # "حاسب آلي وأمن المعلومات في البنوك" (Arabic) from English words
    assert "16" not in ids(svc.engine.search(q, "semantic", page_size=10))     # hashing is lexical, not cross-lingual
    hy = neural_svc.engine.search(q, "hybrid", page_size=10)
    assert "16" in ids(hy)[:5] and not hy.exhaustive


def test_hybrid_keeps_lexical_exact_hits(neural_svc):
    r = neural_svc.engine.search("Internet Security", "hybrid", page_size=10)
    assert ids(r)[0] == "10"                                 # lexical title match is not displaced by semantic neighbours


def test_name_and_title_searches_are_complete_and_unchanged_with_a_neural_embedder(neural_svc, svc):
    for q in ("كريم فؤاد", "سامي منصور", "ليلى حسن"):
        a = neural_svc.engine.search(q, "supervisor", page_size=200)
        b = svc.engine.search(q, "supervisor", page_size=200)
        assert a.exhaustive and a.total == b.total and set(ids(a)) == set(ids(b))
    assert neural_svc.engine.search("كريم فؤاد", "supervisor").total == 130
    t = neural_svc.engine.search("الاندماج المصرفى", "title", page_size=50)
    assert set(ids(t)) == {"2", "3", "4"}
    s = neural_svc.engine.search("طالب أ", "student", page_size=50)
    assert s.exhaustive and "1" in ids(s)


def test_neural_floor_applies_not_the_hashing_floor(tmp_path, records):
    (tmp_path / "n2").mkdir(); (tmp_path / "h").mkdir()
    st = make_settings(tmp_path / "n2", semantic_min_score_neural=0.99)
    s = build_services(st, load=False, embedder=ConceptEmbedder())
    s.indexer.full_rebuild(records); s.engine.load()
    assert s.engine._semantic_floor() == 0.99
    assert s.engine.search("information security banks", "semantic").total == 0     # nothing is that similar
    assert s.engine.search("zzzqqq", "semantic").total == 0                          # gibberish: below any floor
    h = build_services(make_settings(tmp_path / "h", semantic_min_score=0.3, semantic_min_score_neural=0.99), load=False,
                       embedder=HashingEmbedder(64))
    assert h.engine._semantic_floor() == 0.3


def test_switching_embedder_reembeds_everything_and_index_is_consistent(svc, records):
    assert svc.indexer.verify_consistency()["ok"]
    old = svc.embedder.model_id
    svc.embedder = ConceptEmbedder(); svc.indexer.embedder = svc.embedder; svc.engine.embedder = svc.embedder
    rep = svc.indexer.verify_consistency()
    assert not rep["ok"] and rep["problem_counts"]["stale_or_other_model_embeddings"] == len(records)   # detected, not silent
    svc.indexer.full_rebuild(records); svc.engine.load()
    rep = svc.indexer.verify_consistency()
    assert rep["ok"] and svc.embedder.model_id != old
    assert svc.engine.stats()["dense_vectors"] == len(records)


def test_admin_add_is_embedded_and_searchable_semantically(neural_svc):
    from src.admin_ops import RecordAdmin
    from src.data.schema import RecordIn
    a = RecordAdmin(neural_svc)
    a.create(RecordIn(title="Marketing strategy for oil companies", year=2024, subjects=["تسويق"]), "t", "ADMIN")
    r = neural_svc.engine.search("التسويق في شركات البترول", "semantic", page_size=5)
    assert any("Marketing strategy" in h.title for h in r.hits)           # Arabic query -> new English record


# ---- loader plumbing with a fake sentence_transformers module (no download, no torch) -------------------------------
class _FakeST:
    calls: list = []

    def __init__(self, src, local_files_only=False, **kw):
        _FakeST.calls.append(("init", src, local_files_only))
        self.max_seq_length = None
        self.seen = []

    def get_sentence_embedding_dimension(self): return 4

    def encode(self, texts, **kw):
        self.seen += list(texts)
        return np.ones((len(texts), 4), dtype=np.float32)


@pytest.fixture()
def fake_st(monkeypatch):
    _FakeST.calls = []
    m = types.ModuleType("sentence_transformers"); m.SentenceTransformer = _FakeST
    monkeypatch.setitem(sys.modules, "sentence_transformers", m)
    return _FakeST


def test_local_model_path_offline_and_e5_prefixes(fake_st, tmp_path):
    d = tmp_path / "multilingual-e5-small"; d.mkdir()
    e = SentenceTransformerEmbedder(model_path=str(d), local_only=True, max_seq_length=128)
    assert fake_st.calls[0] == ("init", str(d), True) and e.model_id == "st:multilingual-e5-small" and e.model_source == "local_path"
    assert e.model.max_seq_length == 128
    e.encode_passages(["عنوان"]); e.encode_query("سؤال")
    assert e.model.seen == ["passage: عنوان", "query: سؤال"]
    other = SentenceTransformerEmbedder("some/labse")                       # non-e5 model: no prefixes
    other.encode_query("x"); assert other.model.seen == ["x"] and other.model_source == "hub"
    custom = SentenceTransformerEmbedder("some/labse", query_prefix="Q:", passage_prefix="P:")
    custom.encode_passages(["a"]); assert custom.model.seen == ["P:a"]


def test_bad_local_path_falls_back_to_hashing_with_visible_reason(fake_st, tmp_path):
    st = make_settings(tmp_path, embedding_backend="sentence-transformers", embedding_model_path=str(tmp_path / "missing"))
    emb = get_embedder(st)
    assert isinstance(emb, HashingEmbedder) and "EMBEDDING_MODEL_PATH" in emb.fallback_reason
    d = describe_embedder(emb, emb.requested_backend, emb.fallback_reason)
    assert not d["semantic"] and d["requested_backend"] == "sentence-transformers" and d["fallback_reason"]


def test_missing_package_falls_back_with_reason(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "sentence_transformers", None)           # import raises ImportError
    emb = get_embedder(make_settings(tmp_path, embedding_backend="sentence-transformers"))
    assert isinstance(emb, HashingEmbedder) and "not installed" in emb.fallback_reason
