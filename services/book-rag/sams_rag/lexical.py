"""Field-aware BM25 with title / subject-heading phrase boosts (notebook Section 5)."""
import numpy as np
import pandas as pd
from rank_bm25 import BM25Okapi

from .catalog import books_df
from .config import CONFIG
from .text import STOPWORDS, normalize_text, tokenize

FIELD_TEXTS = {
    "title":    books_df["title"],
    "authors":  books_df["author"],
    "subjects": books_df["topics"],
    "all":      books_df["content"],
}

def _safe_tokens(text):
    toks = tokenize(text)
    return toks if toks else ["<empty>"]

bm25_indexes = {name: BM25Okapi([_safe_tokens(t) for t in texts]) for name, texts in FIELD_TEXTS.items()}

TITLE_NORM = books_df["title"].map(normalize_text).tolist()
HEADINGS_NORM = [[normalize_text(s) for s in subs if len(normalize_text(s).split()) >= 2] for subs in books_df["subjects"]]


def heading_phrase_matches(query):
    # Boolean array: one of the book's multi-word subject headings appears as a whole phrase in the question.
    # "المنظمات الحكومية" matches the heading "المنظمات الحكومية" but NOT "المنظمات غير الحكومية".
    q_full = f" {normalize_text(query)} "
    return np.array([any(f" {h} " in q_full for h in hs) for hs in HEADINGS_NORM])

def title_phrase_matches(query):
    # Boolean array: query (minus stopwords) inside the title, or a full multi-word title inside the query.
    q_full = f" {normalize_text(query)} "
    q_core = " ".join(t for t in q_full.split() if t not in STOPWORDS)
    hits = np.zeros(len(TITLE_NORM), dtype=bool)
    if len(q_core.split()) >= 2 and len(q_core) >= 8:
        hits |= np.array([q_core in t for t in TITLE_NORM])
    hits |= np.array([len(t.split()) >= 2 and f" {t} " in q_full for t in TITLE_NORM])
    return hits


def bm25_search(query, candidate_ids=None, top_n=50, field_weights=None):
    # Field-weighted BM25 over books. Returns book_id, lexical_score, lexical_rank (+ per-field scores).
    field_weights = field_weights or CONFIG["bm25_field_weights"]
    q_tokens = tokenize(query)
    if not q_tokens:
        return pd.DataFrame(columns=["book_id", "lexical_score", "lexical_rank"])

    total = np.zeros(len(books_df))
    per_field = {}
    for name, weight in field_weights.items():
        s = bm25_indexes[name].get_scores(q_tokens)
        per_field[f"bm25_{name}"] = s
        total += weight * s

    phrase = title_phrase_matches(query)
    if phrase.any() and total.max() > 0:
        total = total + phrase * CONFIG["title_phrase_boost"] * total.max()
    per_field["title_phrase_match"] = phrase

    if CONFIG.get("heading_phrase_boost", 0) > 0 and total.max() > 0:      # v4
        h_phrase = heading_phrase_matches(query)
        total = total + h_phrase * CONFIG["heading_phrase_boost"] * total.max()
        per_field["heading_phrase_match"] = h_phrase

    mask = np.zeros(len(books_df), dtype=bool)
    if candidate_ids is None:
        mask[:] = True
    else:
        mask[np.asarray(candidate_ids, dtype=int)] = True
    total = np.where(mask & (total > 0), total, -np.inf)     # only books with real keyword overlap

    order = np.argsort(-total)[:top_n]
    order = order[np.isfinite(total[order])]
    out = pd.DataFrame({"book_id": order, "lexical_score": total[order]})
    for name, s in per_field.items():
        out[name] = s[order]
    out["lexical_rank"] = np.arange(1, len(out) + 1)
    return out
