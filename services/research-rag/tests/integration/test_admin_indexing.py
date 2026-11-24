import numpy as np
import pytest

from src.admin_ops import Conflict, Invalid, ManagedExternally, NotFound, RecordAdmin
from src.data.schema import RecordIn
from src.indexing.indexer import Indexer, IndexingError
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings


@pytest.fixture()
def admin(svc):
    return RecordAdmin(svc)


def consistent(svc):
    rep = svc.indexer.verify_consistency(svc.engine)
    assert rep["ok"], rep["problems"]


def test_initial_index_is_consistent(svc):
    consistent(svc)
    st = svc.indexer.status(svc.engine)
    assert st["records"] == st["embeddings"] == st["engine"]["dense_vectors"] and st["index_errors"] == 0


def test_create_assigns_id_indexes_and_audits(svc, admin):
    res = admin.create(RecordIn(title="دراسة جديدة عن الذكاء الاصطناعي فى البنوك", supervisors=["د/ سامي منصور"], year=2024,
                                subjects=["بنوك"]), "alice", "ADMIN")
    rid = res["record_id"]
    assert res["operation"] == "created" and res["embedding"] == "indexed" and rid == str(svc.store.max_numeric_id())
    assert svc.engine.search("الذكاء الاصطناعي", "title").total == 1
    assert rid in [h.record_id for h in svc.engine.search("سامي منصور", "supervisor", page_size=100).hits]
    assert svc.engine.search("الذكاء الاصطناعي البنوك", "semantic").hits[0].record_id == rid
    # display name reuses the canonical spelling and strips the academic title
    assert svc.engine.get_record(rid).supervisors[0].name == "سامي منصور"
    a = svc.store.audit_entries(5, rid)
    assert a[0]["action"] == "create" and a[0]["actor"] == "alice" and a[0]["role"] == "ADMIN"
    consistent(svc)


def test_create_duplicate_id_conflict_and_duplicate_title_warning(svc, admin):
    with pytest.raises(Conflict):
        admin.create(RecordIn(record_id="1", title="x"), "a", "ADMIN")
    res = admin.create(RecordIn(title="الاندماج المصرفى", year=2020), "a", "ADMIN")
    assert res["possible_duplicates"] and {d["record_id"] for d in res["possible_duplicates"]} >= {"2", "3", "4"}
    with pytest.raises(Conflict):
        admin.create(RecordIn(title="الاندماج المصرفى"), "a", "ADMIN", reject_duplicates=True)
    consistent(svc)


def test_validation_errors(admin):
    with pytest.raises(Invalid):
        admin.create(RecordIn(title="ok", year=3014), "a", "ADMIN")
    with pytest.raises(Invalid):
        admin.replace("1", RecordIn(record_id="2", title="t"), "a", "ADMIN")
    with pytest.raises(NotFound):
        admin.replace("nope", RecordIn(title="t"), "a", "ADMIN")
    with pytest.raises(NotFound):
        admin.delete("nope", "a", "ADMIN")
    with pytest.raises(Invalid):
        admin.patch("1", {"record_id": "zzz"}, "a", "ADMIN")


def test_update_reindexes_only_the_changed_record(svc, admin):
    before = {rid: svc.store.get_embedding(rid)[2].copy() for rid in ("1", "2", "10")}
    seq0 = svc.store.current_seq()
    res = admin.patch("10", {"title": "Network Security Essentials", "year": 2006}, "bob", "LIBRARIAN")
    assert res["operation"] == "updated"
    assert svc.engine.search("Internet Security", "title").total == 0
    assert svc.engine.search("Network Security Essentials", "title").hits[0].record_id == "10"
    assert svc.engine.get_record("10").year == 2006
    assert svc.engine.search("network security", "keyword").hits[0].record_id == "10"
    assert not np.array_equal(before["10"], svc.store.get_embedding("10")[2])        # re-embedded
    assert np.array_equal(before["1"], svc.store.get_embedding("1")[2])              # others untouched
    assert np.array_equal(before["2"], svc.store.get_embedding("2")[2])
    assert svc.store.current_seq() > seq0
    consistent(svc)


def test_unchanged_update_is_a_noop(svc, admin):
    r = svc.engine.get_record("2")
    seq = svc.store.current_seq()
    res = admin.replace("2", RecordIn(title=r.title, supervisors=[s.name for s in r.supervisors], year=r.year,
                                      subjects=r.subjects, call_number=r.call_number, extent=r.extent_raw,
                                      dimension=r.dimension_raw, students=r.students), "a", "ADMIN")
    assert res["operation"] == "unchanged" and svc.store.current_seq() == seq


def test_update_supervisor_moves_record_between_supervisor_lists(svc, admin):
    admin.patch("7", {"supervisors": ["منى رشاد"]}, "a", "ADMIN")
    assert "7" in [h.record_id for h in svc.engine.search("منى رشاد", "supervisor", page_size=100).hits]
    assert "7" not in [h.record_id for h in svc.engine.search("نادر فتحي", "supervisor", page_size=100).hits]
    consistent(svc)


def test_delete_removes_from_every_index(svc, admin):
    n = svc.store.count()
    admin.delete("10", "a", "ADMIN")
    e = svc.engine
    assert svc.store.count() == n - 1 and svc.store.get_embedding("10") is None and e.get_record("10") is None
    assert e.search("Internet Security", "title").total == 0
    assert "10" not in [h.record_id for h in e.search("Internet", "hybrid").hits]
    assert "10" not in [h.record_id for h in e.search("نادر فتحي", "supervisor", page_size=100).hits]
    assert svc.store.audit_entries(1)[0]["action"] == "delete"
    consistent(svc)


def test_integrated_mode_blocks_local_writes(svc):
    svc.settings.rag_mode = "integrated"
    with pytest.raises(ManagedExternally):
        RecordAdmin(svc).create(RecordIn(title="x"), "a", "ADMIN")


def test_embedding_failure_keeps_record_searchable_and_is_repaired(svc, admin, monkeypatch):
    monkeypatch.setattr(svc.embedder, "encode_passages", lambda t: (_ for _ in ()).throw(RuntimeError("model down")))
    res = admin.create(RecordIn(title="موضوع جديد تماما حول الاقتصاد الرقمى", year=2022), "a", "ADMIN")
    rid = res["record_id"]
    assert res["embedding"] == "pending"
    assert svc.engine.search("الاقتصاد الرقمى", "title").hits[0].record_id == rid          # structured search works
    assert svc.engine.search("الاقتصاد الرقمى", "keyword").hits[0].record_id == rid        # BM25 works
    assert rid in svc.engine.pending_embeddings and svc.store.error_count() == 1
    assert not svc.indexer.verify_consistency(svc.engine)["ok"]
    monkeypatch.undo()
    assert svc.indexer.embed_pending() == 1
    svc.engine.refresh(force=True)
    assert rid not in svc.engine.pending_embeddings and svc.store.error_count() == 0
    consistent(svc)


def test_persistence_and_restart(tmp_path, records):
    s = make_settings(tmp_path)
    a = build_services(s, load=False, embedder=HashingEmbedder(256))
    a.indexer.full_rebuild(records)
    RecordAdmin(a)  # noqa
    a.engine.load()
    RecordAdmin(a).create(RecordIn(title="سجل بعد الاطلاق", year=2025), "a", "ADMIN")
    vec = a.store.get_embedding("1")[2].copy()
    del a
    b = build_services(s, embedder=HashingEmbedder(256))          # "restart": new objects, same database file
    assert b.store.count() == len(records) + 1 and b.engine.stats()["dense_vectors"] == len(records) + 1
    assert b.engine.search("سجل بعد الاطلاق", "title").total == 1
    assert np.array_equal(vec, b.store.get_embedding("1")[2])
    assert b.engine.search("الاندماج المصرفي", "semantic").hits                       # frozen IDF state restored from DB
    assert b.indexer.verify_consistency(b.engine)["ok"]


def test_two_workers_stay_consistent_through_change_log(tmp_path, records):
    s = make_settings(tmp_path)
    w1 = build_services(s, load=False, embedder=HashingEmbedder(256))
    w1.indexer.full_rebuild(records); w1.engine.load()
    w2 = build_services(s, embedder=HashingEmbedder(256))
    RecordAdmin(w1).create(RecordIn(title="كتاب جديد عن الطاقة المتجددة", year=2023), "a", "ADMIN")
    assert w2.engine.search("الطاقة المتجددة", "title").total == 1            # w2 picked the change up via refresh()
    assert w2.engine.search("الطاقة المتجددة", "semantic").hits[0].title.startswith("كتاب جديد")
    RecordAdmin(w1).delete("10", "a", "ADMIN")
    assert w2.engine.get_record("10") is None and w2.engine.search("Internet Security", "title").total == 0
    w1.indexer.full_rebuild(w1.store.all_records())                           # epoch bump -> w2 reloads
    assert w2.engine.search("الطاقة المتجددة", "title").total == 1 and w2.indexer.verify_consistency(w2.engine)["ok"]


def test_full_rebuild_is_deterministic_and_idempotent(tmp_path, records):
    def build(sub):
        (tmp_path / sub).mkdir()
        s = make_settings(tmp_path / sub)
        x = build_services(s, load=False, embedder=HashingEmbedder(256))
        x.indexer.full_rebuild(records)
        return x
    a, b = build("a"), build("b")
    for rid in ("1", "10", "ب19"):
        assert np.array_equal(a.store.get_embedding(rid)[2], b.store.get_embedding(rid)[2])
    rep = a.indexer.full_rebuild(records)
    assert rep["created"] == 0 and rep["unchanged"] == len(records) and rep["deleted"] == 0


def test_full_rebuild_deletes_records_missing_from_input(svc, records):
    rep = svc.indexer.full_rebuild(records[:10])
    assert rep["deleted"] == len(records) - 10 and svc.store.count() == 10
    svc.engine.load()
    assert svc.indexer.verify_consistency(svc.engine)["ok"]


def test_duplicate_ids_and_invalid_records_detected_before_indexing(svc, records):
    dup = records[0].model_copy()
    valid, problems = Indexer.validate_records(records + [dup])
    assert len(valid) == len(records) and "duplicate record_id" in problems[0]["problem"]
    bad = records[1].model_copy(update={"title": " "})
    assert "empty" in Indexer.validate_records([bad])[1][0]["problem"]
    with pytest.raises(IndexingError):
        svc.indexer.full_rebuild([bad])


def test_embedding_model_switch_marks_stale_and_embed_pending_repairs(svc):
    svc.indexer.embedder = HashingEmbedder(128)     # simulate a different model
    svc.indexer.embedder.fit(["a"])
    assert svc.indexer.verify_consistency()["problem_counts"]["stale_or_other_model_embeddings"] == svc.store.count()
    assert svc.indexer.embed_pending() == svc.store.count()
    assert svc.indexer.verify_consistency()["ok"]


def test_source_sync_from_external_table(tmp_path, svc):
    """Integrated-mode reconciliation, exercised with a SQLite 'authoritative' DB exposing the agreed view/table."""
    from sqlalchemy import create_engine, text
    from src.storage.pg_source import PostgresSource
    url = f"sqlite:///{tmp_path / 'source.db'}"
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("CREATE TABLE rag_projects_v (record_id TEXT, title TEXT, students TEXT, supervisors TEXT, year INT, "
                       "call_number TEXT, extent TEXT, dimension TEXT, subjects TEXT, updated_at TEXT)"))
        c.execute(text("INSERT INTO rag_projects_v VALUES ('1','دور الجهاز المصرفى فى منح التسهيلات الائتمانية','','سامي منصور | ليلى حسن',2003,'332',NULL,NULL,'بنوك',NULL),"
                       "('900','سجل جديد من قاعدة البيانات الرئيسية','','نادر فتحي',2024,NULL,NULL,NULL,'بترول',NULL)"))
    src = PostgresSource(url, "rag_projects_v")
    recs, bad = src.fetch_all()
    before = svc.store.count()
    rep = svc.indexer.sync_from_source(recs)
    assert rep["source_records"] == 2 and rep["deleted"] == before - 1   # record 1 existed; 900 is new
    svc.engine.refresh(force=True)
    assert svc.store.count() == 2 and svc.engine.get_record("900").year == 2024
    with eng.begin() as c:
        c.execute(text("UPDATE rag_projects_v SET year=2005 WHERE record_id='1'"))
        c.execute(text("DELETE FROM rag_projects_v WHERE record_id='900'"))
    one = src.fetch_one("1")
    assert svc.indexer.upsert(one)["op"] == "updated" and src.fetch_one("900") is None
    svc.indexer.delete("900"); svc.engine.refresh(force=True)
    assert svc.engine.get_record("1").year == 2005 and svc.engine.get_record("900") is None
    with pytest.raises(ValueError):
        PostgresSource(url, "x; DROP TABLE y")
