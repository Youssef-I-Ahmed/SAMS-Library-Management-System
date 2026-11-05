"""Load and clean the catalog, build the 22-field records and the chunks (notebook Sections 2 and 4).

Runs once on import: reads the Excel file at CONFIG["data_path"] (a few seconds).
"""
import logging
import math
import os
import re

import numpy as np
import pandas as pd

from .config import CONFIG
from .text import detect_language

log = logging.getLogger("sams_rag")

from app.data_sources import snapshot_frame
raw_df = snapshot_frame()

NULL_TOKENS = {"", "NA", "N/A", "NAN", "NONE", "NULL", "-"}

COUNTRY_FIXES = {
    "Engalnd": "England", "soaodaia": "Saudi Arabia", "JORDON": "Jordan", "Indian": "India",
    "Aibahren": "Bahrain", "lebonon": "Lebanon", "alamarat": "UAE", "kwuit": "Kuwait",
    "almagrb": "Morocco", "Malysia": "Malaysia", "New Zeland": "New Zealand", "lybia": "Libya",
}

def clean_cell(value):
    if value is None or (isinstance(value, float) and math.isnan(value)) or value is pd.NA:
        return None
    value = re.sub(r"\s+", " ", str(value)).strip()
    return None if value.upper() in NULL_TOKENS else value

def split_multi(value):
    # 'a | b | c' -> ['a', 'b', 'c']
    if not isinstance(value, str) or not value:
        return []
    return [part.strip() for part in value.split("|") if part.strip() and part.strip().upper() not in NULL_TOKENS]

def parse_year(value):
    if value and re.fullmatch(r"\d{4}", value) and 1900 <= int(value) <= 2030:
        return int(value)
    return None

clean = raw_df.apply(lambda col: col.map(clean_cell))
clean = clean.astype(object).where(clean.notna(), None)      # one missing-value representation: None

books_df = pd.DataFrame({
    "book_code":   clean["BOOK_CODE"],
    "title":       clean["TITLE"],
    "authors":     clean["EDITORS"].map(split_multi),
    "subjects":    clean["SUBJECTS"].map(split_multi),
    "publishers":  clean["PUBLISHERS"].map(split_multi),
    "country":     clean["PUBLISHER_COUNTRIES"].map(lambda v: ", ".join(COUNTRY_FIXES.get(c, c) for c in split_multi(v)) or None),
    "year":        clean["PUBLISHING_DATE"].map(parse_year).astype("Int64"),
    "edition":     clean["EDITION_STATMENT"],
    "call_number": clean["CALL_NUM"],
    "isbn":        clean["ISBN"],
    "extent":      clean["EXTENT"],
    "series":      clean["SERIAL_ADDRESSES"],
    "note":        clean["GENERAL_NOTE"],
    "copies":      pd.to_numeric(clean["NUM_OF_COPIES"], errors="coerce").astype("Int64"),
})

# pandas >= 3 stores missing strings as NaN (which is truthy); force real None for scalar text fields
for col in ["book_code", "title", "country", "edition", "call_number", "isbn", "extent", "series", "note"]:
    books_df[col] = books_df[col].astype(object).where(books_df[col].notna(), None)

books_df = books_df[books_df["title"].notna()].copy()

# Duplicate MERGING (Diagram step 2: "Remove duplicates" -- without losing any information)
# Rows with the same title + authors + year + edition are the same book catalogued more than once
# (e.g. copies bought at different times). They become ONE record that keeps every book code,
# every copy number, every ISBN / call number, the union of topics and publishers, and the TOTAL copies.
# (missing year -> "" so the key is never NaN, on any pandas version; groupby would silently drop NaN keys)
year_key = books_df["year"].map(lambda y: "" if pd.isna(y) else str(int(y)))
dup_key = (books_df["title"] + "||" + books_df["authors"].map("|".join)
           + "||" + year_key + "||" + books_df["edition"].fillna(""))

def _union_lists(lists):
    # Union of several lists, first-seen order kept.
    out = []
    for lst in lists:
        for item in lst:
            if item not in out:
                out.append(item)
    return out

def _join_unique(values, sep=" | "):
    # Distinct non-empty values joined with sep (None if there are none).
    parts = []
    for v in values:
        for p in (str(v).split(sep) if v else []):
            if p and p not in parts:
                parts.append(p)
    return sep.join(parts) if parts else None

n_before = len(books_df)
merged_rows, n_groups_merged = [], 0
for _, grp in books_df.groupby(dup_key, sort=False, dropna=False):   # sort=False keeps the original row order
    base = grp.iloc[0].to_dict()
    base["merged_codes"] = [c for c in grp["book_code"] if c]   # every BOOK_CODE of this book
    if len(grp) > 1:
        n_groups_merged += 1
        base["subjects"]   = _union_lists(grp["subjects"])
        base["publishers"] = _union_lists(grp["publishers"])
        base["country"]    = _join_unique(grp["country"], sep=", ")
        for col in ["call_number", "isbn", "extent", "series", "note"]:
            base[col] = _join_unique(grp[col])
        copies = grp["copies"].dropna()
        base["copies"] = int(copies.sum()) if len(copies) else pd.NA   # total copies across the merged rows
    merged_rows.append(base)

books_df = pd.DataFrame(merged_rows).reset_index(drop=True)
books_df["year"]   = books_df["year"].astype("Int64")
books_df["copies"] = books_df["copies"].astype("Int64")
for col in ["book_code", "title", "country", "edition", "call_number", "isbn", "extent", "series", "note"]:
    books_df[col] = books_df[col].astype(object).where(books_df[col].notna(), None)
assert sum(len(c) for c in books_df["merged_codes"]) == n_before, "a catalog row was lost while merging"
log.info("Merged %d duplicate records into %d books -> %d books", n_before - len(books_df), n_groups_merged, len(books_df))

# Required flat string fields: author / title / topics
books_df["author"]    = books_df["authors"].map("; ".join)
books_df["topics"]    = books_df["subjects"].map("; ".join)
books_df["publisher"] = books_df["publishers"].map("; ".join)
# v11: language from the MAIN title (before ":" or "="), so an Arabic book with a long English subtitle stays Arabic
#      ("إدارة الجودة الشاملة: TOTAL QUALITY MANAGEMENT" -> ar) and an English book with an Arabic subtitle stays English.
def _main_title(t):
    main = re.split(r"[:=]", t)[0].strip()
    return main if re.search(r"[A-Za-z\u0600-\u06FF]", main) else t
_lang_full_title = books_df["title"].map(detect_language)
books_df["language"]  = books_df["title"].map(lambda t: detect_language(_main_title(t)))
# Prefer explicitly available PostgreSQL language metadata; retain the original
# main-title inference when the source has no canonical ar/en value.
_source_languages = dict(zip(clean["BOOK_CODE"], clean.get("SAMS_LANGUAGE", [None] * len(clean))))
books_df["language"] = [(_source_languages.get(code) if _source_languages.get(code) in ("ar", "en") else language)
                        for code, language in zip(books_df["book_code"], books_df["language"])]
language_changes_df = books_df.loc[books_df["language"] != _lang_full_title, ["book_code", "title", "language"]]
log.info("v11: language changed for %d books (main-title rule)", len(language_changes_df))
books_df.insert(0, "book_id", np.arange(len(books_df)))   # internal integer id used by every index



# ---------------------------------------------------------------------------
# Record builder: ALL 22 source columns go into the `content` field -- always, in the same order.
# books_df (Section 2.2) keeps only the cleaned subset it needs for filtering, so the 22 columns are
# looked up from the cleaned raw table `clean` by BOOK_CODE (unique for every row in this dataset).
# - An empty value is written as "NA", exactly as in the dataset.
# - A merged book (several catalog rows, see Section 2.2) combines the values of ALL its rows:
#   every book code, every copy number, every ISBN ..., and NUM_OF_COPIES is the total.
# ---------------------------------------------------------------------------

# All 22 dataset columns, in the order they appear in each record, with readable labels for the LLM.
RECORD_FIELDS = [
    ("TITLE",                  "Title"),
    ("EDITORS",                "Authors"),
    ("SUBJECTS",               "Topics"),
    ("SUBJECT_CODES",          "Subject codes"),
    ("PUBLISHING_DATE",        "Publishing date"),
    ("PUBLISHERS",             "Publisher"),
    ("PUBLISHER_COUNTRIES",    "Publisher country"),
    ("EDITION_STATMENT",       "Edition"),
    ("REMAN_EDITION_STATMENT", "Edition remarks"),
    ("ISBN",                   "ISBN"),
    ("BOOK_CODE",              "Book code"),
    ("CALL_NUM",               "Call number"),
    ("SECTION_NUM",            "Section number"),
    ("EXTENT",                 "Extent"),
    ("DIMENSION",              "Dimensions"),
    ("NUM_OF_COPIES",          "Number of copies"),
    ("NUM_OF_VOLUMES",         "Number of volumes"),
    ("GENERAL_NOTE",           "Note"),
    ("SERIAL_ADDRESSES",       "Series"),
    ("COPY_GENERAL_CODE",      "Copy codes"),
    ("COPY_general_number",    "Copy general numbers"),
    ("COPY_other_number",      "Copy other numbers"),
]

missing_cols = [c for c, _ in RECORD_FIELDS if c not in clean.columns]
assert not missing_cols, f"columns not found in the dataset: {missing_cols}"

# BOOK_CODE -> full cleaned source row (all 22 columns)
RAW_BY_CODE = {rec["BOOK_CODE"]: rec for rec in clean.to_dict("records") if rec.get("BOOK_CODE")}


def _value_items(column, value):
    # Split one cleaned cell into its individual values ('a | b' -> ['a', 'b']).
    if column == "GENERAL_NOTE":
        value = value.lstrip("- ").strip()
    items = split_multi(value) if "|" in value else [value]
    if column == "PUBLISHER_COUNTRIES":                      # same typo fixes as Section 2.2
        items = [COUNTRY_FIXES.get(c, c) for c in items]
    return [x for x in items if x]


def _merge_column(column, values):
    # Combine one column across all rows of a (possibly merged) book. Returns 'NA' if every row is empty.
    values = [v for v in values if v]
    if not values:
        return "NA"
    if column == "NUM_OF_COPIES":                            # total number of copies
        try:
            return str(sum(int(float(v)) for v in values))
        except ValueError:
            pass
    merged = []
    for v in values:
        for item in _value_items(column, v):
            if item not in merged:
                merged.append(item)
    return "; ".join(merged) if merged else "NA"


def build_content(row):
    # Readable, labeled catalog record with all 22 columns (what the LLM and the BM25 'all' field read).
    codes = row.merged_codes if row.merged_codes else [row.book_code]
    sources = [RAW_BY_CODE[c] for c in codes if c in RAW_BY_CODE] or [{}]
    lines = []
    for column, label in RECORD_FIELDS:
        lines.append(f"{label}: {_merge_column(column, [src.get(column) for src in sources])}")
    return "\n".join(lines)

def build_semantic_text(row):
    parts = [row.title]
    if row.subjects: parts.append("Topics: " + ", ".join(row.subjects))
    if row.authors:  parts.append("By: " + ", ".join(row.authors))
    if row.series:   parts.append("Series: " + row.series)
    if row.note:     parts.append(row.note.lstrip("- ").strip())
    return ". ".join(parts)

books_df["content"]       = [build_content(r) for r in books_df.itertuples()]
books_df["semantic_text"] = [build_semantic_text(r) for r in books_df.itertuples()]


def chunk_text(text, chunk_size=38, overlap=10):
    # Fixed-size word windows with overlap (identical to Labs 8-9).
    words = text.split()
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be in [0, chunk_size)")
    chunks, start = [], 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start += chunk_size - overlap
    return chunks


def build_chunks(frame, chunk_size, overlap):
    rows = []
    for book in frame.itertuples():
        pieces = chunk_text(book.semantic_text, chunk_size=chunk_size, overlap=overlap)
        header = f"{book.title} — {book.authors[0]}" if book.authors else book.title
        for i, piece in enumerate(pieces):
            # chunk 0 already starts with the title; later chunks get the header prepended (Lab 8 search_text idea)
            search_text = piece if i == 0 else f"{header}. {piece}"
            rows.append({"chunk_id": len(rows), "book_id": book.book_id, "chunk_index": i,
                         "word_count": len(piece.split()), "chunk_text": search_text})
    return pd.DataFrame(rows)


chunks_df = build_chunks(books_df, CONFIG["chunk_size"], CONFIG["chunk_overlap"])
chunk_to_book = chunks_df["book_id"].to_numpy()
