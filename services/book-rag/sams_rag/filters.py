"""Metadata filters and query analysis (notebook Section 7)."""
import re
from dataclasses import asdict, dataclass
from typing import List, Optional

import numpy as np
from rapidfuzz import fuzz

from .catalog import books_df
from .text import detect_language, normalize_text

# Pre-normalized fields so filtering is a cheap loop
books_df["title_norm"]       = books_df["title"].map(normalize_text)
books_df["authors_norm"]     = books_df["authors"].map(lambda lst: [normalize_text(a) for a in lst])
books_df["subjects_norm"]    = books_df["subjects"].map(lambda lst: [normalize_text(s) for s in lst])
books_df["publisher_norm"]   = books_df["publisher"].map(normalize_text)


@dataclass
class SearchFilters:
    author: Optional[object] = None          # str or list[str]  (OR)
    title: Optional[str] = None
    topics: Optional[List[str]] = None
    topics_mode: str = "any"                 # "any" | "all"
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    language: Optional[str] = None           # "ar" | "en"
    publisher: Optional[str] = None
    fuzzy_threshold: int = 85

    def is_empty(self):
        return not any([self.author, self.title, self.topics, self.year_from, self.year_to, self.language, self.publisher])

    def describe(self):
        d = {k: v for k, v in asdict(self).items() if v not in (None, [], "") and k not in ("topics_mode", "fuzzy_threshold")}
        if self.topics: d["topics_mode"] = self.topics_mode
        return d


def _matches_any(needle, haystack_list, threshold, scorer=fuzz.token_set_ratio):
    for hay in haystack_list:
        if needle in hay:
            return True
        if len(needle) >= 4 and scorer(needle, hay) >= threshold:
            return True
    return False


def apply_filters(filters: SearchFilters):
    # Return np.array of book_ids that satisfy all active filters (None = no filtering).
    if filters is None or filters.is_empty():
        return None
    keep = np.ones(len(books_df), dtype=bool)
    th = filters.fuzzy_threshold

    if filters.author:
        names = [filters.author] if isinstance(filters.author, str) else list(filters.author)
        names = [normalize_text(n) for n in names]
        keep &= books_df["authors_norm"].map(lambda authors: any(_matches_any(n, authors, th) for n in names)).to_numpy()

    if filters.title:
        t = normalize_text(filters.title)
        keep &= books_df["title_norm"].map(lambda title: _matches_any(t, [title], max(th, 90), fuzz.partial_ratio)).to_numpy()

    if filters.topics:
        wanted = [normalize_text(x) for x in filters.topics]
        combine = all if filters.topics_mode == "all" else any
        keep &= books_df["subjects_norm"].map(lambda subs: combine(_matches_any(w, subs, th) for w in wanted)).to_numpy()

    if filters.year_from is not None:
        keep &= (books_df["year"].fillna(-1) >= filters.year_from).to_numpy()
    if filters.year_to is not None:
        keep &= (books_df["year"].fillna(10**4) <= filters.year_to).to_numpy()
    if filters.language:
        keep &= (books_df["language"] == filters.language).to_numpy()
    if filters.publisher:
        p = normalize_text(filters.publisher)
        keep &= books_df["publisher_norm"].str.contains(p, regex=False).to_numpy()

    return np.flatnonzero(keep)


def _build_vocab(lists, min_chars, min_words):
    vocab = {}
    for lst_norm, lst_raw in lists:
        for n, raw in zip(lst_norm, lst_raw):
            if len(n) >= min_chars and len(n.split()) >= min_words:
                vocab.setdefault(n, raw)
    return vocab

AUTHOR_VOCAB  = _build_vocab(zip(books_df["authors_norm"], books_df["authors"]), min_chars=7, min_words=2)
SUBJECT_VOCAB = _build_vocab(zip(books_df["subjects_norm"], books_df["subjects"]), min_chars=5, min_words=1)
# Single-word English surnames ('kotler', 'drucker') are useful too, but only if they are distinctive
SURNAME_VOCAB = {}
for n, raw in AUTHOR_VOCAB.items():
    last = n.split()[-1]
    if re.fullmatch(r"[a-z]{5,}", last):
        SURNAME_VOCAB.setdefault(last, set()).add(raw)


def analyze_query(query):
    q = f" {normalize_text(query)} "
    authors = [raw for n, raw in AUTHOR_VOCAB.items() if f" {n} " in q]
    if not authors:
        authors = [raw for s, raws in SURNAME_VOCAB.items() if f" {s} " in q for raw in raws]
    # keep the longest non-overlapping topic headings
    topics = sorted({raw for n, raw in SUBJECT_VOCAB.items() if f" {n} " in q}, key=len, reverse=True)[:5]
    return {"language": detect_language(query), "normalized": q.strip(),
            "detected_authors": sorted(set(authors)), "detected_topics": topics}
