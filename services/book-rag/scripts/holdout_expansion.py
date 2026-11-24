"""Held-out check of the cross-language expansion (v13), on NEW questions.

Why: many of the 84 evaluation questions contain glossary words, so their gain (0.887 -> 0.897) could partly come from
the glossary fitting those very questions. These 28 questions were written for this check only: their topics are NOT
the topics of the evaluation questions, and their relevant books come from the catalog's subject headings (same
books_with_subject() as the evaluation), chosen by meaning BEFORE running anything. The glossary is not changed after
seeing the results.

Families:
  glossary_en / glossary_ar / glossary_mixed -- topics in the glossary, asked in English / Arabic / mixed
  control -- topics NOT in the glossary: the expansion must not run, so the scores must be identical

    python scripts/holdout_expansion.py          # runs the production pipeline twice: expansion on, then off
"""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

import pandas as pd  # noqa: E402

from sams_rag import evaluation as ev  # noqa: E402
from sams_rag.config import CONFIG  # noqa: E402
from sams_rag.expansion import expand_query  # noqa: E402
from sams_rag.search import reranker  # noqa: E402
from sams_rag.text import normalize_text  # noqa: E402

COMPUTING = ["computer", "الحاسب", "الحاسوب"]
AUDITING = ["auditing", "المراجعه", "مراجعه الحسابات"]
INSURANCE = ["insurance", "التامين"]
NEGOTIATION = ["negotiation", "التفاوض"]
CRISIS = ["crisis", "الازمات"]
TOURISM = ["tourism", "hotel", "السياحه", "الفنادق"]
ENTREPRENEURSHIP = ["entrepreneur", "small business", "ريادة", "المشروعات الصغيره"]
ADVERTISING = ["advertising", "الاعلان"]
ECONOMICS = ["economics", "الاقتصاد"]
SUPPLY_CHAIN = ["supply chain", "logistic", "الامداد", "اللوجستي"]
FINANCE = ["finance", "التمويل", "الاداره الماليه"]
STRATEGY = ["strategic", "الاداره الاستراتيجيه", "التخطيط الاستراتيجي"]
MOTIVATION = ["motivation", "الحوافز", "الدافعيه"]
INVESTMENT = ["investment", "الاستثمار"]
TIME_MGMT = ["time management", "اداره الوقت"]
KNOWLEDGE_MGMT = ["knowledge management", "اداره المعرفه"]
PUBLIC_RELATIONS = ["public relations", "العلاقات العامه"]
ENVIRONMENT = ["environment", "البيئه"]
TRANSPORT = ["transport", "النقل"]
ENERGY = ["energy", "الطاقه"]
LAW = ["law", "القانون"]

HOLDOUT = [
    # topics in the glossary, asked in English (the expansion adds the Arabic terms)
    ("glossary_en", "introduction to computers", COMPUTING),
    ("glossary_en", "auditing principles and practice", AUDITING),
    ("glossary_en", "books about insurance", INSURANCE),
    ("glossary_en", "negotiation skills for managers", NEGOTIATION),
    ("glossary_en", "crisis management in companies", CRISIS),
    ("glossary_en", "tourism and hotel management", TOURISM),
    ("glossary_en", "entrepreneurship and starting a business", ENTREPRENEURSHIP),
    ("glossary_en", "advertising and promotion", ADVERTISING),
    # topics in the glossary, asked in Arabic (the expansion adds the English terms)
    ("glossary_ar", "مبادئ الاقتصاد", ECONOMICS),
    ("glossary_ar", "كتب عن الاستثمار", INVESTMENT),
    ("glossary_ar", "التخطيط الاستراتيجي للمؤسسات", STRATEGY),
    ("glossary_ar", "الحوافز في بيئة العمل", MOTIVATION),
    ("glossary_ar", "مراجعة الحسابات في الشركات", AUDITING),
    ("glossary_ar", "إدارة الوقت للمديرين", TIME_MGMT),
    ("glossary_ar", "إدارة المعرفة في المنظمات", KNOWLEDGE_MGMT),
    ("glossary_ar", "كتب عن التأمين", INSURANCE),
    # topics in the glossary, mixed Arabic + English
    ("glossary_mixed", "كتب عن الـ Supply chain", SUPPLY_CHAIN),
    ("glossary_mixed", "مراجع في الـ Investment", INVESTMENT),
    ("glossary_mixed", "أساسيات الـ Economics", ECONOMICS),
    ("glossary_mixed", "كتب عن الـ Tourism", TOURISM),
    ("glossary_mixed", "مهارات الـ Negotiation", NEGOTIATION),
    ("glossary_mixed", "كتب الـ Finance للشركات", FINANCE),
    # control: topics NOT in the glossary -> nothing must change
    ("control", "public relations", PUBLIC_RELATIONS),
    ("control", "كتب عن العلاقات العامة", PUBLIC_RELATIONS),
    ("control", "environmental management", ENVIRONMENT),
    ("control", "كتب عن النقل والمواصلات", TRANSPORT),
    ("control", "كتب عن الطاقة", ENERGY),
    ("control", "قوانين العمل", LAW),
]


def build_holdout():
    rows = []
    for fam, q, pats in HOLDOUT:
        rel = ev.books_with_subject([normalize_text(p) for p in pats])
        rows.append({"family": fam, "query": q, "relevant": rel, "n_relevant": len(rel),
                     "expanded_with": expand_query(q)})
    return pd.DataFrame(rows)


def run(df, expansion):
    CONFIG["query_expansion"] = expansion
    rows = ev.evaluate(df, "rrf", ev.K, rerank=reranker.available)
    return rows.set_index("query")[f"nDCG@{ev.K}"]


def main():
    pd.set_option("display.width", 160)
    df = build_holdout()
    gl = df["family"] != "control"
    print(f"{len(df)} new questions | glossary used in {int((df.loc[gl, 'expanded_with'] != '').sum())}/{int(gl.sum())} "
          f"glossary questions | in {int((df.loc[~gl, 'expanded_with'] != '').sum())}/{int((~gl).sum())} control questions")
    if not reranker.available:
        print("WARNING: reranker not loaded -> measuring rrf only (production is rrf+rerank)")
    on, off = run(df, True), run(df, False)
    CONFIG["query_expansion"] = True
    df["off"] = df["query"].map(off).round(3)
    df["on"] = df["query"].map(on).round(3)
    df["diff"] = (df["on"] - df["off"]).round(3)

    print("\n== per question (nDCG@10)")
    print(df[["family", "query", "n_relevant", "off", "on", "diff"]].to_string(index=False))
    print("\n== per family (mean nDCG@10)")
    fam = df.groupby("family").agg(questions=("query", "size"), off=("off", "mean"), on=("on", "mean"),
                                   better=("diff", lambda d: int((d > 0.005).sum())),
                                   worse=("diff", lambda d: int((d < -0.005).sum()))).round(3)
    fam["diff"] = (fam["on"] - fam["off"]).round(3)
    print(fam.to_string())
    g_off, g_on = df.loc[gl, "off"].mean(), df.loc[gl, "on"].mean()
    control_same = bool((df.loc[~gl, "diff"].abs() < 1e-9).all())
    worst = fam.drop(index="control", errors="ignore")["diff"].min()
    print(f"\nglossary questions: {g_off:.3f} -> {g_on:.3f} ({g_on - g_off:+.3f}) | control unchanged: {control_same}")
    if g_on - g_off >= 0.01 and worst >= -0.02 and control_same:
        verdict = "KEEP the expansion: it helps on new questions too"
    elif g_on - g_off > -0.01 and control_same:
        verdict = "NEUTRAL on new questions: the evaluation gain may come from its own questions -- keep 0.887 as reference"
    else:
        verdict = "DO NOT rely on the expansion: it does not help (or hurts) on new questions"
    print("VERDICT:", verdict)


if __name__ == "__main__":
    main()
