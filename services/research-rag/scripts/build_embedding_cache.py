"""Precompute passage embeddings for the whole dataset with the configured neural backend and save them to
EMBEDDING_CACHE_FILE (default data/cache/embeddings.npz). Commit that file to the PRIVATE repo: the cloud app then only
embeds queries at run time (fast cold start, no 4,000-record embedding on a 1 GB container).
Run on a machine that can download the model (e.g. your laptop):
    EMBEDDING_BACKEND=fastembed python scripts/build_embedding_cache.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config.settings import get_settings  # noqa: E402
from src.data.loader import read_raw_rows, rows_to_records  # noqa: E402
from src.retrieval.embeddings import FastEmbedEmbedder, get_embedder, is_neural  # noqa: E402


def main() -> int:
    s = get_settings()
    emb = get_embedder(s)
    if not isinstance(emb, FastEmbedEmbedder):
        print("ABORT: active embedder is", emb.model_id, getattr(emb, "fallback_reason", "") or "(set EMBEDDING_BACKEND=fastembed)")
        return 2
    _, rows, _ = read_raw_rows(s.raw_dataset_path)
    recs, _ = rows_to_records(rows, min_year=s.min_valid_year, max_year=s.max_valid_year)
    texts = [r.embedding_text() for r in recs]
    emb.encode_passages(texts)
    Path(s.embedding_cache_file).parent.mkdir(parents=True, exist_ok=True)
    n = emb.save_cache(s.embedding_cache_file)
    print(f"Saved {n} passage vectors for {emb.model_id} -> {s.embedding_cache_file} ({Path(s.embedding_cache_file).stat().st_size/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
