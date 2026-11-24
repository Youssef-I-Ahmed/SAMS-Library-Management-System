import numpy as np

from src.retrieval.bm25 import BM25Index
from src.retrieval.dense import DenseIndex
from src.retrieval.embeddings import HashingEmbedder


def test_bm25_ranking_add_update_remove():
    b = BM25Index()
    b.add("1", "الاندماج المصرفى بين البنوك")
    b.add("2", "ضغوط العمل والرضا الوظيفى")
    b.add("3", "Online Banking System")
    assert b.search("الاندماج المصرفي")[0][0] == "1"
    assert b.search("banking systems")[0][0] == "3"      # plural folding
    b.add("2", "الاندماج الصناعي")                        # update
    assert {d for d, _ in b.search("الاندماج")} == {"1", "2"}
    b.remove("1")
    assert {d for d, _ in b.search("الاندماج")} == {"2"} and len(b) == 2
    assert b.search("") == [] and b.search("zzzz") == []


def test_bm25_respects_allowed_set():
    b = BM25Index()
    for i in range(5):
        b.add(str(i), "بنوك استثمار")
    assert {d for d, _ in b.search("بنوك", allowed={"1", "3"})} == {"1", "3"}


def test_dense_upsert_remove_search():
    d = DenseIndex()
    d.upsert("a", np.array([1, 0, 0])); d.upsert("b", np.array([0, 1, 0])); d.upsert("c", np.array([0.9, 0.1, 0]))
    assert [i for i, _ in d.search(np.array([1, 0, 0]), limit=2)] == ["a", "c"]
    d.remove("a")
    assert "a" not in d.row and d.search(np.array([1, 0, 0]), limit=1)[0][0] == "c"
    assert d.search(np.array([1, 0, 0]), allowed={"b"}, min_score=0.5) == []


def test_hashing_embedder_is_deterministic_and_normalised():
    e1, e2 = HashingEmbedder(256), HashingEmbedder(256)
    texts = ["الاندماج المصرفى", "Online Banking", "ضغوط العمل"]
    e1.fit(texts); e2.fit(texts)
    v1, v2 = e1.encode_passages(texts), e2.encode_passages(texts)
    assert np.array_equal(v1, v2)
    assert np.allclose(np.linalg.norm(v1, axis=1), 1.0, atol=1e-5)
    e3 = HashingEmbedder(256); e3.set_state(e1.get_state())
    assert np.allclose(e3.encode_query("الاندماج المصرفي"), e1.encode_query("الاندماج المصرفي"))
    q = e1.encode_query("الاندماج المصرفي")
    assert float(v1[0] @ q) > float(v1[2] @ q)          # spelling variant is closer than unrelated text
