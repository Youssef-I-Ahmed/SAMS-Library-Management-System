"""One entry point to the engine + a JSON-ready view of an answer (used by the CLI and, next, by the API).

    from sams_rag.engine import ChatSession, rag_answer, serialize
    chat = ChatSession()
    out = chat.ask("كتب أحمد ماهر")
    data = serialize(out)          # dict -> json.dumps(data, ensure_ascii=False)
"""
import logging

import pandas as pd

from .answer import _books_used, book_card, book_ids_for_code, finish, rag_answer, retrieve
from .catalog import books_df, chunks_df, language_changes_df
from .chat import ChatSession
from .context import near_duplicates_df
from .filters import SearchFilters, apply_filters
from .search import hybrid_search, reranker
from .semantic import encoder

log = logging.getLogger("sams_rag")

__all__ = ["ChatSession", "SearchFilters", "rag_answer", "retrieve", "finish", "hybrid_search", "apply_filters",
           "book_card", "book_ids_for_code", "card_to_dict", "serialize", "preview", "status"]


def card_to_dict(content):
    # "Label: value" lines of a 22-field record -> ordered dict (values kept as is, "NA" included).
    out = {}
    for line in content.split("\n"):
        label, _, value = line.partition(": ")
        out[label] = value
    return out


def _year(v):
    return None if v is None or pd.isna(v) else int(v)


def serialize(out):
    # JSON-ready view of a rag_answer()/ChatSession.ask() result: what a website needs, nothing internal.
    c = out["citations"]
    src = out["package"]["sources"]
    used = _books_used(out) if out["package"]["num_sources"] else []
    sources = []
    for tag in used:
        r = src[src["source"] == tag].iloc[0]
        ids = list(r["merged_book_ids"])
        sources.append({"tag": tag, "book_codes": [code for b in ids for code in books_df.at[b, "merged_codes"]],
                        "title": r["title"], "author": r["author"], "year": _year(r["year"]),
                        "call_number": r["call_number"], "card": card_to_dict(r["content"])})
    all_books = None
    if out.get("all_books") is not None:
        items = [{"n": int(r["#"]), "book_codes": list(r["book_codes"]), "title": r["title"], "author": r["author"],
                  "year": _year(r["year"]), "call_number": r["call_number"], "copies": int(r["copies"]),
                  "in_answer": r["in_answer"] == "✓"} for _, r in out["all_books"].iterrows()]
        all_books = {"complete": bool(out.get("all_books_complete")), "items": items}
    return {
        "answer": out["answer"],
        "is_refusal": bool(c["is_refusal"]),
        "hint": out.get("hint"),
        "coverage_note": out.get("coverage_note"),
        "search_query": out.get("search_query"),
        "filters_applied": out.get("filters") or {},
        "provider": out.get("provider"),
        "model": out.get("model"),
        "latency_s": out.get("latency_s"),
        "citations": {"cited": c["cited"], "inferred": c.get("inferred", []), "invalid": c["invalid"]},
        "fallback_errors": out.get("fallback_errors") or {},
        "sources": sources,
        "all_books": all_books,
    }


def preview(stage):
    # The books the search found, before Gemini has answered (website phase 2). Not the final answer:
    # Gemini may use only some of them, or refuse -- the final result comes from serialize(finish(stage)).
    if "out" in stage:
        return {"search_query": None, "filters_applied": {}, "books": []}
    src = stage["package"]["sources"]
    books = []
    if stage["package"]["num_sources"]:
        for _, r in src.iterrows():
            books.append({"tag": r["source"],
                          "book_codes": [code for b in r["merged_book_ids"] for code in books_df.at[b, "merged_codes"]],
                          "title": r["title"], "author": r["author"], "year": _year(r["year"]),
                          "call_number": r["call_number"]})
    return {"search_query": stage["search_query"], "filters_applied": stage["results"].attrs.get("filters") or {},
            "books": books}


def status():
    # What was loaded -- for logs and a health check.
    return {"books": int(len(books_df)), "chunks": int(len(chunks_df)),
            "embedding_backend": encoder.backend, "embedding_loaded_from": encoder.load_source,
            "reranker": bool(reranker.available), "reranker_loaded_from": reranker.load_source, "near_duplicate_pairs": int(len(near_duplicates_df)),
            "language_changes": int(len(language_changes_df))}
