"""INDEPENDENT ground truth computed straight from the raw Excel file with its own (deliberately separate and
simpler) normalisation code. Nothing here imports the retrieval engine or src.data.normalize_ar, so the
evaluation does not grade the system against itself."""
from __future__ import annotations

import re
from collections import defaultdict

import openpyxl

_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_DIAC = re.compile("[ً-ْـ]")


def norm(s: str) -> str:
    s = _DIAC.sub("", s.translate(_MAP)).lower()
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def person(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^(?:[أا]\s*\.?\s*)?د\s*[/.]\s*", "", raw)
    raw = re.sub(r"^د\s+", "", raw)
    return norm(raw)


def load_oracle(path) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    from src.data.schema import canonical_header
    hdr = [canonical_header(h) for h in rows[0]]
    ix = {h: i for i, h in enumerate(hdr)}
    recs = {}
    for r in rows[1:]:
        if r[0] is None:
            continue
        rid = str(r[ix["BOOK_CODE"]]).strip()
        title = str(r[ix["TITLE"]] or "")
        sup_raw = str(r[ix["Supervisor"]] or "NA")
        sups = []
        if sup_raw.strip().upper() != "NA":
            for part in sup_raw.split("|"):
                for p in re.split(r"\s+(?=(?:[أا]\s*\.?\s*)?د\s*[/.]\s*\S)", part.strip()):
                    k = person(p)
                    if k:
                        sups.append(k)
        stu_raw = str(r[ix["Students"]] or "NA")
        studs = set()
        if stu_raw.strip().upper() != "NA":
            studs = {norm(x) for x in stu_raw.split("|") if norm(x)}
        yr = str(r[ix["WORK | PUBLISHING_DATE"]] or "NA").strip()
        subj = str(r[ix["SUBJECTS_ALL"]] or "NA")
        recs[rid] = {"id": rid, "title": re.sub(r"\s+", " ", title).strip(), "title_norm": norm(title),
                     "sups": set(sups), "year": int(yr) if yr.isdigit() and 1990 <= int(yr) <= 2027 else None,
                     "subjects": {norm(x) for x in subj.split("|") if x.strip().upper() != "NA"},
                     "supervisor_raw": sup_raw, "studs": studs, "students_raw": stu_raw}
    by_sup = defaultdict(set)
    by_title = defaultdict(set)
    by_subject = defaultdict(set)
    by_stu = defaultdict(set)
    raw_names = defaultdict(set)
    for rid, r in recs.items():
        for k in r["sups"]:
            by_sup[k].add(rid)
        for k in r["studs"]:
            by_stu[k].add(rid)
        by_title[r["title_norm"]].add(rid)
        for s in r["subjects"]:
            by_subject[s].add(rid)
    return {"records": recs, "by_sup": by_sup, "by_title": by_title, "by_subject": by_subject, "by_stu": by_stu}
