"""fastembed backend (with a FAKE ONNX model object - B category), cache, calibration, LLM privacy, app gate."""
import json
import numpy as np
import pytest

from src.retrieval.embeddings import FastEmbedEmbedder, describe_embedder, is_neural


class FakeModel:
    def __init__(self): self.calls = []
    def embed(self, texts, batch_size=32):
        self.calls.append(list(texts))
        for t in texts:
            v = np.zeros(8, dtype=np.float32); v[sum(map(ord, t)) % 8] = 1.0; v[0] += 0.1
            yield v


def test_fastembed_is_neural_and_described(tmp_path):
    e = FastEmbedEmbedder("x/model", _model=FakeModel())
    assert is_neural(e) and e.model_id == "fe:x/model" and e.dim == 8
    d = describe_embedder(e, "fastembed")
    assert d["active_backend"] == "fastembed" and d["semantic"]


def test_e5_prefixes_only_for_e5():
    m = FakeModel(); e = FastEmbedEmbedder("intfloat/multilingual-e5-large", _model=m)
    e.encode_query("hello"); e.encode_passages(["doc"])
    assert m.calls[-2] == ["query: hello"] and m.calls[-1] == ["passage: doc"]
    m2 = FakeModel(); e2 = FastEmbedEmbedder("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", _model=m2)
    e2.encode_query("hello")
    assert m2.calls[-1] == ["hello"]


def test_cache_roundtrip_and_model_mismatch(tmp_path):
    f = str(tmp_path / "c.npz")
    m = FakeModel(); e = FastEmbedEmbedder("a/m", cache_file=f, _model=m)
    v1 = e.encode_passages(["one", "two"]); assert e.cache_misses == 2
    e.save_cache()
    m2 = FakeModel(); e2 = FastEmbedEmbedder("a/m", cache_file=f, _model=m2)
    n = len(m2.calls)
    v2 = e2.encode_passages(["one", "two"])
    assert len(m2.calls) == n and e2.cache_hits == 2 and e2.cache_misses == 0   # nothing re-embedded
    assert np.allclose(v1, v2, atol=1e-2)
    e3 = FastEmbedEmbedder("other/m", cache_file=f, _model=FakeModel())          # cache for another model is ignored
    assert not e3._cache


def test_corrupt_cache_ignored(tmp_path):
    f = tmp_path / "c.npz"; f.write_bytes(b"garbage")
    e = FastEmbedEmbedder("a/m", cache_file=str(f), _model=FakeModel())
    assert e.encode_passages(["x"]).shape == (1, 8)


def test_get_embedder_fastembed_failure_is_explicit_fallback(monkeypatch):
    from src.config.settings import Settings
    from src.retrieval import embeddings as E
    monkeypatch.setattr(E, "FastEmbedEmbedder", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("download blocked")))
    emb = E.get_embedder(Settings(embedding_backend="fastembed"))
    assert not is_neural(emb) and emb.requested_backend == "fastembed" and "download blocked" in emb.fallback_reason


def test_calibration_file_used_only_for_matching_model(tmp_path):
    from types import SimpleNamespace
    from src.retrieval.engine import SearchEngine
    cal = tmp_path / "cal.json"
    cal.write_text(json.dumps({"model_id": "fe:a/m", "floor": 0.5}))
    s = SimpleNamespace(semantic_calibration_file=str(cal), semantic_min_score_neural=0.35, semantic_min_score=0.3)
    eng = SearchEngine.__new__(SearchEngine); eng.s = s
    eng.embedder = FastEmbedEmbedder("a/m", _model=FakeModel())
    c = eng.calibration(); assert c["calibrated"] and c["floor"] == 0.5
    eng2 = SearchEngine.__new__(SearchEngine); eng2.s = s; eng2.embedder = FastEmbedEmbedder("b/m", _model=FakeModel())
    c2 = eng2.calibration(); assert not c2["calibrated"] and c2["floor"] == 0.35 and "UNCALIBRATED" in c2["source"]


def test_supervisor_and_student_names_withheld_from_llm_by_default():
    from src.config.settings import Settings
    from src.rag.context import record_block
    from src.data.schema import Record
    s = Settings()
    assert s.rag_include_supervisors is False and s.rag_include_students is False
    rec = Record.model_construct(record_id="R1", title="T", year=2020, subjects=[], call_number=None, extent_raw=None,
                                 dimension_raw=None, students=["Student Name"])
    b = record_block("R1", rec, ["Dr Sup Name"], False, False)
    assert "Sup Name" not in b and "Student Name" not in b
    assert "Dr Sup Name" in record_block("R1", rec, ["Dr Sup Name"], False, True)


def test_hide_student_names_demo_mode():
    from src.config.settings import Settings
    s = Settings(hide_student_names=True, rag_include_students=True)
    assert s.expose_students is False and s.rag_include_students is False


def test_fastembed_default_model_name_trap_is_handled():
    from src.retrieval.embeddings import FASTEMBED_DEFAULT, fastembed_model_name
    assert fastembed_model_name("intfloat/multilingual-e5-small") == FASTEMBED_DEFAULT      # Settings default is not a fastembed model
    assert fastembed_model_name("") == FASTEMBED_DEFAULT
    assert fastembed_model_name("intfloat/multilingual-e5-large") == "intfloat/multilingual-e5-large"
