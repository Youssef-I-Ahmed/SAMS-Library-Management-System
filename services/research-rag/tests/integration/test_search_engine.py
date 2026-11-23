import pytest

from src.data.normalize_ar import person_key
from src.retrieval.types import Filters


def ids(res):
    return [h.record_id for h in res.hits]


def test_exact_title_search(engine):
    r = engine.search("Internet Security", "title")
    assert ids(r) == ["10"] and r.hits[0].match_type == "exact" and r.exhaustive and r.total == 1


def test_exact_title_matches_spelling_variants_and_repeated_titles(engine):
    r = engine.search("الاندماج المصرفي", "title", page_size=50)
    assert set(ids(r)) == {"2", "3", "4"}                       # alef-hamza / ya variants + repeated title
    assert all(h.match_type == "exact" for h in r.hits)


def test_partial_title_search_is_labelled_partial(engine):
    r = engine.search("المصرفى", "title", page_size=50)
    assert "1" in set(ids(r)) and "5" not in set(ids(r))      # "المصرفية" is a different word, not a partial hit
    assert all(h.match_type in ("exact", "partial") for h in r.hits)
    assert {h.match_type for h in r.hits if h.record_id == "1"} == {"partial"}
    r2 = engine.search("buying behavior", "title")
    assert ids(r2) == ["11"]


def test_fuzzy_title_is_approximate_only_when_requested(engine):
    assert engine.search("Onlin Banking Systm", "title").total == 0
    r = engine.search("Onlin Banking Systm", "title", fuzzy=True)
    assert "13" in ids(r) and all(h.match_type == "approximate" for h in r.hits)


def test_exact_supervisor_with_title_and_spelling_variants(engine):
    for q in ("سامي منصور", "د/ سامى منصور", "د/سامي منصور"):
        r = engine.search(q, "supervisor", page_size=100)
        assert r.supervisor_resolution.status == "exact"
        assert set(ids(r)) == {"1", "2", "4", "5", "14", "15"}, q
        assert r.exhaustive and r.total == 6


def test_multi_supervisor_records_found_for_each_supervisor(engine):
    a = set(ids(engine.search("سامي منصور", "supervisor", page_size=100)))
    b = set(ids(engine.search("ليلى حسن", "supervisor", page_size=100)))
    assert {"1", "5"} <= a and {"1", "5"} <= b
    rec = engine.get_record("1")
    assert [s.key for s in rec.supervisors] == ["سامي منصور", "ليلي حسن"]


def test_similar_names_are_never_merged(engine):
    r = engine.search("ليلى حسن", "supervisor")
    assert "6" not in ids(r)                                      # "ليلى حسين" is a different person
    assert [m.name for m in r.supervisor_resolution.similar_not_merged] == ["ليلى حسين"]
    r2 = engine.search("ليلى حسين", "supervisor")
    assert ids(r2) == ["6"]


def test_partial_supervisor_is_flagged_ambiguous_and_distinguishes_people(engine):
    r = engine.search("ليلى", "supervisor", page_size=50)
    assert r.supervisor_resolution.status == "ambiguous_partial"
    assert {m.name for m in r.supervisor_resolution.matched} == {"ليلى حسن", "ليلى حسين"}
    assert all(h.match_type == "partial" and h.matched_supervisor for h in r.hits)
    ex = engine.search("ليلى", "supervisor", supervisor_match="exact")
    assert ex.total == 0


def test_supervisor_all_matching_records_with_pagination(engine, records):
    expected = {r.record_id for r in records if any(s.key == person_key("كريم فؤاد") for s in r.supervisors)}
    assert len(expected) == 130
    seen, page = [], 1
    while True:
        r = engine.search("كريم فؤاد", "supervisor", page=page, page_size=25, sort="record_id")
        assert r.total == 130 and r.total_pages == 6 and r.exhaustive
        seen += ids(r)
        if page >= r.total_pages:
            break
        page += 1
    assert len(seen) == 130 and set(seen) == expected and len(set(seen)) == 130
    assert len(engine.search("كريم فؤاد", "supervisor", page=7, page_size=25).hits) == 0   # beyond the last page


def test_supervisor_key_selects_exactly_one_person(engine):
    r = engine.search("x", "supervisor", Filters(supervisor_key="ليلي حسين"))
    assert ids(r) == ["6"]


def test_subject_search_exact_and_partial(engine):
    r = engine.search("بترول", "subject", page_size=50)
    assert set(ids(r)) == {"6", "7"} and all(h.match_type == "exact" for h in r.hits)
    r = engine.search("تمويل", "subject", page_size=50)
    assert {"17", "18", "ب19"} == set(ids(r)) and all(h.match_type == "partial" for h in r.hits)


def test_multi_subject_record_found_under_each_subject(engine):
    assert "16" in ids(engine.search("حاسب آلى", "subject", page_size=50))
    assert "16" in ids(engine.search("بنوك", "subject", page_size=50))


def test_english_and_arabic_keyword_and_hybrid(engine):
    r = engine.search("social media consumer behavior", "hybrid")
    assert set(ids(r)[:2]) == {"11", "12"} and not r.exhaustive
    r = engine.search("ضغوط العمل", "keyword")
    assert ids(r)[0] == "9"
    r = engine.search("الاستثمار سوق الاوراق المالية", "hybrid")
    assert set(ids(r)[:2]) == {"17", "18"}


def test_semantic_mode_finds_spelling_variants(engine):
    r = engine.search("الإندماج المصرفى", "semantic")
    assert {"2", "3", "4"} <= set(ids(r)[:5]) and r.hits[0].match_type == "semantic"


def test_filters_year_subject_supervisor_language_callnumber(engine):
    r = engine.search("", "auto", Filters(year=2013), page_size=50)
    assert set(ids(r)) >= {"17", "18"} and all(engine.records[i].year == 2013 for i in ids(r))
    r = engine.search("", "auto", Filters(year_from=2010, year_to=2012, subject="بنوك"), page_size=50)
    assert set(ids(r)) == {"4", "3"}
    r = engine.search("المصرفى", "title", Filters(supervisor="سامي منصور"), page_size=50)
    assert set(ids(r)) == {"1", "2", "4"}
    r = engine.search("", "auto", Filters(language="en"), page_size=50)
    assert set(ids(r)) == {"10", "11", "12", "13"}
    r = engine.search("", "auto", Filters(call_number_prefix="338"), page_size=50)
    assert set(ids(r)) == {"6", "7"}
    # filter applied BEFORE ranking: a hybrid query restricted by filter still fills its results
    r = engine.search("البنوك", "hybrid", Filters(subject="حاسب آلى"))
    assert r.total and all("حاسب آلى" in engine.records[i].subjects for i in ids(r))


def test_filters_that_match_nothing_return_zero_not_error(engine):
    r = engine.search("", "auto", Filters(year=1850))
    assert r.total == 0 and r.hits == [] and r.total_pages == 1


def test_pagination_metadata_and_sorting(engine):
    # CONTRACT CHANGE (v2): an empty query with NO filter no longer lists the whole catalogue ("empty is not a match for
    # everything"); browsing is done with a filter. A year-range filter is used here to page through every dated record.
    f = Filters(year_from=1900, year_to=2100)
    dated = sum(1 for r in engine.records.values() if r.year is not None)
    r = engine.search("", "auto", f, sort="year_asc", page=2, page_size=10)
    assert r.page == 2 and r.page_size == 10 and r.total == dated and r.total_pages == -(-r.total // 10)
    ys = [h.year for h in engine.search("", "auto", f, sort="year_asc", page_size=100).hits if h.year]
    assert ys == sorted(ys)
    t = engine.search("", "auto", f, sort="title", page_size=100)
    assert t.hits[0].title is not None


def test_page_size_is_capped(engine):
    assert engine.search("", "auto", page_size=10_000).page_size == engine.s.max_page_size


def test_empty_and_missing_fields_are_searchable_not_crashing(engine):
    r = engine.get_record("13")
    assert r.supervisors == [] and "supervisor_missing" in r.flags
    r = engine.get_record("14")
    assert r.year is None and r.subjects == []
    r = engine.get_record("15")
    assert r.year is None and r.year_raw == "2103" and "year_suspect" in r.flags
    assert engine.search("تقييم الأداء المالي", "title").total == 1
    e = engine.search("", "all")                                        # v2: an empty query without a filter matches NOTHING
    assert e.total == 0 and "empty_query" in e.strategy
    assert engine.search("", "all", Filters(year_from=1900)).total == sum(1 for r in engine.records.values() if r.year is not None)  # filter-only browse still works
    assert engine.search("", "title").total == 0                        # an empty TITLE search is not a match for everything


def test_record_detail_and_stable_ids(engine):
    rec = engine.get_record("ب19")
    assert rec.record_id == "ب19" and rec.title.startswith("دور صناديق")
    assert engine.get_record("nope") is None


def test_possible_duplicates_detected_but_nothing_deleted(engine):
    d = engine.possible_duplicates("الاستثمار في سوق الأوراق المالية", exclude_id="17")
    assert any(x["record_id"] == "18" for x in d)
    assert engine.get_record("17") and engine.get_record("18")          # both still exist
    assert {x["record_id"] for x in engine.possible_duplicates("الاندماج المصرفى", exclude_id="2")} >= {"3", "4"}


def test_auto_mode_tiers_exact_title_first(engine):
    r = engine.search("Internet Security", "auto")
    assert r.hits[0].record_id == "10" and r.hits[0].match_type == "exact" and not r.exhaustive
    r = engine.search("سامي منصور", "auto", page_size=100)
    assert set(ids(r)[:6]) == {"1", "2", "4", "5", "14", "15"}


def test_list_facets(engine):
    sups = engine.list_supervisors(page_size=100)
    assert sups["total"] == 7 and sups["items"][0].name == "كريم فؤاد" and sups["items"][0].record_count == 130
    assert {s["name"] for s in engine.list_subjects()} >= {"بنوك", "بترول"}
    assert engine.list_years()[0]["year"] == 2000
