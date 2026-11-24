"""Should the first 20 books of the full list need a small minimum reranker score? (a "floor")

Today the book page always keeps the first 20 books of the engine's ranking (BOOK_KEEP_TOP, see keep_top_study.py),
whatever the reranker thinks of them. For a question with few matching books (an author the catalog does not have,
a narrow topic), the last of those 20 can be unrelated. A floor would keep a top-20 book only if its reranker score
reaches a small minimum. This script measures, on the same 84 evaluation questions, for several floors:

  1. right books kept    -- share of the right books in the first 20 that the floor keeps (we want ~100%)
  2. other books dropped -- share of the other books in the first 20 that the floor removes (we want high)
  3. Recall@20 after the floor, and the average number of books left out of 20
  4. a few questions with almost no matching books: how many books stay in their list

Run it on Colab with the real models (like evaluate.py); no Gemini, nothing is changed:

    python scripts/floor_study.py

A JSON report is written to reports/floor_<date>.json.
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

TOP = 20                                          # BOOK_KEEP_TOP
DEPTH = 100                                       # the list is built from the engine's closest 100 books
FLOORS = [0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.2]
# questions with few or no matching books in the catalog (no answer key: only how many books stay)
FEW_MATCH = ["كتب دكتور نفين مكرم", "إزاي أعمل كيكة؟", "books about football", "كتب عن الطب البيطري",
             "روايات نجيب محفوظ"]


def scores_for(query, ids):
    # reranker score 0..1 of each book for the question (same scoring as book_ui/relevance.py)
    sc = [float(s) for s in reranker.score(query, [books_df.at[b, "content"] for b in ids])]
    if any(s < 0 or s > 1 for s in sc):
        sc = [1 / (1 + math.exp(-s)) for s in sc]
    return sc


def ranked(query):
    return hybrid_search(query, k=DEPTH, method="rrf", rerank=True, auto_filters=False)["book_id"].tolist()


def main():
    t0 = time.time()
    if not reranker.available:
        sys.exit("The reranker is not loaded: this study needs it. Run it on Colab with the models.")
    eval_df = ev.build_eval_set()
    rows = []                                     # one row per (question, book in the first 20)
    for r in eval_df.itertuples():
        ids = ranked(r.query)[:TOP]
        for b, s in zip(ids, scores_for(r.query, ids)):
            rows.append({"query": r.query, "family": r.family, "n_relevant": len(r.relevant),
                         "right": b in r.relevant, "score": s})
    df = pd.DataFrame(rows)
    n_q = df["query"].nunique()
    print(f"{n_q} questions, first {TOP} books each (rrf+rerank): {int(df['right'].sum())} right books, "
          f"{int((~df['right']).sum())} other books\n")
    print("   floor   right kept   others dropped   Recall@20   books left of 20 (avg)")
    table = {}
    for f in FLOORS:
        kept = df["score"] >= f
        right_kept = (kept & df["right"]).sum() / df["right"].sum()
        others_dropped = (~kept & ~df["right"]).sum() / (~df["right"]).sum()
        rec = (df[kept & df["right"]].groupby("query").size().reindex(df["query"].unique(), fill_value=0)
               / df.groupby("query")["n_relevant"].first()).mean()
        left = kept.groupby(df["query"]).sum().mean()
        table[f] = {"right_kept": round(float(right_kept), 3), "others_dropped": round(float(others_dropped), 3),
                    "recall_at_20": round(float(rec), 3), "books_left": round(float(left), 1)}
        print(f"   {f:<6}  {right_kept:9.1%}   {others_dropped:12.1%}   {rec:9.3f}   {left:10.1f}")

    print("\n   right books lost by family at each floor (share of that family's right books in the first 20):")
    by_family = {}
    for fam, g in df[df["right"]].groupby("family"):
        by_family[fam] = {f: round(float((g["score"] < f).mean()), 3) for f in FLOORS if f}
        print(f"     {fam:<14} " + "  ".join(f"{f}: {(g['score'] < f).mean():5.1%}" for f in FLOORS if f))

    print(f"\n4) Questions with few or no matching books: books left of the first {TOP} at each floor")
    few = {}
    for q in FEW_MATCH:
        ids = ranked(q)[:TOP]
        sc = scores_for(q, ids)
        few[q] = {f: sum(s >= f for s in sc) for f in FLOORS}
        print(f"   {q[:34]:<34} " + "  ".join(f"{f}: {few[q][f]:>2}" for f in FLOORS))

    print("\nHow to read it: pick the highest floor whose 'right kept' stays close to 100% (and Recall@20 hardly "
          "moves);\nthe 'others dropped' column and section 4 show how many unrelated books that floor removes.")

    os.makedirs("reports", exist_ok=True)
    path = os.path.join("reports", f"floor_{time.strftime('%Y%m%d_%H%M')}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"questions": n_q, "top": TOP, "floors": {str(k): v for k, v in table.items()},
                   "by_family_right_lost": by_family, "few_match": few,
                   "seconds": round(time.time() - t0, 1)}, fh, ensure_ascii=False, indent=2)
    print(f"\nReport: {path}")


if __name__ == "__main__":
    main()
