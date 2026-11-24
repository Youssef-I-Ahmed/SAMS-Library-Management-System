#!/usr/bin/env python
"""Retrieval-quality evaluation on the REAL dataset. Ground truth comes from src/evaluation/oracle.py
(independent code path reading the raw .xlsx). Writes data/processed/eval_retrieval.json.

    python scripts/evaluate.py [--seed 13] [--n 300]

Sections
  A  supervisor completeness      engine result set == oracle set, for EVERY supervisor spelling in the file
  B  structured title             exact / partial-phrase result sets == oracle sets
  C  ranked retrieval (keyword | semantic | hybrid) from degraded title queries (60% of the words, spelling variants)
  D  subject/topic retrieval      query = subject name
  E  rule-labelled topical queries (labels are keyword RULES over titles - a proxy, NOT human judgements)
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
# Windows consoles default to cp1252 and crash on Arabic text: force UTF-8 output (and for child processes).
__import__("os").environ.setdefault("PYTHONUTF8", "1")
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - not a text stream (e.g. redirected in tests)
        pass
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import get_settings  # noqa: E402
from src.evaluation import metrics as M  # noqa: E402
from src.evaluation.oracle import load_oracle, norm  # noqa: E402
from src.retrieval.types import Filters  # noqa: E402
from src.service import build_services  # noqa: E402

RULES = [  # (query, lang, regex rule on normalised title that defines relevance)
    ("الاندماج المصرفي", "ar", r"اندماج.*مصرف|مصرف.*اندماج"),
    ("صناديق الاستثمار", "ar", r"صناديق.*استثمار"),
    ("ضغوط العمل", "ar", r"ضغوط.*عمل"),
    ("التجارة الإلكترونية", "ar", r"تجاره.*الكترونيه"),
    ("أسواق البترول", "ar", r"بترول"),
    ("الخصخصة", "ar", r"خصخصه"),
    ("الرضا الوظيفي", "ar", r"رضا.*وظيفي"),
    ("الموارد البشرية", "ar", r"موارد.*بشريه"),
    ("social media consumer behavior", "en", r"social media.*consumer|consumer.*social media"),
    ("e-commerce", "en", r"e commerce|ecommerce|electronic commerce"),
    ("mobile application", "en", r"mobile app"),
    ("banking system", "en", r"bank.*system"),
    ("human resources", "en", r"human resource"),
    ("customer satisfaction", "en", r"customer satisfaction"),
    ("information security", "en", r"security"),
]


def agg(rows: list[dict]) -> dict:
    keys = rows[0].keys() if rows else []
    return {k: round(sum(r[k] for r in rows) / len(rows), 4) for k in keys} | {"queries": len(rows)}


def ranked_ids(eng, q, mode, k=50, filters=None):
    r = eng.search(q, mode, filters, page_size=min(k, 100))
    return [h.record_id for h in r.hits]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--n", type=int, default=300)
    a = ap.parse_args()
    s = get_settings()
    svc = build_services(s)
    eng = svc.engine
    orc = load_oracle(s.raw_dataset_path)
    rng = random.Random(a.seed)
    out: dict = {"seed": a.seed, "embedder": eng.embedder.model_id, "records": len(eng.records)}

    # ---- A. supervisor completeness
    bad, checked = [], 0
    spellings = {}
    for r in orc["records"].values():
        # every distinct raw spelling that appears in the file becomes a query
        for part in re.split(r"\||\s+(?=(?:[أا]\s*\.?\s*)?د\s*[/.]\s*\S)", r["supervisor_raw"]):
            part = part.strip()
            if part and part.upper() != "NA":
                spellings[part] = None
    from src.evaluation.oracle import person
    for sp in spellings:
        exp = orc["by_sup"][person(sp)]
        got, page = set(), 1
        while True:
            res = eng.search(sp, "supervisor", page=page, page_size=100)
            got |= {h.record_id for h in res.hits}
            if page >= res.total_pages:
                break
            page += 1
        checked += 1
        if got != exp or res.total != len(exp):
            bad.append({"query": sp, "expected": len(exp), "got": len(got), "missing": sorted(exp - got)[:5], "extra": sorted(got - exp)[:5]})
    out["A_supervisor_completeness"] = {"spellings_checked": checked, "distinct_people_oracle": len(orc["by_sup"]),
                                        "mismatches": len(bad), "details": bad[:20]}

    # ---- B. structured title
    ids = sorted(orc["records"])
    sample = rng.sample(ids, min(a.n, len(ids)))
    exact_bad, part_bad, nparts = 0, 0, 0
    for rid in sample:
        t = orc["records"][rid]
        exp = orc["by_title"][t["title_norm"]]
        res = eng.search(t["title"], "title", page_size=100)
        got = {h.record_id for h in res.hits if h.match_type == "exact"}
        exact_bad += got != exp
        words = t["title_norm"].split()
        if len(words) >= 5:
            phrase = " ".join(words[1:4])
            exp_p = {i for i, r in orc["records"].items() if f" {phrase} " in f" {r['title_norm']} "}
            got_p, page = set(), 1
            while True:
                rr = eng.search(phrase, "title", page=page, page_size=100)
                got_p |= {h.record_id for h in rr.hits if h.match_type in ("exact", "partial")}
                if page >= rr.total_pages:
                    break
                page += 1
            nparts += 1
            part_bad += not exp_p <= got_p
    out["B_structured_title"] = {"exact_queries": len(sample), "exact_set_mismatches": exact_bad,
                                 "partial_phrase_queries": nparts, "partial_missing_expected": part_bad}

    # ---- C. ranked retrieval from degraded title queries
    def degrade(title: str) -> str:
        w = title.split()
        keep = sorted(rng.sample(range(len(w)), max(2, int(len(w) * 0.6)))) if len(w) >= 4 else list(range(len(w)))
        q = " ".join(w[i] for i in keep)
        return q.replace("ى", "ي").replace("ة", "ه") if rng.random() < 0.5 else q.replace("ي", "ى").replace("أ", "ا")
    cands = [r for r in sample if len(orc["records"][r]["title_norm"].split()) >= 4]
    res_c: dict[str, list] = {"keyword": [], "semantic": [], "hybrid": []}
    for rid in cands:
        t = orc["records"][rid]
        rel = set(orc["by_title"][t["title_norm"]])
        q = degrade(t["title"])
        for mode in res_c:
            rk = ranked_ids(eng, q, mode, 50)
            res_c[mode].append({"recall@1": M.recall_at_k(rk, rel, 1), "recall@5": M.recall_at_k(rk, rel, 5),
                                "recall@10": M.recall_at_k(rk, rel, 10), "precision@5": M.precision_at_k(rk, rel, 5),
                                "ndcg@10": M.ndcg_at_k(rk, rel, 10), "mrr": M.mrr(rk, rel), "hit@10": M.hit_at_k(rk, rel, 10)})
    out["C_ranked_from_degraded_titles"] = {m: agg(v) for m, v in res_c.items()}

    # ---- D. subject retrieval
    res_d = []
    for subj, rel in orc["by_subject"].items():
        rk, page = [], 1
        while True:
            rr = eng.search(subj, "subject", page=page, page_size=100)
            rk += [h.record_id for h in rr.hits]
            if page >= rr.total_pages:
                break
            page += 1
        res_d.append({"recall_all_pages": M.recall_at_k(rk, rel, len(rk) or 1), "precision@10": M.precision_at_k(rk, rel, 10),
                      "exact_set": float(set(rk) == rel)})
    out["D_subject_structured"] = agg(res_d)

    # ---- E. rule-labelled topical queries
    res_e, per = {"keyword": [], "semantic": [], "hybrid": []}, []
    for q, lang, rule in RULES:
        rel = {i for i, r in orc["records"].items() if re.search(rule, r["title_norm"])}
        if not rel:
            continue
        row = {"query": q, "lang": lang, "relevant": len(rel)}
        for mode in res_e:
            rk = ranked_ids(eng, q, mode, 100)
            m = {"p@10": M.precision_at_k(rk, rel, 10), "recall@50": M.recall_at_k(rk, rel, 50), "ndcg@10": M.ndcg_at_k(rk, rel, 10)}
            res_e[mode].append(m)
            row[mode] = {k: round(v, 3) for k, v in m.items()}
        per.append(row)
    out["E_rule_labelled_topics"] = {"aggregate": {m: agg(v) for m, v in res_e.items() if v}, "per_query": per,
                                     "caveat": "relevance = keyword rule over titles (proxy labels, not human judgements)"}

    # ---- latency
    t0 = time.time()
    for rid in sample[:100]:
        eng.search(orc["records"][rid]["title"], "hybrid")
    out["latency_ms_per_hybrid_query"] = round((time.time() - t0) * 10, 2)
    p = s.processed_dir / "eval_retrieval.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "E_rule_labelled_topics"}, ensure_ascii=False, indent=1))
    print(json.dumps(out["E_rule_labelled_topics"]["aggregate"], indent=1))
    return 0 if not bad and not exact_bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
