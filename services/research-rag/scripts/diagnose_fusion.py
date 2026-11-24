"""Diagnose keyword, semantic, and hybrid retrieval without rebuilding the index."""

import sys
from pathlib import Path

# Make the project root importable when this script runs from scripts/.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.config.settings import get_settings
from src.service import build_services
from src.evaluation.probes import TOPICS


def main() -> None:
    # Use the existing evaluation database, not the main project database.
    eval_db = (ROOT / "data" / "store" / "rag_free_check.db").resolve()

    if not eval_db.is_file():
        raise FileNotFoundError(
            f"Evaluation database not found: {eval_db}"
        )

    base = get_settings()

    # Create a separate settings instance for this diagnostic.
    settings = base.model_copy(
        update={
            "database_url": f"sqlite:///{eval_db.as_posix()}",
            "embedding_backend": "ollama",
            "embedding_model": "bge-m3",
        }
    )

    print("=" * 65)
    print("SADAT RAG — Retrieval Fusion Diagnostic")
    print("=" * 65)
    print("Project root:", ROOT)
    print("Database:", eval_db)
    print("Embedding backend:", settings.embedding_backend)
    print("Embedding model:", settings.embedding_model)
    print("Ollama URL:", settings.ollama_url)
    print()

    # Load the existing index; do not call the indexer or rebuild embeddings.
    services = build_services(settings, load=True)
    engine = services.engine

    print("Records loaded:", len(engine.records))
    print("Dense vectors loaded:", len(engine.dense))
    print()

    if len(engine.records) == 0:
        raise RuntimeError(
            "No records were loaded. Stopping the diagnostic."
        )

    if len(engine.dense) == 0:
        raise RuntimeError(
            "The dense index is empty. Stopping before comparing retrieval modes."
        )

    # Compare keyword, semantic, and hybrid retrieval on the same queries.
    for topic_number, (ar_query, en_query, keywords) in enumerate(
        TOPICS, start=1
    ):
        for language, query in (
            ("AR", ar_query),
            ("EN", en_query),
        ):
            print("=" * 65)
            print(f"Topic {topic_number} | Language: {language}")
            print("Query:", query)
            print("Keywords:", ", ".join(keywords))
            print("-" * 65)

            for mode in ("keyword", "semantic", "hybrid"):
                result = engine.search(
                    query,
                    mode,
                    page_size=10,
                )

                print(f"\n[{mode.upper()}]")

                if not result.hits:
                    print("  No results.")
                    continue

                for rank, hit in enumerate(result.hits, start=1):
                    title = getattr(hit, "title", "") or "(no title)"
                    record_id = getattr(hit, "record_id", "unknown")
                    score = getattr(hit, "score", None)

                    print(
                        f"  {rank:02d}. ID={record_id} | "
                        f"score={score} | title={title}"
                    )

            print()

    print("=" * 65)
    print("Diagnostic finished.")
    print("No indexing or database writes were requested.")
    print("=" * 65)


if __name__ == "__main__":
    main()