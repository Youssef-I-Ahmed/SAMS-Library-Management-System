"""Administrative record management (standalone/pilot mode). PostgreSQL stays authoritative in integrated mode."""
from __future__ import annotations

import hashlib
import io
import tempfile
import zipfile
from pathlib import Path

from src.data.loader import SOURCE_COLUMNS, load_alias_map, read_raw_rows, rows_to_records
from src.data.schema import Record, RecordIn, build_record
from src.service import Services


class AdminError(Exception):
    status = 400
    code = "admin_error"


class NotFound(AdminError):
    status, code = 404, "record_not_found"


class Conflict(AdminError):
    status, code = 409, "conflict"


class ManagedExternally(AdminError):
    status, code = 409, "records_managed_externally"


class Invalid(AdminError):
    status, code = 422, "validation_error"


class RecordAdmin:
    def __init__(self, svc: Services):
        self.svc = svc
        self.alias = load_alias_map(svc.settings.supervisor_aliases_path)

    def _guard(self) -> None:
        if self.svc.settings.rag_mode == "integrated":
            raise ManagedExternally("Records are managed in PostgreSQL by the backend; modify them there and call "
                                    "POST /admin/sync (or /admin/sync/records/{id}).")

    def _build(self, rid: str, data: RecordIn, raw_extra: dict | None = None) -> Record:
        s = self.svc.settings
        try:
            rec = build_record(record_id=rid, title=data.title, students=data.students, supervisors=data.supervisors,
                               year=data.year, call_number=data.call_number, extent=data.extent,
                               dimension=data.dimension, subjects=data.subjects,
                               raw={"_source": "admin_api", **(raw_extra or {})}, min_year=s.min_valid_year,
                               max_year=s.max_valid_year, alias_map=self.alias, strict_year=True)
        except ValueError as e:
            raise Invalid(str(e)) from e
        eng = self.svc.engine
        for sv in rec.supervisors:  # reuse the canonical display name when the person is already known
            if sv.key in eng.sup_names:
                sv.name = eng.sup_display(sv.key)
        return rec

    def _next_id(self) -> str:
        return str(self.svc.store.max_numeric_id() + 1)

    def _finish(self, rec: Record, op_label: str, actor: str, role: str | None, before: Record | None) -> dict:
        res = self.svc.indexer.upsert(rec)
        self.svc.engine.refresh(force=True)
        dups = self.svc.engine.possible_duplicates(rec.title, exclude_id=rec.record_id)
        self.svc.store.audit(actor, role, op_label, rec.record_id, {
            "op": res["op"], "title": rec.title, "year": rec.year,
            "supervisors": [s.key for s in rec.supervisors],
            "before_hash": before.content_hash() if before else None, "after_hash": rec.content_hash()})
        return {"record_id": rec.record_id, "operation": res["op"], "embedding": "indexed" if not res["embedding_pending"] else "pending",
                "possible_duplicates": dups, "record": rec}

    def create(self, data: RecordIn, actor: str, role: str | None, reject_duplicates: bool = False) -> dict:
        self._guard()
        rid = data.record_id or self._next_id()
        if self.svc.store.exists(rid):
            raise Conflict(f"record_id {rid!r} already exists")
        rec = self._build(rid, data)
        if reject_duplicates and self.svc.engine.possible_duplicates(rec.title):
            raise Conflict("a record with the same or a very similar title already exists "
                           "(retry with reject_duplicates=false to create anyway)")
        return self._finish(rec, "create", actor, role, None)

    def replace(self, record_id: str, data: RecordIn, actor: str, role: str | None) -> dict:
        self._guard()
        before = self.svc.store.get(record_id)
        if before is None:
            raise NotFound(f"record {record_id!r} not found")
        if data.record_id and data.record_id != record_id:
            raise Invalid("record_id in the body must match the URL (record IDs are immutable)")
        return self._finish(self._build(record_id, data), "update", actor, role, before)

    def patch(self, record_id: str, changes: dict, actor: str, role: str | None) -> dict:
        self._guard()
        before = self.svc.store.get(record_id)
        if before is None:
            raise NotFound(f"record {record_id!r} not found")
        if "record_id" in changes and changes["record_id"] not in (None, record_id):
            raise Invalid("record_id is immutable")
        cur = {"title": before.title, "students": before.students, "supervisors": [s.name for s in before.supervisors],
               "year": before.year, "call_number": before.call_number, "extent": before.extent_raw,
               "dimension": before.dimension_raw, "subjects": before.subjects}
        cur.update({k: v for k, v in changes.items() if k in cur})
        try:
            data = RecordIn(record_id=record_id, **cur)
        except ValueError as e:
            raise Invalid(str(e)) from e
        return self._finish(self._build(record_id, data), "update", actor, role, before)

    def delete(self, record_id: str, actor: str, role: str | None) -> dict:
        self._guard()
        before = self.svc.store.get(record_id)
        if before is None:
            raise NotFound(f"record {record_id!r} not found")
        self.svc.indexer.delete(record_id)
        self.svc.engine.refresh(force=True)
        self.svc.store.audit(actor, role, "delete", record_id, {"title": before.title, "before_hash": before.content_hash()})
        return {"record_id": record_id, "deleted": True}


    # ------------------------------------------------------------------ bulk Excel import (validated, dry-run first)
    def import_workbook(self, data: bytes, filename: str, actor: str, role: str | None, apply: bool = False) -> dict:
        """Validate (and optionally apply) an uploaded .xlsx in the source layout.

        Safety: size/extension/signature/zip-bomb/row-count limits; only the columns of the agreed layout are read;
        records absent from the file are NEVER deleted; duplicates inside the file are reported (first one wins);
        the report contains counts and ids only - no student or supervisor names. ``apply=False`` is a dry run.
        """
        self._guard()
        s = self.svc.settings
        if not filename.lower().endswith(".xlsx"):
            raise Invalid("Only .xlsx files are accepted.")
        if not data:
            raise Invalid("The uploaded file is empty.")
        if len(data) > s.max_upload_mb * 1024 * 1024:
            raise Invalid(f"File too large: the limit is {s.max_upload_mb} MB.")
        if data[:4] != b"PK\x03\x04":
            raise Invalid("The file is not a valid .xlsx workbook.")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if sum(i.file_size for i in z.infolist()) > 25 * s.max_upload_mb * 1024 * 1024:
                    raise Invalid("The workbook expands to an unreasonable size and was rejected.")
                if "xl/workbook.xml" not in z.namelist():
                    raise Invalid("The file is not an Excel workbook.")
        except zipfile.BadZipFile as e:
            raise Invalid("The file is not a valid .xlsx workbook.") from e
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "upload.xlsx"
            path.write_bytes(data)
            try:
                header, rows, sheet = read_raw_rows(path)
            except ValueError as e:  # missing columns: say which (a silent import would lose data)
                raise Invalid(f"{e}. Expected the layout: " + ", ".join(SOURCE_COLUMNS)) from e
            except Exception as e:  # noqa: BLE001 - corrupt workbook, empty sheet ...
                raise Invalid(f"The workbook could not be read: {type(e).__name__}.") from e
        if len(rows) > s.max_import_rows:
            raise Invalid(f"Too many rows ({len(rows)}); the limit is {s.max_import_rows}.")
        recs, rejected = rows_to_records(rows, min_year=s.min_valid_year, max_year=s.max_valid_year, alias_map=self.alias)
        store = self.svc.store
        new, changed, same = [], [], []
        for r in recs:
            old = store.get(r.record_id)
            (new if old is None else same if old.content_hash() == r.content_hash() else changed).append(r.record_id)
        report = {"applied": bool(apply), "filename_sha256": hashlib.sha256(data).hexdigest(), "sheet": sheet,
                  "rows_in_file": len(rows), "valid_records": len(recs), "new": len(new), "changed": len(changed),
                  "unchanged": len(same), "rejected": [{"excel_row": x["excel_row"], "reason": x["reason"]} for x in rejected[:50]],
                  "rejected_count": len(rejected), "sample_new_ids": new[:10], "sample_changed_ids": changed[:10],
                  "note": "Records not present in the file are never deleted by an import."}
        if apply:
            problems = 0
            for r in recs:
                res = self.svc.indexer.upsert(r)
                problems += bool(res.get("embedding_pending"))
            self.svc.engine.refresh(force=True)
            report["embedding_pending"] = problems
            store.audit(actor, role, "import_xlsx", None, {k: report[k] for k in (
                "filename_sha256", "rows_in_file", "valid_records", "new", "changed", "unchanged", "rejected_count")})
        return report
