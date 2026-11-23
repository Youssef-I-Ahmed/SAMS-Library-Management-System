import pytest

from src.data.normalize_ar import (detect_language, normalize_text, person_key, search_terms, strip_person_title)
from src.data.schema import RecordIn, build_record, split_multi, split_supervisors


@pytest.mark.parametrize("a,b", [
    ("الإندماج المصرفى", "الاندماج المصرفي"),          # alef hamza + ya/alef-maqsura
    ("مدرسة", "مدرسه"),                                  # ta marbuta
    ("المُصْرِفِيّ", "المصرفي"),                          # diacritics
    ("الـــبنوك", "البنوك"),                              # tatweel
    ("سنة ٢٠١٠", "سنة 2010"),                            # Arabic-Indic digits
    ("Internet   SECURITY!", "internet security"),
    ("رأفت", "رافت"),
])
def test_arabic_normalization_variants(a, b):
    assert normalize_text(a) == normalize_text(b)


@pytest.mark.parametrize("raw,expected", [
    ("د/ هبة صبري", "هبه صبري"), ("د/هبه صبرى", "هبه صبري"), ("أ.د/ محمد", "محمد"), ("د. أحمد", "احمد"),
    ("دعاء محمد", "دعاء محمد"),            # a name that merely starts with dal must NOT be truncated
    ("Dr. John Smith", "john smith"),
])
def test_person_key_strips_titles_but_not_names(raw, expected):
    assert person_key(raw) == expected


def test_strip_person_title_keeps_display_name():
    assert strip_person_title("د/ سامي منصور") == "سامي منصور"


def test_search_terms_stem_and_stopwords():
    assert "بنوك" in search_terms("دور البنوك في التنمية")
    assert "في" not in search_terms("دور البنوك في التنمية")
    assert search_terms("Social Media Systems") == ["social", "media", "system"]


def test_detect_language():
    assert detect_language("الاندماج المصرفى") == "ar"
    assert detect_language("Internet Security") == "en"
    assert detect_language("") == "unknown"


def test_split_multi_handles_na_and_blanks():
    assert split_multi("NA") == [] and split_multi("") == [] and split_multi(None) == []
    assert split_multi(" a |  b | NA | ") == ["a", "b"]


def test_supervisors_joined_by_title_are_split():
    assert split_supervisors("د/ محمد عبد العليم د/ عمرو التقي") == ["د/ محمد عبد العليم", "د/ عمرو التقي"]
    assert split_supervisors("د/ بدر السنوسي | د/هبة صبري") == ["د/ بدر السنوسي", "د/هبة صبري"]


def test_build_record_flags_and_never_drops_data():
    r = build_record(record_id="7", title="  عنوان   تجريبي ", students="NA", supervisors="د/ سامي منصور | سامى منصور", year="2103",
                     subjects="NA", extent="198 ص", dimension="NA", raw={"x": 1})
    assert r.title == "عنوان تجريبي"
    assert r.year is None and r.year_raw == "2103"
    for f in ("title_whitespace_fixed", "year_suspect", "students_missing", "subject_missing"):
        assert f in r.flags
    assert r.pages == 198 and r.raw == {"x": 1}
    assert len(r.supervisors) == 1 and "supervisor_repeated_in_record" in r.flags   # same person twice collapsed


def test_build_record_missing_year_and_id_rules():
    r = build_record(record_id="ب908", title="t", year="NA")
    assert r.year is None and "year_missing" in r.flags and "record_id_non_numeric" in r.flags
    with pytest.raises(ValueError):
        build_record(record_id="", title="t")
    with pytest.raises(ValueError):
        build_record(record_id="1", title="   ")
    with pytest.raises(ValueError):
        build_record(record_id="1", title="t", year=3014, strict_year=True)


def test_record_in_validation():
    with pytest.raises(ValueError):
        RecordIn(title="   ")
    with pytest.raises(ValueError):
        RecordIn(title="t", record_id="bad id with spaces")
    assert RecordIn(title=" a   b ", supervisors=["x", "NA", " "]).supervisors == ["x"]


def test_content_hash_changes_with_content_not_with_raw():
    a = build_record(record_id="1", title="t", year=2010, raw={"a": 1})
    b = build_record(record_id="1", title="t", year=2010, raw={"a": 2})
    c = build_record(record_id="1", title="t", year=2011)
    assert a.content_hash() == b.content_hash() != c.content_hash()
