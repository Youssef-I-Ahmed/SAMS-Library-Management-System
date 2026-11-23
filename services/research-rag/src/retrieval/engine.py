"""Search engine: structured (exact/partial) search + BM25 + dense + RRF hybrid, with filters,
sorting, pagination and an incremental, change-log driven in-memory index.

Design rules
  * Structured searches (title / supervisor / subject) use normalised-key lookups and return the COMPLETE
    matching set with a real total (``exhaustive=True``).
  * Ranked retrieval (keyword / semantic / hybrid) is cut at ``candidate_pool`` and is flagged
    ``exhaustive=False`` - it must never be presented as a complete list.
  * Filters are applied BEFORE ranking (pre-filtering), never as a post-filter on a top-k list.
"""
from __future__ import annotations

import math
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field as dc_field

from rapidfuzz import fuzz, process

from src.config.settings import Settings
from src.data.normalize_ar import normalize_text, person_key, search_terms, stem_token, strip_person_title
from src.data.schema import Record
from src.retrieval.bm25 import BM25Index
from src.retrieval.dense import DenseIndex
from src.retrieval.embeddings import Embedder
from src.retrieval.types import (Filters, Hit, SearchResponse, SpellingVariant, SupervisorBrief, SupervisorResolution)
from src.storage.record_store import RecordStore


NAME_ONLY_NOTE = ("Matching is by name only: the dataset has no student/supervisor identifier, so records listed under one "
                  "name may belong to different people who share (or spell alike) that name.")


def tok_match(q: str, t: str) -> bool:
    """Query token q matches name token t: equal, or q is a PREFIX of t when q has >= 2 characters
    (a single letter never matches by prefix - it would match thousands of unrelated names)."""
    return t == q or (len(q) >= 2 and t.startswith(q))


def _variants(names: "Counter") -> list[SpellingVariant]:
    if len(names) <= 1:
        return []
    return [SpellingVariant(name=n, record_count=c) for n, c in sorted(names.items(), key=lambda kv: (-kv[1], kv[0]))]


def _id_sort_key(rid: str):
    return (0, int(rid), "") if rid.isdigit() else (1, 0, rid)


@dataclass
class Cand:
    rid: str
    match_type: str
    field_name: str | None = None
    matched_supervisor: str | None = None
    matched_student: str | None = None
    score: float | None = None
    scores: dict = dc_field(default_factory=dict)
    tier: int = 0


class SearchEngine:
    def __init__(self, store: RecordStore, embedder: Embedder, settings: Settings):
        self.store, self.embedder, self.s = store, embedder, settings
        self.lock = threading.RLock()
        self._reset()
        self._last_check = 0.0

    # ------------------------------------------------------------------ build / refresh
    def _reset(self) -> None:
        self.records: dict[str, Record] = {}
        self.by_title: dict[str, set[str]] = defaultdict(set)
        self.by_sup: dict[str, set[str]] = defaultdict(set)
        self.sup_names: dict[str, Counter] = defaultdict(Counter)
        self.sup_orig: dict[str, Counter] = defaultdict(Counter)   # ORIGINAL spellings (title stripped) per canonical key
        self.by_stu: dict[str, set[str]] = defaultdict(set)
        self.stu_names: dict[str, Counter] = defaultdict(Counter)
        self.by_subject: dict[str, set[str]] = defaultdict(set)
        self.subject_names: dict[str, Counter] = defaultdict(Counter)
        self.by_year: dict[int, set[str]] = defaultdict(set)
        self.bm25 = BM25Index()
        self.dense = DenseIndex()
        self.seq = 0
        self.epoch: str | None = None
        self.pending_embeddings: set[str] = set()

    def load(self) -> None:
        """Full (re)load of in-memory structures from the persistent store."""
        with self.lock:
            self._reset()
            self.embedder.set_state(self.store.get_state("embedder_state"))
            seq = self.store.current_seq()
            epoch = self.store.get_state("epoch")
            for rec in self.store.all_records():
                self._index_record(rec)
            self._load_vectors()
            self.seq = seq
            self.epoch = epoch
            self._last_check = time.monotonic()

    def _load_vectors(self) -> None:
        meta = self.store.embedding_meta()
        ids, mat = self.store.load_all_embeddings(self.embedder.model_id)
        keep_i = []
        for n, rid in enumerate(ids):
            rec = self.records.get(rid)
            if rec and meta[rid][1] == rec.embed_hash(self.embedder.model_id):
                keep_i.append(n)
        self.dense = DenseIndex()
        if keep_i:
            self.dense.load([ids[n] for n in keep_i], mat[keep_i])
        self.pending_embeddings = {r for r in self.records if r not in self.dense.row}

    def refresh(self, force: bool = False) -> int:
        """Apply store changes made since the last sync (by this or ANOTHER process). Returns #changes."""
        now = time.monotonic()
        if not force and now - self._last_check < self.s.refresh_interval_s:
            return 0
        with self.lock:
            self._last_check = now
            cur = self.store.current_seq()
            epoch = self.store.get_state("epoch")
            if epoch != self.epoch and self.epoch is not None:  # full rebuild / bulk embedding by another process
                self.load()
                return -1
            if cur == self.seq:
                return 0
            if cur < self.seq:  # log was reset (e.g. full rebuild) -> reload everything
                self.load()
                return -1
            changes = self.store.changes_since(self.seq)
            latest: dict[str, str] = {}
            for _, rid, op in changes:
                latest[rid] = op
            self.embedder.set_state(self.store.get_state("embedder_state"))
            for rid, op in latest.items():
                self._unindex_record(rid)
                if op == "upsert":
                    rec = self.store.get(rid)
                    if rec:
                        self._index_record(rec)
                        self._load_vector_for(rec)
            self.seq = cur
            return len(changes)

    def _load_vector_for(self, rec: Record) -> None:
        got = self.store.get_embedding(rec.record_id)
        if got and got[0] == self.embedder.model_id and got[1] == rec.embed_hash(self.embedder.model_id):
            self.dense.upsert(rec.record_id, got[2])
            self.pending_embeddings.discard(rec.record_id)
        else:
            self.dense.remove(rec.record_id)
            self.pending_embeddings.add(rec.record_id)

    def _index_record(self, rec: Record) -> None:
        self.records[rec.record_id] = rec
        self.by_title[rec.title_norm].add(rec.record_id)
        for s in rec.supervisors:
            self.by_sup[s.key].add(rec.record_id)
            self.sup_names[s.key][s.name] += 1
            self.sup_orig[s.key][" ".join(strip_person_title(s.raw or s.name).split())] += 1
        for st_name in rec.students:
            k = normalize_text(st_name)
            if k:
                self.by_stu[k].add(rec.record_id)
                self.stu_names[k][st_name] += 1
        for sub in rec.subjects:
            n = normalize_text(sub)
            self.by_subject[n].add(rec.record_id)
            self.subject_names[n][sub] += 1
        if rec.year is not None:
            self.by_year[rec.year].add(rec.record_id)
        self.bm25.add(rec.record_id, " ".join([rec.title] + rec.subjects))
        self.pending_embeddings.add(rec.record_id)

    def _unindex_record(self, rid: str) -> None:
        rec = self.records.pop(rid, None)
        self.bm25.remove(rid)
        self.dense.remove(rid)
        self.pending_embeddings.discard(rid)
        if not rec:
            return
        self.by_title[rec.title_norm].discard(rid)
        if not self.by_title[rec.title_norm]:
            del self.by_title[rec.title_norm]
        for s in rec.supervisors:
            self.by_sup[s.key].discard(rid)
            self.sup_names[s.key][s.name] -= 1
            if self.sup_names[s.key][s.name] <= 0:
                del self.sup_names[s.key][s.name]
            o = " ".join(strip_person_title(s.raw or s.name).split())
            if self.sup_orig[s.key][o] > 0:
                self.sup_orig[s.key][o] -= 1
                if self.sup_orig[s.key][o] <= 0:
                    del self.sup_orig[s.key][o]
            if not self.by_sup[s.key]:
                del self.by_sup[s.key]
                self.sup_names.pop(s.key, None)
                self.sup_orig.pop(s.key, None)
        for st_name in rec.students:
            k = normalize_text(st_name)
            if k in self.by_stu:
                self.by_stu[k].discard(rid)
                self.stu_names[k][st_name] -= 1
                if self.stu_names[k][st_name] <= 0:
                    del self.stu_names[k][st_name]
                if not self.by_stu[k]:
                    del self.by_stu[k]
                    self.stu_names.pop(k, None)
        for sub in rec.subjects:
            n = normalize_text(sub)
            self.by_subject[n].discard(rid)
            self.subject_names[n][sub] -= 1
            if self.subject_names[n][sub] <= 0:
                del self.subject_names[n][sub]
            if not self.by_subject[n]:
                del self.by_subject[n]
                self.subject_names.pop(n, None)
        if rec.year is not None:
            self.by_year[rec.year].discard(rid)
            if not self.by_year[rec.year]:
                del self.by_year[rec.year]

    # ------------------------------------------------------------------ helpers
    def sup_display(self, key: str) -> str:
        c = self.sup_names.get(key)
        return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if c else key

    def _brief(self, key: str) -> SupervisorBrief:
        return SupervisorBrief(key=key, name=self.sup_display(key), record_count=len(self.by_sup.get(key, ())),
                               variants=_variants(self.sup_orig.get(key, Counter())))

    def stu_display(self, key: str) -> str:
        c = self.stu_names.get(key)
        return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if c else key

    def _stu_brief(self, key: str) -> SupervisorBrief:
        return SupervisorBrief(key=key, name=self.stu_display(key), record_count=len(self.by_stu.get(key, ())),
                               variants=_variants(self.stu_names.get(key, Counter())))

    def _hit(self, c: Cand) -> Hit:
        r = self.records[c.rid]
        return Hit(record_id=r.record_id, title=r.title, year=r.year,
                   supervisors=[self.sup_display(s.key) for s in r.supervisors], subjects=r.subjects,
                   call_number=r.call_number, language=r.language, match_type=c.match_type,  # type: ignore[arg-type]
                   matched_field=c.field_name, matched_supervisor=c.matched_supervisor, matched_student=c.matched_student,
                   students=list(r.students),
                   score=None if c.score is None else round(c.score, 6), scores={k: round(v, 6) for k, v in c.scores.items()})

    # ------------------------------------------------------------------ filters
    def resolve_supervisor(self, query: str | None = None, key: str | None = None) -> SupervisorResolution:
        """Resolve a supervisor query to canonical people WITHOUT merging distinct names.

        exact   : normalised key equality (after stripping د/ أ.د/ titles, alef/ya/ta-marbuta folding)
        partial : every query token is a token-prefix of the candidate's name (reported as approximate)
        similar_not_merged : spelling-similar but different keys; shown as a hint only
        """
        if key:
            if key in self.by_sup:
                return SupervisorResolution(status="exact", query_key=key, matched=[self._brief(key)])
            return SupervisorResolution(status="none", query_key=key, note="Unknown supervisor_key.")
        qkey = person_key(query)
        if not qkey:
            return SupervisorResolution(status="none", query_key="")
        similar = []
        for k in self.by_sup:
            if k != qkey and fuzz.token_sort_ratio(qkey, k) >= 85:
                similar.append(k)
        similar_b = sorted((self._brief(k) for k in similar), key=lambda b: -b.record_count)[:5]
        if qkey in self.by_sup:
            note = None
            if similar_b:
                note = ("Names with similar spelling exist and were NOT merged (they may be spelling variants "
                        "of the same person or different people). Review `similar_not_merged`.")
            return SupervisorResolution(status="exact", query_key=qkey, matched=[self._brief(qkey)],
                                        similar_not_merged=similar_b, note=note)
        qt = qkey.split()
        cands = []
        for k in self.by_sup:
            kt = k.split()
            if all(any(tok_match(q, t) for t in kt) for q in qt):
                cands.append(k)
        cands.sort(key=lambda k: (-len(self.by_sup[k]), k))
        if not cands:
            return SupervisorResolution(status="none", query_key=qkey, similar_not_merged=similar_b,
                                        note="No supervisor matches this name.")
        status = "partial" if len(cands) == 1 else "ambiguous_partial"
        note = ("Partial (approximate) match only." if status == "partial" else
                "Several different supervisors match this partial name; results are labelled per supervisor. "
                "Pass supervisor_key to select one person.")
        return SupervisorResolution(status=status, query_key=qkey, matched=[self._brief(k) for k in cands],
                                    similar_not_merged=similar_b, note=note)

    def resolve_student(self, query: str | None = None, key: str | None = None) -> SupervisorResolution:
        """Resolve a student-name query to distinct people WITHOUT merging similar names.
        When EXPOSE_STUDENTS=false / HIDE_STUDENT_NAMES=true, student lookup is disabled everywhere (a name lookup would
        reveal which titles a named student wrote even if the name itself is not printed).

        exact   : normalised full-name equality (spacing / diacritics / alef-ya-ta-marbuta folding)
        partial : every query token is a token-prefix of the candidate's name (approximate)
        Different spellings are different keys; spelling-similar names are only listed as `similar_not_merged`.
        """
        if not self.s.expose_students:
            return SupervisorResolution(status="none", query_key="", note="Student lookup is disabled (student names are hidden).")
        if key:
            if key in self.by_stu:
                return SupervisorResolution(status="exact", query_key=key, matched=[self._stu_brief(key)])
            return SupervisorResolution(status="none", query_key=key, note="Unknown student_key.")
        qkey = normalize_text(query or "")
        if not qkey:
            return SupervisorResolution(status="none", query_key="")
        similar_b: list[SupervisorBrief] = []
        if len(qkey.split()) >= 2:
            keys = list(self.by_stu)
            near = process.extract(qkey, keys, scorer=lambda a, b, **kw: max(fuzz.token_sort_ratio(a, b), fuzz.ratio(a, b)),
                                   score_cutoff=88, limit=6)
            similar_b = sorted((self._stu_brief(k) for k, _, _ in near if k != qkey), key=lambda b: -b.record_count)[:5]
        if qkey in self.by_stu:
            note = ("Names with similar spelling exist and were NOT merged (they may be the same person or "
                    "different people). Review `similar_not_merged`. " if similar_b else "") + NAME_ONLY_NOTE
            return SupervisorResolution(status="exact", query_key=qkey, matched=[self._stu_brief(qkey)],
                                        similar_not_merged=similar_b, note=note)
        qt = qkey.split()
        cands = [k for k in self.by_stu
                 if all(any(tok_match(q, t) for t in k.split()) for q in qt)]
        cands.sort(key=lambda k: (-len(self.by_stu[k]), k))
        if not cands:
            return SupervisorResolution(status="none", query_key=qkey, similar_not_merged=similar_b,
                                        note="No student matches this name.")
        status = "partial" if len(cands) == 1 else "ambiguous_partial"
        note = (("Partial (approximate) match only. " if status == "partial" else
                 "Several different students match this partial name; results are labelled per student. "
                 "Pass student_key to select one person. ") + NAME_ONLY_NOTE)
        return SupervisorResolution(status=status, query_key=qkey, matched=[self._stu_brief(k) for k in cands],
                                    similar_not_merged=similar_b, note=note)

    def _allowed(self, f: Filters, notes: list[str]) -> set[str] | None:
        if f is None or f.is_empty():
            return None
        sets: list[set[str]] = []
        if f.year is not None:
            sets.append(set(self.by_year.get(f.year, ())))
        if f.year_from is not None or f.year_to is not None:
            lo = f.year_from if f.year_from is not None else -10**9
            hi = f.year_to if f.year_to is not None else 10**9
            s: set[str] = set()
            for y, ids in self.by_year.items():
                if lo <= y <= hi:
                    s |= ids
            sets.append(s)
        if f.subject:
            n = normalize_text(f.subject)
            sets.append(set(self.by_subject.get(n, ())))
        if f.supervisor_key:
            sets.append(set(self.by_sup.get(f.supervisor_key, ())))
        elif f.supervisor:
            res = self.resolve_supervisor(f.supervisor)
            ids: set[str] = set()
            for m in res.matched:
                ids |= self.by_sup[m.key]
            if res.status in ("partial", "ambiguous_partial"):
                notes.append("Supervisor filter matched approximately (partial name); see supervisor_resolution.")
            sets.append(ids)
        if f.student_key:
            sets.append(set(self.by_stu.get(f.student_key, ())))
        elif f.student:
            res = self.resolve_student(f.student)
            ids = set()
            for m in res.matched:
                ids |= self.by_stu[m.key]
            if res.status in ("partial", "ambiguous_partial"):
                notes.append("Student filter matched approximately (partial name); see student_resolution.")
            sets.append(ids)
        if f.call_number_prefix:
            p = f.call_number_prefix.strip()
            sets.append({rid for rid, r in self.records.items() if (r.call_number or "").startswith(p)})
        if f.language:
            sets.append({rid for rid, r in self.records.items() if r.language == f.language})
        out = sets[0]
        for s in sets[1:]:
            out = out & s
        return out

    # ------------------------------------------------------------------ strategies
    def _title_candidates(self, q: str, allowed, fuzzy: bool) -> list[Cand]:
        qn = normalize_text(q)
        if not qn:
            return []
        out: list[Cand] = []
        seen: set[str] = set()

        def ok(rid):
            return (allowed is None or rid in allowed) and rid not in seen

        def order(ids):
            return sorted(ids, key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i)))

        for rid in order(self.by_title.get(qn, ())):
            if ok(rid):
                out.append(Cand(rid, "exact", "title", score=1.0, tier=1)); seen.add(rid)
        qtoks = [stem_token(t) for t in qn.split()]
        phrase, toks = [], []
        for rid, r in self.records.items():
            if not ok(rid):
                continue
            tn = r.title_norm
            if f" {qn} " in f" {tn} ":
                phrase.append((len(qn) / max(len(tn), 1), rid))
            else:
                tt = {stem_token(t) for t in tn.split()}
                if all(t in tt for t in qtoks):
                    toks.append((len(qn) / max(len(tn), 1), rid))
        for cov, rid in sorted(phrase, key=lambda x: (-x[0], _id_sort_key(x[1]))):
            out.append(Cand(rid, "partial", "title", score=round(cov, 4), tier=2)); seen.add(rid)
        for cov, rid in sorted(toks, key=lambda x: (-x[0], _id_sort_key(x[1]))):
            out.append(Cand(rid, "partial", "title", score=round(cov, 4), tier=3)); seen.add(rid)
        if fuzzy:
            titles = [(rid, r.title_norm) for rid, r in self.records.items() if ok(rid)]
            if titles:
                res = process.extract(qn, [t for _, t in titles], scorer=fuzz.WRatio, score_cutoff=85,
                                      limit=self.s.candidate_pool)
                for _, sc, idx in res:
                    rid = titles[idx][0]
                    if rid not in seen:
                        out.append(Cand(rid, "approximate", "title", score=sc / 100, tier=4)); seen.add(rid)
        return out

    def _supervisor_candidates(self, q: str | None, key: str | None, allowed, match: str, min_tokens: int = 1
                               ) -> tuple[list[Cand], SupervisorResolution]:
        res = self.resolve_supervisor(q, key)
        if len(res.query_key.split()) < min_tokens and res.status != "exact":
            return [], SupervisorResolution(status="none", query_key=res.query_key)
        use = res.matched
        if match == "exact" or (match == "auto" and res.status == "exact"):
            use = res.matched if res.status == "exact" else []
        out: list[Cand] = []
        seen: set[str] = set()
        for m in use:
            mt = "exact" if res.status == "exact" else "approximate"
            ids = sorted(self.by_sup[m.key], key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i)))
            for rid in ids:
                if (allowed is None or rid in allowed) and rid not in seen:
                    out.append(Cand(rid, mt if mt == "exact" else "partial", "supervisor",
                                    matched_supervisor=m.name, score=1.0 if mt == "exact" else 0.5,
                                    tier=1 if mt == "exact" else 2))
                    seen.add(rid)
        return out, res

    def _student_candidates(self, q: str | None, key: str | None, allowed, match: str, min_tokens: int = 1
                            ) -> tuple[list[Cand], SupervisorResolution]:
        res = self.resolve_student(q, key)
        if len(res.query_key.split()) < min_tokens and res.status != "exact":
            return [], SupervisorResolution(status="none", query_key=res.query_key)
        use = res.matched
        if match in ("exact", "spelling") or (match == "auto" and res.status == "exact"):
            use = res.matched if res.status == "exact" else []
        spell = " ".join((q or "").split()) if match == "spelling" else None
        out: list[Cand] = []
        seen: set[str] = set()
        for m in use:
            exact = res.status == "exact"
            ids = sorted((i for i in self.by_stu[m.key]
                          if spell is None or any(" ".join(x.split()) == spell for x in self.records[i].students)),
                         key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i))) if spell is not None else sorted(self.by_stu[m.key], key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i)))
            for rid in ids:
                if (allowed is None or rid in allowed) and rid not in seen:
                    out.append(Cand(rid, "exact" if exact else "partial", "student", matched_student=m.name,
                                    score=1.0 if exact else 0.5, tier=1 if exact else 2))
                    seen.add(rid)
        return out, res

    def _subject_candidates(self, q: str, allowed) -> list[Cand]:
        qn = normalize_text(q)
        if not qn:
            return []
        out, seen = [], set()
        exact = [qn] if qn in self.by_subject else []
        part = [n for n in self.by_subject if n != qn and (qn in n or all(t in n.split() for t in qn.split()))]
        for tier, keys, mt in ((1, exact, "exact"), (2, sorted(part), "partial")):
            for n in keys:
                for rid in sorted(self.by_subject[n], key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i))):
                    if (allowed is None or rid in allowed) and rid not in seen:
                        out.append(Cand(rid, mt, "subject", score=1.0 if mt == "exact" else 0.5, tier=tier)); seen.add(rid)
        return out

    def calibration(self) -> dict:
        """Semantic floor in use and where it comes from: a calibration file measured for THIS model id, or the
        UNCALIBRATED setting. Cached after first read."""
        from src.retrieval.embeddings import is_neural
        if getattr(self, "_calib", None) is not None:
            return self._calib
        if not is_neural(self.embedder):
            self._calib = {"floor": self.s.semantic_min_score, "source": "lexical-default", "calibrated": False}
            return self._calib
        c = {"floor": self.s.semantic_min_score_neural, "source": "setting (UNCALIBRATED)", "calibrated": False}
        try:
            import json
            from pathlib import Path
            f = Path(self.s.semantic_calibration_file)
            if f.exists():
                d = json.loads(f.read_text(encoding="utf-8"))
                if d.get("model_id") == self.embedder.model_id and isinstance(d.get("floor"), (int, float)):
                    c = {"floor": float(d["floor"]), "source": f"calibration file ({f.name})", "calibrated": True,
                         "measured_on": d.get("measured_on")}
        except Exception:  # noqa: BLE001 - a bad calibration file must not break search
            pass
        self._calib = c
        return c

    def _semantic_floor(self) -> float:
        return self.calibration()["floor"]

    def _dense_ready(self) -> bool:
        """Semantic ranking is used only when >= 99% of the records have a fresh vector. A half-built index (e.g. the
        background embedding job is still running) would rank only the already-embedded records and silently bias results."""
        n = len(self.records)
        return n > 0 and len(self.dense) >= 0.99 * n

    def _ranked(self, q: str, allowed, use_bm25: bool, use_dense: bool) -> list[Cand]:
        pool = self.s.candidate_pool
        lists: dict[str, list[tuple[str, float]]] = {}
        if use_bm25:
            lists["bm25"] = self.bm25.search(q, allowed, pool)
        if use_dense and len(self.dense) and self._dense_ready():
            lists["semantic"] = self.dense.search(self.embedder.encode_query(q), allowed, pool, self._semantic_floor())
        weights = {"bm25": self.s.bm25_weight, "semantic": self.s.semantic_weight}
        fused: dict[str, float] = defaultdict(float)
        scores: dict[str, dict] = defaultdict(dict)
        for name, lst in lists.items():
            for rank, (rid, sc) in enumerate(lst, start=1):
                fused[rid] += weights[name] / (self.s.rrf_k + rank)   # Reciprocal Rank Fusion
                scores[rid][name] = sc
        out = []
        for rid, sc in sorted(fused.items(), key=lambda kv: (-kv[1], _id_sort_key(kv[0])))[:pool]:
            ks = set(scores[rid])
            mt = "hybrid" if len(ks) > 1 else ("lexical" if "bm25" in ks else "semantic")
            sc_d = dict(scores[rid])
            sc_d["rrf"] = sc
            out.append(Cand(rid, mt, "title+subject", score=sc, scores=sc_d, tier=9))
        return out

    # ------------------------------------------------------------------ public search API
    def search(self, query: str = "", mode: str = "auto", filters: Filters | None = None, sort: str = "relevance",
               page: int = 1, page_size: int | None = None, fuzzy: bool = False,
               supervisor_match: str = "auto") -> SearchResponse:
        self.refresh()
        page_size = min(max(page_size or self.s.default_page_size, 1), self.s.max_page_size)
        page = max(page, 1)
        query = (query or "").strip()
        filters = filters or Filters()
        notes: list[str] = []
        strategy: list[str] = []
        sup_res: SupervisorResolution | None = None
        stu_res: SupervisorResolution | None = None
        exhaustive = True
        with self.lock:
            allowed = self._allowed(filters, notes)
            qn = normalize_text(query)
            cands: list[Cand] = []
            has_key = bool((mode == "supervisor" and filters.supervisor_key) or (mode == "student" and filters.student_key))
            structured = mode in ("title", "supervisor", "student", "subject")
            if query and not has_key and len(qn.replace(" ", "")) < self.s.min_query_chars:
                # too short to be meaningful (a single letter would match thousands of unrelated records)
                notes.append(f"query_too_short: enter at least {self.s.min_query_chars} characters.")
                strategy.append("query_too_short")
                exhaustive = mode not in ("keyword", "semantic", "hybrid", "auto", "all")
            elif not query and structured and not has_key and allowed is None:
                notes.append("empty_query: enter a name or title for this search mode.")
                strategy.append("empty_query")
            elif not query and not has_key and allowed is None:
                # no query AND no filter: an empty search must never "match everything"
                notes.append("empty_query: enter a search text or choose at least one filter.")
                strategy.append("empty_query")
            elif not query and not has_key:
                ids = sorted(allowed if allowed is not None else self.records,
                             key=lambda i: (-(self.records[i].year or 0), _id_sort_key(i)))
                cands = [Cand(i, "exact", "filter", tier=0) for i in ids]
                strategy.append("filter_only")
                if sort == "relevance":
                    sort = "year_desc"
            elif mode == "title":
                cands = self._title_candidates(query, allowed, fuzzy); strategy.append("structured_title")
            elif mode == "supervisor":
                cands, sup_res = self._supervisor_candidates(query, filters.supervisor_key, allowed, supervisor_match)
                strategy.append("structured_supervisor")
            elif mode == "student":
                cands, stu_res = self._student_candidates(query, filters.student_key, allowed, supervisor_match)
                strategy.append("structured_student")
            elif mode == "subject":
                cands = self._subject_candidates(query, allowed); strategy.append("structured_subject")
                if not cands:
                    notes.append("No subject matched. Use mode=hybrid for topic search over titles.")
            elif mode in ("keyword", "semantic", "hybrid"):
                exhaustive = False
                cands = self._ranked(query, allowed, mode in ("keyword", "hybrid"), mode in ("semantic", "hybrid"))
                strategy.append({"keyword": "bm25", "semantic": "dense", "hybrid": "hybrid_rrf"}[mode])
                if mode in ("semantic", "hybrid") and not len(self.dense):
                    notes.append("Semantic index is empty/pending: results are keyword-only until embeddings are built.")
            else:  # auto / all
                exhaustive = False
                seen: set[str] = set()

                def add(lst):
                    for c in lst:
                        if c.rid not in seen:
                            seen.add(c.rid); cands.append(c)

                t = self._title_candidates(query, allowed, fuzzy)
                s_c, sup_res = self._supervisor_candidates(query, filters.supervisor_key, allowed, "auto",
                                                          min_tokens=2)
                sub = self._subject_candidates(query, allowed)
                st_c, stu_res = self._student_candidates(query, filters.student_key, allowed, "auto", min_tokens=2)
                ex_t = [c for c in t if c.match_type == "exact"]
                ex_s = [c for c in s_c if c.match_type == "exact"]
                ex_u = [c for c in sub if c.match_type == "exact"]
                ex_st = [c for c in st_c if c.match_type == "exact"]
                add(ex_t); add(ex_s); add(ex_st); add(ex_u)
                add([c for c in t if c.match_type != "exact"])
                add(s_c); add(st_c); add(sub)
                strategy = [n for n, l in (("structured_title", t), ("structured_supervisor", s_c),
                                           ("structured_student", st_c), ("structured_subject", sub)) if l]
                ranked = self._ranked(query, allowed, True, True)
                add(ranked)
                strategy.append("hybrid_rrf")
                if ex_s:
                    notes.append(f"Exact supervisor match: {len(ex_s)} records are listed first. For the complete, "
                                 "paginated list of a supervisor's work use mode=supervisor.")
                if sup_res and sup_res.status == "none":
                    sup_res = None
                if stu_res and stu_res.status == "none":
                    stu_res = None
                if not len(self.dense):
                    notes.append("Semantic index is empty/pending: ranking is keyword-only.")
            # sorting
            if sort == "year_desc":
                cands.sort(key=lambda c: (-(self.records[c.rid].year or -1), _id_sort_key(c.rid)))
            elif sort == "year_asc":
                cands.sort(key=lambda c: (self.records[c.rid].year or 10**6, _id_sort_key(c.rid)))
            elif sort == "title":
                cands.sort(key=lambda c: (self.records[c.rid].title_norm, _id_sort_key(c.rid)))
            elif sort == "record_id":
                cands.sort(key=lambda c: _id_sort_key(c.rid))
            total = len(cands)
            pages = max(math.ceil(total / page_size), 1)
            start = (page - 1) * page_size
            hits = [self._hit(c) for c in cands[start:start + page_size]]
            if not exhaustive:
                notes.append("Ranked retrieval: results are a relevance-ranked candidate list, not a complete list.")
        return SearchResponse(query=query, normalized_query=qn, mode_requested=mode, strategy=strategy,
                              exhaustive=exhaustive, total=total, page=page, page_size=page_size, total_pages=pages,
                              sort=sort, notes=notes, supervisor_resolution=sup_res, student_resolution=stu_res, hits=hits)

    # ------------------------------------------------------------------ records & catalogue views
    def get_record(self, record_id: str) -> Record | None:
        self.refresh()
        with self.lock:
            return self.records.get(record_id)

    def possible_duplicates(self, title: str, exclude_id: str | None = None, threshold: int = 95) -> list[dict]:
        """Possible duplicates of a title: identical normalised title, or character-level similarity >= threshold."""
        tn = normalize_text(title)
        out: dict[str, dict] = {}
        with self.lock:
            for rid in self.by_title.get(tn, ()):
                if rid != exclude_id:
                    out[rid] = {"record_id": rid, "title": self.records[rid].title, "reason": "same_normalized_title", "similarity": 100}
            items = [(rid, r.title_norm) for rid, r in self.records.items() if rid != exclude_id and rid not in out]
            if items and tn:
                for _, sc, idx in process.extract(tn, [t for _, t in items], scorer=fuzz.ratio, score_cutoff=threshold, limit=10):
                    rid = items[idx][0]
                    out[rid] = {"record_id": rid, "title": self.records[rid].title, "reason": "similar_title", "similarity": int(sc)}
        return sorted(out.values(), key=lambda d: (-d["similarity"], _id_sort_key(d["record_id"])))

    def list_supervisors(self, query: str | None = None, page: int = 1, page_size: int = 50) -> dict:
        self.refresh()
        page_size = min(max(page_size, 1), self.s.max_page_size)
        with self.lock:
            keys = list(self.by_sup)
            if query:
                qt = person_key(query).split()
                keys = [k for k in keys if all(any(tok_match(q, t) for t in k.split()) for q in qt)]
            keys.sort(key=lambda k: (-len(self.by_sup[k]), k))
            total = len(keys)
            start = (max(page, 1) - 1) * page_size
            items = [self._brief(k) for k in keys[start:start + page_size]]
        return {"total": total, "page": max(page, 1), "page_size": page_size,
                "total_pages": max(math.ceil(total / page_size), 1), "items": items}

    def list_students(self, query: str | None = None, page: int = 1, page_size: int = 50) -> dict:
        self.refresh()
        page_size = min(max(page_size, 1), self.s.max_page_size)
        if not self.s.expose_students:
            return {"total": 0, "page": 1, "page_size": page_size, "total_pages": 1, "items": []}
        with self.lock:
            keys = list(self.by_stu)
            if query:
                qt = normalize_text(query).split()
                keys = [k for k in keys if all(any(tok_match(q, t) for t in k.split()) for q in qt)]
            keys.sort(key=lambda k: (-len(self.by_stu[k]), k))
            total = len(keys)
            start = (max(page, 1) - 1) * page_size
            items = [self._stu_brief(k) for k in keys[start:start + page_size]]
        return {"total": total, "page": max(page, 1), "page_size": page_size,
                "total_pages": max(math.ceil(total / page_size), 1), "items": items}

    def list_subjects(self) -> list[dict]:
        self.refresh()
        with self.lock:
            return sorted(({"name": sorted(self.subject_names[n].items(), key=lambda kv: -kv[1])[0][0], "record_count": len(ids)}
                           for n, ids in self.by_subject.items()), key=lambda d: (-d["record_count"], d["name"]))

    def list_years(self) -> list[dict]:
        self.refresh()
        with self.lock:
            return [{"year": y, "record_count": len(ids)} for y, ids in sorted(self.by_year.items())]

    def stats(self) -> dict:
        with self.lock:
            return {"records": len(self.records), "supervisors": len(self.by_sup), "students": len(self.by_stu), "subjects": len(self.by_subject),
                    "bm25_docs": len(self.bm25), "dense_vectors": len(self.dense),
                    "pending_embeddings": len(self.pending_embeddings), "change_seq": self.seq,
                    "embedder": self.embedder.model_id}
