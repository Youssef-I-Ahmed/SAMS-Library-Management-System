#!/usr/bin/env python
"""Reconcile the RAG index with the academy's authoritative PostgreSQL (integrated mode) - for cron / task scheduler.

    python scripts/sync_from_source.py             # sync everything that changed (new, edited, deleted)
    python scripts/sync_from_source.py --dry-run   # only report what WOULD change; writes nothing

Reads the read-only SQL view named by SOURCE_TABLE through SOURCE_DATABASE_URL (see docs/BACKEND_HANDOFF.md section 4).
Only new or edited rows are re-embedded (content-hash comparison); unchanged rows cost nothing; rows that vanished from
the view are removed from the index. Same code path as the admin endpoint POST /admin/sync, so no JWT is needed here.
Exit code 0 = ok, 1 = problem (source unreachable, rows rejected, index inconsistent).

Run it every few minutes (e.g. */5 * * * *) as a safety net, and ALSO call POST /admin/sync/records/{id} right after a
change is committed so that new projects are searchable within a second.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config.settings import get_settings  # noqa: E402
from src.service import build_services  # noqa: E402
from src.storage.pg_source import PostgresSource  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    s = get_settings()
    if s.rag_mode != "integrated":
        print("RAG_MODE is not 'integrated' (set RAG_MODE=integrated, SOURCE_DATABASE_URL and SOURCE_TABLE in .env).", file=sys.stderr)
        return 1
    try:
        recs, rejected = PostgresSource(s.source_database_url, s.source_table, s.min_valid_year, s.max_valid_year).fetch_all()
    except Exception as e:  # noqa: BLE001 - report, never print the URL (it contains credentials)
        print(f"cannot read the source view: {type(e).__name__}", file=sys.stderr)
        return 1
    svc = build_services(s)
    if a.dry_run:
        have = {r.record_id: r for r in svc.store.all_records()}
        mid = svc.embedder.model_id
        new = [r.record_id for r in recs if r.record_id not in have]
        edited = [r.record_id for r in recs if r.record_id in have and have[r.record_id].embed_hash(mid) != r.embed_hash(mid)]
        gone = sorted(set(have) - {r.record_id for r in recs})
        print(json.dumps({"dry_run": True, "source_records": len(recs), "new": len(new), "edited": len(edited), "to_delete": len(gone),
                          "rejected_rows": len(rejected)}, ensure_ascii=False))
        return 0
    rep = svc.indexer.sync_from_source(recs)
    svc.engine.refresh(force=True)
    chk = svc.indexer.verify_consistency(svc.engine)
    rep.update(rejected_rows=len(rejected), index_ok=chk["ok"])
    print(json.dumps({k: rep[k] for k in ("source_records", "changed", "deleted", "rejected_rows", "index_ok")}, ensure_ascii=False))
    for r in rejected[:20]:
        print("rejected:", r, file=sys.stderr)
    return 0 if chk["ok"] and not rejected else 1


if __name__ == "__main__":
    raise SystemExit(main())
