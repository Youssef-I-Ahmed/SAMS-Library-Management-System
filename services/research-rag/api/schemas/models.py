"""Pydantic request/response schemas for the HTTP API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from src.data.schema import RecordIn
from src.rag.answer import AskResponse  # noqa: F401  (re-export)
from src.retrieval.types import SearchResponse, SupervisorBrief  # noqa: F401  (re-export)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[Any] = []
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000, description="Natural-language question (Arabic or English).")
    model_config = {"json_schema_extra": {"examples": [{"question": "ما هي المشروعات التي تناولت جودة الخدمات المصرفية؟"},
                                                       {"question": "Which projects deal with supply chain management?"}]}}


class SearchRequest(BaseModel):
    """JSON body of POST /search. Same semantics (and the same engine) as GET /search; `q` may be empty when filters are given."""
    q: str = Field(default="", max_length=500, description="Query (Arabic or English). Empty + filters = browse.")
    mode: Literal["auto", "all", "title", "supervisor", "student", "subject", "keyword", "semantic", "hybrid"] = Field(
        default="auto", description="title/supervisor/student/subject = structured & EXHAUSTIVE; keyword/semantic/hybrid = ranked (NOT exhaustive); auto/all = tiered")
    year: int | None = Field(default=None, ge=1900, le=2100)
    year_from: int | None = Field(default=None, ge=1900, le=2100)
    year_to: int | None = Field(default=None, ge=1900, le=2100)
    subject: str | None = Field(default=None, max_length=200)
    supervisor: str | None = Field(default=None, max_length=200)
    supervisor_key: str | None = Field(default=None, max_length=300)
    student: str | None = Field(default=None, max_length=200)
    student_key: str | None = Field(default=None, max_length=300)
    call_number_prefix: str | None = Field(default=None, max_length=50, description="Project / call number prefix")
    language: Literal["ar", "en", "mixed"] | None = None
    sort: Literal["relevance", "year_desc", "year_asc", "title", "record_id"] = "relevance"
    page: int = Field(default=1, ge=1, le=100000)
    page_size: int = Field(default=20, ge=1, description="Upper bound is MAX_PAGE_SIZE (default 100)")
    fuzzy: bool = Field(default=False, description="title mode: also return approximate matches (labelled)")
    supervisor_match: Literal["auto", "exact", "partial", "spelling"] = "auto"

    model_config = {"json_schema_extra": {"examples": [
        {"q": "إدارة المخاطر المصرفية", "mode": "hybrid", "page": 1, "page_size": 10},
        {"q": "supply chain", "mode": "keyword", "year_from": 2015, "year_to": 2020, "sort": "year_desc"}]}}


class SupervisorOut(BaseModel):
    key: str
    name: str


class RecordOut(BaseModel):
    record_id: str
    title: str
    students: list[str] = []
    supervisors: list[SupervisorOut] = []
    year: int | None = None
    year_raw: str | None = None
    call_number: str | None = None
    extent: str | None = None
    pages: int | None = None
    dimension: str | None = None
    subjects: list[str] = []
    language: str
    data_quality_flags: list[str] = []
    possible_duplicates: list[dict] = []


class WriteResult(BaseModel):
    record_id: str
    operation: str = Field(description="created | updated | unchanged")
    embedding: str = Field(description="indexed | pending (record is saved and searchable by keyword; embedding retried)")
    possible_duplicates: list[dict] = []
    record: RecordOut


class DeleteResult(BaseModel):
    record_id: str
    deleted: bool


class RecordPatch(BaseModel):
    """Partial update: only provided fields change. record_id is immutable."""
    title: str | None = Field(default=None, max_length=1000)
    students: list[str] | None = None
    supervisors: list[str] | None = None
    year: int | None = None
    call_number: str | None = None
    extent: str | None = None
    dimension: str | None = None
    subjects: list[str] | None = None


class FacetItem(BaseModel):
    name: str
    record_count: int


class SupervisorPage(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    items: list[SupervisorBrief]


__all__ = ["RecordIn", "SearchResponse", "AskResponse"]
