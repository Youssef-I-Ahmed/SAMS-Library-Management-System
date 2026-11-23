"""Re-run the notebook's evaluation (Section 12) and compare it with the reference results (v13, see REFERENCE).
Run it before accepting ANY change to the engine; it exits with code 1 if something got worse.

    python scripts/evaluate.py                    # 12.1 retrieval (production pipeline) + 12.2 filters   (no Gemini)
    python scripts/evaluate.py --all-retrievers   # + bm25 / semantic / weighted / rrf, like the notebook table
    python scripts/evaluate.py --generation       # + 12.3 citations / refusals              (uses Gemini: 5 questions)
    python scripts/evaluate.py --triad            # + 12.5 RAG Triad with an LLM judge       (uses Gemini: ~32 calls)

A JSON report is written to reports/evaluation_<date>.json.
"""
import argparse
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

import pandas as pd  # noqa: E402

from sams_rag import evaluation as ev  # noqa: E402
from sams_rag.search import reranker  # noqa: E402


def line(status, name, now, ref=None):
    ref_txt = "" if ref is None else f"  ({ev.REFERENCE_NAME}: {ref:.3f}, diff {now - ref:+.3f})"
    print(f"  [{status}] {name:<28} {now:.3f}{ref_txt}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--all-retrievers", action="store_true")
    p.add_argument("--generation", action="store_true")
    p.add_argument("--triad", action="store_true")
    p.add_argument("--tolerance", type=float, default=0.01, help="allowed drop vs the reference (default 0.01)")
    args = p.parse_args()

    report, failures, t0 = {}, [], time.time()
    tol, ref = args.tolerance, ev.REFERENCE

    # ---- 12.1 retrieval ----
    print("\n== 12.1 Retrieval (84 questions) ==")
    if not reranker.available:
        print("  WARNING: reranker not loaded -> measuring rrf only; the reference numbers are for rrf+rerank.")
    overall, by_family, _ = ev.retrieval_eval(all_retrievers=args.all_retrievers)
    print(overall.to_string())
    prod = "rrf+rerank" if "rrf+rerank" in overall.index else "rrf"
    now = float(overall.loc[prod, "nDCG@10"])
    r = ref["overall"][prod]["nDCG@10"]
    ok = now >= r - tol
    line("PASS" if ok else "FAIL", f"{prod} nDCG@10 (overall)", now, r)
    if not ok:
        failures.append(f"{prod} overall nDCG@10 {now:.3f} < {r:.3f}")
    if prod == "rrf+rerank":
        for fam, r in ref["by_family_rrf+rerank"].items():
            v = float(by_family.loc[fam, prod]) if fam in by_family.index else float("nan")
            ok = v >= r - tol
            line("PASS" if ok else "FAIL", f"  {fam}", v, r)
            if not ok:
                failures.append(f"{fam} nDCG@10 {v:.3f} < {r:.3f}")
    if args.all_retrievers:
        for name, vals in ref["overall"].items():
            if name != prod and name in overall.index:
                line("info", f"{name} nDCG@10", float(overall.loc[name, "nDCG@10"]), vals["nDCG@10"])
    report["retrieval"] = {"overall": overall.reset_index().to_dict("records"),
                           "by_family": by_family.reset_index().to_dict("records")}

    # ---- 12.2 filters ----
    print("\n== 12.2 Filter compliance ==")
    comp = ev.filter_compliance()
    ok = bool((comp["compliance"] == 1.0).all())
    line("PASS" if ok else "FAIL", "all filters respected", float(comp["compliance"].mean()), 1.0)
    if not ok:
        failures.append("a filter leaked")
    report["filters"] = comp.astype(str).to_dict("records")

    # ---- 12.3 generation ----
    if args.generation:
        print("\n== 12.3 Generation checks (Gemini) ==")
        gen = ev.generation_checks()
        print(gen[["query", "provider", "cited", "invalid_citations", "refused", "refusal_ok", "latency_s"]].to_string())
        if (gen["provider"] != "gemini").any():
            # the extractive fallback cannot refuse, so these checks only mean something for Gemini answers
            print("  SKIP: some answers did not come from Gemini (no key / quota?) -- 12.3 not measured.")
        else:
            for name, val in [("citation validity", float((gen.invalid_citations == 0).mean())),
                              ("refusal accuracy", float(gen.refusal_ok.mean())),
                              ("coverage", float(gen.coverage_ok.mean()))]:
                ok = val == 1.0
                line("PASS" if ok else "FAIL", name, val, 1.0)
                if not ok:
                    failures.append(f"12.3 {name} {val:.0%}")
        report["generation"] = gen.astype(str).to_dict("records")

    # ---- 12.5 RAG Triad ----
    if args.triad:
        print("\n== 12.5 RAG Triad (Gemini as judge; takes a few minutes) ==")
        triad_df = ev.run_rag_triad()
        if triad_df is not None:
            summary = ev.triad_summary(triad_df, now)
            print(summary.to_string(index=False))
            n_judged = int(triad_df["faithfulness"].notna().sum())
            print(f"  judged answers: {n_judged}/{len(triad_df)}")
            for row in summary.itertuples():
                if not row._4:                       # column "pass"
                    failures.append(f"12.5 {row.metric} below threshold")
            report["triad"] = {"summary": summary.to_dict("records"),
                               "answers": triad_df.drop(columns=["answer"]).astype(str).to_dict("records")}

    # ---- verdict + report ----
    print("\n" + "=" * 70)
    print("VERDICT:", f"PASS -- no regression vs {ev.REFERENCE_NAME}" if not failures else "FAIL -- " + "; ".join(failures))
    print(f"({time.time() - t0:.0f}s)")
    os.makedirs("reports", exist_ok=True)
    path = os.path.join("reports", f"evaluation_{time.strftime('%Y%m%d_%H%M%S')}.json")
    report["verdict"] = {"pass": not failures, "failures": failures}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1, default=str)
    print("report:", path)
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    pd.set_option("display.width", 160)
    main()
