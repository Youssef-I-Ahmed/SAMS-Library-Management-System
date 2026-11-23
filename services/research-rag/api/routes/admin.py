from __future__ import annotations

import json
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from starlette.concurrency import run_in_threadpool

from api.errors import ApiError
from api.routes.deps import record_out, svc
from api.schemas.models import DeleteResult, ErrorResponse, RecordPatch, WriteResult
from api.security import Principal, require_admin
from src.admin_ops import AdminError, RecordAdmin
from src.data.schema import RecordIn

log = logging.getLogger("api.admin")
router = APIRouter(prefix="/admin", tags=["admin"], responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}})


def _ops(request: Request) -> RecordAdmin:
    return request.app.state.admin


def _run(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except AdminError as e:
        raise ApiError(e.status, e.code, str(e)) from e


def _wr(request: Request, res: dict) -> WriteResult:
    return WriteResult(record_id=res["record_id"], operation=res["operation"], embedding=res["embedding"],
                       possible_duplicates=res["possible_duplicates"], record=record_out(request, res["record"], dups=res["possible_duplicates"]))


@router.post("/records", status_code=201, response_model=WriteResult, summary="Create a record (standalone mode only)")
def create(request: Request, body: RecordIn, p: Annotated[Principal, Depends(require_admin)],
           reject_duplicates: Annotated[bool, Query(description="409 if an identical/similar title exists")] = False):
    res = _run(_ops(request).create, body, p.subject, p.role, reject_duplicates)
    return _wr(request, res)


@router.put("/records/{record_id}", response_model=WriteResult, summary="Replace a record (full update)")
def replace(request: Request, record_id: Annotated[str, Path(max_length=64)], body: RecordIn, p: Annotated[Principal, Depends(require_admin)]):
    return _wr(request, _run(_ops(request).replace, record_id, body, p.subject, p.role))


@router.patch("/records/{record_id}", response_model=WriteResult, summary="Partially update a record")
def patch(request: Request, record_id: Annotated[str, Path(max_length=64)], body: RecordPatch, p: Annotated[Principal, Depends(require_admin)]):
    return _wr(request, _run(_ops(request).patch, record_id, body.model_dump(exclude_unset=True), p.subject, p.role))


@router.delete("/records/{record_id}", response_model=DeleteResult, summary="Delete a record")
def delete(request: Request, record_id: Annotated[str, Path(max_length=64)], p: Annotated[Principal, Depends(require_admin)]):
    return DeleteResult(**_run(_ops(request).delete, record_id, p.subject, p.role))


@router.get("/index/status", summary="Index status, versions and recent errors")
def index_status(request: Request, _: Annotated[Principal, Depends(require_admin)]):
    s = svc(request)
    return s.indexer.status(s.engine)


@router.post("/index/verify", summary="Consistency check between records, embeddings and in-memory indexes")
def verify(request: Request, _: Annotated[Principal, Depends(require_admin)]):
    s = svc(request)
    return s.indexer.verify_consistency(s.engine)


@router.post("/import", summary="Validated Excel (.xlsx) bulk import: dry run by default; send the file as the raw request body")
async def import_xlsx(request: Request, p: Annotated[Principal, Depends(require_admin)],
                      apply: Annotated[bool, Query(description="false = validate only (dry run)")] = False,
                      filename: Annotated[str, Query(max_length=200)] = "upload.xlsx"):
    s = svc(request)
    limit = s.settings.max_upload_mb * 1024 * 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, "payload_too_large", f"File too large: the limit is {s.settings.max_upload_mb} MB.")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            raise ApiError(413, "payload_too_large", f"File too large: the limit is {s.settings.max_upload_mb} MB.")
    return await run_in_threadpool(_run, _ops(request).import_workbook, body, filename, p.subject, p.role, apply)


@router.post("/index/reindex", summary="Repair/rebuild the index: pending (embed only missing) or full (all records re-embedded)")
def reindex(request: Request, p: Annotated[Principal, Depends(require_admin)],
            scope: Annotated[Literal["pending", "full"], Query()] = "pending"):
    s = svc(request)
    if scope == "pending":
        n = s.indexer.embed_pending()
        s.engine.refresh(force=True)
        s.store.audit(p.subject, p.role, "reindex_pending", None, {"embedded": n})
        return {"scope": scope, "embedded": n}
    recs = s.store.all_records()   # full re-embed of what the store holds (source of truth in standalone mode)
    if s.settings.rag_mode == "integrated":
        from src.storage.pg_source import PostgresSource
        recs, _ = PostgresSource(s.settings.source_database_url, s.settings.source_table,
                                 s.settings.min_valid_year, s.settings.max_valid_year).fetch_all()
    rep = s.indexer.full_rebuild(recs)
    s.engine.load()
    s.store.audit(p.subject, p.role, "reindex_full", None, {k: rep[k] for k in ("records", "embedded", "seconds")})
    return rep


@router.post("/sync", summary="Integrated mode: reconcile with the authoritative PostgreSQL view")
def sync_all(request: Request, p: Annotated[Principal, Depends(require_admin)]):
    s = svc(request)
    if s.settings.rag_mode != "integrated":
        raise ApiError(409, "not_integrated_mode", "RAG_MODE is not 'integrated'")
    from src.storage.pg_source import PostgresSource
    recs, bad = PostgresSource(s.settings.source_database_url, s.settings.source_table,
                               s.settings.min_valid_year, s.settings.max_valid_year).fetch_all()
    rep = s.indexer.sync_from_source(recs)
    s.engine.refresh(force=True)
    rep["source_rows_rejected"] = bad[:50]
    s.store.audit(p.subject, p.role, "sync_all", None, {k: rep[k] for k in ("source_records", "changed", "deleted")})
    return rep


@router.post("/sync/records/{record_id}", summary="Integrated mode: Express calls this after committing a change in PostgreSQL")
def sync_one(request: Request, record_id: Annotated[str, Path(max_length=64)], p: Annotated[Principal, Depends(require_admin)]):
    s = svc(request)
    if s.settings.rag_mode != "integrated":
        raise ApiError(409, "not_integrated_mode", "RAG_MODE is not 'integrated'")
    from src.storage.pg_source import PostgresSource
    rec = PostgresSource(s.settings.source_database_url, s.settings.source_table,
                         s.settings.min_valid_year, s.settings.max_valid_year).fetch_one(record_id)
    if rec is None:
        deleted = s.indexer.delete(record_id)
        s.engine.refresh(force=True)
        s.store.audit(p.subject, p.role, "sync_delete", record_id, {})
        return {"record_id": record_id, "operation": "deleted" if deleted else "absent"}
    res = s.indexer.upsert(rec)
    s.engine.refresh(force=True)
    s.store.audit(p.subject, p.role, "sync_upsert", record_id, {"op": res["op"]})
    return {"record_id": record_id, "operation": res["op"], "embedding_pending": res["embedding_pending"]}


@router.get("/audit", summary="Recent audit-log entries")
def audit(request: Request, _: Annotated[Principal, Depends(require_admin)],
          limit: Annotated[int, Query(ge=1, le=500)] = 50, record_id: Annotated[str | None, Query(max_length=64)] = None):
    return svc(request).store.audit_entries(limit, record_id)
