#!/usr/bin/env python
"""Build a ZIP that is SAFE TO SHARE PUBLICLY: code, tests, docs and templates only.

Excludes everything that contains or derives from real student data (see data/PRIVATE_DATA_README.md), plus secrets,
databases, caches and generated evaluation output. Run it from the project root:

    python scripts/make_public_package.py [out.zip]
"""
import fnmatch
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE_DIRS = {".venv", "__pycache__", ".pytest_cache", ".git", "private-import", "screenshots"}
EXCLUDE_PATHS = ["data/raw/*", "data/processed/*", "data/store/*", "docs/DATA_RECONCILIATION_REPORT.md"]
KEEP = {"data/raw/.gitkeep", "data/processed/.gitkeep", "data/store/.gitkeep"}
EXCLUDE_NAMES = ["*.pyc", "*.db", "*.sqlite*", "*.xlsx", "*.jsonl", ".env", "secrets.toml", "*.zip"]


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "sadat-rag-public-no-data.zip"
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(ROOT.rglob("*")):
            rel = f.relative_to(ROOT).as_posix()
            if f.is_dir() or any(p in EXCLUDE_DIRS for p in f.relative_to(ROOT).parts):
                continue
            if rel not in KEEP and (any(fnmatch.fnmatch(rel, p) for p in EXCLUDE_PATHS) or any(fnmatch.fnmatch(f.name, p) for p in EXCLUDE_NAMES)):
                continue
            z.write(f, f"sadat-rag/{rel}")
            n += 1
        for k in KEEP:
            if f"sadat-rag/{k}" not in z.namelist():
                z.writestr(f"sadat-rag/{k}", "")
    print(f"wrote {out} ({n} files). No dataset, no derived data, no secrets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
