"""Dataset statistics for the dashboard, the statistics page and the API.

Every number here is computed from the database (SQL aggregation through ``RecordStore``) or, for students, from the
engine's normalised-name index. Nothing is hard-coded, estimated or copied from a mock-up. Values that cannot be
computed reliably are omitted instead of being approximated.

Caveat that the UI repeats to the user: the dataset has no student/supervisor identifier, so "distinct students" and
"distinct supervisors" are distinct NORMALISED NAMES; two different people with the same name count once, and one
person spelled two ways may count twice.
"""
from __future__ import annotations

from src.retrieval.engine import SearchEngine
from src.storage.record_store import RecordStore


def overview(store: RecordStore, engine: SearchEngine | None = None, *, top_supervisors: int = 10, top_subjects: int = 12) -> dict:
    total = store.count()
    bounds = store.year_bounds()
    per_year = store.year_counts()
    subjects = store.subject_counts()
    sups = store.supervisor_counts()
    out: dict = {
        "total_records": total,
        "records_without_valid_year": store.count_missing_year(),
        "records_without_subject": store.count_without_subject(),
        "year_min": bounds[0] if bounds else None,
        "year_max": bounds[1] if bounds else None,
        "years_with_records": len(per_year),
        "per_year": [{"year": y, "count": n} for y, n in per_year],
        "distinct_subjects": len(subjects),
        "subjects": [{"name": n, "count": c} for n, c in subjects[:top_subjects]],
        "subjects_other_count": sum(c for _, c in subjects[top_subjects:]),
        "distinct_supervisors": len(sups),
        "top_supervisors": [{"key": k, "name": n, "count": c} for k, n, c in sups[:top_supervisors]],
        "distinct_students": None,
        "change_seq": store.current_seq(),
    }
    if engine is not None and engine.s.expose_students:
        engine.refresh()
        out["distinct_students"] = len(engine.by_stu)
    return out


def version_key(store: RecordStore) -> str:
    """Cache key that changes whenever the data changes (record count + change-log position + epoch): cached statistics
    can therefore never be stale after an admin edit, import or rebuild."""
    return f"{store.count()}:{store.current_seq()}:{store.get_state('epoch') or ''}"
