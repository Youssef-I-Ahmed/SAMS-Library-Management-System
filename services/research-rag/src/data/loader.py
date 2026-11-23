"""Read Project.xlsx (read-only) into normalised Records. The source file is never modified."""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

import openpyxl

from src.data.schema import SOURCE_COLUMNS, Record, build_record, canonical_header, missing_source_columns


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_alias_map(path: Path | None) -> dict[str, str]:
    """Optional, human-confirmed supervisor merges: CSV with columns alias_key,canonical_key."""
    if not path or not Path(path).exists():
        return {}
    out = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            a, c = (row.get("alias_key") or "").strip(), (row.get("canonical_key") or "").strip()
            if a and c:
                out[a] = c
    return out


def read_raw_rows(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    """Return (header, rows-as-dicts-of-strings, sheet_name). All cells read as text."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = [canonical_header(h) for h in next(it)]
    rows = []
    for r in it:
        if r is None or all(c is None or str(c).strip() == "" for c in r):
            continue
        rows.append({h: ("" if c is None else str(c)) for h, c in zip(header, r)})
    name = ws.title
    wb.close()
    gone = missing_source_columns(header)
    if gone:
        raise ValueError("Missing required column(s): " + ", ".join(gone) + " (found: " + ", ".join(header) + ")")
    return header, rows, name


def rows_to_records(rows: list[dict[str, str]], *, min_year=1990, max_year=2027,
                    alias_map: dict[str, str] | None = None) -> tuple[list[Record], list[dict]]:
    """Convert raw rows to Records. Returns (records, rejected). Rejected = rows that cannot be
    indexed at all (empty id/title or duplicate id); they are reported, never silently dropped."""
    records: list[Record] = []
    rejected: list[dict] = []
    seen_ids: dict[str, int] = {}
    for i, row in enumerate(rows, start=2):  # excel row number
        kw = {SOURCE_COLUMNS[c]: row.get(c) for c in SOURCE_COLUMNS}
        try:
            rec = build_record(
                record_id=kw["record_id"] or "", title=kw["title"] or "", students=kw["students"],
                supervisors=kw["supervisors"], year=kw["year"], call_number=kw["call_number"],
                extent=kw["extent"], dimension=kw["dimension"], subjects=kw["subjects"], raw=row,
                min_year=min_year, max_year=max_year, alias_map=alias_map)
        except ValueError as e:
            rejected.append({"excel_row": i, "reason": str(e), "row": row})
            continue
        if rec.record_id in seen_ids:
            rejected.append({"excel_row": i, "reason": f"duplicate record_id (first seen at row {seen_ids[rec.record_id]})", "row": row})
            continue
        seen_ids[rec.record_id] = i
        records.append(rec)
    return records, rejected
