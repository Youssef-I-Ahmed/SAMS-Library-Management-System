#!/usr/bin/env python
"""Express + Prisma + PostgreSQL + Python-service integration test (real HTTP, real PostgreSQL, real dataset).

    python scripts/run_node_integration.py            # needs: node >= 22, npm, pixeltable-pgserver (requirements-dev), data/raw/Project.xlsx

Starts a DISPOSABLE PostgreSQL, creates the Prisma-style tables + the read-only view, loads the real dataset into
`projects`, starts the Python service in RAG_MODE=integrated, then runs `node --test` against the REFERENCE Express gateway
(integration/express). Expected values come from the Excel file via the independent oracle. Prints counts only.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
EXP = ROOT / "integration" / "express"
SERVICE_SECRET = "integration-service-secret-0123456789-abcdef"
APP_SECRET = "integration-app-secret-0123456789-abcdefgh"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> int:
    import openpyxl  # noqa: F401  (dataset reader used by the loader)
    import psycopg
    import pixeltable_pgserver as pgserver
    from src.data.loader import read_raw_rows
    from src.evaluation.oracle import load_oracle, person

    xlsx = ROOT / "data" / "raw" / "Project.xlsx"
    if not xlsx.exists():
        sys.exit("data/raw/Project.xlsx is required (private dataset).")
    if not shutil.which("node"):
        sys.exit("node is required (>= 22).")
    tmp = Path(tempfile.mkdtemp(prefix="rag-it-"))
    procs: list[subprocess.Popen] = []
    srv = None
    try:
        # ---- 1. disposable PostgreSQL + schema + real data
        srv = pgserver.get_server(tmp / "pg", cleanup_mode="stop")
        uri = srv.get_uri()                                   # postgresql://postgres:@/postgres?host=/socket/dir
        sock = re.search(r"host=([^&]+)", uri).group(1)
        base = f"postgresql://postgres@/sadat?host={sock}"
        with psycopg.connect(uri, autocommit=True) as c:
            c.execute("CREATE DATABASE sadat")
        with psycopg.connect(base, autocommit=True) as c:
            c.execute((EXP / "schema.sql").read_text(encoding="utf-8"))
        _, rows, _ = read_raw_rows(xlsx)
        na = lambda v: None if str(v).strip().upper() in ("", "NA") else str(v).strip()  # noqa: E731
        arr = lambda v: [] if na(v) is None else [x.strip() for x in str(v).split("|") if x.strip() and x.strip().upper() != "NA"]  # noqa: E731
        with psycopg.connect(base) as c, c.cursor() as cur:
            cur.executemany(
                "INSERT INTO projects (book_code,title,students,supervisors,publishing_date,call_num,extent,dimension,subjects_all) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [(r["BOOK_CODE"].strip(), r["TITLE"], arr(r["Students"]), arr(r["Supervisor"]), na(r["WORK | PUBLISHING_DATE"]),
                  na(r["WORK | CALL_NUM"]), na(r["WORK | EXTENT"]), na(r["WORK | DIMENSION"]), arr(r["SUBJECTS_ALL"])) for r in rows])
            c.commit()
        print(f"[it] PostgreSQL ready, {len(rows)} rows loaded into projects")

        # ---- 2. expectations from the Excel file (independent oracle) - never printed
        orc = load_oracle(xlsx)
        top = max(orc["by_sup"].items(), key=lambda kv: len(kv[1]))
        sup_key, sup_ids = top
        raw_names = [r["Supervisor"] for r in rows if any(person(p) == sup_key for p in r["Supervisor"].split("|"))]
        sup_name = next(p.strip() for p in raw_names[0].split("|") if person(p) == sup_key)
        variant = sup_name.replace("ى", "ي") if "ى" in sup_name else sup_name.replace("ي", "ى")
        stu = max(((k, v) for k, v in orc["by_stu"].items() if 2 <= len(v) <= 8), key=lambda kv: len(kv[1]))
        stu_name = next(n for r in orc["records"].values() for n in r["students_raw"].split("|") if n.strip() and __import__("src.evaluation.oracle", fromlist=["norm"]).norm(n) == stu[0])
        tid, trec = next((i, r) for i, r in orc["records"].items() if len(r["title"]) > 25 and sum(1 for x in orc["by_title"].get(r["title_norm"], [])) == 1)
        expect = {"records": len(orc["records"]),
                  "supervisor": {"name": sup_name.strip(), "variant": variant.strip(), "count": len(sup_ids)},
                  "student": {"name": stu_name.strip(), "count": len(stu[1]), "ids": sorted(stu[1])},
                  "title": {"id": tid, "text": trec["title"], "original": trec["title"]}}
        (tmp / "expect.json").write_text(json.dumps(expect, ensure_ascii=False), encoding="utf-8")

        # ---- 3. Python service (integrated mode, read-only role)
        port = free_port()
        env = {**os.environ, "RAG_MODE": "integrated", "SERVICE_JWT_SECRET": SERVICE_SECRET,
               "SOURCE_DATABASE_URL": f"postgresql+psycopg://rag_reader:rag_reader_test_pw@/sadat?host={sock}",
               "SOURCE_TABLE": "rag_projects_v", "DATABASE_URL": f"sqlite:///{tmp / 'rag.db'}", "ADMIN_ROLES": "ADMIN,LIBRARIAN"}
        py = subprocess.Popen([sys.executable, "-m", "uvicorn", "api.main:app", "--port", str(port), "--no-access-log"], cwd=ROOT, env=env,
                              stdout=open(tmp / "api.log", "w"), stderr=subprocess.STDOUT)
        procs.append(py)
        rag = f"http://127.0.0.1:{port}"
        for _ in range(60):
            try:
                urllib.request.urlopen(rag + "/health", timeout=2); break
            except Exception:
                time.sleep(1)
        else:
            sys.exit("Python service did not start; see " + str(tmp / "api.log"))
        # initial full sync of the PostgreSQL view (what a deployment does at start)
        import jwt
        tok = jwt.encode({"sub": "it", "role": "ADMIN", "scope": "rag:read rag:admin", "iss": "sadat-express", "aud": "sadat-rag",
                          "iat": int(time.time()), "exp": int(time.time()) + 600}, SERVICE_SECRET, algorithm="HS256")
        req = urllib.request.Request(rag + "/admin/sync", method="POST", headers={"Authorization": f"Bearer {tok}"})
        rep = json.load(urllib.request.urlopen(req, timeout=300))
        print("[it] initial sync:", {k: rep[k] for k in ("source_records",) if k in rep})
        urllib.request.urlopen(urllib.request.Request(rag + "/admin/index/reindex?scope=pending", method="POST", headers={"Authorization": f"Bearer {tok}"}), timeout=300)

        # ---- 4. Prisma client + node tests
        if not (EXP / "node_modules").exists():
            subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=EXP, check=True, env={**os.environ, "PRISMA_SKIP_POSTINSTALL_GENERATE": "1"})
        fake = tmp / "schema-engine-unavailable"
        fake.write_text("#!/bin/sh\nexit 1\n"); fake.chmod(0o755)
        genv = {**os.environ, "DATABASE_URL": base}
        if "PRISMA_SCHEMA_ENGINE_BINARY" not in genv:
            genv["PRISMA_SCHEMA_ENGINE_BINARY"] = str(fake)   # client generation does not execute it (see README); migrate would
        subprocess.run(["npx", "prisma", "generate"], cwd=EXP, check=True, env=genv, stdout=subprocess.DEVNULL)
        nenv = {**os.environ, "DATABASE_URL": base, "RAG_URL": rag, "SERVICE_JWT_SECRET": SERVICE_SECRET, "APP_JWT_SECRET": APP_SECRET,
                "EXPECT_JSON": str(tmp / "expect.json")}
        r = subprocess.run(["node", "--test", "--test-concurrency=1", "test/gateway.test.mjs"], cwd=EXP, env=nenv)
        return r.returncode
    finally:
        for p in procs:
            p.terminate()
        if srv is not None:
            try:
                srv.cleanup()
            except Exception:  # noqa: BLE001
                pass
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
