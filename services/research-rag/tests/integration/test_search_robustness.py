"""Audit fixes: short/empty/gibberish queries, spelling-variant disclosure, normalization rules (independent expectations)."""
import pytest

from src.data.normalize_ar import normalize_text, person_key
from src.retrieval.types import Filters


@pytest.mark.parametrize("q", ["ا", "م", "ب", "a", "د", "؟", "!"])
@pytest.mark.parametrize("mode", ["auto", "student", "supervisor", "title", "subject", "hybrid"])
def test_single_character_queries_return_nothing_with_a_note(engine, q, mode):
    r = engine.search(q, mode)
    assert r.total == 0 and "query_too_short" in r.strategy and r.notes


@pytest.mark.parametrize("mode", ["student", "supervisor", "title", "subject"])
def test_empty_query_in_structured_mode_is_not_a_match_for_everything(engine, mode):
    r = engine.search("", mode)
    assert r.total == 0 and "empty_query" in r.strategy
    # ... but filters alone still browse
    assert engine.search("", mode, Filters(year=2010)).total > 0


def test_single_letter_token_never_prefix_matches_inside_a_longer_name(engine):
    # "سامي م" : the lone letter م must not prefix-match "منصور" - and it is not an exact token either
    r = engine.search("سامي م", "supervisor")
    assert r.supervisor_resolution.status == "none" and r.total == 0
    r = engine.search("سامي من", "supervisor")                 # two letters do prefix-match
    assert r.total > 0 and all(h.match_type == "partial" for h in r.hits)


@pytest.mark.parametrize("q", ["qqqqzzzz xxxx", "asdfghjkl", "ksjdhfkjsd", "<script>alert(1)</script>", "'; DROP TABLE rag_records;--", "😀😀"])
def test_gibberish_and_hostile_strings_are_safe_and_not_presented_as_exact(engine, svc, q):
    r = engine.search(q, "auto")
    assert not r.exhaustive and all(h.match_type not in ("exact",) for h in r.hits)
    assert svc.store.count() > 100                              # nothing was dropped / executed


def test_supervisor_spelling_variants_are_disclosed_not_hidden(engine):
    r = engine.search("سامي منصور", "supervisor")
    brief = r.supervisor_resolution.matched[0]
    names = {v.name for v in brief.variants}
    assert len(names) >= 2 and {"سامي منصور", "سامى منصور"} <= names          # originals preserved (ya vs alef-maqsura)
    assert sum(v.record_count for v in brief.variants) >= brief.record_count


def test_similar_but_different_people_are_not_merged(engine):
    a = engine.search("ليلى حسن", "supervisor"); b = engine.search("ليلى حسين", "supervisor")
    ids_a, ids_b = {h.record_id for h in a.hits}, {h.record_id for h in b.hits}
    assert ids_a and ids_b and not (ids_a & ids_b) or ids_a != ids_b
    assert a.supervisor_resolution.matched[0].key != b.supervisor_resolution.matched[0].key


# ---- normalization audit: expectations written independently of the implementation
@pytest.mark.parametrize("a,b", [
    ("أحمد", "احمد"), ("إسراء", "اسراء"), ("آمنة", "امنه"), ("مُحَمَّد", "محمد"), ("محمــد", "محمد"),
    ("على", "علي"), ("  محمد   علي ", "محمد علي"), ("٢٠٢٤", "2024"), ("Mohamed ALI", "mohamed ali"),
])
def test_normalization_equivalences(a, b):
    assert normalize_text(a) == normalize_text(b)


def test_normalization_keeps_different_names_different():
    assert normalize_text("محمد علي") != normalize_text("محمد عمر")
    assert normalize_text("دعاء") != normalize_text("عاء")            # leading dal is not a title
    assert person_key("د/ دعاء محمد") == person_key("دعاء محمد")      # ...but a real academic title is stripped
    assert person_key("دعاء محمد") != person_key("محمد")


def test_mixed_arabic_english_query_normalizes_each_script():
    assert normalize_text("تأثير Social-Media على المبيعات") == "تاثير social media علي المبيعات"
