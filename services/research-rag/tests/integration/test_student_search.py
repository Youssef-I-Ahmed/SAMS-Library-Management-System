"""Requirement: student search returns ALL records of a student, supports partial names, never merges similar names,
handles multi-student records, and follows admin add/edit/delete. Synthetic corpus only (no real names)."""
import pytest

from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings, row, token
from src.data.loader import rows_to_records
from src.data.schema import RecordIn


@pytest.fixture()
def ssvc(tmp_path):
    rows = [
        row(1, "عنوان اول", "ليلى حسن", 2010, "بنوك", "سلمى كمال أحمد | منى رضا"),
        row(2, "عنوان ثان", "ليلى حسن", 2011, "بنوك", "سلمى  كمال احمد"),                  # same person: spacing + hamza
        row(3, "عنوان ثالث", "نادر فتحي", 2012, "بترول", "سلمى كمال أحمد | سلمى كمال أحمد"),  # listed twice in one record
        row(4, "عنوان رابع", "نادر فتحي", 2013, "بترول", "سلمى كمال احمد علي"),              # different (longer) name
        row(5, "عنوان خامس", "نادر فتحي", 2014, "بترول", "سلمي كمال أحمد"),                  # ya/alef-maqsura variant: same key
        row(6, "عنوان سادس", "منى رشاد", 2015, "موارد بشرية", "سلمى كمال محمد"),             # similar but DIFFERENT person
        row(7, "عنوان سابع", "منى رشاد", 2016, "موارد بشرية", "NA"),                          # no students
        row(8, "Fourth English Title", "منى رشاد", 2017, "حاسب آلى", "Omar Hassan | Sara Adel"),
        row(9, "Fifth English Title", "منى رشاد", 2018, "حاسب آلى", "omar  hassan"),
    ]
    recs, rej = rows_to_records(rows)
    assert not rej
    s = build_services(make_settings(tmp_path), load=False, embedder=HashingEmbedder(256))
    s.indexer.full_rebuild(recs)
    s.engine.load()
    return s


def ids(res):
    return sorted(h.record_id for h in res.hits)


def test_exact_student_returns_every_record_even_with_spelling_variants(ssvc):
    r = ssvc.engine.search("سلمى كمال أحمد", "student")
    assert r.exhaustive and r.total == 4 and ids(r) == ["1", "2", "3", "5"]      # 1,2,3,5 - record 3 counted once
    assert all(h.match_type == "exact" for h in r.hits)
    assert r.student_resolution.status == "exact"


def test_similar_names_are_not_merged_but_are_hinted(ssvc):
    r = ssvc.engine.search("سلمى كمال أحمد", "student")
    sim = {b.name for b in r.student_resolution.similar_not_merged}
    assert any("محمد" in n for n in sim) or any("احمد علي" in n or "أحمد علي" in n for n in sim)
    assert "4" not in ids(r) and "6" not in ids(r)


def test_partial_student_name_is_labelled_approximate_and_lists_each_person(ssvc):
    r = ssvc.engine.search("سلمى كمال", "student")
    assert r.student_resolution.status == "ambiguous_partial"
    names = {m.name: m.record_count for m in r.student_resolution.matched}
    assert len(names) == 3 and sorted(names.values()) == [1, 1, 4]
    assert r.total == 6 and all(h.match_type == "partial" for h in r.hits)
    assert {h.matched_student for h in r.hits} == set(names)


def test_student_key_selects_one_person_and_pagination_is_lossless(ssvc):
    key = ssvc.engine.search("سلمى كمال أحمد", "student").student_resolution.matched[0].key
    got, page = [], 1
    while True:
        r = ssvc.engine.search("", "student", __import__("src.retrieval.types", fromlist=["Filters"]).Filters(student_key=key),
                               page=page, page_size=1)
        got += [h.record_id for h in r.hits]
        if page >= r.total_pages:
            break
        page += 1
    assert sorted(got) == ["1", "2", "3", "5"] and len(got) == len(set(got))


def test_english_student_names_case_and_spacing_insensitive(ssvc):
    r = ssvc.engine.search("OMAR HASSAN", "student")
    assert r.total == 2 and ids(r) == ["8", "9"]


def test_unknown_student_and_empty_records(ssvc):
    r = ssvc.engine.search("لا يوجد طالب بهذا الاسم", "student")
    assert r.total == 0 and r.exhaustive and r.student_resolution.status == "none"
    assert ssvc.engine.get_record("7").students == []


def test_student_filter_combines_with_other_filters(ssvc):
    from src.retrieval.types import Filters
    r = ssvc.engine.search("", "all", Filters(student="سلمى كمال أحمد", year_from=2012))
    assert ids(r) == ["3", "5"]


def test_hits_carry_students_and_auto_mode_lists_exact_student_first(ssvc):
    r = ssvc.engine.search("سلمى كمال أحمد", "auto")
    assert r.hits[0].matched_student and r.hits[0].students
    assert {"1", "2", "3", "5"} <= set(ids(r))


def test_student_index_follows_admin_add_edit_delete(ssvc):
    from src.admin_ops import RecordAdmin
    ops = RecordAdmin(ssvc)
    new = ops.create(RecordIn(title="عنوان جديد للاختبار", students=["طالب فريد الاسم"], year=2024), actor="t", role="ADMIN")
    rid = new["record_id"]
    assert ssvc.engine.search("طالب فريد الاسم", "student").total == 1
    ops.patch(rid, {"students": ["طالب معدل الاسم"]}, actor="t", role="ADMIN")
    assert ssvc.engine.search("طالب فريد الاسم", "student").total == 0
    assert ssvc.engine.search("طالب معدل الاسم", "student").total == 1
    ops.delete(rid, actor="t", role="ADMIN")
    assert ssvc.engine.search("طالب معدل الاسم", "student").total == 0
    assert ssvc.engine.search("سلمى كمال أحمد", "student").total == 4      # other records untouched


def test_student_api_endpoints(ssvc):
    from fastapi.testclient import TestClient
    from api.main import create_app
    h = token(ssvc.settings)
    with TestClient(create_app(services=ssvc)) as c:
        j = c.get("/students/records", params={"name": "سلمى كمال أحمد"}, headers=h).json()
        assert j["total"] == 4 and j["exhaustive"] is True and j["student_resolution"]["status"] == "exact"
        assert all(x["students"] for x in j["hits"])
        key = j["student_resolution"]["matched"][0]["key"]
        assert c.get("/students/records", params={"key": key, "page_size": 2, "page": 2}, headers=h).json()["page"] == 2
        assert c.get("/students/records", params={"key": "nope nope"}, headers=h).status_code == 404
        assert c.get("/students/records", headers=h).status_code == 422
        assert c.get("/students", params={"q": "سلمى"}, headers=h).json()["total"] == 3
        s = c.get("/search", params={"q": "سلمى كمال", "mode": "student"}, headers=h).json()
        assert s["total"] == 6 and s["student_resolution"]["status"] == "ambiguous_partial"
        assert c.get("/students").status_code == 401


def test_name_only_matching_is_disclosed_and_exact_spelling_filter_works(ssvc):
    r = ssvc.engine.search("سلمى كمال أحمد", "student")
    assert "name only" in r.student_resolution.note
    brief = r.student_resolution.matched[0]
    assert len(brief.variants) >= 2 and {v.name for v in brief.variants} >= {"سلمى كمال أحمد", "سلمي كمال أحمد"}  # originals kept
    strict = ssvc.engine.search("سلمي كمال أحمد", "student", supervisor_match="spelling")   # the ya-spelling only (record 5)
    assert ids(strict) == ["5"] and strict.exhaustive
    assert ids(ssvc.engine.search("سلمي كمال أحمد", "student")) == ["1", "2", "3", "5"]


def test_spelling_exact_api_flag(ssvc):
    from fastapi.testclient import TestClient
    from api.main import create_app
    h = token(ssvc.settings)
    with TestClient(create_app(services=ssvc)) as c:
        j = c.get("/students/records", params={"name": "سلمي كمال أحمد", "spelling_exact": True}, headers=h).json()
        assert j["total"] == 1 and j["hits"][0]["record_id"] == "5"
        assert c.get("/students/records", params={"key": "x y", "spelling_exact": True}, headers=h).status_code in (404, 422)
