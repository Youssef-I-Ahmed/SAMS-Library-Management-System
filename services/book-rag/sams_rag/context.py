"""Near-duplicate records and the LLM context package (notebook Section 10)."""
import logging
import os
import re
from types import SimpleNamespace

import pandas as pd
from rapidfuzz import fuzz

from .catalog import books_df, build_content
from .config import CONFIG
from .text import normalize_text

log = logging.getLogger("sams_rag")

VOLUME_WORDS = {normalize_text(w) for w in """الاول الأول الثاني الثالث الرابع الخامس السادس السابع الثامن التاسع العاشر
الاولى الأولى الثانية الثالثة الرابعة الجزء جزء ج المجلد مجلد vol volume part i ii iii iv v vi""".split()}

DUP_AUTHORS = books_df["authors"].map(lambda lst: frozenset(normalize_text(a) for a in lst)).tolist()
DUP_YEAR = books_df["year"].tolist()
DUP_CALL = books_df["call_number"].map(lambda c: re.sub(r"\s+", "", normalize_text(c)) if c else "").tolist()
DUP_EDITION = books_df["edition"].map(lambda e: normalize_text(e) if e else "").tolist()
DUP_TITLE = books_df["title"].map(normalize_text).tolist()


def _title_markers(t):
    # numbers and volume words: two titles with different markers are different volumes/books
    return {x for x in t.split() if x.isdigit() or x in VOLUME_WORDS}


def is_near_duplicate(i, j):
    if i == j or not DUP_AUTHORS[i] or DUP_AUTHORS[i] != DUP_AUTHORS[j]:
        return False
    if pd.isna(DUP_YEAR[i]) or pd.isna(DUP_YEAR[j]) or DUP_YEAR[i] != DUP_YEAR[j]:
        return False
    if not DUP_CALL[i] or DUP_CALL[i] != DUP_CALL[j]:
        return False
    if DUP_EDITION[i] and DUP_EDITION[j] and DUP_EDITION[i] != DUP_EDITION[j]:
        return False
    if _title_markers(DUP_TITLE[i]) != _title_markers(DUP_TITLE[j]):
        return False
    return fuzz.token_set_ratio(DUP_TITLE[i], DUP_TITLE[j]) >= 85


# Scan the whole catalog once (same authors + year + call number, then compare titles) and save the list
_groups = {}
for b in range(len(books_df)):
    if DUP_AUTHORS[b] and pd.notna(DUP_YEAR[b]) and DUP_CALL[b]:
        _groups.setdefault((DUP_AUTHORS[b], DUP_YEAR[b], DUP_CALL[b]), []).append(b)
_pairs = []
for ids in _groups.values():
    for x in range(len(ids)):
        for y in range(x + 1, len(ids)):
            a, b = ids[x], ids[y]
            if is_near_duplicate(a, b):
                _pairs.append({"book_code_1": books_df.at[a, "book_code"], "title_1": books_df.at[a, "title"],
                               "book_code_2": books_df.at[b, "book_code"], "title_2": books_df.at[b, "title"],
                               "author": books_df.at[a, "author"], "year": books_df.at[a, "year"],
                               "call_number": books_df.at[a, "call_number"],
                               "title_similarity": round(fuzz.token_set_ratio(DUP_TITLE[a], DUP_TITLE[b]))})
near_duplicates_df = pd.DataFrame(_pairs)
# Near-duplicate audit remains in memory; no bibliographic CSV export on refresh.

def build_context_package(results, max_sources=None, word_budget=None):
    max_sources = max_sources or CONFIG["max_sources"]
    word_budget = word_budget or CONFIG["word_budget"]

    selected, seen, used_words = [], set(), 0
    for row in results.itertuples():
        key = normalize_text(row.title) + "||" + normalize_text(row.author)
        if key in seen:
            continue
        dup_of = next((s for s in selected if is_near_duplicate(s["row"].book_id, row.book_id)), None)
        if dup_of is not None:                                   # v6: same book catalogued twice -> one entry
            dup_of["ids"].append(row.book_id)
            continue
        n_words = len(row.content.split())
        if selected and used_words + n_words > word_budget:
            continue
        seen.add(key)
        selected.append({"row": row, "ids": [row.book_id]})
        used_words += n_words
        if len(selected) >= max_sources:
            break

    blocks, source_rows = [], []
    for i, item in enumerate(selected, start=1):
        row, tag = item["row"], f"S{i}"
        if len(item["ids"]) > 1:                                 # combine all book codes and copies of the records
            codes = [c for b in item["ids"] for c in books_df.at[b, "merged_codes"]]
            content = build_content(SimpleNamespace(merged_codes=codes, book_code=row.book_code))
        else:
            content = row.content
        blocks.append(f"[{tag}]\n{content}")
        source_rows.append({"source": tag, "book_id": row.book_id, "book_code": row.book_code, "title": row.title,
                            "author": row.author, "year": row.year, "call_number": row.call_number,
                            "content": content, "merged_book_ids": item["ids"]})
    return {"context_text": "\n\n".join(blocks), "sources": pd.DataFrame(source_rows),
            "used_words": used_words, "num_sources": len(selected)}
