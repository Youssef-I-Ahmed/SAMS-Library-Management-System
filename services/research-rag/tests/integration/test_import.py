"""Validated Excel import (admin): dry run, apply, change detection, never deletes, and file-validation limits."""
import io

import openpyxl
import pytest

from src.admin_ops import Invalid, ManagedExternally, RecordAdmin
from tests.conftest import _COLS, row, token
from fastapi.testclient import TestClient
from api.main import create_app


def xlsx(rows: list[dict], cols=_COLS) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Research"
    ws.append(cols)
    for r in rows:
        ws.append([r.get(c, "NA") for c in cols])
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()


NEW = [row(9001, "عنوان مستورد جديد", "مشرف مستورد", 2022, "بنوك", "طالب مستورد"),
       row(9002, "Imported English Title", "مشرف مستورد", 2023, "حاسب آلى")]


def test_dry_run_reports_but_changes_nothing_then_apply_adds(svc):
    ops, before = RecordAdmin(svc), svc.store.count()
    rep = ops.import_workbook(xlsx(NEW), "new.xlsx", "t", "ADMIN", apply=False)
    assert rep["applied"] is False and rep["new"] == 2 and rep["changed"] == 0 and rep["rejected_count"] == 0
    assert svc.store.count() == before and svc.engine.search("عنوان مستورد جديد", "title").total == 0
    rep = ops.import_workbook(xlsx(NEW), "new.xlsx", "t", "ADMIN", apply=True)
    assert rep["applied"] and rep["new"] == 2 and svc.store.count() == before + 2
    assert svc.engine.search("عنوان مستورد جديد", "title").total == 1
    assert svc.engine.search("طالب مستورد", "student").total == 1
    assert svc.engine.search("مشرف مستورد", "supervisor").total == 2
    assert any(e["action"] == "import_xlsx" for e in svc.store.audit_entries(10))


def test_reimport_is_idempotent_detects_changes_and_never_deletes(svc):
    ops = RecordAdmin(svc)
    ops.import_workbook(xlsx(NEW), "n.xlsx", "t", "ADMIN", apply=True)
    n = svc.store.count()
    again = ops.import_workbook(xlsx(NEW), "n.xlsx", "t", "ADMIN", apply=True)
    assert again["unchanged"] == 2 and again["new"] == 0 and again["changed"] == 0
    edited = [row(9001, "عنوان مستورد معدل", "مشرف مستورد", 2022, "بنوك", "طالب مستورد")]
    rep = ops.import_workbook(xlsx(edited), "e.xlsx", "t", "ADMIN", apply=True)
    assert rep["changed"] == 1 and svc.store.count() == n          # 9002 was absent from this file: NOT deleted
    assert svc.engine.search("عنوان مستورد معدل", "title").total == 1
    assert svc.engine.search("عنوان مستورد جديد", "title").total == 0


def test_rejected_rows_are_reported_without_leaking_row_content(svc):
    rows = NEW + [row(9001, "تكرار نفس المعرف", "سر", 2020, "بنوك", "اسم طالب حساس"), row(9003, "", "x")]
    rep = RecordAdmin(svc).import_workbook(xlsx(rows), "r.xlsx", "t", "ADMIN", apply=False)
    assert rep["valid_records"] == 2 and rep["rejected_count"] == 2
    assert {x["excel_row"] for x in rep["rejected"]} == {4, 5}
    assert "اسم طالب حساس" not in str(rep)


@pytest.mark.parametrize("data,name,msg", [
    (b"", "a.xlsx", "empty"),
    (b"not a zip at all", "a.xlsx", "not a valid"),
    (b"PK\x03\x04garbage", "a.xlsx", "not a valid"),
    (b"x" * 10, "a.csv", "Only .xlsx"),
])
def test_file_validation(svc, data, name, msg):
    with pytest.raises(Invalid, match=msg):
        RecordAdmin(svc).import_workbook(data, name, "t", "ADMIN")


def test_missing_required_columns_and_size_and_row_limits(svc):
    ops = RecordAdmin(svc)
    with pytest.raises(Invalid, match="Missing required column"):
        ops.import_workbook(xlsx([{"A": "1"}], cols=["A", "B"]), "x.xlsx", "t", "ADMIN")
    with pytest.raises(Invalid, match="too large"):
        ops.import_workbook(b"PK\x03\x04" + b"0" * (svc.settings.max_upload_mb * 1024 * 1024), "x.xlsx", "t", "ADMIN")
    svc.settings.max_import_rows = 1
    with pytest.raises(Invalid, match="Too many rows"):
        ops.import_workbook(xlsx(NEW), "x.xlsx", "t", "ADMIN")


def test_import_blocked_in_integrated_mode(svc):
    svc.settings.rag_mode = "integrated"
    with pytest.raises(ManagedExternally):
        RecordAdmin(svc).import_workbook(xlsx(NEW), "x.xlsx", "t", "ADMIN")


def test_import_api_auth_limits_and_roundtrip(svc):
    with TestClient(create_app(services=svc)) as c:
        rd, ad = token(svc.settings), token(svc.settings, "rag:read rag:admin", "ADMIN")
        body = xlsx(NEW)
        assert c.post("/admin/import", content=body).status_code == 401
        assert c.post("/admin/import", content=body, headers=rd).status_code == 403
        j = c.post("/admin/import", content=body, headers=ad).json()
        assert j["applied"] is False and j["new"] == 2
        j = c.post("/admin/import?apply=true&filename=n.xlsx", content=body, headers=ad).json()
        assert j["applied"] is True and svc.engine.search("Imported English Title", "title").total == 1
        r = c.post("/admin/import", content=b"x" * (svc.settings.max_upload_mb * 1024 * 1024 + 10), headers=ad)
        assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"
        r = c.post("/admin/import?filename=a.txt", content=body, headers=ad)
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_import_accepts_the_renamed_header_layout(svc):
    """The team's second Project.xlsx renamed 5 columns (' PUBLISHING_DATE', 'SUBJECTS', ...): same data must import."""
    cols = ["BOOK_CODE", "TITLE", "Students", "Supervisor", " PUBLISHING_DATE", " CALL_NUM", " EXTENT", "DIMENSION", "SUBJECTS"]
    row = {"BOOK_CODE": "9001", "TITLE": "عنوان جديد للاستيراد", "Students": "NA", "Supervisor": "NA", " PUBLISHING_DATE": "2014",
           " CALL_NUM": "1", " EXTENT": "9 ص", "DIMENSION": "1*1", "SUBJECTS": "بنوك"}
    r = RecordAdmin(svc).import_workbook(xlsx([row], cols=cols), "x.xlsx", "t", "ADMIN", apply=True)
    assert r["new"] == 1
    rec = svc.engine.get_record("9001")
    assert rec.year == 2014 and rec.subjects == ["بنوك"]
