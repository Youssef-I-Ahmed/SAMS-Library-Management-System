"""Hybrid search: BM25 + vectors, RRF fusion and cross-encoder reranking (notebook Sections 8 and 9)."""
import logging
import os
from dataclasses import asdict
from typing import Optional

import numpy as np
import pandas as pd

from .catalog import books_df
from .config import CONFIG
from .filters import SearchFilters, analyze_query, apply_filters
from .lexical import bm25_search
from .semantic import semantic_search
from .text import tokenize
from app import local_models

log = logging.getLogger("sams_rag")

class Reranker:
    # Server addition: like the embedding model, the reranker is loaded from a local copy in CONFIG["models_dir"]
    # when there is one (no download, works offline); otherwise it is downloaded once and the copy is saved.
    def __init__(self, model_name, enabled=True, local_dir=None):
        self.available = False
        self.load_source = None
        if not enabled:
            return
        from sentence_transformers import CrossEncoder
        if not local_dir or not os.path.isfile(os.path.join(local_dir, "config.json")):
            raise RuntimeError("Required local reranker unavailable")
        self.model = local_models.reranker(local_dir)
        self.available, self.load_source = True, "local-dir"

    def score(self, query, passages):
        return local_models.predict(self.model, [(query, p) for p in passages], show_progress_bar=False)


reranker = Reranker(CONFIG["reranker_model"], enabled=CONFIG["use_reranker"],
                    local_dir=CONFIG.get("reranker_local_dir"))

def _merge_filters(explicit: Optional[SearchFilters], analysis: dict, auto_filters: bool):
    f = SearchFilters(**asdict(explicit)) if explicit else SearchFilters()
    if auto_filters and not f.author and analysis["detected_authors"]:
        f.author = analysis["detected_authors"]
    return f


def min_max_normalize(scores):
    scores = np.asarray(scores, dtype=float)
    if len(scores) == 0 or scores.max() == scores.min():
        return np.zeros_like(scores)
    return (scores - scores.min()) / (scores.max() - scores.min())


def hybrid_search(query, filters: Optional[SearchFilters] = None, k=10, method="rrf", alpha=None,
                  candidate_pool=None, auto_filters=True, rerank=None, min_similarity=None):
    # Query -> (filters) -> BM25 + vector retrieval -> fusion -> (rerank) -> top-k books.
    alpha = CONFIG["hybrid_alpha"] if alpha is None else alpha
    pool = candidate_pool or CONFIG["candidate_pool"]
    rerank = CONFIG["use_reranker"] if rerank is None else rerank

    analysis = analyze_query(query)
    active = _merge_filters(filters, analysis, auto_filters)
    candidate_ids = apply_filters(active)

    meta = {"query": query, "method": method, "filters": active.describe(), "analysis": analysis,
            "n_candidates": len(books_df) if candidate_ids is None else int(len(candidate_ids))}
    if candidate_ids is not None and len(candidate_ids) == 0:
        empty = pd.DataFrame(columns=["book_id", "score"]); empty.attrs.update(meta); return empty

    # Filter-only request (empty query + filters, e.g. "all books by X"): no relevance signal -> newest first
    if not tokenize(query):
        if candidate_ids is None:
            empty = pd.DataFrame(columns=["book_id", "score"]); empty.attrs.update(meta); return empty
        method, rerank = "filter-only", False
        fused = pd.DataFrame({"book_id": candidate_ids,
                              "score": books_df.loc[candidate_ids, "year"].fillna(0).astype(float).to_numpy()})
        meta["method"] = method

    lex = bm25_search(query, candidate_ids, pool) if method in ("bm25", "weighted", "rrf") else None
    sem = semantic_search(query, candidate_ids, pool, min_similarity) if method in ("semantic", "weighted", "rrf") else None

    if method == "filter-only":
        pass
    elif method == "bm25":
        fused = lex.assign(score=lex["lexical_score"])
    elif method == "semantic":
        fused = sem.assign(score=sem["semantic_score"])
    else:
        fused = pd.merge(lex[["book_id", "lexical_score", "lexical_rank"]],
                         sem[["book_id", "semantic_score", "semantic_rank"]], on="book_id", how="outer")
        if method == "rrf":
            rk = CONFIG["rrf_k"]
            fused["score"] = (1.0 / (rk + fused["lexical_rank"])).fillna(0) + (1.0 / (rk + fused["semantic_rank"])).fillna(0)
        elif method == "weighted":
            sem_s = fused["semantic_score"]
            sem_s = sem_s.fillna(sem_s.min() if sem_s.notna().any() else 0.0)   # absent from vector list -> worst seen score
            fused["score"] = (alpha * min_max_normalize(sem_s) +
                              (1 - alpha) * min_max_normalize(fused["lexical_score"].fillna(0)))
        else:
            raise ValueError(f"unknown method {method}")

    fused = fused.sort_values("score", ascending=False).head(max(k, CONFIG["rerank_pool"] if rerank else k))
    fused = fused.merge(books_df[["book_id", "book_code", "title", "author", "topics", "year", "call_number", "content"]],
                        on="book_id", how="left")

    if rerank and reranker.available and len(fused) > 1:
        fused["rerank_score"] = reranker.score(query, fused["content"].tolist())
        fused = fused.sort_values("rerank_score", ascending=False)

    out = fused.head(k).reset_index(drop=True)
    out.insert(0, "rank", np.arange(1, len(out) + 1))
    out.attrs.update(meta)
    return out
