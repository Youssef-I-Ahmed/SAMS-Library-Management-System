"""Compare RRF weights using the existing evaluation database and embeddings."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.config.settings import get_settings
from src.service import build_services
from src.evaluation.probes import TOPICS


def main() -> None:
    eval_db = (ROOT / "data" / "store" / "rag_free_check.db").resolve()
    if not eval_db.is_file():
        raise FileNotFoundError(f"Evaluation DB not found: {eval_db}")

    base = get_settings()
    settings = base.model_copy(update={
        "database_url": f"sqlite:///{eval_db.as_posix()}",
        "embedding_backend": "ollama",
        "embedding_model": "bge-m3",
    })

    services = build_services(settings, load=True)
    engine = services.engine

    print(f"Database: {eval_db}")
    print(f"Records: {len(engine.records)}")
    print(f"Dense vectors: {len(engine.dense)}")

    if not engine.records or not len(engine.dense):
        raise RuntimeError("Records or dense vectors are missing.")

    # Keep one loaded engine and change only the in-memory RRF weights.
    queries = [
        (lang, query, keywords)
        for ar_query, en_query, keywords in TOPICS
        for lang, query in (("AR", ar_query), ("EN", en_query))
    ]

    for semantic_weight in (1.0, 2.0, 3.0):
        engine.s.semantic_weight = semantic_weight
        engine.s.bm25_weight = 1.0
        print(f"\n{'=' * 70}")
        print(f"BM25 weight=1.0 | Semantic weight={semantic_weight}")
        print("=" * 70)

        for lang, query, keywords in queries:
            result = engine.search(query, "hybrid", page_size=5)
            print(f"\n[{lang}] {query}")
            print("Expected topic keywords:", ", ".join(keywords))
            for rank, hit in enumerate(result.hits, 1):
                semantic = hit.scores.get("semantic")
                bm25 = hit.scores.get("bm25")
                print(
                    f"{rank}. ID={hit.record_id} | "
                    f"semantic={semantic} | bm25={bm25} | {hit.title}"
                )

    print("\nFinished. No embeddings rebuilt and no database writes requested.")


if __name__ == "__main__":
    main()