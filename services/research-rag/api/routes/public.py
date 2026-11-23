from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.errors import ApiError
from api.routes.deps import record_out, svc
from api.schemas.models import (AskRequest, AskResponse, ErrorResponse, FacetItem, RecordOut, SearchRequest, SearchResponse,
                                SupervisorPage)
from api.security import Principal, require_read
from src.retrieval.types import Filters

router = APIRouter()
ERR = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


def _run_search(request, q, mode, year, year_from, year_to, subject, supervisor, supervisor_key, student, student_key,
                call_number_prefix, language, sort, page, page_size, fuzzy, supervisor_match):
    """Single implementation behind GET /search and POST /search (no duplicated retrieval logic)."""
    s = svc(request)
    if page_size > s.settings.max_page_size:
        raise ApiError(422, "validation_error", f"page_size must be <= {s.settings.max_page_size}")
    if year_from and year_to and year_from > year_to:
        raise ApiError(422, "validation_error", "year_from must be <= year_to")
    f = Filters(year=year, year_from=year_from, year_to=year_to, subject=subject, supervisor=supervisor,
                supervisor_key=supervisor_key, student=student, student_key=student_key, call_number_prefix=call_number_prefix, language=language)
    return s.engine.search(q, mode, f, sort, page, page_size, fuzzy, supervisor_match)


@router.get("/health", tags=["ops"], summary="Liveness probe (no dependencies checked)")
def health(request: Request):
    return {"status": "ok", "version": svc(request).settings.app_version}


@router.get("/ready", tags=["ops"], summary="Readiness: database, index and (optional) LLM configuration")
def ready(request: Request):
    s = svc(request)
    checks: dict = {}
    try:
        with s.store.engine.connect() as c:
            c.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:  # noqa: BLE001
        checks["database"] = False
    st = s.engine.stats() if checks["database"] else {}
    checks["index_loaded"] = bool(st.get("records"))
    checks["embeddings_complete"] = st.get("pending_embeddings", 1) == 0 and bool(st.get("dense_vectors"))
    checks["llm_configured"] = s.settings.llm_provider != "none"
    checks["auth_configured"] = bool(s.settings.service_jwt_secret) and s.settings.service_jwt_secret != "change-me"
    required = checks["database"] and checks["index_loaded"]
    from src.retrieval.embeddings import describe_embedder
    emb = describe_embedder(s.engine.embedder, s.settings.embedding_backend, getattr(s.engine.embedder, "fallback_reason", None))
    body = {"status": "ready" if required else "not_ready", "checks": checks,
            "retrieval_only": s.settings.llm_provider == "none", "llm_provider": s.settings.llm_provider,
            "embedding": emb,
            "records": st.get("records"), "pending_embeddings": st.get("pending_embeddings")}
    return JSONResponse(body, status_code=200 if required else 503)


@router.get("/search", response_model=SearchResponse, responses=ERR, tags=["search"],
            summary="Structured, keyword, semantic and hybrid search with filters, sorting and pagination")
def search(
    request: Request, _: Annotated[Principal, Depends(require_read)],
    q: Annotated[str, Query(max_length=500, description="Query. Empty + filters = browse.")] = "",
    mode: Annotated[Literal["auto", "all", "title", "supervisor", "student", "subject", "keyword", "semantic", "hybrid"], Query(
        description="title/supervisor/student/subject = structured & EXHAUSTIVE; keyword/semantic/hybrid = ranked (NOT exhaustive); auto/all = tiered")] = "auto",
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    year_from: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    year_to: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    subject: Annotated[str | None, Query(max_length=200)] = None,
    supervisor: Annotated[str | None, Query(max_length=200)] = None,
    supervisor_key: Annotated[str | None, Query(max_length=300)] = None,
    student: Annotated[str | None, Query(max_length=200)] = None,
    student_key: Annotated[str | None, Query(max_length=300)] = None,
    call_number_prefix: Annotated[str | None, Query(max_length=50)] = None,
    language: Annotated[Literal["ar", "en", "mixed"] | None, Query()] = None,
    sort: Annotated[Literal["relevance", "year_desc", "year_asc", "title", "record_id"], Query()] = "relevance",
    page: Annotated[int, Query(ge=1, le=100000)] = 1,
    page_size: Annotated[int, Query(ge=1)] = 20,
    fuzzy: Annotated[bool, Query(description="title mode: also return approximate matches (labelled)")] = False,
    supervisor_match: Annotated[Literal["auto", "exact", "partial", "spelling"], Query(description="student mode: `spelling` = only records whose ORIGINAL spelling equals the query (after whitespace collapse)")] = "auto",
):
    return _run_search(request, q, mode, year, year_from, year_to, subject, supervisor, supervisor_key, student,
                       student_key, call_number_prefix, language, sort, page, page_size, fuzzy, supervisor_match)


@router.post("/search", response_model=SearchResponse, responses=ERR, tags=["search"],
             summary="Same as GET /search but with a JSON body (recommended for Arabic text and long queries)")
def search_post(request: Request, body: SearchRequest, _: Annotated[Principal, Depends(require_read)]):
    return _run_search(request, body.q, body.mode, body.year, body.year_from, body.year_to, body.subject, body.supervisor,
                       body.supervisor_key, body.student, body.student_key, body.call_number_prefix, body.language,
                       body.sort, body.page, body.page_size, body.fuzzy, body.supervisor_match)


@router.post("/ask", response_model=AskResponse, responses=ERR, tags=["rag"],
             summary="Grounded question answering with evidence policy (abstains when the records cannot support an answer)")
def ask(request: Request, body: AskRequest, _: Annotated[Principal, Depends(require_read)]):
    s = svc(request)
    if len(body.question) > s.settings.ask_max_question_chars:
        raise ApiError(422, "validation_error", "question too long")
    return request.app.state.answers.ask(body.question)


@router.get("/records/{record_id}", response_model=RecordOut, responses={**ERR, 404: {"model": ErrorResponse}}, tags=["records"])
def get_record(request: Request, record_id: Annotated[str, Path(max_length=64)], _: Annotated[Principal, Depends(require_read)]):
    rec = svc(request).engine.get_record(record_id)
    if rec is None:
        raise ApiError(404, "record_not_found", f"record {record_id!r} not found")
    return record_out(request, rec, with_duplicates=True)


@router.get("/supervisors", response_model=SupervisorPage, responses=ERR, tags=["supervisors"],
            summary="List canonical supervisors with record counts (name search is partial, for discovery)")
def supervisors(request: Request, _: Annotated[Principal, Depends(require_read)],
                q: Annotated[str | None, Query(max_length=200)] = None,
                page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 50):
    return svc(request).engine.list_supervisors(q, page, page_size)


@router.get("/supervisors/records", response_model=SearchResponse, responses=ERR, tags=["supervisors"],
            summary="COMPLETE, paginated list of all records of a supervisor (exact match by name or canonical key)")
def supervisor_records(request: Request, _: Annotated[Principal, Depends(require_read)],
                       name: Annotated[str | None, Query(max_length=200)] = None,
                       key: Annotated[str | None, Query(max_length=300)] = None,
                       sort: Annotated[Literal["relevance", "year_desc", "year_asc", "title", "record_id"], Query()] = "year_desc",
                       page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 50,
                       include_partial: Annotated[bool, Query(description="when no exact match, return partial matches (labelled approximate)")] = False):
    if bool(name) == bool(key):
        raise ApiError(422, "validation_error", "provide exactly one of `name` or `key`")
    e = svc(request).engine
    f = Filters(supervisor_key=key)
    if key and e.resolve_supervisor(key=key).status == "none":
        raise ApiError(404, "supervisor_not_found", f"unknown supervisor key {key!r}")
    return e.search(name or key, "supervisor", f, sort, page, page_size, supervisor_match="auto" if include_partial else "exact")


@router.get("/students", response_model=SupervisorPage, responses=ERR, tags=["students"],
            summary="List distinct students (normalised full names; never merged) with record counts; `q` = partial name")
def students(request: Request, _: Annotated[Principal, Depends(require_read)],
             q: Annotated[str | None, Query(max_length=200)] = None,
             page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 50):
    return svc(request).engine.list_students(q, page, page_size)


@router.get("/students/records", response_model=SearchResponse, responses={**ERR, 404: {"model": ErrorResponse}}, tags=["students"],
            summary="COMPLETE, paginated list of all records of a student (exact match by name or canonical key)")
def student_records(request: Request, _: Annotated[Principal, Depends(require_read)],
                    name: Annotated[str | None, Query(max_length=200)] = None,
                    key: Annotated[str | None, Query(max_length=300)] = None,
                    sort: Annotated[Literal["relevance", "year_desc", "year_asc", "title", "record_id"], Query()] = "year_desc",
                    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 50,
                    include_partial: Annotated[bool, Query(description="when no exact match, return partial matches (labelled approximate)")] = False,
                    spelling_exact: Annotated[bool, Query(description="only records whose ORIGINAL spelling equals `name` (name mode only)")] = False):
    if bool(name) == bool(key):
        raise ApiError(422, "validation_error", "provide exactly one of `name` or `key`")
    if spelling_exact and not name:
        raise ApiError(422, "validation_error", "`spelling_exact` requires `name`")
    e = svc(request).engine
    if key and e.resolve_student(key=key).status == "none":
        raise ApiError(404, "student_not_found", f"unknown student key {key!r}")
    return e.search(name or key, "student", Filters(student_key=key), sort, page, page_size,
                    supervisor_match="spelling" if spelling_exact else ("auto" if include_partial else "exact"))


@router.get("/facets/subjects", response_model=list[FacetItem], responses=ERR, tags=["facets"])
def facet_subjects(request: Request, _: Annotated[Principal, Depends(require_read)]):
    return svc(request).engine.list_subjects()


@router.get("/facets/years", tags=["facets"], responses=ERR)
def facet_years(request: Request, _: Annotated[Principal, Depends(require_read)]):
    return svc(request).engine.list_years()
