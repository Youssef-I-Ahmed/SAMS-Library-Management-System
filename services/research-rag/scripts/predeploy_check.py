"""Pre-deployment check for the Streamlit Cloud pilot. Run from the project root:  python scripts/predeploy_check.py
Fails (exit 1) on: missing/modified dataset, secrets files present in the tree, requirements missing, absurd settings."""
from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SHA = "34e2be486ecc37014e685d216f263920fd9404e6cf9b2b5a41245d55ad427528"
bad: list[str] = []


def check(ok: bool, msg: str):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok:
        bad.append(msg)


ds = ROOT / "data/raw/Project.xlsx"
check(ds.exists(), "data/raw/Project.xlsx present")
if ds.exists():
    check(hashlib.sha256(ds.read_bytes()).hexdigest() == EXPECTED_SHA, "dataset sha256 matches the validated 3,983-record file")
check(not (ROOT / ".env").exists(), "no .env file in the tree")
check(not (ROOT / ".streamlit/secrets.toml").exists(), "no .streamlit/secrets.toml in the tree (paste it into Streamlit Cloud Secrets instead)")
check((ROOT / "app.py").exists() and (ROOT / "requirements.txt").exists(), "entry point app.py and requirements.txt exist")
req = (ROOT / "requirements.txt").read_text().lower()
check("fastembed" in req and "streamlit" in req, "requirements.txt lists streamlit and fastembed")
check(not any(l.strip().startswith(("torch","sentence-transformers")) for l in req.splitlines()), "requirements.txt has no torch (keeps the cloud image small)")
cache = ROOT / "data/cache/embeddings.npz"
print(("PASS " if cache.exists() else "WARN ") + "precomputed embedding cache " + ("present" if cache.exists() else "missing (the app will embed 3,983 records on first start: slow on the free tier)"))
cal = ROOT / "data/cache/semantic_calibration.json"
print(("PASS " if cal.exists() else "WARN ") + "semantic calibration file " + ("present" if cal.exists() else "missing (similarity floor will be the UNCALIBRATED default)"))
try:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.split()
    if out:
        check(".env" not in out and ".streamlit/secrets.toml" not in out, "no secrets files tracked by git")
        check("data/raw/Project.xlsx" in out, "dataset is tracked (use: git add -f data/raw/Project.xlsx) - PRIVATE repo only")
except Exception:  # noqa: BLE001
    print("INFO git not available; skipped tracked-file checks")
sys.exit(1 if bad else 0)
