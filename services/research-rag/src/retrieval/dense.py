"""In-memory dense index backed by persisted vectors (exact cosine search; fine for tens of thousands of records)."""
from __future__ import annotations

import numpy as np


class DenseIndex:
    def __init__(self, dim: int = 0):
        self.dim = dim
        self.ids: list[str] = []
        self.row: dict[str, int] = {}
        self.mat = np.zeros((0, dim), dtype=np.float32)

    def __len__(self) -> int:
        return len(self.ids)

    def load(self, ids: list[str], mat: np.ndarray) -> None:
        self.ids = list(ids)
        self.row = {i: n for n, i in enumerate(self.ids)}
        self.mat = mat.astype(np.float32, copy=True)
        if len(ids):
            self.dim = mat.shape[1]

    def upsert(self, rid: str, vec: np.ndarray) -> None:
        vec = np.asarray(vec, dtype=np.float32)
        if self.dim == 0:
            self.dim = len(vec)
            self.mat = np.zeros((0, self.dim), dtype=np.float32)
        if rid in self.row:
            self.mat[self.row[rid]] = vec
        else:
            self.row[rid] = len(self.ids)
            self.ids.append(rid)
            self.mat = np.vstack([self.mat, vec[None, :]])

    def remove(self, rid: str) -> None:
        i = self.row.pop(rid, None)
        if i is None:
            return
        last = len(self.ids) - 1
        if i != last:
            moved = self.ids[last]
            self.ids[i] = moved
            self.mat[i] = self.mat[last]
            self.row[moved] = i
        self.ids.pop()
        self.mat = self.mat[:last]

    def search(self, qvec: np.ndarray, allowed: set[str] | None = None, limit: int = 100,
               min_score: float = -1.0) -> list[tuple[str, float]]:
        if not len(self.ids):
            return []
        sims = self.mat @ np.asarray(qvec, dtype=np.float32)
        if allowed is not None:
            mask = np.fromiter((i in allowed for i in self.ids), dtype=bool, count=len(self.ids))
            sims = np.where(mask, sims, -2.0)
        order = np.lexsort((np.array(self.ids), -sims))  # deterministic tie-break by id
        out = []
        for i in order[: max(limit * 2, limit)]:
            s = float(sims[i])
            if s < min_score or s <= -2.0:
                break
            out.append((self.ids[i], s))
            if len(out) >= limit:
                break
        return out
