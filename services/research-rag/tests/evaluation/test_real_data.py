"""Evaluation tests on the REAL dataset (data/raw/Project.xlsx). Separate from unit/integration tests; skipped on a
clean clone without the (private) dataset. Ground truth = independent oracle (src/evaluation/oracle.py)."""
import random
import re
from pathlib import Path

import pytest

from src.config.settings import ROOT
from src.data.loader import read_raw_rows, rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.evaluation import metrics as M
from src.evaluation.cases import build_cases
from src.evaluation.oracle import load_oracle, norm, person
from src.rag.answer import AnswerService
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings

RAW = ROOT / "data" / "raw" / "Project.xlsx"
pytestmark = [pytest.mark.realdata, pytest.mark.skipif(not RAW.exists(), reason="data/raw/Project.xlsx not present")]


@pytest.fixture(scope="module")
def real(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("real")
    s = make_settings(tmp, hashing_dim=1024)
    svc = build_services(s, load=False, embedder=HashingEmbedder(1024))
    _, rows, _ = read_raw_rows(RAW)
    recs, rej = rows_to_records(rows)
    assert not rej
    apply_display_map(recs, canonical_display_map(recs))
    svc.indexer.full_rebuild(recs)
    svc.engine.load()
    return svc, load_oracle(RAW)


def test_dataset_loaded_completely(real):
    svc, orc = real
    assert svc.store.count() == len(orc["records"]) == 3983
    assert svc.indexer.verify_consistency(svc.engine)["ok"]


def test_every_supervisor_spelling_returns_exactly_the_oracle_set(real):
    svc, orc = real
    spellings = set()
    for r in orc["records"].values():
        for part in re.split(r"\||\s+(?=(?:[أا]\s*\.?\s*)?د\s*[/.]\s*\S)", r["supervisor_raw"]):
            if part.strip() and part.strip().upper() != "NA":
                spellings.add(part.strip())
    assert len(spellings) > 250
    for sp in sorted(spellings):
        exp = orc["by_sup"][person(sp)]
        got, page = [], 1
        while True:
            res = svc.engine.search(sp, "supervisor", page=page, page_size=100)
            got += [h.record_id for h in res.hits]
            assert res.total == len(exp) and res.exhaustive
            if page >= res.total_pages:
                break
            page += 1
        assert len(got) == len(set(got)) and set(got) == exp, sp


def test_largest_supervisor_is_complete_and_not_truncated(real):
    svc, orc = real
    top = max(orc["by_sup"], key=lambda k: len(orc["by_sup"][k]))
    assert len(orc["by_sup"][top]) > 500
    res = svc.engine.search(top, "supervisor", page_size=100)
    assert res.total == len(orc["by_sup"][top]) and res.total_pages == -(-res.total // 100)


def test_exact_title_returns_all_repeated_titles(real):
    svc, orc = real
    rng = random.Random(5)
    for rid in rng.sample(sorted(orc["records"]), 200):
        t = orc["records"][rid]
        got = {h.record_id for h in svc.engine.search(t["title"], "title", page_size=100).hits if h.match_type == "exact"}
        assert got == orc["by_title"][t["title_norm"]]


def test_subject_search_is_exact_and_complete(real):
    svc, orc = real
    for subj, rel in orc["by_subject"].items():
        got, page = set(), 1
        while True:
            r = svc.engine.search(subj, "subject", page=page, page_size=100)
            got |= {h.record_id for h in r.hits if h.match_type == "exact"}
            if page >= r.total_pages:
                break
            page += 1
        assert got == rel, subj


def test_ranked_retrieval_quality_floor(real):
    """Not a quality claim: guards against regressions. Actual numbers are produced by scripts/evaluate.py."""
    svc, orc = real
    rng = random.Random(9)
    ids = [i for i in sorted(orc["records"]) if len(orc["records"][i]["title_norm"].split()) >= 4]
    sc = {"keyword": [], "hybrid": []}
    for rid in rng.sample(ids, 150):
        t = orc["records"][rid]
        w = t["title"].split()
        q = " ".join(rng.sample(w, max(2, int(len(w) * 0.6))))
        rel = orc["by_title"][t["title_norm"]]
        for m in sc:
            rk = [h.record_id for h in svc.engine.search(q, m, page_size=50).hits]
            sc[m].append(M.recall_at_k(rk, rel, 10))
    for m, v in sc.items():
        assert sum(v) / len(v) >= 0.90, (m, sum(v) / len(v))


def test_abstention_policy_on_real_cases(real):
    svc, orc = real
    cases = build_cases(orc, seed=13, n_each=25)
    ans = AnswerService(svc.engine, None, svc.settings)
    false_ans, false_abs, wrong_count = [], [], 0
    for c in cases:
        r = ans.ask(c.question)
        if c.expect == "abstain" and r.status != "abstained":
            false_ans.append((c.group, c.question[:80], r.status))
        if c.expect == "answer" and r.status == "abstained":
            false_abs.append((c.group, c.question[:80]))
        if c.group == "supervisor_count":
            wrong_count += r.total_matching != c.meta["count"]
        if c.group == "record_fact" and r.status != "abstained":
            assert [s.record_id for s in r.sources] == [c.record_id], c.question
    must_abstain = sum(c.expect == "abstain" for c in cases)
    should_answer = sum(c.expect == "answer" for c in cases)
    assert not false_ans, false_ans[:5]                           # no unsupported answer on any must-abstain case
    assert len(false_abs) / should_answer <= 0.03, false_abs[:5]
    assert wrong_count == 0
    assert must_abstain >= 100 and should_answer >= 100


def test_fabricated_record_questions_never_answered(real):
    svc, _ = real
    ans = AnswerService(svc.engine, None, svc.settings)
    for q in ("من المشرف على «Blockchain for agricultural drones»؟", "ما سنة نشر «دراسة عن الحوسبة الكمية في البنوك المركزية»؟"):
        assert ans.ask(q).abstain_reason == "record_not_found"


def test_persistence_of_real_index_across_restart(real):
    svc, orc = real
    again = build_services(svc.settings, embedder=HashingEmbedder(1024))
    assert again.engine.stats()["dense_vectors"] == 3983
    assert again.engine.search("عمرو التقى", "supervisor").total == len(orc["by_sup"][person("عمرو التقى")])


def test_every_student_returns_exactly_the_oracle_set_with_pagination(real):
    """Requirement: student search returns ALL records of a student (never just the first), no merging of names."""
    svc, orc = real
    names = sorted(orc["by_stu"])
    assert len(names) > 3000
    multi = [n for n in names if len(orc["by_stu"][n]) > 1]
    assert multi, "dataset should contain students with several records"
    # every distinct normalised student name (exact, via a different surface form: raw spelling from the record)
    for n in names:
        exp = orc["by_stu"][n]
        res = svc.engine.search(n, "student", page=1, page_size=100)
        assert res.exhaustive and res.total == len(exp), n
        assert {h.record_id for h in res.hits} == exp or res.total > 100
    # pagination without loss/duplication on the student with most records, tiny pages
    top = max(names, key=lambda n: len(orc["by_stu"][n]))
    got, page = [], 1
    while True:
        r = svc.engine.search(top, "student", page=page, page_size=2)
        got += [h.record_id for h in r.hits]
        if page >= r.total_pages:
            break
        page += 1
    assert len(got) == len(set(got)) == len(orc["by_stu"][top]) and set(got) == orc["by_stu"][top]


def test_student_partial_name_and_similar_names_not_merged(real):
    svc, orc = real
    # partial (first two tokens) of a student with >=2 records -> union of all students whose name starts that way
    n = next(n for n in sorted(orc["by_stu"]) if len(orc["by_stu"][n]) > 2 and len(n.split()) >= 3)
    q = " ".join(n.split()[:2])
    res = svc.engine.search(q, "student", supervisor_match="auto")
    sr = res.student_resolution
    assert sr is not None and sr.status in ("partial", "ambiguous_partial", "exact")
    expected_keys = {k for k in orc["by_stu"] if all(any(t == x or t.startswith(x) for t in k.split()) for x in q.split())}
    exp_ids = set().union(*(orc["by_stu"][k] for k in expected_keys))
    allp, page = set(), 1
    while True:
        r = svc.engine.search(q, "student", page=page, page_size=100)
        allp |= {h.record_id for h in r.hits}
        if page >= r.total_pages:
            break
        page += 1
    assert allp == exp_ids
    assert all(h.match_type in ("exact", "partial") for h in r.hits)
    # two different spellings are two different people (counts differ from their union)
    a, b = "شيماء فهمي السيد", "شيماء فهمي سيد"
    if a in orc["by_stu"] or b in orc["by_stu"]:
        ra, rb = svc.engine.search(a, "student"), svc.engine.search(b, "student")
        assert ra.total == len(orc["by_stu"].get(norm(a), ())) and rb.total == len(orc["by_stu"].get(norm(b), ()))
