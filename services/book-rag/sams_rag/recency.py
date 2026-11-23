"""Questions that ask for the NEWEST books (v14): "وإيه الأحدث فيهم؟", "أحدث كتب التسويق", "latest books on marketing".

Why: the search ranks books by how close they are to the topic and ignores the year, so "the newest" could list a
2005 book before a 2020 one.

What: when the question asks for the newest books, the search takes the books closest to the topic as usual
(the top CONFIG["recency_pool"] after reranking, so only books ON the topic), then orders them from the newest to the
oldest; the full list of matching books is ordered the same way, and Gemini is told to keep that order.
Books with no year (or year 0) go last.

Which words: only words that never appear in the catalog's titles. "الحديثة" (31 titles), "الجديدة" (10) and "new"
(17) are titles' words ("الاتجاهات الحديثة في ...") and are NOT used. A question that is (part of) a book title is never
treated as a "newest" question. Nothing changes for any other question (none of the 84 evaluation questions).
"""
import re

from .lexical import title_phrase_matches
from .text import normalize_text

RECENCY_PATTERNS = [
    r"(^| )(ال)?احدث( |$)",                       # الأحدث / أحدث
    r"(^| )(ال)?اجدد( |$)",                       # الأجدد / أجدد
    r"(^| )اخر (الاصدارات|اصدار|الكتب)( |$)",      # آخر الإصدارات / آخر إصدار / آخر الكتب
    r"\bnewest\b", r"\blatest\b", r"\bmost recent\b",
]


def wants_recent(*texts):
    """True when one of the texts (the question, its rewritten search query) asks for the newest books."""
    for text in texts:
        if not text:
            continue
        q = normalize_text(text)
        if any(re.search(p, q) for p in RECENCY_PATTERNS) and not title_phrase_matches(text).any():
            return True
    return False


def year_of(value):
    """Publication year as a number; -1 when unknown (missing, 0, not a number) so those books go last."""
    try:
        y = float(value)
    except (TypeError, ValueError):
        return -1.0
    return y if y == y and y > 0 else -1.0


def order_by_recency(results, k):
    """The k newest books among the search results (ties keep the search order); attrs["recency"] = True."""
    if results is None or len(results) == 0:
        return results
    attrs = dict(results.attrs)
    out = (results.assign(_year=results["year"].map(year_of), _pos=range(len(results)))
           .sort_values(["_year", "_pos"], ascending=[False, True]).head(k)
           .drop(columns=["_year", "_pos"]).reset_index(drop=True))
    if "rank" in out.columns:
        out["rank"] = range(1, len(out) + 1)
    out.attrs.update(attrs)
    out.attrs["recency"] = True
    return out
