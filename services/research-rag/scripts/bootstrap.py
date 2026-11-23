#!/usr/bin/env python
"""ONE COMMAND from the supplied dataset to a verified, searchable store:

    python scripts/bootstrap.py [--xlsx data/raw/Project.xlsx] [--skip-reconcile]

Steps: (1) prepare_data  (2) build_index (full rebuild, embeddings)  (3) reconcile against the Excel file
(4) index consistency check. Re-runnable at any time (e.g. when the index is missing or stale): the Excel file is
never modified and the store is rebuilt from it. Exit code 0 only if every step passes.
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(title: str, *cmd: str) -> None:
    print(f"\n=== {title} ===", flush=True)
    r = subprocess.run([sys.executable, *cmd], cwd=ROOT)
    if r.returncode:
        sys.exit(f"\nSTEP FAILED: {title} (exit {r.returncode})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, default=ROOT / "data" / "raw" / "Project.xlsx")
    ap.add_argument("--skip-reconcile", action="store_true")
    a = ap.parse_args()
    if not a.xlsx.exists():
        sys.exit(f"Dataset not found: {a.xlsx}\nPlace the original Project.xlsx there (private data - never commit it), "
                 "or pass --xlsx /path/to/Project.xlsx.")
    run("1/4 prepare data (quality report, normalised records)", "scripts/prepare_data.py", "--source", str(a.xlsx))
    run("2/4 build index (store + embeddings)", "scripts/build_index.py")
    if not a.skip_reconcile:
        run("3/4 reconcile source <-> store", "scripts/reconcile.py", "--xlsx", str(a.xlsx))
    run("4/4 index consistency", "scripts/build_index.py", "--verify")
    print("\nOK: dataset imported, indexed and verified. Start the API:\n"
          "  uvicorn api.main:app --port 8000 --no-access-log")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
