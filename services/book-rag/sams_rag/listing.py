"""The full list under the answer: keeps the books that really relate to the question (website API and book page).

v16: moved here from book_ui/relevance.py so the website API gives the same list as the book page (engine.serialize
applies it). Nothing in the search changes: this only trims the list of "closest books" that is built after the answer.

The engine fills that list to a fixed size (CONFIG["all_books_limit"], 100) with no relevance cut-off. Here every listed
book is scored by the engine's own reranker (the cross-encoder already used for ranking; it returns 0..1): the first
KEEP_TOP books of the engine's order always stay, and after them a book stays if it reaches MIN_RELEVANCE -- so the
list can be 6 books or 50, depending on what the catalog really has. Books cited in the answer always stay.
Lists built from a filter (e.g. every book of an author) are complete lists and are not touched. A topic list (every
book filed under the subject, item["in_topic"] = True, then related books found by the search) keeps all of its
subject books, and only its related books go through the cut.
"""
import math
import os

MIN_RELEVANCE = float(os.getenv("BOOK_MIN_RELEVANCE", 0.2))   # 0..1 reranker score a listed book must reach
# the engine's own top results are always kept. 20: measured with scripts/keep_top_study.py on the 84 evaluation
# questions (real models): places 11-15 and 16-20 hold a similar share of right books (30% / 26%), after 20 the
# gain per extra place halves; and the reranker score alone keeps only 45% of the right books (so rank is needed)
KEEP_TOP = int(os.getenv("BOOK_KEEP_TOP", 20))
SHOW_SCORES = os.getenv("BOOK_SHOW_SCORES", "").lower() in ("1", "true", "yes")   # show the score (for tuning)
FALLBACK_LIMIT = int(os.getenv("BOOK_FALLBACK_LIMIT", 15))      # list size when the reranker is not loaded


_INDEX = {}


def _code_to_book(engine):
    # BOOK_CODE -> row of books_df (built once per engine)
    key = id(engine.books_df)
    if key not in _INDEX:
        out = {}
        for b, codes in enumerate(engine.books_df["merged_codes"]):
            for c in codes or []:
                out.setdefault(str(c), b)
        _INDEX.clear()
        _INDEX[key] = out
    return _INDEX[key]


def _engine():
    # the engine's own objects (read at call time: a rebuilt catalog is picked up)
    from types import SimpleNamespace
    from .catalog import books_df
    from .search import reranker
    return SimpleNamespace(books_df=books_df, reranker=reranker)


def keep_relevant(data, question, engine=None, min_score=None):
    """Returns data with all_books["items"] reduced to the relevant books (data is not modified in place).
    engine: an object with .books_df and .reranker (default: this engine's); safe to call twice."""
    min_score = MIN_RELEVANCE if min_score is None else min_score
    engine = engine or _engine()
    ab = data.get("all_books")
    rr = getattr(engine, "reranker", None)
    if not ab or not ab.get("items") or ab.get("relevant_only"):   # nothing to trim, or trimmed already
        return data
    topic = any("in_topic" in it for it in ab["items"])
    if ab.get("complete") and not topic:       # a filter list: every matching book, untouched
        return data
    if topic:                                  # subject books are kept as they are; the related books are cut below
        return _topic_list(data, ab, question, engine, rr, min_score)
    if not (rr and rr.available):              # no reranker (fallback mode): no scores -> a short list, as before
        new = dict(data)
        new["all_books"] = dict(ab, items=ab["items"][:FALLBACK_LIMIT])
        return new
    items, texts = _with_texts(ab["items"], engine)
    if not items:
        return data
    # score against the researcher's own words AND the engine's search query (one may be Arabic, the other
    # English): a book counts as relevant if either finds it relevant
    scores = _scores(rr, [question, data.get("search_query")], texts)
    if scores is None:                         # scoring problem: keep the engine's list as it is
        return data
    ranked = list(zip(items, scores))
    # keep: the engine's top results (its ranking is the measured one, Hit@10 = 1.0), books cited in the answer,
    # and any further book the reranker finds relevant
    kept = [it for pos, (it, s) in enumerate(ranked) if pos < KEEP_TOP or s >= min_score or it.get("in_answer")]
    if SHOW_SCORES:
        score_of = {id(it): s for it, s in ranked}
        kept = [dict(it, score=round(score_of[id(it)], 2)) for it in kept]
    new_items = [dict(it, n=i) for i, it in enumerate(kept, start=1)]
    new = dict(data)
    new["all_books"] = dict(ab, items=new_items, relevant_only=True)
    return new


def _with_texts(all_items, engine):
    # (items found in the catalog, their catalog text) -- the text is what the reranker reads
    index = _code_to_book(engine)
    items, texts = [], []
    for it in all_items:
        b = next((index[str(c)] for c in it.get("book_codes") or [] if str(c) in index), None)
        if b is None:
            continue
        items.append(it)
        texts.append(engine.books_df.at[b, "content"])
    return items, texts


def _scores(rr, queries, texts):
    # one 0..1 score per text: the best over the given queries (None on a scoring problem)
    queries = [q for q in dict.fromkeys(queries) if q]
    try:
        per_query = []
        for q in queries:
            sc = [float(s) for s in rr.score(q, texts)]
            if any(s < 0 or s > 1 for s in sc):     # raw logits instead of 0..1: squash them the same way
                sc = [1 / (1 + math.exp(-s)) for s in sc]
            per_query.append(sc)
        return [max(col) for col in zip(*per_query)]
    except Exception:
        return None


def _topic_list(data, ab, question, engine, rr, min_score):
    # Topic list: every subject book stays (the catalog files it under the subject); a related book stays if it is
    # cited in the answer, among the first KEEP_TOP related books in the engine's order (the same rule as the other
    # lists: the reranker gives low scores to a short question against a long catalog record, so the score alone
    # kept almost nothing), or relevant enough. The engine's order is kept (subject books first, or newest first).
    all_items = ab["items"]
    subject = [it for it in all_items if it.get("in_topic")]
    related = [it for it in all_items if not it.get("in_topic")]
    keep_rel = [it for r, it in enumerate(related) if it.get("in_answer") or r < KEEP_TOP]
    rest = [it for r, it in enumerate(related) if not (it.get("in_answer") or r < KEEP_TOP)]
    score_of = {}
    if rest and rr and rr.available:
        items, texts = _with_texts(rest, engine)
        scores = _scores(rr, [question, data.get("search_query")], texts) if items else []
        if scores is None:                     # scoring problem: keep the related books as they are
            keep_rel = related
        else:
            score_of = {id(it): s for it, s in zip(items, scores)}
            keep_rel += [it for it in items if score_of[id(it)] >= min_score]
    elif rest:                                 # no reranker: no scores -> a short list of related books
        keep_rel = related[:FALLBACK_LIMIT]
    keep_ids = {id(it) for it in keep_rel}
    kept = [it for it in all_items if it.get("in_topic") or id(it) in keep_ids]
    if SHOW_SCORES:
        kept = [dict(it, score=round(score_of[id(it)], 2)) if id(it) in score_of else it for it in kept]
    new_items = [dict(it, n=i) for i, it in enumerate(kept, start=1)]
    new = dict(data)
    new["all_books"] = dict(ab, items=new_items, relevant_only=True,
                            topic_count=len(subject), related_count=len(kept) - len(subject))
    return new
