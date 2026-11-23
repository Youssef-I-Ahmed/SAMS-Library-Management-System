"""Supervisor registry helpers: canonical display names and *candidate* (never auto-merged) variants."""
from __future__ import annotations

from collections import Counter, defaultdict

from rapidfuzz import fuzz, process

from src.data.schema import Record, Supervisor


def canonical_display_map(records: list[Record]) -> dict[str, str]:
    """key -> most frequent display name among records (ties: lexicographically smallest, deterministic)."""
    c: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for s in r.supervisors:
            c[s.key][s.name] += 1
    return {k: sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for k, v in c.items()}


def apply_display_map(records: list[Record], dm: dict[str, str]) -> None:
    for r in records:
        r.supervisors = [Supervisor(key=s.key, name=dm.get(s.key, s.name), raw=s.raw) for s in r.supervisors]


def supervisor_counts(records: list[Record]) -> Counter:
    c: Counter = Counter()
    for r in records:
        for k in {s.key for s in r.supervisors}:
            c[k] += 1
    return c


def similar_name_candidates(keys: list[str], threshold: float = 88.0) -> list[tuple[str, str, float]]:
    """Pairs of DISTINCT canonical keys that look similar (possible spelling variants of one person,
    or different people with similar names). These are reported for human review only and are
    never merged automatically."""
    keys = sorted(keys)
    if len(keys) < 2:
        return []
    m = process.cdist(keys, keys, scorer=fuzz.token_sort_ratio, workers=1, score_cutoff=threshold)
    out = []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            if m[i][j] >= threshold:
                out.append((keys[i], keys[j], float(m[i][j])))
    return out
