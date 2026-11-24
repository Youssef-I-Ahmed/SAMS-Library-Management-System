"""REAL dataset (hashing retrieval, scripted LLM): the evidence-policy fix for 'banking service quality'-style questions.
The LLM is a scripted FakeLLM: these tests prove the evidence GATE and context, not any real model's output."""
import pytest

from src.config.settings import ROOT
from src.data.loader import read_raw_rows, rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.rag.answer import AnswerService
from src.rag.evidence import GENERIC_TERMS
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import FakeLLM, make_settings

RAW = ROOT / "data" / "raw" / "Project.xlsx"
pytestmark = [pytest.mark.realdata, pytest.mark.skipif(not RAW.exists(), reason="data/raw/Project.xlsx not present")]


@pytest.fixture(scope="module")
def eng(tmp_path_factory):
    _, rows, _ = read_raw_rows(RAW)
    recs, _ = rows_to_records(rows, min_year=1950, max_year=2100)
    apply_display_map(recs, canonical_display_map(recs))
    sv = build_services(make_settings(tmp_path_factory.mktemp("bank")), load=False, embedder=HashingEmbedder(256))
    sv.indexer.full_rebuild(recs)
    sv.engine.load()
    return sv


def ask(sv, q):
    llm = FakeLLM("Records [R1] concern this topic.")
    return AnswerService(sv.engine, llm, sv.settings).ask(q), llm


def explicit_terms(sv, r):
    return [set(sv.engine.bm25.doc_terms.get(x.record_id, ())) for x in r.retrieved if x.support == "explicit"]


def test_banking_service_quality_reaches_the_llm_with_banking_evidence_only(eng):
    r, llm = ask(eng, "Which projects deal with banking service quality?")
    assert llm.calls == 1 and r.status == "ok" and r.generated_by == "llm"
    docs = explicit_terms(eng, r)
    assert docs and all("banking" in d for d in docs)                          # every explicit record is about banking
    ctx = llm.last_user
    assert "THE impact of service quality on customer satisfaction" not in ctx  # generic-only record is not evidence
    assert "supervisors:" not in ctx                                             # names are not sent by default


def test_arabic_banking_service_quality_reaches_the_llm_with_banking_evidence_only(eng):
    r, llm = ask(eng, "ما المشاريع التي تتناول جودة الخدمات المصرفية؟")
    assert llm.calls == 1 and r.status == "ok"
    from src.data.normalize_ar import search_terms
    bank = set(search_terms("المصرفية"))
    docs = explicit_terms(eng, r)
    assert docs and all(bank & d for d in docs)


def test_generic_only_question_is_still_answerable(eng):
    r, llm = ask(eng, "What is the impact of service quality?")
    assert llm.calls == 1 and r.status == "ok"


def test_generic_word_overlap_does_not_rescue_an_unsupported_question(eng):
    for q in ("Which projects study the role of quantum chemistry?", "ما دور الكيمياء الكمية في الدراسة؟"):
        r, llm = ask(eng, q)
        assert r.status == "abstained" and r.generated_by == "policy" and llm.calls == 0
        assert all(x.support != "explicit" for x in r.retrieved)


def test_findings_question_still_abstains_even_with_a_banking_topic(eng):
    r, llm = ask(eng, "What were the findings of the banking service quality studies?")
    assert r.status == "abstained" and llm.calls == 0


def test_generic_terms_set_is_non_empty_and_stemmed():
    assert {"service", "quality"} <= GENERIC_TERMS
