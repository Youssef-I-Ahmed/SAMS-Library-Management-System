"""Incremental BM25 (Okapi) inverted index. Supports add / update / remove of single documents."""
from __future__ import annotations

import math
from collections import Counter, defaultdict

from src.data.normalize_ar import search_terms


class BM25Index:
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1, self.b = k1, b
        self.postings: dict[str, dict[str, int]] = defaultdict(dict)
        self.doc_len: dict[str, int] = {}
        self.doc_terms: dict[str, list[str]] = {}
        self.total_len = 0

    def __len__(self) -> int:
        return len(self.doc_len)

    def add(self, doc_id: str, text: str) -> None:
        if doc_id in self.doc_len:
            self.remove(doc_id)
        terms = search_terms(text)
        tf = Counter(terms)
        for t, c in tf.items():
            self.postings[t][doc_id] = c
        self.doc_len[doc_id] = len(terms)
        self.doc_terms[doc_id] = list(tf)
        self.total_len += len(terms)

    def remove(self, doc_id: str) -> None:
        if doc_id not in self.doc_len:
            return
        for t in self.doc_terms.pop(doc_id):
            p = self.postings.get(t)
            if p is not None:
                p.pop(doc_id, None)
                if not p:
                    del self.postings[t]
        self.total_len -= self.doc_len.pop(doc_id)

    def idf(self, term: str) -> float:
        n = len(self.doc_len)
        df = len(self.postings.get(term, ()))
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def search(self, query: str, allowed: set[str] | None = None, limit: int = 100) -> list[tuple[str, float]]:
        q_terms = list(dict.fromkeys(search_terms(query)))
        if not q_terms or not self.doc_len:
            return []
        avgdl = self.total_len / len(self.doc_len) or 1.0
        scores: dict[str, float] = defaultdict(float)
        for t in q_terms:
            post = self.postings.get(t)
            if not post:
                continue
            idf = self.idf(t)
            for d, tf in post.items():
                if allowed is not None and d not in allowed:
                    continue
                dl = self.doc_len[d]
                scores[d] += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * dl / avgdl))
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
        return ranked[:limit]
