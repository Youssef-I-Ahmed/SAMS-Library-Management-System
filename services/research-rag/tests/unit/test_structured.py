"""Unit tests for the deterministic parsers (no database, no LLM): IDs, digits, years."""
import pytest

from src.data.normalize_ar import to_western_digits
from src.rag.structured import group_by_request, parse_project_ids, parse_years


@pytest.mark.parametrize("q,ids", [
    ("ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟", ["1113"]),
    ("ما عنوان المشروع رقم ١١١٣؟", ["1113"]),
    ("ما عنوان المشروع رقم ۱۱۱۳؟", ["1113"]),
    ("What is the title of project number 1113 and in which year was it published?", ["1113"]),
    ("project #1113", ["1113"]),
    ("رقم المشروع 7", ["7"]),
])
def test_ids_parsed_in_every_language_and_digit_set(q, ids):
    assert parse_project_ids(q) == ids


@pytest.mark.parametrize("q", [
    "كم عدد المشروعات المسجلة في سنة 2023؟",
    "How many projects were registered in 2023?",
    "ما موضوع القانون رقم 15 لسنة 2020",
    "",
])
def test_non_id_numbers_are_not_ids(q):
    assert not parse_project_ids(q)


def test_digit_folding():
    assert to_western_digits("٠١٢٣٤٥٦٧٨٩") == "0123456789"
    assert to_western_digits("۰۱۲۳۴۵۶۷۸۹") == "0123456789"
    assert to_western_digits("abc") == "abc"


def test_year_parser_never_crashes_on_hostile_input():
    for q in ["", " ", "؟؟؟", "9" * 500, "سنة 99999999999999999999", "'; DROP TABLE records;--"]:
        parse_years(q)
        group_by_request(q)
        parse_project_ids(q)


def test_project_number_followed_by_year_is_still_a_project_id_but_law_numbers_are_not():
    from src.rag.structured import parse_project_ids
    assert parse_project_ids("اعرض المشروع رقم 1113 لسنة 2007") == ["1113"]
    assert parse_project_ids("project number 1113 of 2007") == ["1113"]
    assert parse_project_ids("القانون رقم 91 لسنة 2005") == []
    assert parse_project_ids("رقم 91 لسنة 2005") == []
