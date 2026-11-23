from __future__ import annotations

import math


def recall_at_k(ranked: list[str], rel: set[str], k: int) -> float:
    return len(set(ranked[:k]) & rel) / len(rel) if rel else 0.0


def precision_at_k(ranked: list[str], rel: set[str], k: int) -> float:
    top = ranked[:k]
    return len([r for r in top if r in rel]) / k if k else 0.0


def ndcg_at_k(ranked: list[str], rel: set[str], k: int) -> float:
    dcg = sum(1.0 / math.log2(i + 2) for i, r in enumerate(ranked[:k]) if r in rel)
    ideal = sum(1.0 / math.log2(i + 2) for i in range(min(len(rel), k)))
    return dcg / ideal if ideal else 0.0


def mrr(ranked: list[str], rel: set[str]) -> float:
    for i, r in enumerate(ranked, 1):
        if r in rel:
            return 1.0 / i
    return 0.0


def hit_at_k(ranked: list[str], rel: set[str], k: int) -> float:
    return 1.0 if set(ranked[:k]) & rel else 0.0
