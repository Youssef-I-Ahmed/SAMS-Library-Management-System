#!/usr/bin/env python
"""ZERO-COST real checks on YOUR machine: multilingual semantic-search evaluation + real-LLM smoke test via Ollama.

    1. Install Ollama (free): https://ollama.com/download and start it (the desktop app, or `ollama serve`)
    2. python scripts/free_local_check.py --pull

Options:
    --embed-model bge-m3
    --llm-model qwen2.5:3b
    --st-path models/xxx
    --skip-embed / --skip-llm

It uses a SEPARATE store (data/store/rag_free_check.db):
your normal index and Excel file are never touched.
Output: data/processed/free_local_report.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

# Windows consoles default to a legacy encoding. Force UTF-8.
os.environ.setdefault("PYTHONUTF8", "1")

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"


def run(cmd: list[str], env: dict, label: str) -> tuple[int, str]:
    print(f"\n=== {label} ===", flush=True)

    p = subprocess.run(
        [sys.executable, *cmd],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    out = (p.stdout or "") + (p.stderr or "")
    print(out[-2500:] if len(out) > 2500 else out)

    return p.returncode, out


def have(url: str) -> list[str] | None:
    try:
        response = httpx.get(url + "/api/tags", timeout=5)
        response.raise_for_status()
        return [
            model["name"]
            for model in response.json().get("models", [])
        ]
    except Exception:  # noqa: BLE001
        return None


def pull(url: str, model: str) -> None:
    print(
        f"Pulling {model} (one-time download; can take minutes)...",
        flush=True,
    )

    with httpx.stream(
        "POST",
        url + "/api/pull",
        json={"model": model},
        timeout=None,
    ) as response:
        response.raise_for_status()
        last = ""

        for line in response.iter_lines():
            try:
                status = json.loads(line).get("status", "")
            except (ValueError, TypeError):
                continue

            if status != last and not status.startswith("pulling"):
                print("  ", status)
                last = status


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--url",
        default="http://localhost:11434",
    )
    parser.add_argument(
        "--embed-model",
        default="bge-m3",
    )
    parser.add_argument(
        "--llm-model",
        default="qwen2.5:3b",
    )
    parser.add_argument(
        "--st-path",
        default="",
    )
    parser.add_argument(
        "--pull",
        action="store_true",
        help="Download missing Ollama models",
    )
    parser.add_argument(
        "--skip-embed",
        action="store_true",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
    )

    args = parser.parse_args()

    records_path = ROOT / "data" / "processed" / "records.jsonl"
    excel_path = ROOT / "data" / "raw" / "Project.xlsx"

    if not records_path.exists() or not excel_path.exists():
        sys.exit(
            "Required files are missing. Run "
            "'python scripts/bootstrap.py' first."
        )

    need_ollama = (
        not args.skip_llm
        or (not args.skip_embed and not args.st_path)
    )

    if need_ollama:
        models = have(args.url)

        if models is None:
            sys.exit(
                f"Ollama is not reachable at {args.url}. "
                "Start Ollama and try again."
            )

        wanted = []

        if not args.skip_embed and not args.st_path:
            wanted.append(args.embed_model)

        if not args.skip_llm:
            wanted.append(args.llm_model)

        missing = [
            model
            for model in wanted
            if not any(
                installed == model
                or installed.startswith(model + ":")
                or installed.split(":")[0] == model
                for installed in models
            )
        ]

        for model in missing:
            if args.pull:
                pull(args.url, model)
            else:
                print(
                    f"MISSING model: run 'ollama pull {model}' "
                    "or rerun with --pull."
                )

        if missing and not args.pull:
            return 2

        # Verify the models after any requested downloads.
        models = have(args.url)

        if models is None:
            print("Could not verify the Ollama models after download.")
            return 2

        still_missing = [
            model
            for model in wanted
            if not any(
                installed == model
                or installed.startswith(model + ":")
                or installed.split(":")[0] == model
                for installed in models
            )
        ]

        if still_missing:
            print("Models still missing:", ", ".join(still_missing))
            return 2

    # Separate test database; do not point at the normal database.
    store = ROOT / "data" / "store" / "rag_free_check.db"
    store.parent.mkdir(parents=True, exist_ok=True)

    # Refuse to delete an existing test database automatically.
    # Remove it manually only when you intentionally want a fresh rebuild.
    if store.exists() and not args.skip_embed:
        print(
            f"Existing test database found: {store}\n"
            "It will be reused for this run. The script will not delete it."
        )

    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{store.as_posix()}",
        "OLLAMA_URL": args.url,
        "LLM_TIMEOUT_S": "240",
        "LLM_MAX_RETRIES": "0",
        "SERVICE_JWT_SECRET": os.environ.get(
            "SERVICE_JWT_SECRET",
            "free-local-check-secret-0123456789-abcdef",
        ),
    }

    report: dict = {
        "started": time.strftime("%Y-%m-%d %H:%M:%S"),
        "steps": {},
    }

    ok = True

    if args.st_path:
        env.update(
            EMBEDDING_BACKEND="sentence-transformers",
            EMBEDDING_MODEL_PATH=args.st_path,
            EMBEDDING_LOCAL_ONLY="true",
        )
    else:
        env.update(
            EMBEDDING_BACKEND="ollama",
            EMBEDDING_MODEL=args.embed_model,
        )

    if not args.skip_embed:
        start = time.time()

        rc, output = run(
            [
                "scripts/build_index.py",
                "--records",
                "data/processed/records.jsonl",
            ],
            env,
            "1/3 Embed all records with the selected model",
        )

        report["steps"]["index_with_real_model"] = {
            "exit": rc,
            "seconds": round(time.time() - start),
        }

        ok = ok and rc == 0

        if rc == 0:
            rc, _ = run(
                ["scripts/build_index.py", "--verify"],
                env,
                "Index consistency",
            )

            report["steps"]["index_verify"] = {"exit": rc}
            ok = ok and rc == 0

            rc, _ = run(
                ["scripts/eval_semantic.py"],
                env,
                "2/3 Multilingual retrieval evaluation and threshold selection",
            )

            report["steps"]["eval_semantic"] = {"exit": rc}
            ok = ok and rc == 0

            evaluation_file = PROC / "eval_semantic.json"

            if evaluation_file.exists():
                report["eval_semantic"] = json.loads(
                    evaluation_file.read_text(encoding="utf-8")
                )

    if not args.skip_llm:
        llm_env = {
            **env,
            "LLM_PROVIDER": "ollama",
            "LLM_MODEL": args.llm_model,
            "LLM_BASE_URL": args.url,
        }

        rc, output = run(
            ["scripts/llm_smoke.py"],
            llm_env,
            "3/3 Real LLM smoke test: grounding, citations, and abstention",
        )

        report["steps"]["llm_smoke"] = {
            "exit": rc,
            "model": args.llm_model,
            "output_tail": output[-800:],
        }

        ok = ok and rc == 0

    report["all_ok"] = bool(ok)

    PROC.mkdir(parents=True, exist_ok=True)

    report_path = PROC / "free_local_report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\nReport written:", report_path)
    print("RESULT:", "ALL STEPS PASSED" if ok else "SOME STEP FAILED")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())