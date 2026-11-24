"""Initial + incremental indexing, consistency verification and status.

Per-record flow (incremental): validate -> store.upsert (record + supervisor/subject rows + change_log, ONE
transaction) -> embed only if the embedding text/model changed -> persist vector. Other processes pick the
change up through the change log (SearchEngine.refresh), so no full rebuild is needed.
A failed embedding never loses the record: it stays searchable by structured/keyword search, the error is
logged in rag_index_errors and `embed_pending()` retries it.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from src.config.settings import Settings
from src.data.schema import Record
from src.retrieval.embeddings import Embedder
from src.storage.record_store import RecordStore


class IndexingError(Exception):
    pass


from src.retrieval.embeddings import describe_embedder  # noqa: E402


class Indexer:
    def __init__(self, store: RecordStore, embedder: Embedder, settings: Settings):
        self.store, self.embedder, self.s = store, embedder, settings
        self.embedder.set_state(store.get_state("embedder_state"))

    # ------------------------------------------------------------------ validation
    @staticmethod
    def validate_records(records: list[Record]) -> tuple[list[Record], list[dict]]:
        """Detect duplicate IDs and invalid records BEFORE indexing. Returns (valid, problems)."""
        seen: dict[str, int] = {}
        valid, problems = [], []
        for i, r in enumerate(records):
            if not r.record_id or not r.title.strip():
                problems.append({"index": i, "record_id": r.record_id, "problem": "empty record_id or title"})
            elif r.record_id in seen:
                problems.append({"index": i, "record_id": r.record_id, "problem": f"duplicate record_id (first at index {seen[r.record_id]})"})
            else:
                seen[r.record_id] = i
                valid.append(r)
        return valid, problems

    # ------------------------------------------------------------------ embedding
    def _embed_records(self, recs: list[Record], batch: int = 128) -> int:
        n = 0
        mid = self.embedder.model_id
        for i in range(0, len(recs), batch):
            chunk = recs[i:i + batch]
            try:
                vecs = self.embedder.encode_passages([r.embedding_text() for r in chunk])
            except Exception as e:  # noqa: BLE001 - provider/model errors must not lose records
                for r in chunk:
                    self.store.log_error(r.record_id, "embedding", f"{type(e).__name__}: {e}")
                continue
            self.store.put_embeddings_bulk((r.record_id, mid, v, r.embed_hash(mid)) for r, v in zip(chunk, vecs))
            n += len(chunk)
        return n

    def embed_pending(self) -> int:
        """Embed every record lacking a fresh embedding (new, changed, or model switched). Idempotent."""
        mid = self.embedder.model_id
        meta = self.store.embedding_meta()
        todo = [r for r in self.store.all_records() if meta.get(r.record_id) != (mid, r.embed_hash(mid))]
        n = self._embed_records(todo)
        if n:
            self.store.clear_errors(stage="embedding")
            self.store.set_state("epoch", uuid.uuid4().hex)  # tell other processes to reload vectors
        return n

    # ------------------------------------------------------------------ full rebuild
    def full_rebuild(self, records: list[Record], *, delete_missing: bool = True, embed: bool = True) -> dict:
        """Deterministic full rebuild from a list of records (recovery / maintenance / first load)."""
        t0 = time.time()
        valid, problems = self.validate_records(records)
        if problems and not valid:
            raise IndexingError(f"no valid records: {problems[:3]}")
        keep = {r.record_id for r in valid}
        created = updated = unchanged = 0
        for r in valid:
            op, _ = self.store.upsert(r, with_log=False)
            created += op == "created"; updated += op == "updated"; unchanged += op == "unchanged"
        deleted = 0
        if delete_missing:
            for rid in set(self.store.ids()) - keep:
                self.store.delete(rid); deleted += 1
        # refit (deterministic) and re-embed everything under the new state
        texts = [r.embedding_text() for r in sorted(valid, key=lambda r: r.record_id)]
        self.embedder.fit(texts)
        st = self.embedder.get_state()
        if st is not None:
            self.store.set_state("embedder_state", st)
        self.store.clear_errors(stage="embedding")
        # embed=False: store + index the records now and embed later (embed_pending), so a slow neural model never blocks
        # the first page load; structured and keyword search work immediately, semantic ranking switches on when complete.
        embedded = self._embed_records(sorted(valid, key=lambda r: r.record_id)) if embed else 0
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.store.set_state("epoch", uuid.uuid4().hex)
        self.store.set_state("last_full_rebuild", now)
        self.store.set_state("embedding_model", self.embedder.model_id)
        return {"records": len(valid), "created": created, "updated": updated, "unchanged": unchanged,
                "deleted": deleted, "embedded": embedded, "problems": problems,
                "embedding_model": self.embedder.model_id, "seconds": round(time.time() - t0, 2)}

    # ------------------------------------------------------------------ incremental
    def upsert(self, rec: Record) -> dict:
        op, seq = self.store.upsert(rec)
        mid = self.embedder.model_id
        embedded = False
        got = self.store.get_embedding(rec.record_id)
        if got is None or got[0] != mid or got[1] != rec.embed_hash(mid):
            try:
                vec = self.embedder.encode_passages([rec.embedding_text()])[0]
                self.store.put_embedding(rec.record_id, mid, vec, rec.embed_hash(mid))
                self.store.clear_errors(record_id=rec.record_id, stage="embedding")
                embedded = True
            except Exception as e:  # noqa: BLE001
                self.store.log_error(rec.record_id, "embedding", f"{type(e).__name__}: {e}")
        if embedded:
            # a worker may have refreshed between the record write and the vector write -> notify again
            self.store.log_change(rec.record_id, "upsert")
        return {"op": op, "embedded": embedded, "embedding_pending": not embedded and op != "unchanged" and
                self.store.get_embedding(rec.record_id) is None}

    def delete(self, record_id: str) -> bool:
        return self.store.delete(record_id) is not None

    # ------------------------------------------------------------------ source sync (integrated mode)
    def sync_from_source(self, records: list[Record]) -> dict:
        """Reconcile with the authoritative source: upsert changed, delete vanished, embed only what changed."""
        valid, problems = self.validate_records(records)
        keep = {r.record_id for r in valid}
        changed = 0
        for r in valid:
            res = self.upsert(r)
            changed += res["op"] != "unchanged"
        deleted = 0
        for rid in set(self.store.ids()) - keep:
            self.store.delete(rid); deleted += 1
        self.store.set_state("last_source_sync", datetime.now(timezone.utc).isoformat(timespec="seconds"))
        return {"source_records": len(valid), "changed": changed, "deleted": deleted, "problems": problems}

    # ------------------------------------------------------------------ verification & status
    def verify_consistency(self, engine=None) -> dict:
        mid = self.embedder.model_id
        recs = {r.record_id: r for r in self.store.all_records()}
        meta = self.store.embedding_meta()
        missing = sorted(i for i in recs if i not in meta)
        stale = sorted(i for i, r in recs.items() if i in meta and meta[i] != (mid, r.embed_hash(mid)))
        orphan = sorted(i for i in meta if i not in recs)
        problems = {"records_without_embedding": missing, "stale_or_other_model_embeddings": stale,
                    "orphan_embeddings": orphan}
        if engine is not None:
            engine.refresh(force=True)
            sups: dict[str, set] = {}
            for r in recs.values():
                for s in r.supervisors:
                    sups.setdefault(s.key, set()).add(r.record_id)
            problems["engine_record_count_mismatch"] = [] if len(engine.records) == len(recs) else [len(engine.records), len(recs)]
            problems["bm25_count_mismatch"] = [] if len(engine.bm25) == len(recs) else [len(engine.bm25), len(recs)]
            problems["supervisor_index_mismatch"] = [] if {k: set(v) for k, v in engine.by_sup.items()} == sups else ["differs"]
            fresh = len(recs) - len(missing) - len(stale)
            problems["dense_count_mismatch"] = [] if len(engine.dense) == fresh else [len(engine.dense), fresh]
        ok = not any(problems.values())
        return {"ok": ok, "records": len(recs), "embeddings": len(meta),
                "problems": {k: (v[:20] if isinstance(v, list) else v) for k, v in problems.items()},
                "problem_counts": {k: len(v) for k, v in problems.items()}}

    def status(self, engine=None) -> dict:
        st = self.store.all_state()
        out = {
            "mode": self.s.rag_mode,
            "records": self.store.count(),
            "embeddings": self.store.embedding_count(),
            "embedding_models_in_store": dict(self.store.embedding_models()),
            "active_embedding_model": self.embedder.model_id,
            "embedding_backend": self.s.embedding_backend,
            "embedding_mode": describe_embedder(self.embedder, self.s.embedding_backend, getattr(self.embedder, "fallback_reason", None)),
            "last_full_rebuild": st.get("last_full_rebuild"),
            "last_source_sync": st.get("last_source_sync"),
            "change_seq": self.store.current_seq(),
            "index_errors": self.store.error_count(),
            "recent_errors": self.store.recent_errors(10),
        }
        if engine is not None:
            out["engine"] = engine.stats()
        return out
