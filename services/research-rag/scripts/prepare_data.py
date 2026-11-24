#!/usr/bin/env python
"""Phase A/B data preparation (reproducible, read-only on the source).

    python scripts/prepare_data.py [--source data/raw/Project.xlsx] [--out data/processed]

Outputs (all deterministic for a given input file):
  records.jsonl                normalised records (one JSON object per line)
  quality_report.json          every count in docs/DATA_QUALITY_REPORT.md
  supervisor_candidates.csv    similar-but-distinct supervisor names for HUMAN review (never auto-merged)
  duplicate_candidates.csv     possible duplicate groups for HUMAN review (nothing is deleted)
  prepare_manifest.json        input sha256, counts, tool versions
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import get_settings  # noqa: E402
from src.data.loader import load_alias_map, read_raw_rows, rows_to_records, sha256_file  # noqa: E402
from src.data.quality import quality_report  # noqa: E402
from src.data.supervisors import apply_display_map, canonical_display_map, supervisor_counts  # noqa: E402


def prepare(source: Path, out: Path, alias_path: Path | None = None, min_year=1990, max_year=2027) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    sha_before = sha256_file(source)
    header, rows, sheet = read_raw_rows(source)
    alias = load_alias_map(alias_path)
    records, rejected = rows_to_records(rows, min_year=min_year, max_year=max_year, alias_map=alias)
    apply_display_map(records, canonical_display_map(records))
    report = quality_report(header, rows, records, rejected, sheet)

    with open(out / "records.jsonl", "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r.model_dump(), ensure_ascii=False, sort_keys=True) + "\n")
    with open(out / "quality_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1, sort_keys=True)
    counts = supervisor_counts(records)
    with open(out / "supervisor_candidates.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["key_a", "records_a", "key_b", "records_b", "similarity", "decision(merge/keep)"])
        for a, b, s in report["similar_names"]:
            w.writerow([a, counts[a], b, counts[b], s, ""])
    by_id = {r.record_id: r for r in records}
    with open(out / "duplicate_candidates.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["class", "record_ids", "title"])
        for cls, key in (("likely_duplicate_entry", "likely_duplicate_entry_ids"), ("repeated_title", "repeated_title_ids")):
            for g in report["duplicates"][key]:
                w.writerow([cls, " ".join(g), by_id[g[0]].title])
    sha_after = sha256_file(source)
    assert sha_before == sha_after, "source file changed during preparation!"
    manifest = {"source": source.name, "source_sha256": sha_after, "rows": len(rows),
                "records": len(records), "rejected": len(rejected), "alias_entries": len(alias)}
    with open(out / "prepare_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    return {"manifest": manifest, "report": report, "rejected": rejected}


def main() -> int:
    s = get_settings()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=s.raw_dataset_path)
    ap.add_argument("--out", type=Path, default=s.processed_dir)
    args = ap.parse_args()
    res = prepare(args.source, args.out, s.supervisor_aliases_path, s.min_valid_year, s.max_valid_year)
    print(json.dumps(res["manifest"], indent=1))
    print("rejected rows:", len(res["rejected"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
