"""Evaluation of the engine (notebook Section 12), unchanged logic, as functions.

    12.1 retrieval metrics on 84 questions   -> retrieval_eval()
    12.2 filter compliance                   -> filter_compliance()
    12.3 citation / refusal checks (Gemini)  -> generation_checks()
    12.5 RAG Triad with an LLM judge         -> run_rag_triad() + triad_summary()

REFERENCE holds the notebook v12 results; scripts/evaluate.py compares a new run against them.
"""
import json
import math
import os
import re
import time
from collections import Counter

import numpy as np
import pandas as pd

from .answer import rag_answer
from .catalog import books_df
from .chat import llm_complete
from .config import CONFIG
from .filters import SUBJECT_VOCAB, SearchFilters, apply_filters
from .search import hybrid_search, reranker
from .text import detect_language, normalize_text

K = 10

# Notebook v12 run (Hybrid_RAG_v12_run_.ipynb): the numbers a new version must not fall below.
REFERENCE = {
    "overall": {"rrf+rerank": {"P@10": 0.489, "R@10": 0.658, "Hit@10": 1.000, "MRR": 0.950, "nDCG@10": 0.887},
                "rrf": {"nDCG@10": 0.863}, "weighted": {"nDCG@10": 0.853},
                "semantic": {"nDCG@10": 0.824}, "bm25": {"nDCG@10": 0.805}},
    "by_family_rrf+rerank": {"arabic_morph": 0.843, "author": 0.990, "concept": 0.764,
                             "known_item": 1.000, "mixed_lang": 0.749, "topic_heading": 0.792},
    "triad": {"citation_validity": 1.000, "refusal_accuracy": 1.000, "faithfulness": 1.000,
              "answer_relevance": 1.000, "context_relevance": 0.917},
}

def books_with_subject(patterns):
    pats = [normalize_text(p) for p in patterns]
    return set(books_df.loc[books_df["subjects_norm"].map(lambda subs: any(p in s for s in subs for p in pats)), "book_id"])

CONCEPT_QUERIES = [
    ("How do organizations recruit, train and manage their employees?",
     ["ادارة الافراد", "الموارد البشرية", "القوى البشرية", "اختيار الافراد", "الموظفون", "التدريب",
      "human resource", "personnel management", "recruiting", "employee", "training", "staff"]),
    ("كتب عن الأسهم وأسواق الأوراق المالية",
     ["البورصات", "البورصة", "الأسهم", "السندات", "الاوراق المالية", "اوراق مالية", "الاسواق المالية",
      "stock", "bonds", "portfolio management", "investment analysis"]),
    ("selling products and services online",
     ["التجارة الالكترونية", "التسويق الالكتروني", "التسويق عبر الانترنت",
      "e commerce", "electronic commerce", "internet marketing", "digital marketing", "digital technology marketing"]),
    ("Islamic banking and Sharia-compliant finance",
     ["البنوك الاسلامية", "المصارف الاسلامية", "الاقتصاد الاسلامي", "المعاملات فقه اسلامي", "الاسلام والاقتصاد", "islamic"]),
    ("protecting a company against financial losses and uncertainty",
     ["المخاطر", "risk management", "financial risk", "risk control", "insurance risks"]),
    ("statistical data analysis with software",
     ["احصاء", "احصائي", "spss", "statistic", "data analysis"]),
    ("تحسين جودة المنتجات والخدمات في المؤسسات",
     ["جودة", "ايزو", "quality"]),
    ("income tax and sales tax laws",
     ["الضرائب", "ضرائب", "ضريبي", "tax"]),
    ("how to be an effective leader",
     ["القيادة", "القادة", "leadership"]),
    ("planning and managing projects on time and budget",
     ["ادارة المشروعات", "تخطيط المشروعات", "المشروعات تنظيم واداره", "project management", "projects"]),
    ("دراسات الجدوى للمشروعات الجديدة",
     ["دراسة الجدوى", "جدوى", "تقييم المشروعات", "المشروعات تقييم", "feasibility"]),
    ("customer behavior and consumer psychology",
     ["سلوك المستهلك", "المستهلكون", "رضاء المستهلك", "consumer behavior", "consumers"]),
]
ARABIC_MORPH_QUERIES = [
    ("ما هي الكتب المتاحة عن البنك؟",    ["البنوك", "بنوك", "banks and banking", "banking"]),          # بنك / بنوك
    ("كتب عن إدارة مشروع صغير",          ["المشروعات الصغيرة", "المشروعات التجارية الصغيرة", "small business"]),  # مشروع / المشروعات
    ("كتب عن ضريبة الدخل",               ["ضرائب الدخل", "income tax"]),                               # ضريبة / ضرائب
    ("كتب عن السهم والسند",              ["الأسهم", "السندات", "stock", "bonds"]),                     # سهم / أسهم
    ("كيف يكون القائد الإداري ناجحا؟",   ["القيادة", "القادة", "leadership"]),                          # القائد / القادة
    ("كتب عن الشركة المساهمة",           ["الشركات المساهمة"]),                                        # الشركة / الشركات
    ("اتجاهات المستهلكين ورضاهم",         ["المستهلكون", "سلوك المستهلك", "رضاء المستهلك", "consumers", "consumer behavior"]),  # المستهلكين / المستهلكون
    ("تقييم أداء الموظف وتدريبه",         ["الموظفون", "تقييم الاداء", "التدريب", "employee", "training"]),  # الموظف / الموظفون
    ("كتب عن السوق المالي",              ["الاسواق المالية", "البورصات", "البورصة", "stock"]),          # السوق / الأسواق
]
MIXED_LANG_QUERIES = [
    ("كتب عن الـ Marketing الإلكتروني",     ["التسويق الالكتروني", "التسويق عبر الانترنت", "internet marketing", "digital marketing"]),
    ("مراجع في الـ E-commerce",             ["التجارة الالكترونية", "electronic commerce", "e commerce"]),
    ("كتب Accounting للمبتدئين",            ["المحاسبة", "accounting"]),
    ("إدارة الـ Projects والتخطيط لها",      ["ادارة المشروعات", "تخطيط المشروعات", "project management", "projects"]),
    ("مهارات الـ Leadership للمديرين",       ["القيادة", "القادة", "leadership"]),
    ("التسويق في الـ Banks",                ["التسويق المصرفي", "تسويق الخدمات المصرفية"]),
    ("تحليل إحصائي باستخدام SPSS",          ["احصاء", "احصائي", "spss", "statistic"]),
    ("كتب عن الـ Human Resources في الشركات", ["الموارد البشرية", "ادارة الافراد", "human resource", "personnel management"]),
]

def build_eval_set():
    # The 84 retrieval questions of notebook §12.1 (same seed -> the same questions as the notebook).
    rng = np.random.default_rng(7)
    eval_rows = []

    # 1) known-item: partial titles (first 5 words)
    title_groups = books_df.groupby("title_norm")["book_id"].apply(set)
    for bid in rng.choice(books_df.index[books_df["title"].str.split().str.len() >= 4], 25, replace=False):
        title = books_df.at[bid, "title"]
        eval_rows.append({"family": "known_item", "query": " ".join(title.split()[:5]),
                          "relevant": title_groups[books_df.at[bid, "title_norm"]]})

    # 2) author: authors with 3–25 books
    author_books = {}
    for row in books_df.itertuples():
        for a_norm, a_raw in zip(row.authors_norm, row.authors):
            author_books.setdefault(a_norm, (a_raw, set()))[1].add(row.book_id)
    eligible = [(raw, ids) for n, (raw, ids) in author_books.items() if 3 <= len(ids) <= 25 and len(n.split()) >= 2]
    for i in rng.choice(len(eligible), 15, replace=False):
        raw, ids = eligible[i]
        q = f"كتب {raw}" if detect_language(raw) == "ar" else f"books by {raw}"
        eval_rows.append({"family": "author", "query": q, "relevant": ids})

    # 3) topic headings with 5–40 books
    heading_sizes = Counter(s for subs in books_df["subjects_norm"] for s in set(subs))
    heads = sorted(h for h, c in heading_sizes.items() if 5 <= c <= 40 and len(h) >= 6)   # sorted -> same questions every run
    for i in rng.choice(len(heads), 15, replace=False):
        h = heads[i]
        eval_rows.append({"family": "topic_heading", "query": SUBJECT_VOCAB.get(h, h),
                          "relevant": set(books_df.loc[books_df["subjects_norm"].map(lambda subs: h in subs), "book_id"])})

    # 4) concept / paraphrase / cross-lingual (hand-written queries, labels from heading patterns)
    #    v1: label lists completed from the catalog's subject-heading vocabulary, chosen BY MEANING
    #    (never from what the retriever returned, which would bias the evaluation toward the current system).
    for q, pats in CONCEPT_QUERIES:
        eval_rows.append({"family": "concept", "query": q, "relevant": books_with_subject(pats)})

    # 5) Arabic word-form variation (v1): the query uses a different form than the catalog
    #    (singular vs broken plural, case endings). Measures Arabic morphology (step 2 of the improvement plan).
    for q, pats in ARABIC_MORPH_QUERIES:
        eval_rows.append({"family": "arabic_morph", "query": q, "relevant": books_with_subject(pats)})

    # 6) Mixed Arabic + English in one question (v1)
    for q, pats in MIXED_LANG_QUERIES:
        eval_rows.append({"family": "mixed_lang", "query": q, "relevant": books_with_subject(pats)})

    eval_df = pd.DataFrame(eval_rows)
    eval_df["n_relevant"] = eval_df["relevant"].map(len)
    eval_df = eval_df[eval_df["n_relevant"] > 0].reset_index(drop=True)
    return eval_df


def precision_at_k(ret, rel, k): return len(set(ret[:k]) & rel) / k
def recall_at_k(ret, rel, k):    return len(set(ret[:k]) & rel) / len(rel)
def hit_at_k(ret, rel, k):       return int(len(set(ret[:k]) & rel) > 0)
def reciprocal_rank(ret, rel):
    for i, d in enumerate(ret, start=1):
        if d in rel: return 1.0 / i
    return 0.0
def ndcg_at_k(ret, rel, k):
    dcg = sum(1.0 / math.log2(i + 1) for i, d in enumerate(ret[:k], start=1) if d in rel)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(rel), k) + 1))
    return dcg / idcg if idcg else 0.0


def evaluate(eval_df, method, k=10, rerank=False, auto_filters=False):
    rows = []
    for r in eval_df.itertuples():
        ret = hybrid_search(r.query, k=k, method=method, rerank=rerank, auto_filters=auto_filters)["book_id"].tolist()
        rows.append({"family": r.family, "query": r.query,
                     f"P@{k}": precision_at_k(ret, r.relevant, k), f"R@{k}": recall_at_k(ret, r.relevant, k),
                     f"Hit@{k}": hit_at_k(ret, r.relevant, k), "MRR": reciprocal_rank(ret, r.relevant),
                     f"nDCG@{k}": ndcg_at_k(ret, r.relevant, k)})
    return pd.DataFrame(rows).assign(retriever=method + ("+rerank" if rerank else "") + ("+autofilter" if auto_filters else ""))


def retrieval_eval(eval_df=None, all_retrievers=False):
    # 12.1 -- returns (overall table, per-family nDCG table, per-question rows). Production = rrf+rerank.
    eval_df = build_eval_set() if eval_df is None else eval_df
    runs = []
    if all_retrievers:
        runs += [evaluate(eval_df, "bm25", K), evaluate(eval_df, "semantic", K),
                 evaluate(eval_df, "weighted", K), evaluate(eval_df, "rrf", K)]
    if reranker.available:
        runs.append(evaluate(eval_df, "rrf", K, rerank=True))
    else:
        runs.append(evaluate(eval_df, "rrf", K))
    all_runs = pd.concat(runs, ignore_index=True)
    metric_cols = [f"P@{K}", f"R@{K}", f"Hit@{K}", "MRR", f"nDCG@{K}"]
    overall = all_runs.groupby("retriever")[metric_cols].mean().sort_values(f"nDCG@{K}", ascending=False).round(3)
    by_family = all_runs.pivot_table(index="family", columns="retriever", values=f"nDCG@{K}", aggfunc="mean").round(3)
    return overall, by_family, all_runs


FILTER_TESTS = [
    ("leadership", SearchFilters(author="عبد الرحمن توفيق")),
    ("marketing", SearchFilters(topics=["التسويق"], year_from=2008, year_to=2012)),
    ("finance", SearchFilters(language="en", topics=["Finance"])),
    ("banks", SearchFilters(topics=["البنوك", "الاسلامية"], topics_mode="all")),
    ("management", SearchFilters(publisher="Pearson")),
    ("الاستثمار", SearchFilters(author=["فريد النجار", "محمد الصيرفى"])),
]


def filter_compliance():
    # 12.2 -- every returned book must satisfy its filters.
    rows = []
    for q, f in FILTER_TESTS:
        res = hybrid_search(q, filters=f, k=10, auto_filters=False)
        allowed = set(apply_filters(f))
        ok = [b in allowed for b in res["book_id"]]
        rows.append({"query": q, "filters": f.describe(), "candidates": len(allowed), "returned": len(res),
                     "compliance": np.mean(ok) if ok else 1.0})
    return pd.DataFrame(rows)


GEN_TESTS = [
    {"query": "ما هي الكتب التي تتناول دراسات الجدوى؟", "filters": None, "expect_refusal": False},
    {"query": "Recommend English books on marketing management published after 2008", "filters": SearchFilters(language="en", year_from=2009), "expect_refusal": False},
    {"query": "كتب عبد المطلب عبد الحميد عن البنوك", "filters": None, "expect_refusal": False},
    {"query": "What is the boiling point of water at sea level?", "filters": None, "expect_refusal": True},
    {"query": "كتب عن تصميم ألعاب الفيديو", "filters": SearchFilters(topics=["ألعاب الفيديو"]), "expect_refusal": True},
]


def generation_checks():
    # 12.3 -- invented [S#] tags, refusal of out-of-scope questions, every answer cites or refuses.
    gen_rows = []
    for t in GEN_TESTS:
        out = rag_answer(t["query"], filters=t["filters"])
        c = out["citations"]
        gen_rows.append({"query": t["query"], "provider": out["provider"], "sources": out["package"]["num_sources"],
                         "cited": len(c["cited"]), "invalid_citations": len(c["invalid"]),
                         "refused": c["is_refusal"], "expected_refusal": t["expect_refusal"],
                         "refusal_ok": c["is_refusal"] == t["expect_refusal"],
                         "coverage_ok": c["is_refusal"] or len(c["cited"]) > 0, "latency_s": out["latency_s"]})
    return pd.DataFrame(gen_rows)


TRIAD_TESTS = [
    # in scope (Arabic)
    {"query": "ما هي الكتب المتاحة عن إدارة الموارد البشرية؟",            "filters": None, "expect_refusal": False},
    {"query": "أريد كتبا عن دراسات الجدوى للمشروعات",                     "filters": None, "expect_refusal": False},
    {"query": "كتب عن التسويق الإلكتروني والتجارة الإلكترونية",            "filters": None, "expect_refusal": False},
    {"query": "ما الكتب التي تتناول البنوك الإسلامية؟",                    "filters": None, "expect_refusal": False},
    {"query": "كتب عن التحليل الإحصائي باستخدام SPSS",                    "filters": None, "expect_refusal": False},
    {"query": "أين أجد كتبا عن الجودة الشاملة على الرف؟",                  "filters": None, "expect_refusal": False},
    # in scope (English, incl. cross-lingual)
    {"query": "Which books cover risk management in banks?",               "filters": None, "expect_refusal": False},
    {"query": "Books about investing in the stock exchange",               "filters": None, "expect_refusal": False},
    {"query": "Recommend books on consumer behavior",                      "filters": None, "expect_refusal": False},
    # with filters
    {"query": "What did this author write about leadership?",
     "filters": SearchFilters(author="عبد الرحمن توفيق", topics=["القيادة"]), "expect_refusal": False},
    {"query": "English marketing books published after 2008",
     "filters": SearchFilters(language="en", year_from=2009), "expect_refusal": False},
    # needs the books' text: should say the catalog has no content, then point to books (not a refusal)
    {"query": "ما هي خطوات إعداد دراسة الجدوى كما وردت في الكتب؟",         "filters": None, "expect_refusal": False},
    # out of scope: must refuse
    {"query": "What is the boiling point of water at sea level?",          "filters": None, "expect_refusal": True},
    {"query": "مين كسب كاس العالم 2022؟",                                   "filters": None, "expect_refusal": True},
    {"query": "ما هي حالة الطقس في القاهرة غدا؟",                           "filters": None, "expect_refusal": True},
    {"query": "كتب عن تصميم ألعاب الفيديو",
     "filters": SearchFilters(topics=["ألعاب الفيديو"]),                    "expect_refusal": True},
]

THRESHOLDS = {
    "citation_validity": 1.00,   # share of answers with no invented [S#] tag
    "refusal_accuracy":  1.00,   # refuses exactly the out-of-scope questions
    "faithfulness":      0.90,   # mean, in-scope questions
    "answer_relevance":  0.80,   # mean, in-scope questions
    "context_relevance": 0.70,   # mean, in-scope questions
    "retrieval_ndcg@10": 0.80,   # from §12.1
}

JUDGE_GEMINI_MODEL = None   # None = same model as the generator; set another Gemini model name for a less biased judge
TRIAD_SLEEP_S = 4           # pause between API calls (free-tier rate limits); 0 on a paid tier

JUDGE_SYSTEM = """You are a strict evaluator of a library-catalog question-answering system.
You receive a QUESTION, the SOURCES (catalog records) that were given to the assistant, and the assistant's ANSWER.
The sources are catalog records only (title, authors, topics, publisher, year, call number, copies, ...), not book text.

Score three criteria, each a number between 0 and 1:
- context_relevance: the share of the sources that are relevant to the question (0 if none are; null if there are no sources).
- faithfulness: are ALL factual claims in the answer about books (titles, authors, years, publishers, call numbers,
  topics, copies, ...) supported by the sources? 1 = every claim supported; lower it for each unsupported or
  contradicted claim; 0 = mostly invented. An answer that makes no factual claims (e.g. a refusal) scores 1.
- answer_relevance: does the answer directly address the question? If the question cannot be answered from a library
  catalog (e.g. general knowledge, weather, sports), a clear refusal scores 1 and any attempt to answer scores 0.
  If the question is about the library's books, a refusal scores 0.

Return ONLY a JSON object, no markdown fences:
{"context_relevance": <number or null>, "faithfulness": <number>, "answer_relevance": <number>,
 "reasons": {"context_relevance": "<short>", "faithfulness": "<short>", "answer_relevance": "<short>"}}"""


def _parse_judge_json(text):
    # Extract the JSON object from the judge reply (tolerates code fences / extra text).
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in judge reply")
    data = json.loads(text[start:end + 1])
    scores = {}
    for key in ("context_relevance", "faithfulness", "answer_relevance"):
        v = data.get(key)
        scores[key] = None if v is None else min(1.0, max(0.0, float(v)))
    scores["reasons"] = data.get("reasons", {})
    return scores


def judge_answer(out, retries=2):
    # Ask the judge LLM for the three RAG Triad scores of one rag_answer() output.
    user_prompt = (f"QUESTION:\n{out['query']}\n\n"
                   f"SOURCES:\n{out['package']['context_text'] or '(no sources)'}\n\n"
                   f"ANSWER:\n{out['answer']}")
    previous_model = CONFIG["gemini_model"]
    if JUDGE_GEMINI_MODEL:
        CONFIG["gemini_model"] = JUDGE_GEMINI_MODEL
    try:
        last_error = None
        for attempt in range(retries + 1):
            reply = llm_complete(JUDGE_SYSTEM, user_prompt)
            if reply:
                try:
                    return _parse_judge_json(reply)
                except Exception as exc:
                    last_error = f"unparseable judge reply ({type(exc).__name__})"
            else:
                last_error = "judge call failed"
            time.sleep(max(TRIAD_SLEEP_S, 1) * (attempt + 2))      # back off (rate limits)
        raise RuntimeError(last_error)
    finally:
        CONFIG["gemini_model"] = previous_model

def run_rag_triad(tests=TRIAD_TESTS):
    if CONFIG["llm_provider"] != "gemini" or not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        print("RAG Triad skipped: needs GEMINI_API_KEY and LLM_PROVIDER=gemini.")
        return None
    rows = []
    for n, t in enumerate(tests, start=1):
        out = rag_answer(t["query"], filters=t["filters"])
        c = out["citations"]
        row = {"query": t["query"], "expected": "refuse" if t["expect_refusal"] else "answer",
               "provider": out["provider"], "sources": out["package"]["num_sources"],
               "refused": c["is_refusal"], "refusal_ok": c["is_refusal"] == t["expect_refusal"],
               "citation_valid": len(c["invalid"]) == 0,
               "context_relevance": np.nan, "faithfulness": np.nan, "answer_relevance": np.nan,
               "judge_note": "", "answer": out["answer"]}
        time.sleep(TRIAD_SLEEP_S)
        if out["provider"] != "gemini":                      # generation fell back -> not a Gemini answer, don't judge it
            row["judge_note"] = f"not judged: answer came from '{out['provider']}' ({out['fallback_errors']})"
        else:
            try:
                s = judge_answer(out)
                row.update({k: (np.nan if s[k] is None else s[k]) for k in ("context_relevance", "faithfulness", "answer_relevance")})
                row["judge_note"] = " | ".join(f"{k}: {v}" for k, v in s["reasons"].items())
            except Exception as exc:
                row["judge_note"] = f"judge error: {exc}"
            time.sleep(TRIAD_SLEEP_S)
        rows.append(row)
        print(f"[{n}/{len(tests)}] {t['query'][:60]}  -> provider={row['provider']}, refused={row['refused']}")
    return pd.DataFrame(rows)


def triad_summary(df, retrieval_ndcg):
    in_scope = df[df["expected"] == "answer"]
    measured = {
        "citation_validity": df["citation_valid"].mean(),
        "refusal_accuracy":  df["refusal_ok"].mean(),
        "faithfulness":      in_scope["faithfulness"].mean(),
        "answer_relevance":  in_scope["answer_relevance"].mean(),
        "context_relevance": in_scope["context_relevance"].mean(),
        "retrieval_ndcg@10": retrieval_ndcg,
    }
    rows = []
    for metric, value in measured.items():
        th = THRESHOLDS[metric]
        rows.append({"metric": metric, "value": round(float(value), 3) if pd.notna(value) else None,
                     "threshold": th, "pass": bool(pd.notna(value) and value >= th)})
    return pd.DataFrame(rows)
