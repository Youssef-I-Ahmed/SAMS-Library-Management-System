#!/usr/bin/env python
"""Source-vs-imported reconciliation: compares EVERY row of the original Excel file with the records persisted in the
store (database), field by field, using separate code from the importer (openpyxl + src/evaluation/oracle helpers).

    python scripts/reconcile.py [--xlsx data/raw/Project.xlsx] [--report docs/DATA_RECONCILIATION_REPORT.md]

Exit code 0 only if there is no missing/extra record and no field mismatch. The Markdown report contains counts and
record ids only (no student or supervisor names), so it is safe to share.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import ROOT, get_settings  # noqa: E402
from src.evaluation.oracle import norm, person  # noqa: E402
from src.data.normalize_ar import normalize_text  # noqa: E402
from src.service import build_services  # noqa: E402

NA = "NA"


def cell(v) -> str:
    return NA if v is None or str(v).strip() == "" else str(v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, default=ROOT / "data" / "raw" / "Project.xlsx")
    ap.add_argument("--report", type=Path, default=ROOT / "docs" / "DATA_RECONCILIATION_REPORT.md")
    a = ap.parse_args()
    sha = hashlib.sha256(a.xlsx.read_bytes()).hexdigest()
    wb = openpyxl.load_workbook(a.xlsx, read_only=True, data_only=True)
    sheets = wb.sheetnames
    ws = wb[sheets[0]]
    rows = list(ws.iter_rows(values_only=True))
    raw_hdr = [str(h) for h in rows[0]]
    from src.data.schema import canonical_header
    hdr = [canonical_header(h) for h in rows[0]]
    src = {}
    dup_src = Counter()
    for r in rows[1:]:
        if r[0] is None:
            continue
        d = {h: cell(v) for h, v in zip(hdr, r)}
        rid = d["BOOK_CODE"].strip()
        dup_src[rid] += 1
        src[rid] = d
    svc = build_services(get_settings(), load=False)
    store = {r.record_id: r for r in svc.store.all_records()}
    missing = sorted(set(src) - set(store))
    extra = sorted(set(store) - set(src))
    mism: dict[str, list[str]] = {k: [] for k in (
        "raw_columns", "title", "students", "supervisors", "year", "subjects", "call_number", "extent", "dimension")}
    for rid, d in src.items():
        rec = store.get(rid)
        if not rec:
            continue
        if any(rec.raw.get(k) != v for k, v in d.items()):
            mism["raw_columns"].append(rid)
        if " ".join(d["TITLE"].split()) != " ".join(rec.title.split()):
            mism["title"].append(rid)
        s_exp = [] if d["Students"].upper() == NA else [x.strip() for x in d["Students"].split("|") if x.strip()]
        # parsed names have internal whitespace collapsed (original text is preserved verbatim in `raw`, checked above)
        if [" ".join(x.split()) for x in s_exp] != rec.students:
            mism["students"].append(rid)
        sup_raw = d["Supervisor"]
        exp = set()
        if sup_raw.upper() != NA:
            for part in sup_raw.split("|"):
                for p in re.split(r"\s+(?=(?:[أا]\s*\.?\s*)?د\s*[/.]\s*\S)", part.strip()):
                    if person(p):
                        exp.add(person(p))
        got = {person(s.raw) for s in rec.supervisors if person(s.raw)}
        if exp != got:
            mism["supervisors"].append(rid)
        y = d["WORK | PUBLISHING_DATE"].strip()
        exp_y = int(y) if y.isdigit() and 1990 <= int(y) <= 2027 else None
        if exp_y != rec.year:
            mism["year"].append(rid)
        exp_sub = [x.strip() for x in d["SUBJECTS_ALL"].split("|") if x.strip() and x.strip().upper() != NA]
        if [norm(x) for x in exp_sub] != [norm(x) for x in rec.subjects]:
            mism["subjects"].append(rid)
        if (None if d["WORK | CALL_NUM"].upper() == NA else d["WORK | CALL_NUM"].strip()) != rec.call_number:
            mism["call_number"].append(rid)
        if (None if d["WORK | EXTENT"].upper() == NA else d["WORK | EXTENT"].strip()) != rec.extent_raw:
            mism["extent"].append(rid)
        if (None if d["WORK | DIMENSION"].upper() == NA else d["WORK | DIMENSION"].strip()) != rec.dimension_raw:
            mism["dimension"].append(rid)
    # ---- normalization differences (original values are always kept in `raw`; these count where the DERIVED fields differ)
    nd = Counter()
    for rid, d in src.items():
        rec = store.get(rid)
        if not rec:
            continue
        if d["TITLE"] != rec.title:
            nd["title_whitespace_collapsed"] += 1
        if d["Students"].upper() != NA and any(x.strip() != " ".join(x.split()) for x in d["Students"].split("|") if x.strip()):
            nd["student_names_whitespace_collapsed"] += 1
        for sv in rec.supervisors:
            if sv.name != sv.raw:
                nd["supervisor_display_name_canonicalised"] += 1
            if sv.raw != " ".join(re.sub(r"^\s*(?:[أا]\s*\.?\s*)?د\s*[/.]\s*", "", sv.raw).split()) :
                nd["supervisor_academic_title_present_in_original"] += 1
        y = d["WORK | PUBLISHING_DATE"].strip()
        if y.upper() != NA and rec.year is None:
            nd["year_not_a_valid_year_kept_as_text_only"] += 1
    flags = Counter(f for r in store.values() for f in r.flags)
    # duplicates (reported, never removed)
    by_title = Counter(" ".join(d["TITLE"].split()) for d in src.values())
    dup_titles = {t: c for t, c in by_title.items() if c > 1}
    by_norm = Counter(normalize_text(d["TITLE"]) for d in src.values())
    dup_norm = {t: c for t, c in by_norm.items() if c > 1}
    full = Counter(tuple(v for k, v in d.items() if k != "BOOK_CODE") for d in src.values())
    exact_rows = {k: c for k, c in full.items() if c > 1}
    ok = not missing and not extra and not any(mism.values()) and all(v == 1 for v in dup_src.values())
    out = {"xlsx_sha256": sha, "sheet": sheets[0], "sheets_in_file": sheets, "columns": raw_hdr, "source_rows": len(src),
           "store_records": len(store), "duplicate_source_ids": sum(1 for v in dup_src.values() if v > 1),
           "missing_in_store": missing, "extra_in_store": extra,
           "mismatches": {k: {"count": len(v), "sample_ids": v[:10]} for k, v in mism.items()}, "ok": ok,
           "normalization_differences": dict(nd), "quality_flags": dict(flags),
           "duplicates": {"repeated_title_groups": len(dup_titles), "records_in_repeated_title_groups": sum(dup_titles.values()),
                          "repeated_title_groups_after_arabic_normalisation": len(dup_norm),
                          "records_in_those_groups": sum(dup_norm.values()),
                          "identical_rows_except_id_groups": len(exact_rows), "identical_rows_except_id_records": sum(exact_rows.values()),
                          "action": "reported only; no record was removed or merged"}}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    lines = ["# Source ↔ imported data reconciliation", "",
             "Generated by `python scripts/reconcile.py` (independent re-read of the Excel file vs. the persisted store).",
             "Contains counts and record ids only — no student or supervisor names.", "",
             f"* Source file sha256: `{sha}`", f"* Sheet(s) in file: {', '.join(sheets)} (used: `{sheets[0]}`)",
             f"* Columns: {', '.join(f'`{h}`' for h in hdr)}",
             f"* Source rows with a record id: **{len(src)}**; duplicate ids in source: **{out['duplicate_source_ids']}**",
             f"* Records in store: **{len(store)}**; missing in store: **{len(missing)}**; extra in store: **{len(extra)}**",
             "", "| Check | Mismatching records |", "|---|---|"]
    lines += [f"| {k} | {len(v)} |" for k, v in mism.items()]
    lines += ["", "## Normalization differences (derived vs original; originals are always preserved in `raw`)", "",
              "| Difference | Count |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in sorted(nd.items())]
    lines += ["", "## Data-quality flags raised (records are kept, never dropped)", "", "| Flag | Records |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in sorted(flags.items())]
    d = out["duplicates"]
    lines += ["", "## Duplicates (reported, none removed)", "",
              f"* Titles that occur more than once: **{d['repeated_title_groups']}** groups covering **{d['records_in_repeated_title_groups']}** records",
              f"* After Arabic normalisation of the title (alef/ya/ta-marbuta/diacritics): **{d['repeated_title_groups_after_arabic_normalisation']}** groups covering **{d['records_in_those_groups']}** records",
              f"* Rows identical in every field except the id: **{d['identical_rows_except_id_groups']}** groups / **{d['identical_rows_except_id_records']}** records", ""]
    lines += ["", f"**Result: {'PASS — every source row is present and every compared field matches' if ok else 'FAIL — see JSON output'}**", "",
              "Checks: `raw_columns` = every original cell value preserved verbatim in the record's `raw` copy; "
              "`students` = ordered `|`-split list identical (internal whitespace collapsed; original kept in `raw`); `supervisors` = same set of people after independent "
              "normalisation (embedded `د/` boundaries split); `year` = valid 1990–2027 integer else none (flagged, not guessed); "
              "others = value equality (subjects after normalisation)."]
    try:
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:  # e.g. read-only/absent docs/ in a container: keep the report next to the processed data instead
        a.report = get_settings().processed_dir / "DATA_RECONCILIATION_REPORT.md"
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("docs/ not writable; report written to", a.report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
