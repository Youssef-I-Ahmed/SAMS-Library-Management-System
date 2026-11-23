"""scripts/sync_from_source.py against a REAL PostgreSQL server (synthetic data only): initial load, new row, edited row,
deleted row, dry run, unreachable source. Skipped when no PostgreSQL is available (same rules as test_postgres.py)."""
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

pytestmark = pytest.mark.postgres
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def server_url(tmp_path_factory):
    url = os.environ.get("TEST_POSTGRES_URL")
    if url:
        yield url
        return
    try:
        import pixeltable_pgserver as pgserver
    except ImportError:
        pytest.skip("no PostgreSQL available")
    srv = pgserver.get_server(tmp_path_factory.mktemp("pgsync"), cleanup_mode="stop")
    yield srv.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
    srv.cleanup()


@pytest.fixture()
def source(server_url):
    name = "t_" + uuid.uuid4().hex[:10]
    admin = create_engine(server_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    url = str(make_url(server_url).set(database=name).render_as_string(hide_password=False))
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("""CREATE TABLE projects (id SERIAL PRIMARY KEY, book_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
            students TEXT[] NOT NULL DEFAULT '{}', supervisors TEXT[] NOT NULL DEFAULT '{}', publishing_date TEXT, call_num TEXT,
            extent TEXT, dimension TEXT, subjects_all TEXT[] NOT NULL DEFAULT '{}')"""))
        c.execute(text("""CREATE VIEW rag_projects_v AS SELECT book_code AS record_id, title, students, supervisors,
            publishing_date AS year, call_num AS call_number, extent, dimension, subjects_all AS subjects FROM projects"""))
        c.execute(text("""INSERT INTO projects (book_code,title,students,supervisors,publishing_date,call_num,subjects_all) VALUES
            ('P1','Digital marketing and customer happiness','{Student One}','{Dr Supervisor A}','2021','658.8','{Marketing}'),
            ('P2','Supply chain resilience in banks','{Student Two}','{Dr Supervisor B}','2020','658.7','{Banking}')"""))
    yield eng, url
    eng.dispose()
    admin.dispose()


def run(url, tmp_path, *args):
    env = {**os.environ, "RAG_MODE": "integrated", "SOURCE_DATABASE_URL": url, "SOURCE_TABLE": "rag_projects_v",
           "DATABASE_URL": f"sqlite:///{tmp_path / 'rag.db'}", "EMBEDDING_BACKEND": "hashing", "LLM_PROVIDER": "none"}
    p = subprocess.run([sys.executable, "scripts/sync_from_source.py", *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
    return p.returncode, (json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else None), p.stderr


def test_sync_script_new_edited_deleted_and_dry_run(source, tmp_path):
    eng, url = source
    rc, out, err = run(url, tmp_path)
    assert rc == 0 and out["source_records"] == 2 and out["changed"] == 2 and out["index_ok"], err
    rc, out, _ = run(url, tmp_path)                                  # nothing changed -> nothing re-embedded
    assert rc == 0 and out["changed"] == 0 and out["deleted"] == 0
    with eng.begin() as c:
        c.execute(text("INSERT INTO projects (book_code,title,publishing_date) VALUES ('P3','Artificial intelligence in education','2025')"))
        c.execute(text("UPDATE projects SET title='Supply chain resilience in Egyptian banks' WHERE book_code='P2'"))
        c.execute(text("DELETE FROM projects WHERE book_code='P1'"))
    rc, dry, _ = run(url, tmp_path, "--dry-run")
    assert rc == 0 and dry == {"dry_run": True, "source_records": 2, "new": 1, "edited": 1, "to_delete": 1, "rejected_rows": 0}
    rc, out, _ = run(url, tmp_path)
    assert rc == 0 and out["source_records"] == 2 and out["changed"] == 2 and out["deleted"] == 1 and out["index_ok"]


def test_sync_script_unreachable_source_fails_cleanly_without_leaking_credentials(tmp_path):
    bad = "postgresql+psycopg://rag_reader:SuperSecretPw@127.0.0.1:1/nope"
    rc, out, err = run(bad, tmp_path)
    assert rc == 1 and "SuperSecretPw" not in err and "cannot read the source view" in err
