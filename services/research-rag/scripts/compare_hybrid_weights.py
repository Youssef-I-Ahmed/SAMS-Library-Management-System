#!/usr/bin/env python
"""Detailed comparison of semantic-only and hybrid retrieval using Ollama BGE-M3.

Uses only data/store/rag_free_check.db and writes a new report file.
It does not rebuild embeddings or modify application settings.
Relevance labels are keyword proxies, not human judgments.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTHONUTF8", "1")

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.config.settings import get_settings
from src.data.normalize_ar import normalize_text
from src.evaluation.probes import TOPICS
from src.service import build_services


def ndcg(ranked: list[str], relevant: set[str], k: int = 10) -> float:
    dcg = sum(
        1 / math.log2(i + 2)
        for i, rid in enumerate(ranked[:k])
        if rid in relevant
    )
    ideal = sum(
        1 / math.log2(i + 2)
        for i in range(min(len(relevant), k))
    )
    return dcg / ideal if ideal else 0.0


def recall_at_k(ranked: list[str], relevant: set[str], k: int = 10) -> float:
    denominator = min(k, len(relevant))
    return (
        sum(rid in relevant for rid in ranked[:k]) / denominator
        if denominator
        else 0.0
    )


def is_arabic_title(title: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in title)


def avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def main() -> int:
    base_settings = get_settings()
    eval_db = ROOT / "data" / "store" / "rag_free_check.db"

    if not eval_db.exists():
        raise FileNotFoundError(
            f"Evaluation database not found: {eval_db}"
        )

    settings = base_settings.model_copy(update={
        "database_url": f"sqlite:///{eval_db.as_posix()}",
        "embedding_backend": "ollama",
        "embedding_model": "bge-m3",
    })

    print(f"Evaluation database: {eval_db}")

    services = build_services(settings, load=True)
    engine = services.engine
    model_id = str(getattr(engine.embedder, "model_id", ""))

    if not model_id.startswith("ollama:bge-m3"):
        raise RuntimeError(
            f"Expected ollama:bge-m3, but got {model_id}. "
            "Check that Ollama is running and bge-m3 is available."
        )

    print(f"Active embedding model: {model_id}")

    titles = {
        rid: normalize_text(record.title)
        for rid, record in engine.records.items()
    }

    original_bm25 = engine.s.bm25_weight
    original_semantic = engine.s.semantic_weight

    experiments = {
        "semantic_only": (
            "semantic",
            original_bm25,
            original_semantic,
        ),
        "hybrid_current": (
            "hybrid",
            original_bm25,
            original_semantic,
        ),
        "hybrid_semantic_x3": (
            "hybrid",
            1.0,
            3.0,
        ),
        "hybrid_semantic_x5": (
            "hybrid",
            1.0,
            5.0,
        ),
    }

    report = {
        "model": model_id,
        "database": str(eval_db),
        "records": len(engine.records),
        "relevance_note": (
            "Keyword-based title proxies only; these are not human "
            "relevance judgments. Cross-language buckets classify a "
            "title as Arabic if it contains any Arabic-range character."
        ),
        "metrics": (
            "Recall@10 and NDCG@10; averages are macro-averages "
            "over eligible probes. Recall@10 uses min(10, relevant_count) "
            "as its denominator to remain comparable with the previous report."
        ),
        "experiments": {},
        "per_probe": {},
    }

    try:
        for name, (
            mode,
            bm25_weight,
            semantic_weight,
        ) in experiments.items():

            engine.s.bm25_weight = bm25_weight
            engine.s.semantic_weight = semantic_weight

            per_language = {
                "ar": [],
                "en": [],
            }

            cross_ar_en = []
            cross_en_ar = []
            per_probe = []

            for index, (
                ar_query,
                en_query,
                keywords,
            ) in enumerate(TOPICS, start=1):

                normalized_keywords = [
                    normalize_text(keyword)
                    for keyword in keywords
                ]

                relevant = {
                    rid
                    for rid, title in titles.items()
                    if any(
                        keyword and keyword in title
                        for keyword in normalized_keywords
                    )
                }

                if not relevant:
                    per_probe.append({
                        "probe": index,
                        "arabic_query": ar_query,
                        "english_query": en_query,
                        "status": "skipped_no_keyword_proxy_matches",
                    })
                    continue

                probe_result = {
                    "probe": index,
                    "arabic_query": ar_query,
                    "english_query": en_query,
                    "keyword_proxy_relevant_count": len(relevant),
                    "queries": {},
                    "cross_language": {},
                }

                query_results = {}

                for language, query in (
                    ("ar", ar_query),
                    ("en", en_query),
                ):
                    response = engine.search(
                        query,
                        mode,
                        page_size=10,
                    )

                    ranked = [
                        hit.record_id
                        for hit in response.hits
                    ]

                    query_results[language] = (
                        ranked,
                        response.hits,
                    )

                    metrics = {
                        "recall_at_10": round(
                            recall_at_k(ranked, relevant),
                            4,
                        ),
                        "ndcg_at_10": round(
                            ndcg(ranked, relevant),
                            4,
                        ),
                        "returned": len(ranked),
                    }

                    per_language[language].append(metrics)

                    probe_result["queries"][language] = {
                        "query": query,
                        **metrics,
                        "top10": [
                            {
                                "record_id": hit.record_id,
                                "title": hit.title,
                                "match_type": hit.match_type,
                            }
                            for hit in response.hits
                        ],
                    }

                cross_language_cases = (
                    (
                        "ar",
                        "en",
                        "arabic_query_english_titles",
                        cross_ar_en,
                    ),
                    (
                        "en",
                        "ar",
                        "english_query_arabic_titles",
                        cross_en_ar,
                    ),
                )

                for (
                    query_language,
                    target_language,
                    bucket_name,
                    bucket,
                ) in cross_language_cases:

                    target_relevant = {
                        rid
                        for rid in relevant
                        if is_arabic_title(
                            engine.records[rid].title
                        ) == (target_language == "ar")
                    }

                    if len(target_relevant) < 3:
                        probe_result["cross_language"][bucket_name] = {
                            "eligible": False,
                            "target_relevant_count": len(target_relevant),
                            "reason": (
                                "Fewer than 3 keyword-proxy relevant "
                                "titles in target language."
                            ),
                        }
                        continue

                    ranked, _hits = query_results[query_language]

                    value = recall_at_k(
                        ranked,
                        target_relevant,
                    )

                    bucket.append(value)

                    probe_result["cross_language"][bucket_name] = {
                        "eligible": True,
                        "target_relevant_count": len(target_relevant),
                        "recall_at_10": round(value, 4),
                    }

                per_probe.append(probe_result)

            def summarize(rows: list[dict]) -> dict:
                return {
                    "query_count": len(rows),
                    "recall_at_10": avg([
                        row["recall_at_10"]
                        for row in rows
                    ]),
                    "ndcg_at_10": avg([
                        row["ndcg_at_10"]
                        for row in rows
                    ]),
                }

            report["experiments"][name] = {
                "mode": mode,
                "bm25_weight": bm25_weight,
                "semantic_weight": semantic_weight,
                "by_query_language": {
                    "arabic": summarize(per_language["ar"]),
                    "english": summarize(per_language["en"]),
                },
                "overall": summarize(
                    per_language["ar"] + per_language["en"]
                ),
                "cross_language": {
                    "arabic_query_english_titles": {
                        "n": len(cross_ar_en),
                        "recall_at_10": avg(cross_ar_en),
                    },
                    "english_query_arabic_titles": {
                        "n": len(cross_en_ar),
                        "recall_at_10": avg(cross_en_ar),
                    },
                },
            }

            report["per_probe"][name] = per_probe

    finally:
        engine.s.bm25_weight = original_bm25
        engine.s.semantic_weight = original_semantic

    output = (
        ROOT
        / "data"
        / "processed"
        / "compare_hybrid_weights_detailed.json"
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output.write_text(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            report["experiments"],
            ensure_ascii=False,
            indent=2,
        )
    )

    print(f"\nDetailed report saved to: {output}")
    print("Original weights restored in memory; no embeddings were rebuilt.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())