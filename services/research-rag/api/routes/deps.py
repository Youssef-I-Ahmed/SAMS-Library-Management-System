from __future__ import annotations

from fastapi import Request

from api.schemas.models import RecordOut, SupervisorOut
from src.data.schema import Record


def svc(request: Request):
    return request.app.state.services


def record_out(request: Request, rec: Record, with_duplicates: bool = False, dups: list | None = None) -> RecordOut:
    s = svc(request)
    e = s.engine
    return RecordOut(
        record_id=rec.record_id, title=rec.title,
        students=rec.students if s.settings.expose_students else [],
        supervisors=[SupervisorOut(key=x.key, name=e.sup_display(x.key)) for x in rec.supervisors],
        year=rec.year, year_raw=rec.year_raw, call_number=rec.call_number, extent=rec.extent_raw, pages=rec.pages,
        dimension=rec.dimension_raw, subjects=rec.subjects, language=rec.language, data_quality_flags=rec.flags,
        possible_duplicates=(dups if dups is not None else (e.possible_duplicates(rec.title, exclude_id=rec.record_id) if with_duplicates else [])))
