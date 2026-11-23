"""Read-only adapter for the AUTHORITATIVE PostgreSQL (Prisma-managed) in integrated mode.

The RAG service never writes to the source. It reads a stable SQL VIEW agreed with the software team
(see docs/INTEGRATION.md) with these columns:

    record_id, title, students, supervisors, year, call_number, extent, dimension, subjects

`students`, `supervisors`, `subjects` may be text[] arrays or '|'-separated text.
"""
from __future__ import annotations

import re

from sqlalchemy import text

from src.data.schema import Record, build_record
from src.storage.db import make_engine

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_$.\"]*$")


class PostgresSource:
    def __init__(self, url: str, view: str, min_year: int = 1990, max_year: int = 2027, alias_map=None):
        if not url:
            raise ValueError("SOURCE_DATABASE_URL is not configured")
        if not _IDENT.match(view):
            raise ValueError("SOURCE_TABLE must be a plain (optionally schema-qualified) identifier")
        self.engine = make_engine(url)
        self.view, self.min_year, self.max_year, self.alias_map = view, min_year, max_year, alias_map

    def fetch_all(self) -> tuple[list[Record], list[dict]]:
        with self.engine.connect() as c:
            rows = c.execute(text(f"SELECT * FROM {self.view}")).mappings().all()  # noqa: S608 (validated identifier)
        recs, bad = [], []
        for row in rows:
            try:
                recs.append(build_record(
                    record_id=str(row["record_id"]), title=row["title"], students=row.get("students"),
                    supervisors=row.get("supervisors"), year=row.get("year"), call_number=row.get("call_number"),
                    extent=row.get("extent"), dimension=row.get("dimension"), subjects=row.get("subjects"),
                    raw={k: (v if isinstance(v, (str, int, float, list, type(None))) else str(v)) for k, v in dict(row).items()},
                    min_year=self.min_year, max_year=self.max_year, alias_map=self.alias_map))
            except ValueError as e:
                bad.append({"record_id": str(row.get("record_id")), "reason": str(e)})
        return recs, bad

    def fetch_one(self, record_id: str) -> Record | None:
        with self.engine.connect() as c:
            row = c.execute(text(f"SELECT * FROM {self.view} WHERE record_id = :i"), {"i": record_id}).mappings().first()  # noqa: S608
        if not row:
            return None
        return build_record(record_id=str(row["record_id"]), title=row["title"], students=row.get("students"),
                            supervisors=row.get("supervisors"), year=row.get("year"), call_number=row.get("call_number"),
                            extent=row.get("extent"), dimension=row.get("dimension"), subjects=row.get("subjects"),
                            min_year=self.min_year, max_year=self.max_year, alias_map=self.alias_map)
