"""Persistence adapter for records, embeddings, change log, index state, errors and audit trail."""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from typing import Iterable

import numpy as np
from sqlalchemy import and_, delete, exists, func, insert, or_, select, update
from sqlalchemy.engine import Engine

from src.data.normalize_ar import normalize_text
from src.data.schema import Record, Supervisor
from src.storage import db as T


def _row_to_record(row, sups: list, ) -> Record:
    return Record(
        record_id=row.record_id, title=row.title, title_norm=row.title_norm,
        students=json.loads(row.students), supervisors=[Supervisor(key=s.key, name=s.name, raw=s.raw) for s in sups],
        year=row.year, year_raw=row.year_raw, call_number=row.call_number, extent_raw=row.extent_raw,
        pages=row.pages, dimension_raw=row.dimension_raw, subjects=json.loads(row.subjects),
        language=row.language or "unknown", flags=json.loads(row.flags), raw=json.loads(row.raw))


class RecordStore:
    def __init__(self, engine: Engine):
        self.engine = engine
        T.init_db(engine)

    # ---------------------------------------------------------------- records
    def count(self) -> int:
        with self.engine.connect() as c:
            return c.execute(select(func.count()).select_from(T.records)).scalar_one()

    def exists(self, record_id: str) -> bool:
        with self.engine.connect() as c:
            return c.execute(select(T.records.c.record_id).where(T.records.c.record_id == record_id)).first() is not None

    def get_hash(self, record_id: str) -> str | None:
        with self.engine.connect() as c:
            r = c.execute(select(T.records.c.content_hash).where(T.records.c.record_id == record_id)).first()
            return r[0] if r else None

    def get(self, record_id: str) -> Record | None:
        with self.engine.connect() as c:
            row = c.execute(select(T.records).where(T.records.c.record_id == record_id)).first()
            if not row:
                return None
            sups = c.execute(select(T.record_supervisors).where(T.record_supervisors.c.record_id == record_id)
                             .order_by(T.record_supervisors.c.position)).all()
            return _row_to_record(row, sups)

    def all_records(self) -> list[Record]:
        with self.engine.connect() as c:
            rows = c.execute(select(T.records)).all()
            sup_rows = c.execute(select(T.record_supervisors).order_by(
                T.record_supervisors.c.record_id, T.record_supervisors.c.position)).all()
        by: dict[str, list] = {}
        for s in sup_rows:
            by.setdefault(s.record_id, []).append(s)
        return [_row_to_record(r, by.get(r.record_id, [])) for r in rows]

    # ---------------------------------------------------------------- deterministic structured queries (SQL)
    # Every statement is parameterised (SQLAlchemy Core); no user text is ever concatenated into SQL.
    def _where(self, *, years=(), year_from=None, year_to=None, supervisor_keys=(), subject_norms=(), record_ids=None):
        r = T.records
        conds = []
        if years:
            conds.append(r.c.year.in_([int(y) for y in years]))
        if year_from is not None:
            conds.append(r.c.year >= int(year_from))
        if year_to is not None:
            conds.append(r.c.year <= int(year_to))
        for k in supervisor_keys:
            conds.append(exists().where(and_(T.record_supervisors.c.record_id == r.c.record_id, T.record_supervisors.c.key == k)))
        for n in subject_norms:
            conds.append(exists().where(and_(T.record_subjects.c.record_id == r.c.record_id, T.record_subjects.c.subject_norm == n)))
        if record_ids is not None:
            ids = list(record_ids)
            if not ids:
                conds.append(r.c.record_id == None)  # noqa: E711 - impossible condition: an empty id set matches nothing
            else:
                conds.append(r.c.record_id.in_(ids))
        return conds

    @staticmethod
    def _like(term: str) -> str:
        return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

    def topic_counts(self, *, subject_stems: Iterable[str] = (), term_alternatives: Iterable[Iterable[str]] = (), limit: int = 10, **year_filters) -> dict:
        """Deterministic topic-in-period counts from the stored fields (parameterised SQL, no LLM, no similarity).
        * subject_n  : records whose SUBJECT field contains any of ``subject_stems`` (None when no stems were given)
        * mention_n  : records where EVERY term (any of its alternatives) occurs in the TITLE or in a SUBJECT
        * subjects   : per matching subject spelling -> count (transparency about which spellings were included)
        All are restricted by the year filters. ``ids`` is a sample of up to ``limit`` mention records."""
        r, sub = T.records, T.record_subjects
        base = self._where(**year_filters)
        esc = "\\"

        def subj_like(t):
            return exists().where(and_(sub.c.record_id == r.c.record_id, sub.c.subject_norm.like(self._like(t), escape=esc)))

        out: dict = {"subject_n": None, "mention_n": None, "subjects": [], "ids": []}
        with self.engine.connect() as c:
            stems = [x for x in subject_stems if x]
            if stems:
                cond = base + [or_(*[subj_like(t) for t in stems])]
                out["subject_n"] = c.execute(select(func.count()).select_from(r).where(and_(*cond))).scalar_one()
                q = (select(sub.c.subject, func.count().label("n")).select_from(sub.join(r, r.c.record_id == sub.c.record_id))
                     .where(and_(*base, or_(*[sub.c.subject_norm.like(self._like(t), escape=esc) for t in stems])))
                     .group_by(sub.c.subject).order_by(func.count().desc()))
                out["subjects"] = [(a, int(b)) for a, b in c.execute(q).all()]
            alts = [[x for x in alt if x] for alt in term_alternatives]
            alts = [a_ for a_ in alts if a_]
            if alts:
                tcond = [or_(*[or_(r.c.title_norm.like(self._like(t), escape=esc), subj_like(t)) for t in alt]) for alt in alts]
                cond = base + tcond
                out["mention_n"] = c.execute(select(func.count()).select_from(r).where(and_(*cond))).scalar_one()
                out["ids"] = [x[0] for x in c.execute(select(r.c.record_id).where(and_(*cond)).order_by(r.c.record_id).limit(limit)).all()]
        return out

    def count_where(self, **filters) -> int:
        """Exact number of records matching ALL given filters (no filters = every record). Real SQL aggregation."""
        q = select(func.count()).select_from(T.records)
        for c in self._where(**filters):
            q = q.where(c)
        with self.engine.connect() as c:
            return int(c.execute(q).scalar_one())

    def ids_where(self, *, limit: int | None = None, **filters) -> list[str]:
        """Record IDs matching all filters, newest year first (then numeric id)."""
        q = select(T.records.c.record_id, T.records.c.year)
        for c in self._where(**filters):
            q = q.where(c)
        with self.engine.connect() as c:
            rows = c.execute(q).all()
        rows.sort(key=lambda x: (-(x.year or 0), (0, int(x.record_id), "") if x.record_id.isdigit() else (1, 0, x.record_id)))
        ids = [x.record_id for x in rows]
        return ids[:limit] if limit else ids

    def year_counts(self, **filters) -> list[tuple[int, int]]:
        q = select(T.records.c.year, func.count()).where(T.records.c.year.is_not(None)).group_by(T.records.c.year).order_by(T.records.c.year)
        for c in self._where(**filters):
            q = q.where(c)
        with self.engine.connect() as c:
            return [(int(y), int(n)) for y, n in c.execute(q).all()]

    def count_missing_year(self) -> int:
        with self.engine.connect() as c:
            return int(c.execute(select(func.count()).select_from(T.records).where(T.records.c.year.is_(None))).scalar_one())

    def subject_counts(self, limit: int | None = None) -> list[tuple[str, int]]:
        """Records per (normalised) subject, with the most frequent original spelling as label."""
        sub = T.record_subjects
        with self.engine.connect() as c:
            rows = c.execute(select(sub.c.subject_norm, sub.c.subject, func.count().label("n")).group_by(sub.c.subject_norm, sub.c.subject)).all()
        best: dict[str, tuple[str, int, int]] = {}      # norm -> (label, count of that label, total records)
        for norm, label, n in rows:
            cur = best.get(norm)
            if cur is None:
                best[norm] = (label, n, n)
            else:
                best[norm] = (label if n > cur[1] else cur[0], max(n, cur[1]), cur[2] + n)
        out = sorted(((v[0], v[2]) for v in best.values()), key=lambda t: (-t[1], t[0]))
        return out[:limit] if limit else out

    def count_without_subject(self) -> int:
        sub = T.record_subjects
        with self.engine.connect() as c:
            return int(c.execute(select(func.count()).select_from(T.records)
                                 .where(~exists().where(sub.c.record_id == T.records.c.record_id))).scalar_one())

    def supervisor_counts(self, limit: int | None = None) -> list[tuple[str, str, int]]:
        """(canonical key, most frequent display name, number of records), most active first."""
        s = T.record_supervisors
        with self.engine.connect() as c:
            rows = c.execute(select(s.c.key, s.c.name, func.count().label("n")).group_by(s.c.key, s.c.name)).all()
        agg: dict[str, dict] = {}
        for key, name, n in rows:
            a = agg.setdefault(key, {"names": {}, "n": 0})
            a["names"][name] = a["names"].get(name, 0) + n
            a["n"] += n
        out = [(k, sorted(a["names"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0], a["n"]) for k, a in agg.items()]
        out.sort(key=lambda t: (-t[2], t[1]))
        return out[:limit] if limit else out

    def distinct_supervisor_count(self) -> int:
        with self.engine.connect() as c:
            return int(c.execute(select(func.count(func.distinct(T.record_supervisors.c.key)))).scalar_one())

    def distinct_subject_count(self) -> int:
        with self.engine.connect() as c:
            return int(c.execute(select(func.count(func.distinct(T.record_subjects.c.subject_norm)))).scalar_one())

    def year_bounds(self) -> tuple[int, int] | None:
        with self.engine.connect() as c:
            lo, hi = c.execute(select(func.min(T.records.c.year), func.max(T.records.c.year))).one()
        return (int(lo), int(hi)) if lo is not None else None

    def ids(self) -> list[str]:
        with self.engine.connect() as c:
            return [r[0] for r in c.execute(select(T.records.c.record_id))]

    def max_numeric_id(self) -> int:
        mx = 0
        for rid in self.ids():
            if rid.isdigit():
                mx = max(mx, int(rid))
        return mx

    def supervisor_display(self, key: str) -> str | None:
        """Most frequent display name already stored for this canonical key."""
        with self.engine.connect() as c:
            rows = c.execute(select(T.record_supervisors.c.name, func.count().label("n"))
                             .where(T.record_supervisors.c.key == key).group_by(T.record_supervisors.c.name)).all()
        if not rows:
            return None
        return sorted(rows, key=lambda r: (-r.n, r.name))[0].name

    def upsert(self, rec: Record, *, with_log: bool = True) -> tuple[str, int | None]:
        """Insert or replace a record atomically (record + supervisor rows + subject rows + change log).
        Returns (op, change_seq) where op in {'created','updated','unchanged'}."""
        h = rec.content_hash()
        now = datetime.now(timezone.utc)
        vals = dict(
            title=rec.title, title_norm=rec.title_norm, year=rec.year, year_raw=rec.year_raw,
            call_number=rec.call_number, extent_raw=rec.extent_raw, pages=rec.pages,
            dimension_raw=rec.dimension_raw, language=rec.language,
            students=json.dumps(rec.students, ensure_ascii=False), subjects=json.dumps(rec.subjects, ensure_ascii=False),
            flags=json.dumps(rec.flags, ensure_ascii=False), raw=json.dumps(rec.raw, ensure_ascii=False),
            content_hash=h)
        with self.engine.begin() as c:
            old = c.execute(select(T.records.c.content_hash).where(T.records.c.record_id == rec.record_id)).first()
            if old and old[0] == h:
                return "unchanged", None
            if old:
                c.execute(update(T.records).where(T.records.c.record_id == rec.record_id).values(updated_at=now, **vals))
                c.execute(delete(T.record_supervisors).where(T.record_supervisors.c.record_id == rec.record_id))
                c.execute(delete(T.record_subjects).where(T.record_subjects.c.record_id == rec.record_id))
                op = "updated"
            else:
                c.execute(insert(T.records).values(record_id=rec.record_id, created_at=now, updated_at=now, **vals))
                op = "created"
            if rec.supervisors:
                c.execute(insert(T.record_supervisors), [
                    dict(record_id=rec.record_id, position=i, key=s.key, name=s.name, raw=s.raw)
                    for i, s in enumerate(rec.supervisors)])
            if rec.subjects:
                c.execute(insert(T.record_subjects), [
                    dict(record_id=rec.record_id, position=i, subject=s, subject_norm=normalize_text(s))
                    for i, s in enumerate(rec.subjects)])
            seq = None
            if with_log:
                seq = c.execute(insert(T.change_log).values(record_id=rec.record_id, op="upsert")).inserted_primary_key[0]
            return op, seq

    def delete(self, record_id: str) -> int | None:
        with self.engine.begin() as c:
            res = c.execute(delete(T.records).where(T.records.c.record_id == record_id))
            if res.rowcount == 0:
                return None
            # explicit child cleanup keeps behaviour identical when FK cascade is unavailable
            for t in (T.record_supervisors, T.record_subjects, T.embeddings):
                c.execute(delete(t).where(t.c.record_id == record_id))
            return c.execute(insert(T.change_log).values(record_id=record_id, op="delete")).inserted_primary_key[0]

    def clear_all(self) -> None:
        with self.engine.begin() as c:
            for t in (T.embeddings, T.record_supervisors, T.record_subjects, T.records):
                c.execute(delete(t))

    # ---------------------------------------------------------------- change log
    def current_seq(self) -> int:
        with self.engine.connect() as c:
            return c.execute(select(func.coalesce(func.max(T.change_log.c.seq), 0))).scalar_one()

    def changes_since(self, seq: int) -> list[tuple[int, str, str]]:
        with self.engine.connect() as c:
            return [(r.seq, r.record_id, r.op) for r in
                    c.execute(select(T.change_log).where(T.change_log.c.seq > seq).order_by(T.change_log.c.seq))]

    def log_change(self, record_id: str, op: str = "upsert") -> int:
        with self.engine.begin() as c:
            return c.execute(insert(T.change_log).values(record_id=record_id, op=op)).inserted_primary_key[0]

    def compact_change_log(self, keep_last: int = 100000) -> None:
        cur = self.current_seq()
        with self.engine.begin() as c:
            c.execute(delete(T.change_log).where(T.change_log.c.seq <= cur - keep_last))

    # ---------------------------------------------------------------- embeddings
    def put_embedding(self, record_id: str, model_id: str, vec: np.ndarray, text_hash: str) -> None:
        blob = np.asarray(vec, dtype="<f4").tobytes()
        with self.engine.begin() as c:
            ex = c.execute(select(T.embeddings.c.record_id).where(T.embeddings.c.record_id == record_id)).first()
            vals = dict(model_id=model_id, dim=int(len(vec)), vector=blob, text_hash=text_hash,
                        updated_at=datetime.now(timezone.utc))
            if ex:
                c.execute(update(T.embeddings).where(T.embeddings.c.record_id == record_id).values(**vals))
            else:
                c.execute(insert(T.embeddings).values(record_id=record_id, **vals))

    def put_embeddings_bulk(self, items: Iterable[tuple[str, str, np.ndarray, str]]) -> None:
        with self.engine.begin() as c:
            for rid, model_id, vec, th in items:
                c.execute(delete(T.embeddings).where(T.embeddings.c.record_id == rid))
                c.execute(insert(T.embeddings).values(
                    record_id=rid, model_id=model_id, dim=int(len(vec)),
                    vector=np.asarray(vec, dtype="<f4").tobytes(), text_hash=th, updated_at=datetime.now(timezone.utc)))

    def get_embedding(self, record_id: str) -> tuple[str, str, np.ndarray] | None:
        with self.engine.connect() as c:
            r = c.execute(select(T.embeddings).where(T.embeddings.c.record_id == record_id)).first()
        if not r:
            return None
        return r.model_id, r.text_hash, np.frombuffer(r.vector, dtype="<f4").copy()

    def embedding_meta(self) -> dict[str, tuple[str, str]]:
        """record_id -> (model_id, text_hash) without loading vectors."""
        with self.engine.connect() as c:
            return {r.record_id: (r.model_id, r.text_hash) for r in
                    c.execute(select(T.embeddings.c.record_id, T.embeddings.c.model_id, T.embeddings.c.text_hash))}

    def load_all_embeddings(self, model_id: str) -> tuple[list[str], np.ndarray]:
        with self.engine.connect() as c:
            rows = c.execute(select(T.embeddings.c.record_id, T.embeddings.c.vector, T.embeddings.c.dim)
                             .where(T.embeddings.c.model_id == model_id).order_by(T.embeddings.c.record_id)).all()
        if not rows:
            return [], np.zeros((0, 0), dtype=np.float32)
        ids = [r.record_id for r in rows]
        mat = np.vstack([np.frombuffer(r.vector, dtype="<f4") for r in rows]).astype(np.float32)
        return ids, mat

    def embedding_count(self) -> int:
        with self.engine.connect() as c:
            return c.execute(select(func.count()).select_from(T.embeddings)).scalar_one()

    def embedding_models(self) -> Counter:
        with self.engine.connect() as c:
            return Counter({r[0]: r[1] for r in c.execute(
                select(T.embeddings.c.model_id, func.count()).group_by(T.embeddings.c.model_id))})

    # ---------------------------------------------------------------- state / errors / audit
    def set_state(self, key: str, value: str) -> None:
        with self.engine.begin() as c:
            if c.execute(select(T.index_state.c.key).where(T.index_state.c.key == key)).first():
                c.execute(update(T.index_state).where(T.index_state.c.key == key).values(value=value))
            else:
                c.execute(insert(T.index_state).values(key=key, value=value))

    def get_state(self, key: str, default: str | None = None) -> str | None:
        with self.engine.connect() as c:
            r = c.execute(select(T.index_state.c.value).where(T.index_state.c.key == key)).first()
            return r[0] if r else default

    def all_state(self) -> dict[str, str]:
        with self.engine.connect() as c:
            return {r.key: r.value for r in c.execute(select(T.index_state))}

    def log_error(self, record_id: str | None, stage: str, message: str) -> None:
        with self.engine.begin() as c:
            c.execute(insert(T.index_errors).values(record_id=record_id, stage=stage, message=message[:2000]))

    def recent_errors(self, limit: int = 20) -> list[dict]:
        with self.engine.connect() as c:
            rows = c.execute(select(T.index_errors).order_by(T.index_errors.c.id.desc()).limit(limit)).all()
        return [dict(id=r.id, ts=str(r.ts), record_id=r.record_id, stage=r.stage, message=r.message) for r in rows]

    def clear_errors(self, record_id: str | None = None, stage: str | None = None) -> None:
        with self.engine.begin() as c:
            q = delete(T.index_errors)
            if record_id:
                q = q.where(T.index_errors.c.record_id == record_id)
            if stage:
                q = q.where(T.index_errors.c.stage == stage)
            c.execute(q)

    def error_count(self) -> int:
        with self.engine.connect() as c:
            return c.execute(select(func.count()).select_from(T.index_errors)).scalar_one()

    def audit(self, actor: str, role: str | None, action: str, record_id: str | None, details: dict) -> None:
        with self.engine.begin() as c:
            c.execute(insert(T.audit_log).values(
                actor=actor[:200], role=role, action=action, record_id=record_id,
                details=json.dumps(details, ensure_ascii=False)))

    def audit_entries(self, limit: int = 50, record_id: str | None = None) -> list[dict]:
        with self.engine.connect() as c:
            q = select(T.audit_log).order_by(T.audit_log.c.id.desc()).limit(limit)
            if record_id:
                q = q.where(T.audit_log.c.record_id == record_id)
            rows = c.execute(q).all()
        return [dict(id=r.id, ts=str(r.ts), actor=r.actor, role=r.role, action=r.action,
                     record_id=r.record_id, details=json.loads(r.details)) for r in rows]
