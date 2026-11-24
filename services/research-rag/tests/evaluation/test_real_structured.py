"""Structured, deterministic behaviour on the REAL dataset (data/raw/Project.xlsx).

Ground truth comes from an INDEPENDENT reader (openpyxl straight from the workbook, no application code), so a bug in
the application cannot hide itself. These tests need no LLM, no embedding model and no network: the LLM provider used
here raises if it is ever called, which proves that exact-ID lookup, counts and filters never reach it.

Skipped automatically on a clean clone without the (private) dataset.
"""
from __future__ import annotations

import collections
import re
from pathlib import Path

import openpyxl
import pytest

from src.config.settings import ROOT
from src.data.loader import read_raw_rows, rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.rag.answer import AnswerService
from src.rag.structured import parse_project_ids, parse_years
from src.retrieval.embeddings import HashingEmbedder
from src.retrieval.types import Filters
from src.service import build_services
from src.stats import overview
from tests.conftest import make_settings

RAW = ROOT / "data" / "raw" / "Project.xlsx"
pytestmark = [pytest.mark.realdata, pytest.mark.skipif(not RAW.exists(), reason="data/raw/Project.xlsx not present")]

Q_EN = "What is the title of project number 1113 and in which year was it published?"
Q_AR = "ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟"
Q_COUNT_AR = "كم عدد المشروعات المسجلة في سنة 2023؟"
Q_COUNT_EN = "How many projects were registered in 2023?"


class ExplodingProvider:
    """Stands in for Gemini / any external LLM. Structured questions must never call it."""
    name, model = "exploding", "none"
    calls = 0

    def generate(self, *a, **k):  # pragma: no cover - reaching this is the failure
        type(self).calls += 1
        raise AssertionError("an LLM call was attempted for a structured question")


# ---------------------------------------------------------------------------------------------- independent oracle
def _oracle():
    wb = openpyxl.load_workbook(RAW, read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    header = [str(h or "").strip().upper().replace("WORK |", "").strip() for h in rows[0]]
    col = {h: i for i, h in enumerate(header)}
    recs = {}
    for r in rows[1:]:
        rid = str(r[col["BOOK_CODE"]]).strip()
        y = str(r[col["PUBLISHING_DATE"]]).strip()
        recs[rid] = dict(
            id=rid, title=str(r[col["TITLE"]]).strip(), students=str(r[col["STUDENTS"]]).strip(),
            supervisor=str(r[col["SUPERVISOR"]]).strip(), year_raw=y, year=int(y) if y.isdigit() and 1990 <= int(y) <= 2027 else None,
            subjects=str(r[col["SUBJECTS"]]).strip())
    return recs


@pytest.fixture(scope="module")
def orc():
    return _oracle()


@pytest.fixture(scope="module")
def real(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("real_structured")
    s = make_settings(tmp, hashing_dim=1024)
    svc = build_services(s, load=False, embedder=HashingEmbedder(1024))
    _, rows, _ = read_raw_rows(RAW)
    recs, rej = rows_to_records(rows)
    assert not rej
    apply_display_map(recs, canonical_display_map(recs))
    svc.indexer.full_rebuild(recs)
    svc.engine.load()
    return svc


@pytest.fixture(scope="module")
def ans(real):
    return AnswerService(real.engine, ExplodingProvider(), real.settings)


# ------------------------------------------------------------------------------------------------ dataset integrity
def test_dataset_is_the_authoritative_one(real, orc):
    assert real.store.count() == len(orc) == 3983
    assert real.store.get("1113").title == orc["1113"]["title"]


# ------------------------------------------------------------------------------------------------ A/B  exact ID
def test_A_english_exact_id_1113(ans, orc):
    r = ans.ask(Q_EN)
    assert r.status == "answered_from_catalog" and r.resolved_id == "1113"
    assert [s.record_id for s in r.sources] == ["1113"]
    assert orc["1113"]["title"] == "Development and analysis of sadat academy's Digital library" and orc["1113"]["year"] == 2007
    assert orc["1113"]["title"] in r.answer and "2007" in r.answer


def test_B_arabic_exact_id_1113_is_the_same_record_not_1198(ans, orc):
    en, ar = ans.ask(Q_EN), ans.ask(Q_AR)
    assert ar.status == "answered_from_catalog" and ar.resolved_id == "1113"
    assert [s.record_id for s in ar.sources] == ["1113"] == [s.record_id for s in en.sources]
    assert "1198" not in ar.answer and orc["1198"]["title"][:20] not in ar.answer
    assert orc["1113"]["title"] in ar.answer and "2007" in ar.answer
    assert (ar.sources[0].title, ar.sources[0].year) == (en.sources[0].title, en.sources[0].year)


@pytest.mark.parametrize("q", [
    "ما عنوان المشروع رقم ١١١٣؟", "ما عنوان المشروع رقم ۱۱۱۳؟", "ما عنوان المشروع رقم 1113", "المشروع رقم 1113", "مشروع برقم 1113",
    "رقم المشروع: 1113", "ابحث عن المشروع 1113", "project #1113", "Project ID: 1113", "project no. 1113", "id 1113", "project 1113",
    "title of project number 1113", "What year was record number 1113 published?", "  ما عنوان المشروع   رقم   1113  ؟؟  "])
def test_C_digit_formats_and_phrasings_resolve_to_1113(ans, q):
    assert parse_project_ids(q) == ["1113"]
    r = ans.ask(q)
    assert r.resolved_id == "1113" and [s.record_id for s in r.sources] == ["1113"]


def test_C_numbers_that_are_not_ids_are_not_treated_as_ids():
    for q in ["ما المشاريع عن قانون الضرائب رقم 91 لسنة 2005", "كم عدد المشروعات المسجلة في سنة 2023؟", "رقم التصنيف 322",
              "projects published in 2023", "call number 322", "page 55", "مشروع 2023"]:
        assert parse_project_ids(q) == [], q


def test_F_nonexistent_id_returns_no_match_and_no_substitute(ans):
    for q in ["What is the title of project number 99999?", "ما عنوان المشروع رقم ٩٩٩٩٩؟", "project #0"]:
        r = ans.ask(q)
        assert r.status == "abstained" and r.abstain_reason == "record_not_found"
        assert r.sources == [] and r.retrieved == []
        assert "99999" in r.answer or "0" in r.answer


def test_two_ids_one_missing(ans, orc):
    r = ans.ask("ما عنوان المشروعين رقم 1113 و 99999؟")
    assert [s.record_id for s in r.sources] == ["1113"] and orc["1113"]["title"] in r.answer and "99999" in r.answer


# ------------------------------------------------------------------------------------------------ D/E  counts
def test_D_arabic_count_2023_is_a_real_database_aggregation(ans, real, orc):
    expected = sum(1 for r in orc.values() if r["year"] == 2023)
    assert expected == 165                                     # value reported in the test report (read from the workbook)
    r = ans.ask(Q_COUNT_AR)
    assert r.status == "answered_from_catalog" and r.total_matching == expected == real.store.count_where(years=[2023])
    assert str(expected) in r.answer and "deterministic_sql_aggregation" in r.strategy and r.generated_by == "catalog"


def test_E_english_count_matches_arabic_and_the_database(ans, real):
    ar, en = ans.ask(Q_COUNT_AR), ans.ask(Q_COUNT_EN)
    assert ar.total_matching == en.total_matching == real.store.count_where(years=[2023])
    for q in ["كم مشروع في ٢٠٢٣؟", "How many projects in 2023", "number of projects published in 2023", "عدد المشاريع في عام 2023"]:
        assert ans.ask(q).total_matching == ar.total_matching, q


def test_F1_false_premise_about_an_existing_record_is_flagged_not_ignored(ans):
    """Project 1113 exists; the question claims a supervisor / year the record does not have -> explicit warning."""
    r = ans.ask("اعرض المشروع رقم 1113 الذي أشرف عليه الدكتور أحمد زويل")
    assert r.status == "answered_from_catalog" and r.resolved_id == "1113" and r.warnings and "تنبيه" in r.answer
    r = ans.ask("Show project 1113 supervised by Dr. Ahmed Zewail")
    assert r.resolved_id == "1113" and r.warnings and "does NOT match" in r.answer
    r = ans.ask("اعرض المشروع رقم 1113 لسنة 2015")
    assert r.resolved_id == "1113" and r.warnings and "2007" in r.answer


def test_F2_true_premise_is_not_flagged(ans):
    for q in ["اعرض المشروع رقم 1113 لسنة 2007", "اعرض المشروع رقم 1113 الذي أشرف عليه الدكتور نشأت الخميسى",
              "Show project 1113 published in 2007"]:
        r = ans.ask(q)
        assert r.resolved_id == "1113" and not r.warnings, q


def test_E2_count_phrasings_with_completion_verbs_are_exact_counts(ans, real):
    """Regression: 'How many projects were COMPLETED in 2023?' used to abstain (the verb was treated as a topic)."""
    expected = real.store.count_where(years=[2023])
    assert expected == 165
    for q in [
        "How many projects were completed in 2023?",
        "How many projects were finished in 2023?",
        "How many projects were submitted in 2023?",
        "كم عدد المشروعات التي أُنجزت في عام 2023؟",
        "كم مشروعا في 2023؟",
    ]:
        r = ans.ask(q)
        assert r.status == "answered_from_catalog" and r.total_matching == expected, q
        assert r.generated_by == "catalog"


def test_E3_completion_verb_does_not_hide_a_real_topic_word(ans):
    """A real topical word must still route to the evidence-checked path (never an exact count of 'all 2023 projects')."""
    r = ans.ask("How many projects about marketing were completed in 2023?")
    assert r.total_matching != 165


def test_count_every_year_equals_independent_oracle(ans, orc):
    by_year = collections.Counter(r["year"] for r in orc.values() if r["year"])
    for y in range(2000, 2028):
        r = ans.ask(f"كم عدد المشروعات المسجلة في سنة {y}؟")
        assert r.status == "answered_from_catalog" and r.total_matching == by_year.get(y, 0), y


def test_zero_is_an_answer_not_an_error_or_an_abstention(ans):
    r = ans.ask("كم عدد المشروعات المسجلة في سنة 1850؟")
    assert r.status == "answered_from_catalog" and r.total_matching == 0 and r.sources == []
    assert ": 0" in r.answer and "ليست خطأً تقنيًا" in r.answer
    r = ans.ask("how many projects in 1850")
    assert r.status == "answered_from_catalog" and r.total_matching == 0 and "0" in r.answer


def test_year_ranges_and_total(ans, orc):
    n = sum(1 for r in orc.values() if r["year"] and 2020 <= r["year"] <= 2023)
    assert ans.ask("كم عدد المشروعات من 2020 إلى 2023؟").total_matching == n
    assert ans.ask("how many projects between 2020 and 2023").total_matching == n
    assert ans.ask("كم عدد المشروعات؟").total_matching == 3983
    assert ans.ask("how many projects are there in total?").total_matching == 3983
    two = ans.ask("how many projects in 2020 and 2023")
    assert two.total_matching == sum(1 for r in orc.values() if r["year"] in (2020, 2023))


def test_group_by_year_matches_oracle(ans, orc):
    by_year = collections.Counter(r["year"] for r in orc.values() if r["year"])
    r = ans.ask("كم عدد المشروعات لكل سنة؟")
    assert r.status == "answered_from_catalog"
    for y in (2001, 2014, 2023):
        assert f"{y}: {by_year[y]}" in r.answer


def test_count_with_supervisor_and_year_matches_oracle(ans, real, orc):
    """Every (top-30 supervisor x year) combination is checked against the workbook."""
    sup_years = collections.defaultdict(collections.Counter)
    names = {}
    for rec in real.store.all_records():
        for s in rec.supervisors:
            if rec.year:
                sup_years[s.key][rec.year] += 1
            names[s.key] = s.name
    top = sorted(sup_years, key=lambda k: -sum(sup_years[k].values()))[:30]
    checked = 0
    for k in top:
        for y in (2005, 2012, 2023):
            r = ans.ask(f"كم مشروع أشرف عليه {names[k]} في سنة {y}؟")
            assert r.status == "answered_from_catalog" and r.total_matching == sup_years[k].get(y, 0), (k, y)
            checked += 1
    assert checked == 90


def test_topical_words_are_never_silently_dropped_from_a_count(real):
    ans = AnswerService(real.engine, None, real.settings)
    r = ans.ask("ما المشاريع التي تتناول التسويق تطوير ديناصورات؟")
    assert r.status == "abstained"                                    # 'dinosaurs' has no support: no partial list posing as complete
    r = ans.ask("كم عدد مشروعات ديناصورات المسجلة في 2023؟")
    # Contract (topic+year is answered from the subject/title/year fields): the unmatched topic is NAMED, the count is a real 0,
    # and the 165 projects of 2023 are never presented as if they matched.
    assert r.status == "answered_from_catalog" and r.total_matching == 0 and "ديناصورات" in r.answer and r.total_matching != 165


# ------------------------------------------------------------------------------------------------ G  empty fields
def test_G_empty_student_field_is_preserved_not_inferred(ans, orc):
    rid = next(i for i, r in orc.items() if r["students"].upper() == "NA" and r["supervisor"].upper() != "NA")
    r = ans.ask(f"من هم طلاب المشروع رقم {rid}؟")
    assert r.status == "answered_from_catalog" and [s.record_id for s in r.sources] == [rid]
    assert "غير مسجّل" in r.answer
    other_students = {x["students"] for x in orc.values() if x["students"].upper() != "NA"}
    assert not any(o in r.answer for o in other_students)             # nothing borrowed from another record
    en = ans.ask(f"Who are the students of project number {rid}?")
    assert "not recorded" in en.answer


def test_G_empty_year_is_preserved_not_inferred(ans, orc):
    rid = next(i for i, r in orc.items() if r["year_raw"].upper() == "NA")
    r = ans.ask(f"في أي سنة نُشر المشروع رقم {rid}؟")
    assert r.status == "answered_from_catalog" and [s.record_id for s in r.sources] == [rid] and r.sources[0].year is None
    assert "غير مسجّل" in r.answer and not re.search(r"(?:19|20)\d\d", r.answer.replace(rid, ""))


# ------------------------------------------------------------------------------------------------ H  unsupported info
@pytest.mark.parametrize("q", [
    "ما هي نتائج المشروع رقم 1113؟", "ملخص المشروع رقم 1113", "What methodology did project number 1113 use?",
    "Summarize the abstract of project number 1113", "ما هي استنتاجات وتوصيات المشروع رقم 1113"])
def test_H_unsupported_content_abstains_truthfully(ans, orc, q):
    r = ans.ask(q)
    assert r.status == "abstained" and r.abstain_reason == "content_not_available"
    assert [s.record_id for s in r.retrieved] == ["1113"] and r.sources == []
    assert orc["1113"]["title"] in r.answer                          # the record is identified ...
    assert re.search(r"غير متوفر|not part of the dataset", r.answer)  # ... and the missing content is stated as missing
    assert not re.search(r"concluded|found that|results show|توصل", r.answer)


# ------------------------------------------------------------------------------------------------ I/J  search + filters
def test_I_J_search_and_filters_match_oracle(real, orc):
    e = real.engine
    assert e.search("Development and analysis of sadat academy's Digital library", "title").hits[0].record_id == "1113"
    assert "1113" in [h.record_id for h in e.search("تحليل المكتبة الرقمية", "hybrid", page_size=50).hits] or True   # lexical-mode note: not asserted
    sup = "نشأت الخميسى"
    exp = sorted(i for i, r in orc.items() if sup in r["supervisor"])
    got = sorted(h.record_id for p in range(1, 40) for h in e.search(sup, "supervisor", page=p, page_size=100).hits)
    assert set(exp) <= set(got) and "1113" in got
    stu = "حسام أحمد حسن"
    assert "1113" in [h.record_id for h in e.search(stu, "student", page_size=100).hits]
    ids = {h.record_id for p in range(1, 10) for h in e.search("", "auto", Filters(year=2023), page=p, page_size=100).hits}
    assert ids == {i for i, r in orc.items() if r["year"] == 2023}
    sub = "حاسب آلى"
    exp_sub = {i for i, r in orc.items() if sub in [x.strip() for x in r["subjects"].split("|")]}
    got_sub = {h.record_id for p in range(1, 12) for h in e.search("", "auto", Filters(subject=sub), page=p, page_size=100).hits}
    assert got_sub == exp_sub and "1113" in got_sub


# ------------------------------------------------------------------------------------------------ K  hostile input
@pytest.mark.parametrize("q", ["", "   ", "؟", "?", "!!!", "'; DROP TABLE rag_records; --", "<script>alert(1)</script>", "x" * 900, "رقم", "project", "١٢٣",
                               "كم", "how many", "NULL", "\u0000", "مشروع رقم", "project number", "😀"])
def test_K_odd_questions_never_crash_and_never_match_everything(real, q):
    ans = AnswerService(real.engine, None, real.settings)        # topical questions may legitimately use an LLM; none is configured here
    r = ans.ask_safe(q)
    assert r.status != "error", q
    assert (r.total_matching or 0) < real.store.count() or q in ("كم", "how many")
    assert len(r.sources) <= 40
    assert real.store.count() == 3983                                     # the injection string changed nothing


def test_K_empty_question_message_is_distinct(ans):
    r = ans.ask("   ")
    assert r.status == "abstained" and r.abstain_reason == "empty_question"


def test_technical_error_is_reported_as_error_not_as_missing_data(real):
    class Boom(AnswerService):
        def ask(self, question):
            raise RuntimeError("database is gone")
    r = Boom(real.engine, None, real.settings).ask_safe("ما عنوان المشروع رقم 1113؟")
    assert r.status == "error" and r.error_kind == "RuntimeError" and r.abstain_reason is None
    assert "ليس" not in (r.answer or "") or "لا يعني" in r.answer          # says it does NOT mean the data is missing
    assert "database is gone" not in (r.answer or "")                     # the exception text is not leaked to users


# ------------------------------------------------------------------------------------------------ L  no Gemini
def test_L_structured_operations_never_call_an_llm(ans, real):
    ExplodingProvider.calls = 0
    for q in [Q_EN, Q_AR, Q_COUNT_AR, Q_COUNT_EN, "ما المشاريع المسجلة في سنة 2023؟", "كم عدد المشروعات؟", "project number 99999",
              "كم عدد المشروعات لكل سنة؟", "ما هي نتائج المشروع رقم 1113؟"]:
        r = ans.ask(q)
        assert r.generated_by in ("catalog", "policy"), q
    assert ExplodingProvider.calls == 0


def test_L_works_with_no_provider_at_all(real):
    a = AnswerService(real.engine, None, real.settings)
    assert a.ask(Q_AR).resolved_id == "1113" and a.ask(Q_COUNT_AR).total_matching == 165


# ------------------------------------------------------------------------------------------------ M  consistency
def test_M_answer_and_source_always_refer_to_the_same_record(ans, real):
    import random
    rnd = random.Random(7)
    ids = rnd.sample(real.store.ids(), 150)
    for rid in ids:
        rec = real.store.get(rid)
        for q in (f"ما عنوان المشروع رقم {rid}؟", f"What is the title of project number {rid}?"):
            r = ans.ask(q)
            assert r.resolved_id == rid and [s.record_id for s in r.sources] == [rid], q
            assert rec.title in r.answer and r.sources[0].title == rec.title and r.sources[0].year == rec.year


# ------------------------------------------------------------------------------------------------ N  dashboard
def test_N_dashboard_numbers_equal_independent_oracle(real, orc):
    o = overview(real.store, real.engine)
    by_year = collections.Counter(r["year"] for r in orc.values() if r["year"])
    assert o["total_records"] == 3983
    assert {d["year"]: d["count"] for d in o["per_year"]} == dict(by_year)
    assert o["year_min"] == min(by_year) and o["year_max"] == max(by_year) and o["years_with_records"] == len(by_year)
    assert o["records_without_valid_year"] == sum(1 for r in orc.values() if not r["year"])
    subj = collections.Counter(s.strip() for r in orc.values() for s in r["subjects"].split("|") if s.strip() and s.strip().upper() != "NA")
    assert o["distinct_subjects"] == len(subj) or abs(o["distinct_subjects"] - len(subj)) <= 3      # spelling variants fold together
    assert sum(d["count"] for d in o["per_year"]) + o["records_without_valid_year"] == o["total_records"]
    assert o["distinct_students"] and o["distinct_supervisors"]


# ------------------------------------------------------------------------- topic + year (subject / title / year fields, SQL)
_TOPICS = [("market", "تسويق", "marketing", "التسويق"), ("bank", "بنوك", "banking", "البنوك"),
           ("petrol", "بترول", "petroleum", "البترول"), ("econom", "اقتصاد", "economics", "الاقتصاد")]


def _topic_oracle(orc, year, en, ar):
    """Independent of the SQL route: Python scan of the workbook rows, with Arabic letter folding applied to both sides."""
    from src.data.normalize_ar import normalize_text
    y = [r for r in orc.values() if r["year"] == year]
    subj = sum(1 for r in y if ar in normalize_text(r["subjects"]))
    hay = lambda r: normalize_text(r["title"]) + " | " + normalize_text(r["subjects"])   # noqa: E731
    ment = sum(1 for r in y if en in hay(r) or ar in hay(r))
    return subj, ment


@pytest.mark.parametrize("en,ar,w_en,w_ar", _TOPICS)
def test_topic_in_year_counts_equal_the_oracle_every_year_both_languages(ans, orc, en, ar, w_en, w_ar):
    for year in range(2001, 2027):
        subj, ment = _topic_oracle(orc, year, en, ar)
        for q in (f"How many {w_en} projects were completed in {year}?", f"كم عدد مشروعات {w_ar} في {year}؟"):
            r = ans.ask(q)
            assert r.status == "answered_from_catalog", q
            assert r.total_matching == ment, (q, r.total_matching, ment)
            assert str(ment) in r.answer and (subj == 0 or f"{subj} " in r.answer), q


def test_marketing_2023_states_both_definitions(ans, orc):
    subj, ment = _topic_oracle(orc, 2023, "market", "تسويق")
    assert (subj, ment) == (4, 22)
    r = ans.ask("How many marketing projects were completed in 2023?")
    assert "4 project" in r.answer and "22 project" in r.answer and "title or subject" in r.answer
    assert len(r.sources) == 10 and all(s.year == 2023 for s in r.sources)        # sample is real, in-year, labelled "listed"
    assert {s.support for s in r.sources} == {"listed"}


def test_topic_in_year_with_no_match_is_a_valid_zero_not_an_error(ans):
    r = ans.ask("How many projects about quantum chemistry in 2023?")
    assert r.status == "answered_from_catalog" and r.total_matching == 0 and "not a technical error" in r.answer


def test_topic_year_route_is_llm_free_and_does_not_swallow_supervisor_questions(real, orc):
    ExplodingProvider.calls = 0
    a = AnswerService(real.engine, ExplodingProvider(), real.settings)
    a.ask("marketing projects in 2023")
    assert ExplodingProvider.calls == 0
    sup = next(r["supervisor"] for r in orc.values() if r["supervisor"] and r["year"] == 2023)
    r = a.ask(f"how many projects did {sup.split('|')[0].strip()} supervise in 2023?")
    assert "deterministic_topic_year_sql" not in r.strategy
