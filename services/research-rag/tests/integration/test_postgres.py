"""Real PostgreSQL tests (marker `postgres`). Run against TEST_POSTGRES_URL (server URL, any database), or against a
throw-away local server started by the optional `pixeltable-pgserver` package. Skipped when neither is available.
Synthetic data only."""
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from src.admin_ops import ManagedExternally, RecordAdmin
from src.data.loader import rows_to_records
from src.data.schema import RecordIn
from src.retrieval.embeddings import HashingEmbedder
from src.retrieval.types import Filters
from src.service import build_services
from src.storage.pg_source import PostgresSource
from tests.conftest import make_settings, synthetic_rows

pytestmark = pytest.mark.postgres


@pytest.fixture(scope="module")
def server_url(tmp_path_factory):
    url = os.environ.get("TEST_POSTGRES_URL")
    if url:
        yield url
        return
    try:
        import pixeltable_pgserver as pgserver
    except ImportError:
        pytest.skip("no PostgreSQL available (set TEST_POSTGRES_URL or pip install pixeltable-pgserver)")
    srv = pgserver.get_server(tmp_path_factory.mktemp("pg"), cleanup_mode="stop")
    yield srv.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
    srv.cleanup()


@pytest.fixture()
def db_url(server_url):
    """A fresh empty database per test."""
    name = "t_" + uuid.uuid4().hex[:10]
    admin = create_engine(server_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    yield str(make_url(server_url).set(database=name).render_as_string(hide_password=False))
    admin.dispose()


def services(url, **kw):
    s = make_settings(__import__("pathlib").Path("/tmp"), database_url=url, **kw)
    return build_services(s, load=False, embedder=HashingEmbedder(256))


def test_standalone_on_postgres_search_admin_cycle_and_restart(db_url):
    recs, _ = rows_to_records(synthetic_rows())
    a = services(db_url)
    rep = a.indexer.full_rebuild(recs)
    assert rep["records"] == len(recs) and a.indexer.verify_consistency()["ok"]
    a.engine.load()

    r = a.engine.search("كريم فؤاد", "supervisor", page_size=100)
    assert r.total == 130 and r.exhaustive and r.total_pages == 2

    ops = RecordAdmin(a)
    rid = ops.create(
        RecordIn(
            title="دراسة اختبار على بوستجرس",
            supervisors=["مشرف تجريبي"],
            students=["طالب تجريبي"],
            year=2024,
        ),
        "t",
        "ADMIN",
    )["record_id"]

    assert a.engine.search("دراسة اختبار على بوستجرس", "title").total == 1
    assert a.engine.search("طالب تجريبي", "student").total == 1

    ops.patch(rid, {"title": "عنوان معدل على بوستجرس"}, "t", "ADMIN")
    assert a.engine.search("دراسة اختبار على بوستجرس", "title").total == 0
    assert a.engine.search("عنوان معدل على بوستجرس", "title").total == 1

    b = services(db_url)
    b.engine.load()
    assert b.store.count() == len(recs) + 1
    assert b.engine.search("عنوان معدل على بوستجرس", "title").total == 1
    assert len(b.engine.dense) == len(recs) + 1
    assert b.indexer.verify_consistency(b.engine)["ok"]

    RecordAdmin(b).delete(rid, "t", "ADMIN")
    assert b.engine.search("عنوان معدل على بوستجرس", "title").total == 0
    assert b.store.count() == len(recs)
    assert b.engine.search("كريم فؤاد", "supervisor").total == 130
    assert b.store.audit_entries(50)


def test_multi_worker_change_visible_across_engines_on_postgres(db_url):
    recs, _ = rows_to_records(synthetic_rows())

    a = services(db_url)
    a.indexer.full_rebuild(recs)
    a.engine.load()

    w2 = services(db_url)
    w2.engine.load()

    RecordAdmin(a).create(
        RecordIn(title="سجل يراه العامل الثاني", year=2023),
        "t",
        "ADMIN",
    )
    assert w2.engine.search("سجل يراه العامل الثاني", "title").total == 1


def test_integrated_mode_reads_prisma_like_postgres_view_with_array_columns(
    db_url, server_url
):
    """Prisma commonly maps String[] -> text[]; the view may expose arrays or '|' text. Both must work."""
    src_eng = create_engine(db_url)

    with src_eng.begin() as c:
        c.execute(
            text(
                """CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    students TEXT[],
                    supervisors TEXT[],
                    year INT,
                    call_number TEXT,
                    extent TEXT,
                    dimension TEXT,
                    subjects TEXT[]
                )"""
            )
        )

        c.execute(
            text(
                """INSERT INTO projects VALUES
                ('P1','دور البنوك فى التنمية',
                 ARRAY['طالبة اولى','طالب ثان'],
                 ARRAY['د/ مشرف اول','مشرف ثان'],
                 2015,'332',NULL,NULL,ARRAY['بنوك']),
                ('P2','Marketing Analytics',
                 ARRAY['Student One'],
                 ARRAY['د/ مشرف اول'],
                 2020,NULL,'120 ص',NULL,ARRAY['التسويق']),
                ('P3','بدون مشرف',
                 NULL,NULL,NULL,NULL,NULL,NULL,NULL)"""
            )
        )

        c.execute(
            text(
                """CREATE VIEW rag_projects_v AS
                SELECT id AS record_id, title, students, supervisors, year,
                       call_number, extent, dimension, subjects
                FROM projects"""
            )
        )

        # Roles are cluster-wide: create the read-only test role if it does not exist yet (idempotent), then set its password.
        c.execute(
            text(
                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rag_reader_t') "
                "THEN CREATE ROLE rag_reader_t LOGIN; END IF; END $$"
            )
        )
        c.execute(
            text("ALTER ROLE rag_reader_t WITH LOGIN PASSWORD 'rag_reader_test_pw'")
        )
        c.execute(text("GRANT SELECT ON rag_projects_v TO rag_reader_t"))

    ro_url = str(
        make_url(db_url)
        .set(username="rag_reader_t", password="rag_reader_test_pw")
        .render_as_string(hide_password=False)
    )

    src = PostgresSource(ro_url, "rag_projects_v")
    recs, bad = src.fetch_all()
    assert len(recs) == 3 and not bad

    s = services(
        db_url,
        rag_mode="integrated",
        source_database_url=ro_url,
    )

    rep = s.indexer.sync_from_source(recs)
    s.indexer.embed_pending()
    s.engine.load()

    assert rep["source_records"] == 3
    assert s.engine.search("مشرف اول", "supervisor").total == 2
    assert s.engine.search("طالب ثان", "student").total == 1

    with src_eng.begin() as c:
        c.execute(
            text(
                "UPDATE projects SET year=2016, "
                "title='دور البنوك فى التنمية الاقتصادية' WHERE id='P1'"
            )
        )
        c.execute(text("DELETE FROM projects WHERE id='P2'"))

    assert s.indexer.upsert(src.fetch_one("P1"))["op"] == "updated"
    assert src.fetch_one("P2") is None

    s.indexer.delete("P2")
    s.engine.refresh(force=True)

    assert s.engine.get_record("P1").year == 2016
    assert s.engine.get_record("P2") is None
    assert s.engine.search("مشرف اول", "supervisor").total == 1

    with pytest.raises(ManagedExternally):
        RecordAdmin(s).create(RecordIn(title="x"), "t", "ADMIN")

    # The read-only role really cannot write to the source.
    with create_engine(ro_url).connect() as c, pytest.raises(Exception):
        c.execute(text("DELETE FROM projects"))


def test_real_dataset_on_postgres_matches_oracle(db_url):
    """Whole real dataset imported into PostgreSQL: counts, complete supervisor/student lists, restart persistence."""
    from src.config.settings import ROOT
    from src.data.loader import read_raw_rows
    from src.data.supervisors import apply_display_map, canonical_display_map
    from src.evaluation.oracle import load_oracle, person

    raw = ROOT / "data" / "raw" / "Project.xlsx"
    if not raw.exists():
        pytest.skip("dataset not present")

    _, rows, _ = read_raw_rows(raw)
    recs, rej = rows_to_records(rows)
    apply_display_map(recs, canonical_display_map(recs))

    a = services(db_url)
    a.indexer.full_rebuild(recs)
    a.engine.load()

    orc = load_oracle(raw)

    b = services(db_url)
    b.engine.load()

    assert b.store.count() == len(orc["records"]) == 3983
    assert b.indexer.verify_consistency(b.engine)["ok"]

    for name, k in (
        ("عمرو التقي", person("عمرو التقي")),
        ("عمرو عبد المجيد غنايم", person("عمرو عبد المجيد غنايم")),
    ):
        r = b.engine.search(name, "supervisor", page_size=100)
        assert r.total == len(orc["by_sup"][k]) and r.exhaustive

    top = max(orc["by_stu"], key=lambda n: len(orc["by_stu"][n]))
    assert b.engine.search(top, "student", page_size=100).total == len(orc["by_stu"][top])