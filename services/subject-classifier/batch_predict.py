"""Batch classification: Excel/CSV in -> Excel/CSV out (no server needed).

    python batch_predict.py input.xlsx output.xlsx --column TITLE
"""
import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

MODEL_PATH = Path(__file__).parent / "models" / "best_model.pkl"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--column", default="TITLE", help="column that holds the titles")
    a = ap.parse_args()

    df = pd.read_csv(a.input) if a.input.lower().endswith(".csv") else pd.read_excel(a.input)
    df.columns = [str(c).strip() for c in df.columns]
    if a.column not in df.columns:
        raise SystemExit(f"Column '{a.column}' not found. Available: {list(df.columns)}")

    model = joblib.load(MODEL_PATH)
    classes = model.named_steps["clf"].classes_
    titles = df[a.column].fillna("").astype(str)
    proba = model.predict_proba(titles)
    top = proba.argmax(axis=1)
    df["predicted_subject"] = classes[top]
    df["confidence"] = proba[np.arange(len(df)), top].round(4)   # not calibrated
    df.loc[titles.str.strip() == "", ["predicted_subject", "confidence"]] = None

    if a.output.lower().endswith(".csv"):
        df.to_csv(a.output, index=False, encoding="utf-8-sig")
    else:
        df.to_excel(a.output, index=False)
    print(f"Done: {len(df)} rows -> {a.output}")


if __name__ == "__main__":
    main()
