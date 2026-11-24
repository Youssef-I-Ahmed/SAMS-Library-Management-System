"""v15: a topic question lists every book of the subject (+ the closest books); nothing else changes."""
import pytest

from sams_rag.catalog import books_df
from sams_rag.config import CONFIG
from sams_rag.engine import finish, hybrid_search, rag_answer, retrieve, serialize
from sams_rag.recency import year_of
from sams_rag.text import normalize_text


def _filed_under(heading):
    n = f" {normalize_text(heading)} "
    return set(books_df.index[books_df["subjects_norm"].map(lambda subs: any(n in f" {s} " for s in subs))])


def _listed_ids(out):
    return {b for g in out["all_books_groups"] for b in g}


def test_topic_question_lists_every_book_of_the_subject():
    out = rag_answer("كتب عن التسويق")
    assert out["all_books_complete"] and out["topic_list"]["headings"] == ["التسويق"]
    assert _filed_under("التسويق") <= _listed_ids(out)                       # all 154 records are listed
    assert out["topic_list"]["count"] > 100
    assert "«التسويق»" in out["coverage_note"] and "من أصل" in out["coverage_note"]


def test_closest_books_are_still_listed():
    out = rag_answer("كتب عن التسويق")
    closest = set(hybrid_search(out["search_query"], k=CONFIG["all_books_limit"], auto_filters=False)["book_id"])
    assert closest <= _listed_ids(out)                                         # nothing that showed before disappears


def test_most_specific_heading_is_used():
    assert rag_answer("كتب عن التسويق الإلكتروني")["topic_list"]["headings"] == ["التسويق الالكترونى"]


def test_two_subjects_means_books_of_both():
    out = rag_answer("التسويق في البنوك")
    from sams_rag.topics import _filed_under as filed, heading_synonyms
    both = (filed(normalize_text("التسويق"), heading_synonyms("التسويق"))       # v16: with the English headings too
            & filed(normalize_text("البنوك"), heading_synonyms("البنوك")))
    assert both and out["topic_list"]["count"] == sum(any(b in both for b in g) for g in out["all_books_groups"])
    assert out["topic_list"]["count"] < len(_filed_under("التسويق"))           # narrower than marketing alone


@pytest.mark.parametrize("q", ["التمويل المعاصر",            # a book title that contains the subject "التمويل"
                               "إزاي أسوّق منتج أونلاين"])     # no subject heading in the question
def test_not_a_topic_list(q):
    out = rag_answer(q)
    assert not out.get("topic_list") and not out["all_books_complete"]


def test_author_question_unchanged():
    out = rag_answer("كتب أحمد ماهر")
    assert out["all_books_complete"] and len(out["all_books"]) == 33 and not out.get("topic_list")


def test_switch_off_restores_the_closest_list(monkeypatch):
    monkeypatch.setitem(CONFIG, "topic_full_list", False)
    out = rag_answer("كتب عن التسويق")
    # the closest N records; near-duplicate records are merged into one row, so a row or two fewer is normal
    # (book_app.py raises N to 100 when the whole suite runs, and those 100 can hold a pair of duplicates)
    assert not out["all_books_complete"] and "in_topic" not in out["all_books"].columns
    assert CONFIG["all_books_limit"] - 3 <= len(out["all_books"]) <= CONFIG["all_books_limit"]


def test_newest_topic_list_ordered_by_year():
    out = rag_answer("أحدث كتب التسويق")
    years = [year_of(y) for y in out["all_books"]["year"]]
    assert out["topic_list"] and out["recency"] and all(a >= b for a, b in zip(years, years[1:]))


def test_serialized_and_staged():
    data = serialize(rag_answer("كتب عن المحاسبة"))
    assert data["topic_list"]["headings"] == ["المحاسبة"] and data["all_books"]["complete"]
    assert any(it["in_topic"] for it in data["all_books"]["items"])
    a, b = serialize(rag_answer("كتب عن المحاسبة")), serialize(finish(retrieve("كتب عن المحاسبة")))
    a.pop("latency_s"); b.pop("latency_s")
    assert a == b


def test_topic_list_takes_the_other_language_headings():
    # v16: "computer science" (16 books under the English heading) also lists the books filed under the Arabic
    # headings of the same field ("الحاسبات الالكترونية - برامج"...), not a heading that only uses computers
    from sams_rag.config import CONFIG
    from sams_rag.topics import topic_books
    heads, ids, syn = topic_books("computer science")
    assert heads == ["Computer science"] and "الحاسبات" in syn
    assert _filed_under("Computer science") < ids and len(ids) >= 70
    arabic = _filed_under("الحاسبات الالكترونية - برامج")
    assert arabic <= ids
    marketing_with_pc = {b for b in _filed_under("التسويق - تطبيقات الحاسب الالي")} - _filed_under("Computer science") \
        - {b for b, subs in zip(books_df.index, books_df["subjects_norm"]) if any(s.startswith("الحاسب") for s in subs)}
    assert not (marketing_with_pc & ids)
    CONFIG["topic_synonyms"] = False
    try:
        assert topic_books("computer science")[1] == _filed_under("Computer science")   # switch off -> as v15
    finally:
        CONFIG["topic_synonyms"] = True


def test_a_glossary_word_makes_a_topic_question():
    # v16: "الكمبيوتر" is no catalog heading, but its glossary equivalent "computer science" is -> same list
    from sams_rag.topics import topic_books
    a, b = topic_books("كتب عن الكمبيوتر"), topic_books("computer science")
    assert a and b and a[1] == b[1]
    assert topic_books("كتاب Java: How to program") is None          # a book title stays a title question
    assert topic_books("كتب عن الحاسب الالي")[1] == b[1]               # a glossary term, although a title has it
    assert topic_books("مقدمة في الحاسب الآلي") is None                # ... the title itself stays a title
