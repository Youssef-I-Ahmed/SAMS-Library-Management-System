"""The operator scripts must fail safely (exit 2, no traceback, nothing claimed) when their prerequisites are missing."""
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def run(script, env_extra=None):
    import os
    env = {k: v for k, v in os.environ.items() if not k.startswith(("LLM_", "EMBEDDING_"))}
    env.update(env_extra or {})
    return subprocess.run([sys.executable, str(ROOT / "scripts" / script)], capture_output=True, text=True, env=env, cwd=ROOT, timeout=120)


@pytest.mark.skipif(not (ROOT / "data" / "store" / "rag.db").exists(), reason="needs a bootstrapped store")
def test_eval_semantic_refuses_on_hashing_backend():
    r = run("eval_semantic.py")
    assert r.returncode == 2 and "not a neural model" in r.stdout and "Traceback" not in r.stderr


def test_llm_smoke_reports_not_tested_without_credentials():
    r = run("llm_smoke.py", {"LLM_PROVIDER": "none"})
    assert r.returncode == 2 and "NOT TESTED" in r.stdout and "Traceback" not in r.stderr
