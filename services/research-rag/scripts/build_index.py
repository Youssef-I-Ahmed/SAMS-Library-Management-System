#!/usr/bin/env python
"""Build / rebuild the persistent index from the prepared dataset (or the integrated PostgreSQL source).

    python scripts/prepare_data.py          # once (writes data/processed/records.jsonl)
    python scripts/build_index.py           # full rebuild (recovery/maintenance command)
    python scripts/build_index.py --pending # embed only records lacking a fresh embedding
    python scripts/build_index.py --sync-source   # integrated mode: reconcile with PostgreSQL
    python scripts/build_index.py --verify  # consistency check only
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.settings import get_settings  # noqa: E402
from src.service import build_services  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--records", type=Path, default=None, help="records.jsonl from prepare_data.py")
    ap.add_argument("--pending", action="store_true")
    ap.add_argument("--sync-source", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--keep-missing", action="store_true", help="do not delete store records absent from the input")
    a = ap.parse_args()
    s = get_settings()
    svc = build_services(s, load=False)
    if a.verify:
        svc.engine.load()
        rep = svc.indexer.verify_consistency(svc.engine)
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        return 0 if rep["ok"] else 1
    if a.pending:
        print(json.dumps({"embedded": svc.indexer.embed_pending()}))
        return 0
    if a.sync_source:
        from src.storage.pg_source import PostgresSource
        src = PostgresSource(s.source_database_url, s.source_table, s.min_valid_year, s.max_valid_year)
        recs, bad = src.fetch_all()
        rep = svc.indexer.sync_from_source(recs)
        rep["source_rows_rejected"] = bad
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        return 0
    path = a.records or (s.processed_dir / "records.jsonl")
    if not path.exists():
        print(f"{path} not found - run scripts/prepare_data.py first", file=sys.stderr)
        return 2
    from src.data.schema import Record
    recs = [Record.model_validate_json(l) for l in open(path, encoding="utf-8") if l.strip()]
    rep = svc.indexer.full_rebuild(recs, delete_missing=not a.keep_missing)
    svc.engine.load()
    rep["consistency"] = svc.indexer.verify_consistency(svc.engine)["ok"]
    print(json.dumps(rep, ensure_ascii=False, indent=1))
    return 0 if rep["consistency"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
