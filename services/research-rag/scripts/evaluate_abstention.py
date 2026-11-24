"""Evaluate the evidence / abstention policy and the answer-verification layer on the REAL dataset.

    python scripts/evaluate_abstention.py
    python scripts/evaluate_abstention.py --sweep
    python scripts/evaluate_abstention.py --llm

Part 1: policy evaluation.
Part 2: scripted answer-verification tests.
Part 3: optional LLM evaluation.
Writes data/processed/eval_abstention.json
"""
from __future__ import annotations

import argparse
import json
import random
import sys
# Windows consoles default to cp1252 and crash on Arabic text: force UTF-8 output (and for child processes).
__import__("os").environ.setdefault("PYTHONUTF8", "1")
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - not a text stream (e.g. redirected in tests)
        pass
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import get_settings
from src.evaluation.cases import build_cases
from src.evaluation.oracle import load_oracle, norm
from src.rag.analyze import analyze_question
from src.rag.evidence import assess_candidates, verify_answer
from src.rag.answer import AnswerService
from src.rag.llm import get_provider
from src.service import build_services


def run_policy(svc, cases, provider=None) -> dict:
    ans = AnswerService(svc.engine, provider, svc.settings)
    g: dict[str, Counter] = defaultdict(Counter)
    failures = []

    for c in cases:
        r = ans.ask(c.question)
        abstained = r.status == "abstained"
        g[c.group]["n"] += 1

        if c.expect == "abstain":
            ok = abstained and (
                c.expect_reason is None or r.abstain_reason == c.expect_reason
            )
            g[c.group]["abstained"] += abstained
            g[c.group]["correct_reason"] += ok
            g[c.group]["false_answer"] += not abstained

            if not ok:
                failures.append({
                    "group": c.group,
                    "q": c.question[:110],
                    "status": r.status,
                    "reason": r.abstain_reason,
                })
        else:
            g[c.group]["answered"] += not abstained
            g[c.group]["false_abstain"] += abstained

            if c.group == "record_fact":
                na = norm(r.answer or "")
                names_ok = all(k in na for k in c.meta["sups"])
                g[c.group]["exactly_right"] += bool(
                    not abstained
                    and [s.record_id for s in r.sources] == [c.record_id]
                    and names_ok
                )

            elif c.group == "supervisor_count":
                g[c.group]["exactly_right"] += (
                    r.total_matching == c.meta["count"]
                )

            elif c.group == "topical":
                an = analyze_question(svc.engine, c.question)
                terms = ans._topical_terms(an)
                sup = assess_candidates(
                    svc.engine,
                    terms,
                    svc.engine._ranked(" ".join(terms), None, True, True),
                    svc.settings,
                )
                g[c.group]["target_in_explicit_support(all)"] += (
                    c.record_id in {
                        x.rid for x in sup if x.level == "explicit"
                    }
                )

            if abstained or (
                c.group == "supervisor_count"
                and r.total_matching != c.meta["count"]
            ):
                failures.append({
                    "group": c.group,
                    "q": c.question[:110],
                    "status": r.status,
                    "reason": r.abstain_reason,
                })

    summary = {}
    for k, v in g.items():
        n = v["n"]
        summary[k] = {
            kk: (vv if kk == "n" else f"{vv}/{n}")
            for kk, vv in v.items()
        }

    ab = [c for c in cases if c.expect == "abstain"]
    an = [c for c in cases if c.expect == "answer"]
    fa = sum(v["false_answer"] for v in g.values())
    fab = sum(v["false_abstain"] for v in g.values())

    return {
        "groups": summary,
        "must_abstain_total": len(ab),
        "false_answers": fa,
        "false_answer_rate": round(fa / len(ab), 4) if ab else None,
        "should_answer_total": len(an),
        "false_abstentions": fab,
        "false_abstain_rate": round(fab / len(an), 4) if an else None,
        "sample_failures": failures[:12],
    }


def run_verifier(svc, seed=13) -> dict:
    """Test faithful and unfaithful scripted answers against real retrieved contexts."""
    rng = random.Random(seed)
    e = svc.engine
    ans = AnswerService(e, None, svc.settings)
    ids = sorted(e.records)
    sup_keys = sorted(e.by_sup)
    res = defaultdict(lambda: Counter())

    for rid in rng.sample(ids, min(120, len(ids))):
        rec = e.records[rid]
        words = [
            w for w in rec.title_norm.split() if len(w) > 3
        ][:3]

        if len(words) < 3:
            continue

        base = ans.ask(
            "ما المشاريع التي تتناول " + " ".join(words) + "؟"
        )
        if not base.sources:
            continue

        ctx = [
            (s.ref, e.records[s.record_id], s.supervisors)
            for s in base.sources
        ]
        s1 = ctx[0][1]
        year = s1.year

        available = [
            k for k in sup_keys
            if k not in {
                sv.key
                for _, r, _ in ctx
                for sv in r.supervisors
            }
        ]
        if not available:
            continue
        other = rng.choice(available)

        cases = {
            "faithful": (
                f"السجل «{s1.title}» [R1] مسجل في الفهرس"
                + (f" بسنة {year}" if year else "")
                + ".",
                True,
            ),
            "faithful_with_disclaimer": (
                f"يوجد سجل بعنوان «{s1.title}» [R1]. "
                "لا تتوفر في الفهرس نتائج هذا البحث.",
                True,
            ),
            "fake_citation": (
                f"السجل «{s1.title}» [R999].",
                False,
            ),
            "invented_year": (
                f"السجل [R1] نشر سنة {1950 + rng.randint(0, 20)}.",
                False,
            ),
            "invented_person": (
                f"أشرف على السجل [R1] الدكتور {other}.",
                False,
            ),
            "invented_title": (
                "السجل [R1] بعنوان «دراسة مختلقة حول الذكاء الاصطناعي الكمي».",
                False,
            ),
            "findings_claim": (
                "توصل البحث [R1] إلى أن الاستثمار يزيد الأرباح بشكل ملحوظ.",
                False,
            ),
            "english_findings_claim": (
                "The study found that the proposed model improves performance [R1].",
                False,
            ),
            "uncited": (
                "يوجد في الفهرس عدة سجلات عن هذا الموضوع وهي مسجلة بالفهرس.",
                False,
            ),
        }

        for name, (text, should_pass) in cases.items():
            v = verify_answer(
                text,
                question="ما المشاريع",
                context=ctx,
                facts=[],
                engine=e,
            )
            res[name]["n"] += 1
            res[name]["passed_verification"] += v.ok

            if name.startswith("faithful") and not v.ok:
                print("\n" + "=" * 70)
                print(f"FAITHFUL VERIFICATION FAILURE: {name}")
                print(f"Record ID: {rid}")
                print(f"Title: {s1.title}")
                print(f"Year: {year}")
                print(
                    "Verification problems:",
                    getattr(v, "problems", "Not exposed"),
                )
                print(f"Verification result: {v}")
                print(f"Generated answer: {text}")
                print("=" * 70)

    out = {}
    for name, c in res.items():
        faithful = name.startswith("faithful")
        out[name] = {
            "n": c["n"],
            "passed_verification": c["passed_verification"],
            "result": (
                f"false_reject_rate="
                f"{1 - c['passed_verification'] / c['n']:.3f}"
                if faithful
                else f"caught={c['n'] - c['passed_verification']}/{c['n']}"
            ),
        }

    return out


def run_llm(svc, cases, provider) -> dict:
    ans = AnswerService(svc.engine, provider, svc.settings)
    c = Counter()

    for case in [
        x for x in cases if x.group == "topical"
    ][:40]:
        r = ans.ask(case.question)
        c["n"] += 1
        c[r.status] += 1
        c[
            "verification_problem_"
            + (
                r.evidence.verification_problems[0].split(":")[0]
                if r.evidence.verification_problems
                else "none"
            )
        ] += 1

    return dict(c)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()

    s = get_settings()
    svc = build_services(s)
    cases = build_cases(
        load_oracle(s.raw_dataset_path), a.seed, a.n
    )

    out: dict = {
        "seed": a.seed,
        "cases": dict(Counter(c.group for c in cases)),
        "settings": {
            "evidence_min_coverage": s.evidence_min_coverage,
            "evidence_common_term_df": s.evidence_common_term_df,
            "evidence_min_supported_records": s.evidence_min_supported_records,
            "embedder": svc.embedder.model_id,
        },
    }

    out["policy"] = run_policy(svc, cases)
    out["verifier"] = run_verifier(svc, a.seed)

    if a.sweep:
        sweep = {}
        for cov in (0.34, 0.5, 0.67, 0.75, 1.0):
            svc.settings.evidence_min_coverage = cov
            r = run_policy(svc, cases)
            sweep[str(cov)] = {
                "false_answer_rate": r["false_answer_rate"],
                "false_abstain_rate": r["false_abstain_rate"],
                "partial_overlap": r["groups"].get("partial_overlap", {}),
                "topical": r["groups"].get("topical", {}),
            }

        svc.settings.evidence_min_coverage = s.evidence_min_coverage
        out["threshold_sweep"] = sweep

    if a.llm:
        prov = get_provider(s)
        out["llm"] = (
            run_llm(svc, cases, prov)
            if prov
            else "LLM_PROVIDER not configured"
        )

    (s.processed_dir / "eval_abstention.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())