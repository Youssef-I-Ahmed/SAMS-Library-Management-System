"""Shared request/response models for retrieval (also reused by the FastAPI layer)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["auto", "all", "title", "supervisor", "student", "subject", "keyword", "semantic", "hybrid"]
Sort = Literal["relevance", "year_desc", "year_asc", "title", "record_id"]
MatchType = Literal["exact", "partial", "approximate", "lexical", "semantic", "hybrid"]


class Filters(BaseModel):
    year: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    subject: str | None = None
    supervisor: str | None = Field(default=None, description="Supervisor name (resolved exactly after normalisation).")
    supervisor_key: str | None = Field(default=None, description="Canonical supervisor key (exact), from supervisor candidates.")
    student: str | None = Field(default=None, description="Student name (exact after normalisation, else partial).")
    student_key: str | None = Field(default=None, description="Canonical student key (exact), from student candidates.")
    call_number_prefix: str | None = None
    language: Literal["ar", "en", "mixed"] | None = None

    def is_empty(self) -> bool:
        return not any(v is not None and v != "" for v in self.model_dump().values())


class SpellingVariant(BaseModel):
    name: str
    record_count: int


class SupervisorBrief(BaseModel):
    key: str
    name: str
    record_count: int
    variants: list[SpellingVariant] = Field(
        default=[], description="Original spellings that normalise to this key (only present when more than one). "
                                "They are matched together for search; the originals are preserved on every record.")


class SupervisorResolution(BaseModel):
    status: Literal["exact", "partial", "ambiguous_partial", "none"]
    query_key: str
    matched: list[SupervisorBrief] = []
    similar_not_merged: list[SupervisorBrief] = Field(
        default=[], description="Distinct names with similar spelling. NOT merged automatically (may be a different person).")
    note: str | None = None


class Hit(BaseModel):
    record_id: str
    title: str
    year: int | None = None
    supervisors: list[str] = []
    subjects: list[str] = []
    call_number: str | None = None
    language: str = "unknown"
    match_type: MatchType
    matched_field: str | None = None
    matched_supervisor: str | None = None
    matched_student: str | None = None
    students: list[str] = []
    score: float | None = None
    scores: dict[str, float] = {}


class SearchResponse(BaseModel):
    query: str
    normalized_query: str
    mode_requested: str
    strategy: list[str] = Field(description="Which retrieval strategies produced the results, in priority order.")
    exhaustive: bool = Field(description="True when `total` is the COMPLETE set of matching records "
                                        "(structured search). False when ranked retrieval was cut off at a candidate pool.")
    total: int
    page: int
    page_size: int
    total_pages: int
    sort: str
    notes: list[str] = []
    supervisor_resolution: SupervisorResolution | None = None
    student_resolution: SupervisorResolution | None = Field(default=None, description="Same shape as supervisor_resolution; `matched` lists students (key, name, record_count). Names are never merged.")
    hits: list[Hit]
