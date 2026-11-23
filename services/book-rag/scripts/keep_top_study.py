"""How many top-ranked books should the "full list" always keep? (BOOK_KEEP_TOP, 20 today: chosen with this script)

The book page keeps the first N books of the engine's ranking in the list under the answer, and after them only the
books the reranker scores >= 0.2 (book_ui/relevance.py). This script measures, on the same 84 evaluation questions as
scripts/evaluate.py, what each N gives:

  1. Recall@N             -- share of the right books (the evaluation's answer key) found in the first N
  2. right books by place -- share of right books among places 1-10, 11-15, 16-20, 21-30, 31-50
  3. questions helped     -- share of questions that get at least one more right book in each band
  4. reranker scores      -- the share of right books that score >= 0.2 (if low: the score alone would drop them)

Run it on Colab with the real models (like evaluate.py); no Gemini, nothing is changed:

    python scripts/keep_top_study.py

A JSON report is written to reports/keep_top_<date>.json.
"""
import json
import logging
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

import pandas as pd  # noqa: E402

from sams_rag import evaluation as ev  # noqa: E402
from sams_rag.catalog import books_df  # noqa: E402
from sams_rag.search import hybrid_search, reranker  # noqa: E402

DEPTH = 100                                   # the list is built from the engine's closest 100 books (book_app.py)
CUTS = [10, 15, 20, 30, 50]                   # candidate values of BOOK_KEEP_TOP
BANDS = [(1, 10), (11, 15), (16, 20), (21, 30), (31, 50)]
MIN_RELEVANCE = 0.2                           # book_ui/relevance.py


def scores_for(query, ids):
    # reranker score 0..1 of each book for the question (same scoring as book_ui/relevance.py)
    sc = [float(s) for s in reranker.score(query, [books_df.at[b, "content"] for b in ids])]
    if any(s < 0 or s > 1 for s in sc):
        sc = [1 / (1 + math.exp(-s)) for s in sc]
    return sc


def main():
    t0 = time.time()
    if not reranker.available:
        print("WARNING: reranker not loaded -> ranking without it, and no score section. Run on Colab with the models.\n")
    eval_df = ev.build_eval_set()
    rows, score_rows = [], []
    for r in eval_df.itertuples():
        ret = hybrid_search(r.query, k=DEPTH, method="rrf", rerank=reranker.available,
                            auto_filters=False)["book_id"].tolist()
        rel = r.relevant
        row = {"family": r.family, "query": r.query, "n_relevant": len(rel)}
        for n in CUTS:
            row[f"R@{n}"] = ev.recall_at_k(ret, rel, n)
        for a, b in BANDS:
            band = ret[a - 1:b]
            row[f"right_{a}_{b}"] = sum(x in rel for x in band)
            row[f"size_{a}_{b}"] = len(band)
        rows.append(row)
        if reranker.available:
            band_ids = ret[:50]
            for place, (b, s) in enumerate(zip(band_ids, scores_for(r.query, band_ids)), start=1):
                score_rows.append({"place": place, "right": b in rel, "score": s})
    df = pd.DataFrame(rows)

    print(f"{len(df)} questions, engine's closest {DEPTH} books each "
          f"({'rrf+rerank' if reranker.available else 'rrf'})\n")
    print("1) Recall@N -- share of the right books found in the first N (average over the questions)")
    recall = {n: round(df[f"R@{n}"].mean(), 3) for n in CUTS}
    for n in CUTS:
        print(f"   N = {n:<3} {recall[n]:.3f}" + ("" if n == CUTS[0] else f"   (+{recall[n] - recall[CUTS[0]]:.3f} vs N=10)"))

    print("\n2) Share of right books at each place in the ranking (all questions together)")
    bands = {}
    for a, b in BANDS:
        right, size = int(df[f"right_{a}_{b}"].sum()), int(df[f"size_{a}_{b}"].sum())
        helped = float((df[f"right_{a}_{b}"] > 0).mean())
        bands[f"{a}-{b}"] = {"right_share": round(right / size, 3) if size else None, "right_books": right,
                             "questions_with_a_right_book": round(helped, 3)}
        print(f"   places {a:>2}-{b:<2}  right books {right / size:6.1%}   "
              f"questions with at least one right book here {helped:6.1%}")

    print("\n   by question family (share of right books in places 11-15 / 16-20):")
    fam = df.groupby("family")[[f"right_{a}_{b}" for a, b in BANDS] + [f"size_{a}_{b}" for a, b in BANDS]].sum()
    by_family = {}
    for f, r in fam.iterrows():
        s1 = r["right_11_15"] / r["size_11_15"] if r["size_11_15"] else 0
        s2 = r["right_16_20"] / r["size_16_20"] if r["size_16_20"] else 0
        by_family[f] = {"11-15": round(s1, 3), "16-20": round(s2, 3)}
        print(f"     {f:<14} {s1:6.1%} / {s2:6.1%}")

    score = None
    if score_rows:
        sdf = pd.DataFrame(score_rows)
        right = sdf[sdf["right"]]
        score = {"right_books_scored_at_least_0.2": round(float((right["score"] >= MIN_RELEVANCE).mean()), 3),
                 "right_books_median_score": round(float(right["score"].median()), 3),
                 "other_books_median_score": round(float(sdf[~sdf["right"]]["score"].median()), 3)}
        print(f"\n3) Reranker scores (first 50 places): right books that score >= {MIN_RELEVANCE}: "
              f"{score['right_books_scored_at_least_0.2']:.1%}; median score of right books "
              f"{score['right_books_median_score']:.2f}, of the other books {score['other_books_median_score']:.2f}")
        print("   (if the first share is low, the score alone would drop many right books -> keep the top N by rank)")

    print("\nHow to read it: N is worth raising while the next band still holds a fair share of right books and "
          "Recall still grows;\nwhere the share drops and Recall hardly moves, the extra books are mostly not "
          "right -> stop there.")

    os.makedirs("reports", exist_ok=True)
    path = os.path.join("reports", f"keep_top_{time.strftime('%Y%m%d_%H%M')}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"questions": len(df), "ranking": "rrf+rerank" if reranker.available else "rrf",
                   "recall": recall, "bands": bands, "by_family": by_family, "reranker_scores": score,
                   "seconds": round(time.time() - t0, 1)}, f, ensure_ascii=False, indent=2)
    print(f"\nReport: {path}")


if __name__ == "__main__":
    main()
