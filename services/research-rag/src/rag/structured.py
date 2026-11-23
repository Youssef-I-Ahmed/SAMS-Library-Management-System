"""Deterministic question parsing for STRUCTURED operations (no LLM, no embeddings, no network).

Everything here is pure text -> intent logic. The answers themselves come from the database
(``RecordStore``) in ``AnswerService``; nothing in this module can invent a value.

Supported structured intents
  * exact project-ID lookup            "ما عنوان المشروع رقم 1113؟" / "title of project number 1113"
  * counts (year, year range, several years, supervisor, subject, student, total)
  * group-by breakdowns                "how many projects per year", "كم مشروع في كل سنة"

Design rules
  * Arabic-Indic / Eastern-Arabic / Western digits are all accepted and folded to ASCII.
  * An ID is extracted ONLY when the wording names a project/record/number explicitly. A number that is
    part of a law ("قانون رقم 91 لسنة 2005"), a call number, a page count or a year is never an ID.
  * Years are only 1900-2099 and only recognised as 4-digit tokens.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from src.data.normalize_ar import normalize_text, to_western_digits

MAX_IDS_PER_QUESTION = 20

# ---------------------------------------------------------------------------------------- text helpers


def _clean(question: str) -> str:
    """NFKC, digits -> ASCII, Arabic punctuation -> spaces/commas, zero-width and tatweel removed."""
    s = unicodedata.normalize("NFKC", question or "")
    s = re.sub("[​-‏‪-‮⁦-⁩﻿ـ]", "", s)
    s = to_western_digits(s)
    s = s.replace("،", ",").replace("؟", "?").replace("؛", ";")
    return s


# ---------------------------------------------------------------------------------------- exact project ID

_NUM = r"(\d{1,9})"
_SEP = r"\s*(?:,|&|\band\b|\bor\b|و|أو|او)\s*"
# the identifier list: 1113 | 1113 and 1198 | 1113, 1198, 1200 (Arabic "و" may be glued to the digit: "1113و1198")
_NUMLIST = rf"{_NUM}(?:{_SEP}\d{{1,9}})*"

# project-type nouns (AR with optional definite article / prepositions, EN singular/plural)
_NOUN_AR = r"(?:ال)?(?:مشروع(?:ات|ين)?|مشاريع|بحث|ابحاث|أبحاث|بحوث|رسال(?:ة|ه)|رسائل|سجل(?:ات)?|كتاب|دراس(?:ة|ه)|عمل)"
_NOUN_EN = r"(?:project|record|thesis|research|book|item|entry|paper|study|work)s?"
_ID_WORD_AR = r"(?:رقم|برقم|بالرقم|كود|بكود|رمز|برمز|معرف|المعرف|الرقم)"
_ID_WORD_EN = r"(?:id|code|number|no\.?|num\.?|nr\.?|#)"

# words that make a following "number N" NOT a project ID (laws, calls, pages, sizes ...)
_NOT_ID_BEFORE = re.compile(
    r"(?:قانون|قرار|لائحة|لائحه|مادة|ماده|معيار|فصل|باب|صفحة|صفحه|هاتف|تصنيف|طلب|"
    r"law|act|article|decree|regulation|standard|iso|section|chapter|page|phone|call|class|classification)\s*$",
    re.IGNORECASE)

_PATTERNS: list[re.Pattern] = [
    # "project number 1113" | "project id: 1113" | "project #1113" | "project no. 1113"
    re.compile(rf"\b{_NOUN_EN}\s*(?:{_ID_WORD_EN})\s*[:#\-]?\s*\(?\s*{_NUMLIST}", re.IGNORECASE),
    # "project 1113" (bare) - handled separately because it must not be a year
    # "number 1113 project" is rare; "id 1113" / "#1113" / "record id 1113"
    re.compile(rf"(?<![\w/]){_ID_WORD_EN}\s*[:\-]?\s*\(?\s*{_NUMLIST}", re.IGNORECASE),
    # Arabic: "المشروع رقم 1113" | "مشروع برقم ١١١٣" | "الرسالة كود 55"
    re.compile(rf"{_NOUN_AR}\s*(?:{_ID_WORD_AR})\s*[:#\-]?\s*\(?\s*{_NUMLIST}"),
    # Arabic: "رقم المشروع 1113" | "كود البحث: 1113"
    re.compile(rf"{_ID_WORD_AR}\s*{_NOUN_AR}\s*[:#\-]?\s*\(?\s*{_NUMLIST}"),
    # Arabic bare marker: "رقم 1113" (guarded by _NOT_ID_BEFORE)
    re.compile(rf"(?<![\w])(?:{_ID_WORD_AR})\s*[:#\-]?\s*\(?\s*{_NUMLIST}"),
]
# singular noun directly followed by a number: "المشروع 1113" / "project 1113"  (rejected for year-like numbers)
_BARE_SINGULAR = [
    re.compile(rf"\b(?:project|record|thesis|research|book|entry)\s+{_NUMLIST}", re.IGNORECASE),
    re.compile(rf"(?:^|\s)(?:ال)?(?:مشروع|بحث|رسالة|رساله|سجل|كتاب)\s+{_NUMLIST}"),
]
_HASH = re.compile(rf"#\s*{_NUMLIST}")


def _numbers_in(fragment: str) -> list[str]:
    return re.findall(r"\d{1,9}", fragment)


def _year_like(n: str) -> bool:
    return len(n) == 4 and 1900 <= int(n) <= 2099


def parse_project_ids(question: str) -> list[str]:
    """Project IDs (BOOK_CODE) the user asked about, in order, de-duplicated. [] when the question names none.

    IDs are returned as digit strings without leading zeros stripped (the stored IDs are digit strings).
    """
    s = _clean(question)
    found: list[str] = []

    def add(fragment: str) -> None:
        for n in _numbers_in(fragment):
            if n not in found:
                found.append(n)

    for pat in _PATTERNS:
        for m in pat.finditer(s):
            before = s[: m.start()].rstrip()
            if _NOT_ID_BEFORE.search(before) and not re.search(_NOUN_AR + r"\s*$|" + _NOUN_EN + r"\s*$", before, re.IGNORECASE):
                continue  # "قانون رقم 91", "call number 322": a number, but not a project ID
            tail_after = s[m.end(): m.end() + 14]
            if re.match(r"\s*(?:لسنة|لسنه|of\s+(?:19|20)\d\d)", tail_after) and not (
                re.search(_NOUN_AR, m.group(0)) or re.search(_NOUN_EN, m.group(0), re.IGNORECASE)
            ):
                continue  # bare "رقم 91 لسنة 2005" = law number; but "المشروع رقم 1113 لسنة 2007" IS a project ID + year
            add(m.group(0))
    for m in _HASH.finditer(s):
        add(m.group(0))
    if not found:  # bare "project 1113" - accepted only when the number cannot be read as a year
        for pat in _BARE_SINGULAR:
            for m in pat.finditer(s):
                for n in _numbers_in(m.group(0)):
                    if not _year_like(n) and n not in found:
                        found.append(n)
    return found[:MAX_IDS_PER_QUESTION]


# ---------------------------------------------------------------------------------------- requested attributes

ID_ATTRIBUTE_WORDS: dict[str, tuple[str, ...]] = {
    "title": ("عنوان", "العنوان", "title", "titled"),
    "year": ("سنة", "سنه", "عام", "متى", "تاريخ", "نشر", "نشره", "year", "when", "published", "publication", "date"),
    "supervisors": ("مشرف", "المشرف", "المشرفين", "اشراف", "supervisor", "supervisors", "supervised", "advisor", "adviser"),
    "students": ("طالب", "الطالب", "طلاب", "الطلاب", "مؤلف", "المؤلف", "اعد", "كتب", "student", "students", "author", "authors", "who wrote", "written by"),
    "subjects": ("تخصص", "التخصص", "موضوع", "الموضوع", "مجال", "subject", "subjects", "category", "specialization", "specialisation", "topic"),
    "call_number": ("رقم التصنيف", "رقم الطلب", "call number", "call no", "classification"),
    "extent": ("عدد الصفحات", "صفحات", "pages", "extent", "page count"),
    "dimension": ("مقاس", "ابعاد", "أبعاد", "dimension", "dimensions", "size"),
}


def requested_attributes(question: str) -> list[str]:
    """Stored fields the question asks about (canonical field order). [] -> show every stored field."""
    qn = f" {normalize_text(_clean(question))} "
    out = []
    for attr, words in ID_ATTRIBUTE_WORDS.items():
        if any(f" {normalize_text(w)} " in qn for w in words):
            out.append(attr)
    if "call_number" in out:       # "رقم التصنيف / call number" must not also be read as another attribute
        out = [a for a in out if a != "year"] if "تاريخ" in qn else out
    return out


# ---------------------------------------------------------------------------------------- counts / years

_YEAR = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_CUED_YEAR = re.compile(r"(?:سنة|سنه|عام|year|in|during|في|فى)\s*((?:1[0-8]|2[1-9])\d{2})(?!\d)", re.IGNORECASE)
_RANGE_MARK = re.compile(
    r"(?:من|بين|from|between)\s*(?:سنة|عام|year)?\s*((?:19|20)\d{2})\s*(?:إلى|الى|حتى|لغاية|و|to|until|till|through|and|-|–|—)\s*(?:سنة|عام|year)?\s*((?:19|20)\d{2})"
    r"|((?:19|20)\d{2})\s*(?:-|–|—|to|until|through)\s*((?:19|20)\d{2})",
    re.IGNORECASE)
_AFTER = re.compile(r"(?:بعد|after|since|منذ)\s*(?:سنة|عام|year)?\s*((?:19|20)\d{2})", re.IGNORECASE)
_BEFORE = re.compile(r"(?:قبل|before|until|حتى|prior to)\s*(?:سنة|عام|year)?\s*((?:19|20)\d{2})", re.IGNORECASE)


@dataclass
class YearSpec:
    years: list[int] = field(default_factory=list)       # discrete years ("in 2020 and 2023")
    year_from: int | None = None                           # inclusive range
    year_to: int | None = None

    @property
    def present(self) -> bool:
        return bool(self.years) or self.year_from is not None or self.year_to is not None

    def label(self, ar: bool) -> str:
        if self.years:
            return ("السنة: " if ar and len(self.years) == 1 else "السنوات: " if ar else "year: " if len(self.years) == 1 else "years: ") \
                + (", ".join(map(str, self.years)))
        if self.year_from is not None and self.year_to is not None:
            return (f"السنوات: {self.year_from}–{self.year_to}" if ar else f"years: {self.year_from}–{self.year_to}")
        if self.year_from is not None:
            return (f"من سنة {self.year_from}" if ar else f"from {self.year_from}")
        return (f"حتى سنة {self.year_to}" if ar else f"up to {self.year_to}")


def parse_years(question: str) -> YearSpec:
    s = _clean(question)
    spec = YearSpec()
    m = _RANGE_MARK.search(s)
    if m:
        a, b = [int(x) for x in m.groups() if x]
        spec.year_from, spec.year_to = min(a, b), max(a, b)
        return spec
    ma, mb = _AFTER.search(s), _BEFORE.search(s)
    if ma and mb:
        spec.year_from, spec.year_to = int(ma.group(1)), int(mb.group(1))
        return spec
    if ma:
        spec.year_from = int(ma.group(1))
        return spec
    if mb:
        spec.year_to = int(mb.group(1))
        return spec
    for y in _YEAR.findall(s):
        if int(y) not in spec.years:
            spec.years.append(int(y))
    if not spec.years:      # an out-of-range 4-digit year ("in 1850") is still a YEAR filter when a year cue precedes it
        for y in _CUED_YEAR.findall(s):
            if int(y) not in spec.years:
                spec.years.append(int(y))
    return spec


PROJECT_NOUNS = {normalize_text(w) for w in (
    "مشروع", "مشاريع", "مشروعات", "المشروعات", "المشاريع", "بحث", "ابحاث", "أبحاث", "بحوث", "الابحاث", "رسالة", "رسائل",
    "سجل", "سجلات", "كتاب", "كتب", "دراسة", "دراسات", "اطروحة", "اطروحات",
    "project", "projects", "research", "researches", "thesis", "theses", "record", "records", "paper", "papers", "study", "studies")}


def mentions_project_noun(question: str) -> bool:
    toks = set(normalize_text(_clean(question)).split())
    return bool(toks & PROJECT_NOUNS) or any(t.startswith(("وال", "بال")) and t[2:] in PROJECT_NOUNS for t in toks)


_GROUP_YEAR = re.compile(
    r"(?:لكل|في كل|حسب|بحسب|موزع(?:ة)?\s*(?:على|حسب)|توزيع)\s*(?:سنة|سنه|عام)|"
    r"\b(?:per|by|each|every)\s+year\b|\byearly\b|\bannual(?:ly)?\b|year\s*(?:by|-)\s*year", re.IGNORECASE)
_GROUP_SUBJECT = re.compile(
    r"(?:لكل|في كل|حسب|بحسب|توزيع)\s*(?:تخصص|موضوع|مجال)|\b(?:per|by|each|every)\s+(?:subject|category|specialization|specialisation)\b",
    re.IGNORECASE)


def group_by_request(question: str) -> str | None:
    """'year' | 'subject' when the question asks for a breakdown, else None."""
    s = normalize_text(_clean(question))
    raw = _clean(question)
    if _GROUP_YEAR.search(raw) or _GROUP_YEAR.search(s):
        return "year"
    if _GROUP_SUBJECT.search(raw) or _GROUP_SUBJECT.search(s):
        return "subject"
    return None
