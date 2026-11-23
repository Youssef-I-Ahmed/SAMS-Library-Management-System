"""REAL dataset: when student names are hidden, student lookup must be disabled everywhere (not just not printed)."""
import pytest

from src.config.settings import ROOT
from src.data.loader import read_raw_rows, rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings

RAW = ROOT / "data" / "raw" / "Project.xlsx"
pytestmark = [pytest.mark.realdata, pytest.mark.skipif(not RAW.exists(), reason="data/raw/Project.xlsx not present")]


@pytest.fixture(scope="module")
def recs():
    _, rows, _ = read_raw_rows(RAW)
    r, _ = rows_to_records(rows, min_year=1950, max_year=2100)
    apply_display_map(r, canonical_display_map(r))
    return r


def build(tmp_path, recs, **kw):
    s = make_settings(tmp_path, **kw)
    sv = build_services(s, load=False, embedder=HashingEmbedder(256))
    sv.indexer.full_rebuild(recs)
    sv.engine.load()
    return sv.engine


def test_default_student_lookup_still_works(tmp_path_factory, recs):
    e = build(tmp_path_factory.mktemp("on"), recs)
    r = next(x for x in recs if len(x.students) == 1)
    res = e.search(r.students[0], "student", page_size=100)
    assert res.total >= 1 and r.record_id in {h.record_id for h in res.hits}


def test_hidden_mode_disables_every_student_lookup_path(tmp_path_factory, recs):
    e = build(tmp_path_factory.mktemp("off"), recs, hide_student_names=True)
    r = next(x for x in recs if len(x.students) == 1 and len(x.students[0].split()) >= 3)
    name = r.students[0]
    assert e.search(name, "student").total == 0
    assert e.list_students(name)["total"] == 0
    auto = e.search(name, "auto", page_size=100)
    assert auto.student_resolution is None and "structured_student" not in auto.strategy
    assert all(name not in " ".join(h.students or []) for h in auto.hits)
    assert e.resolve_student(key="anything").status == "none"
    # supervisor / title search unaffected
    sup = next(s for x in recs for s in x.supervisors)
    assert e.search(sup.name, "supervisor", page_size=1).total >= 1
    assert e.search(r.title, "title", page_size=10).total >= 1
