"""Record schema, validation and normalisation (one code path for dataset import and admin input).

Dataset columns actually present in Project.xlsx (sheet "Research"):
BOOK_CODE, TITLE, Students, Supervisor, WORK | PUBLISHING_DATE, WORK | CALL_NUM,
WORK | EXTENT, WORK | DIMENSION, SUBJECTS_ALL.  There is NO abstract / full-text column.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from pydantic import BaseModel, Field, field_validator

from src.data.normalize_ar import detect_language, normalize_text, person_key, strip_person_title

MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "-"}
SEP = "|"
ID_RE = re.compile(r"^[\w.\-]{1,64}$", re.UNICODE)

# source column -> internal field
SOURCE_COLUMNS = {
    "BOOK_CODE": "record_id",
    "TITLE": "title",
    "Students": "students",
    "Supervisor": "supervisors",
    "WORK | PUBLISHING_DATE": "year",
    "WORK | CALL_NUM": "call_number",
    "WORK | EXTENT": "extent",
    "WORK | DIMENSION": "dimension",
    "SUBJECTS_ALL": "subjects",
}


_HEADER_ALIASES = {
    "BOOK_CODE": "BOOK_CODE", "TITLE": "TITLE", "STUDENTS": "Students", "SUPERVISOR": "Supervisor",
    "PUBLISHING_DATE": "WORK | PUBLISHING_DATE", "CALL_NUM": "WORK | CALL_NUM",
    "EXTENT": "WORK | EXTENT", "DIMENSION": "WORK | DIMENSION",
    "SUBJECTS": "SUBJECTS_ALL", "SUBJECTS_ALL": "SUBJECTS_ALL",
}


def canonical_header(h: Any) -> str:
    """Map a spreadsheet header to the canonical column name. The team renamed columns between
    dataset versions ('WORK | PUBLISHING_DATE' -> ' PUBLISHING_DATE', 'SUBJECTS_ALL' -> 'SUBJECTS'); both
    spellings are accepted. Unknown headers are returned stripped, so they are reported, not guessed."""
    t = "" if h is None else re.sub(r"\s+", " ", str(h)).strip()
    k = t.upper()
    if k.startswith("WORK |"):
        k = k[6:].strip()
    return _HEADER_ALIASES.get(k, t)


def missing_source_columns(header: list[str]) -> list[str]:
    return [c for c in SOURCE_COLUMNS if c not in header]


def is_missing(v: Any) -> bool:
    return v is None or str(v).strip().lower() in MISSING_TOKENS


def split_multi(v: Any) -> list[str]:
    """Split a '|' separated cell into trimmed non-missing parts (order preserved)."""
    if isinstance(v, (list, tuple)):
        parts = [str(x) for x in v]
    elif is_missing(v):
        return []
    else:
        parts = str(v).split(SEP)
    out = []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip()
        if not is_missing(p):
            out.append(p)
    return out


# Some cells list two people separated only by an academic title ("د/ س د/ ص") instead of "|".
_EMBEDDED_TITLE = re.compile(r"\s+(?=(?:(?:أ|ا)\s*\.?\s*)?د\s*[/.]\s*\S)")


def split_supervisors(v: Any) -> list[str]:
    """Split on '|' AND on an embedded academic-title boundary ('د/ x د/ y' -> ['د/ x', 'د/ y'])."""
    out: list[str] = []
    for part in split_multi(v):
        out.extend(p.strip() for p in _EMBEDDED_TITLE.split(part) if p.strip())
    return out


class Supervisor(BaseModel):
    key: str          # canonical comparison key (normalised, title stripped)
    name: str         # display name (title stripped, whitespace collapsed)
    raw: str          # value exactly as given in the source


class Record(BaseModel):
    """Normalised record as stored and indexed."""
    record_id: str
    title: str
    title_norm: str
    students: list[str] = []
    supervisors: list[Supervisor] = []
    year: int | None = None
    year_raw: str | None = None
    call_number: str | None = None
    extent_raw: str | None = None
    pages: int | None = None
    dimension_raw: str | None = None
    subjects: list[str] = []
    language: str = "unknown"          # derived from the title (not a source column)
    flags: list[str] = []
    raw: dict[str, Any] = {}           # original source values, untouched (traceability)

    def embedding_text(self) -> str:
        """Text that is embedded: title + subjects. (Supervisor/student names are deliberately
        excluded: they add noise to topical similarity and are served by structured search.)"""
        parts = [self.title] + self.subjects
        return " | ".join(p for p in parts if p)

    def content_hash(self) -> str:
        payload = json.dumps(
            [self.record_id, self.title, self.subjects, [s.key for s in self.supervisors], self.year,
             self.call_number, self.students, self.extent_raw, self.dimension_raw],
            ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    def embed_hash(self, model_id: str) -> str:
        return hashlib.sha256((model_id + "\x00" + self.embedding_text()).encode()).hexdigest()[:32]


class RecordIn(BaseModel):
    """Admin/API input for create / replace. Only record_id (optional on create) and title are required."""
    record_id: str | None = Field(default=None, description="Stable ID (BOOK_CODE). Auto-assigned on create if omitted.")
    title: str = Field(min_length=1, max_length=1000)
    students: list[str] = Field(default_factory=list, max_length=50)
    supervisors: list[str] = Field(default_factory=list, max_length=20)
    year: int | None = None
    call_number: str | None = Field(default=None, max_length=50)
    extent: str | None = Field(default=None, max_length=100)
    dimension: str | None = Field(default=None, max_length=100)
    subjects: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", v).strip()
        if not v:
            raise ValueError("title must not be blank")
        return v

    @field_validator("record_id")
    @classmethod
    def _id(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not ID_RE.match(v):
            raise ValueError("record_id must be 1-64 chars: letters, digits, '.', '-', '_'")
        return v

    @field_validator("students", "supervisors", "subjects")
    @classmethod
    def _lists(cls, v: list[str]) -> list[str]:
        out = []
        for x in v:
            x = re.sub(r"\s+", " ", x).strip()
            if x and not is_missing(x):
                if len(x) > 200:
                    raise ValueError("list items must be <= 200 characters")
                out.append(x)
        return out


def parse_pages(extent: str | None) -> int | None:
    if not extent:
        return None
    m = re.search(r"(\d{1,5})", extent)
    return int(m.group(1)) if m else None


def build_record(
    *, record_id: str, title: str, students=None, supervisors=None, year=None, call_number=None,
    extent=None, dimension=None, subjects=None, raw: dict | None = None,
    min_year: int = 1990, max_year: int = 2027, alias_map: dict[str, str] | None = None,
    strict_year: bool = False,
) -> Record:
    """Normalise one record. Never drops information; problems are recorded in ``flags``.

    strict_year=True (admin input) raises ValueError on an implausible year; dataset import
    (strict_year=False) keeps the raw value in ``year_raw``, sets ``year`` to None and flags it.
    """
    flags: list[str] = []
    rid = str(record_id).strip()
    if not rid:
        raise ValueError("record_id is empty")
    raw_title = str(title) if title is not None else ""
    clean_title = re.sub(r"\s+", " ", raw_title).strip()
    if clean_title != raw_title:
        flags.append("title_whitespace_fixed")
    if not clean_title:
        raise ValueError("title is empty")
    if re.search("[ً-ْـ]", clean_title):
        flags.append("title_has_diacritics_or_tatweel")
    if not re.fullmatch(r"\d+", rid):
        flags.append("record_id_non_numeric")

    # year
    year_raw = None if is_missing(year) else str(year).strip()
    year_val: int | None = None
    if year_raw is None:
        flags.append("year_missing")
    else:
        try:
            y = int(float(year_raw))
            if min_year <= y <= max_year:
                year_val = y
            else:
                if strict_year:
                    raise ValueError(f"year {y} outside plausible range {min_year}-{max_year}")
                flags.append("year_suspect")
        except ValueError:
            if strict_year:
                raise
            flags.append("year_suspect")

    # supervisors: split, normalise, de-duplicate inside the record (keeping order)
    sups: list[Supervisor] = []
    seen: set[str] = set()
    sup_in = split_supervisors(supervisors)
    if not sup_in:
        flags.append("supervisor_missing")
    for s in sup_in:
        k = person_key(s)
        if alias_map:
            k = alias_map.get(k, k)
        if not k:
            continue
        if k in seen:
            flags.append("supervisor_repeated_in_record")
            continue
        seen.add(k)
        sups.append(Supervisor(key=k, name=strip_person_title(s), raw=s))

    studs = split_multi(students)
    if not studs:
        flags.append("students_missing")
    subs = split_multi(subjects)
    if not subs:
        flags.append("subject_missing")
    ext_raw = None if is_missing(extent) else str(extent).strip()
    dim_raw = None if is_missing(dimension) else str(dimension).strip()
    cn = None if is_missing(call_number) else str(call_number).strip()

    return Record(
        record_id=rid, title=clean_title, title_norm=normalize_text(clean_title), students=studs,
        supervisors=sups, year=year_val, year_raw=year_raw, call_number=cn, extent_raw=ext_raw,
        pages=parse_pages(ext_raw), dimension_raw=dim_raw, subjects=subs,
        language=detect_language(clean_title), flags=sorted(set(flags)), raw=raw or {},
    )
