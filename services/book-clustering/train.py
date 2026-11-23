# -*- coding: utf-8 -*-
"""
train.py - train the book clustering model on the catalog and save it.

Usage:
    python train.py --input SAMS_Books_Merged_Book_Names_Corrected.xlsx --model_dir model

Creates in --model_dir:
    book_clusters.joblib    the fitted model (TF-IDF + SVD + KMeans for Arabic and English)
    training_report.json    settings, library versions, and quality scores of this training run
"""
import argparse
import datetime
import json
import os
import platform

import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

from clustering_core import BookClusterer, SVD_DIMS, SUBJECT_WEIGHT, CODES_WEIGHT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="catalog Excel file")
    ap.add_argument("--model_dir", default="model")
    ap.add_argument("--k_ar", type=int, default=10)
    ap.add_argument("--k_en", type=int, default=6)
    args = ap.parse_args()
    os.makedirs(args.model_dir, exist_ok=True)

    # Read the catalog; the text "NA" becomes a real missing value.
    df = pd.read_excel(args.input).replace({"NA ": np.nan, "NA": np.nan})
    clusterer, assigned = BookClusterer.fit(df, args.k_ar, args.k_en)

    # Quality: agreement of the training clusters with Dewey (first 2 digits of CALL_NUM).
    assigned["ddc"] = assigned["CALL_NUM"].astype(str).str.extract(r"(\d{3})")[0]
    d = assigned[assigned["ddc"].notna()]
    y = d["ddc"].str[:2]
    purity = pd.crosstab(d["cluster"], y).max(axis=1).sum() / len(d)
    report = {
        "trained_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "n_training_books": int(len(assigned)),
        "books_per_language": assigned["lang"].value_counts().to_dict(),
        "k": {"ar": args.k_ar, "en": args.k_en},
        "settings": {"svd_dims": SVD_DIMS, "subject_weight": SUBJECT_WEIGHT, "codes_weight": CODES_WEIGHT},
        "agreement_with_dewey_on_training_books": {
            "NMI": round(normalized_mutual_info_score(y, d["cluster"]), 3),
            "ARI": round(adjusted_rand_score(y, d["cluster"]), 3),
            "Purity": round(float(purity), 3),
            "books_evaluated": int(len(d)),
        },
        "versions": {"python": platform.python_version(), "scikit-learn": sklearn.__version__,
                     "pandas": pd.__version__, "numpy": np.__version__},
    }
    clusterer.meta.update({"trained_at_utc": report["trained_at_utc"],
                           "scikit_learn_version": sklearn.__version__,
                           "k": report["k"]})

    model_path = os.path.join(args.model_dir, "book_clusters.joblib")
    clusterer.save(model_path)
    with open(os.path.join(args.model_dir, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("Saved model to", model_path)
    print(json.dumps(report["agreement_with_dewey_on_training_books"], indent=2))


if __name__ == "__main__":
    main()
