#!/usr/bin/env python
"""Measure NEURAL semantic retrieval on the real dataset and calibrate the semantic score floor.

    EMBEDDING_BACKEND=sentence-transformers EMBEDDING_MODEL_PATH=models/multilingual-e5-small \
    EMBEDDING_LOCAL_ONLY=true python scripts/bootstrap.py          # re-embeds the whole index with the neural model
    ... same env ...            python scripts/eval_semantic.py

Refuses to run (exit 2) when the active embedder is the offline hashing fallback: those numbers would not be semantic.
Relevance labels are RULE-BASED proxies (a title counts as relevant when it contains any keyword of the topic in
either language) - engineering evidence, not human judgements. Prints counts/scores only (no student names).
"""
from __future__ import annotations

import json
import math
import sys
# Windows consoles default to cp1252 and crash on Arabic text: force UTF-8 output (and for child processes).
__import__("os").environ.setdefault("PYTHONUTF8", "1")
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - not a text stream (e.g. redirected in tests)
        pass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config.settings import get_settings  # noqa: E402
from src.data.normalize_ar import normalize_text  # noqa: E402
from src.retrieval.embeddings import describe_embedder, is_neural  # noqa: E402
from src.service import build_services  # noqa: E402

from src.evaluation.probes import NOISE, TOPICS  # noqa: E402


def ndcg(rank: list[str], rel: set[str], k=10):
    dcg = sum(1 / math.log2(i + 2) for i, r in enumerate(rank[:k]) if r in rel)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(rel), k)))
    return dcg / ideal if ideal else 0.0


def main() -> int:
    s = get_settings()
    sv = build_services(s)
    e = sv.engine
    info = describe_embedder(sv.embedder, getattr(sv.embedder, "requested_backend", None), getattr(sv.embedder, "fallback_reason", None))
    if not is_neural(sv.embedder):
        print("ABORT: active embedder is", sv.embedder.model_id, "- not a neural model.", info.get("fallback_reason") or "")
        return 2
    titles = {r.record_id: normalize_text(r.title) for r in e.records.values()}
    res = {"embedder": info, "queries": {}}
    agg = {m: {"ar": [], "en": []} for m in ("keyword", "semantic", "hybrid")}
    for ar, en, kws in TOPICS:
        nk = [normalize_text(k) for k in kws]
        rel = {i for i, t in titles.items() if any(k in t for k in nk)}
        if len(rel) < 3:
            continue
        for lang, q in (("ar", ar), ("en", en)):
            for m in agg:
                r = e.search(q, m, page_size=50)
                rank = [h.record_id for h in r.hits]
                agg[m][lang].append((len([x for x in rank[:10] if x in rel]) / min(10, len(rel)), ndcg(rank, rel)))
    for m, d in agg.items():
        for lang, v in d.items():
            if v:
                res["queries"][f"{m}/{lang}"] = {"n": len(v), "recall@10": round(sum(x[0] for x in v) / len(v), 4),
                                                 "ndcg@10": round(sum(x[1] for x in v) / len(v), 4)}
    # cross-language: Arabic query -> English relevant titles, English query -> Arabic relevant titles
    import re
    is_ar = lambda t: bool(re.search("[\u0600-\u06FF]", t))  # noqa: E731
    cross = {"ar_query_en_titles": [], "en_query_ar_titles": []}
    for ar, en, kws in TOPICS:
        nk = [normalize_text(k) for k in kws]
        rel = {i for i, t in titles.items() if any(k in t for k in nk)}
        rel_en = {i for i in rel if not is_ar(e.records[i].title)}
        rel_ar = rel - rel_en
        for key, q, r_ in (("ar_query_en_titles", ar, rel_en), ("en_query_ar_titles", en, rel_ar)):
            if len(r_) >= 3:
                row = {}
                for m in ("keyword", "semantic", "hybrid"):
                    top10 = [h.record_id for h in e.search(q, m, page_size=10).hits]
                    row[m] = len([x for x in top10 if x in r_]) / min(10, len(r_))
                cross[key].append(row)
    res["cross_language_recall@10"] = {k: {m: round(sum(r[m] for r in v) / len(v), 4) for m in ("keyword", "semantic", "hybrid")} | {"n": len(v)}
                                       for k, v in cross.items() if v}
    # exact/structured searches must stay COMPLETE with the neural embedder active (independent Excel oracle)
    import random
    from src.evaluation.oracle import load_oracle
    xlsx = s.raw_dataset_path
    orc = load_oracle(xlsx)
    rnd = random.Random(13)
    sup_keys = rnd.sample(sorted(orc["by_sup"]), min(50, len(orc["by_sup"])))
    bad_sup = sum(1 for k in sup_keys if e.search(k, "supervisor", page_size=1).total != len(orc["by_sup"][k]))
    stu_keys = rnd.sample(sorted(orc["by_stu"]), min(50, len(orc["by_stu"])))
    bad_stu = sum(1 for k in stu_keys if e.search(k, "student", page_size=1).total != len(orc["by_stu"][k]))
    tids = rnd.sample(sorted(orc["records"]), 40)
    bad_title = sum(1 for i in tids if i not in {h.record_id for h in e.search(orc["records"][i]["title"], "title", page_size=100).hits})
    res["structured_completeness_vs_oracle"] = {"supervisors_checked": len(sup_keys), "supervisor_mismatches": bad_sup,
                                                "students_checked": len(stu_keys), "student_mismatches": bad_stu,
                                                "titles_checked": len(tids), "titles_missing": bad_title}
    # score floor calibration: top raw cosine for gibberish/off-domain vs on-topic queries
    def top(q):
        v = e.dense.search(sv.embedder.encode_query(q), None, 1, -1.0)
        return v[0][1] if v else 0.0
    noise = sorted(round(top(q), 3) for q in NOISE)
    topic = sorted(round(top(q), 3) for ar, en, _ in TOPICS for q in (ar, en))
    res["top_cosine_noise"] = noise
    res["top_cosine_on_topic"] = topic
    gap = noise[-1] < topic[0]
    res["suggested_semantic_min_score_neural"] = round((noise[-1] + topic[0]) / 2, 3) if gap else None
    res["calibration_note"] = ("noise and on-topic score ranges are separable" if gap else
                               "ranges overlap: an absolute floor cannot separate noise from topics; rely on hybrid fusion and evidence rules")
    res["current_floor"] = s.semantic_min_score_neural
    if res["suggested_semantic_min_score_neural"] is not None:
        import datetime
        cf = Path(s.semantic_calibration_file)
        cf.parent.mkdir(parents=True, exist_ok=True)
        cf.write_text(json.dumps({"model_id": sv.embedder.model_id, "floor": res["suggested_semantic_min_score_neural"],
                                  "measured_on": datetime.date.today().isoformat(),
                                  "noise_max": noise[-1], "topic_min": topic[0]}, indent=1), encoding="utf-8")
        print("Calibration written to", cf, "(commit it to the private repo so the cloud app uses it)")
    if res["suggested_semantic_min_score_neural"] is not None:      # behaviour at the suggested floor
        e.s.semantic_min_score_neural = res["suggested_semantic_min_score_neural"]
        e._calib = None
        res["at_suggested_floor"] = {
            "irrelevant_queries_with_semantic_hits": sum(1 for q in NOISE if e.search(q, "semantic").total > 0),
            "irrelevant_queries": len(NOISE),
            "topic_queries_with_semantic_hits": sum(1 for ar, en, _ in TOPICS for q in (ar, en) if e.search(q, "semantic").total > 0),
            "topic_queries": 2 * len(TOPICS)}
        print("RECOMMENDED: SEMANTIC_MIN_SCORE_NEURAL=%s" % res["suggested_semantic_min_score_neural"])
    print(json.dumps(res, ensure_ascii=False, indent=1))
    Path(s.processed_dir / "eval_semantic.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
