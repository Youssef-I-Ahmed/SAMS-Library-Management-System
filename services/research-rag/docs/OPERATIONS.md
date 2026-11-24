# Operations guide — import, index, update, backup, restore

## Data model (tables created by `src/storage/db.py`)
| Table | Purpose |
|---|---|
| `rag_records` | one row per record: `record_id` (PK, = source `BOOK_CODE`), title, normalized title, students/supervisors/subjects (JSON), year, call number, extent, dimension, language, quality flags, `raw` (original source cells, verbatim), content hash |
| `rag_record_supervisors`, `rag_record_subjects` | lookup tables derived from the record |
| `rag_embeddings` | float32 vector per record + hash of the embedded text + model id |
| `rag_change_log`, `rag_index_state` | change sequence/epoch so several workers refresh their in-memory indexes; embedder state |
| `rag_index_errors`, `rag_audit_log` | indexing failures; admin operations (actor, role, action, record, details) |
Students and supervisors are lists inside the record (original spelling kept; internal whitespace collapsed; the verbatim source text stays in `raw`). Search keys are normalized in memory; **similar names are never merged**.

## Source of truth
* **Standalone** (`RAG_MODE=standalone`): the database named by `DATABASE_URL` (SQLite file for the pilot, PostgreSQL for production) is authoritative for records; deleting/rebuilding the *index* never deletes records (`rag_records` is kept, only embeddings are recomputed).
* **Integrated** (`RAG_MODE=integrated`): PostgreSQL/Prisma is authoritative; the RAG store is a rebuildable cache.

## First import (Excel → database → index)
```bash
cp /secure/Project.xlsx data/raw/Project.xlsx          # never committed; original is never modified (sha256 asserted)
python scripts/prepare_data.py                          # data/processed/{records.jsonl,quality_report.json,…}
python scripts/build_index.py                           # full import + embeddings + consistency check
python scripts/reconcile.py                             # source ↔ store field-by-field comparison; exit 0 only on PASS
python scripts/build_index.py --verify                  # index consistency
```
Docker: `docker compose --profile import run --rm rag-import` (mount the file via `./private-import/`). *(Docker not built in the author's environment — see EXTERNAL_REQUIREMENTS.md.)*
Rejected rows (e.g. empty title) are listed in the output and never silently dropped; nothing is deleted for being duplicate or incomplete.

## Updating
* Single records: admin API/UI (standalone) — transactional: the record is saved first, then embedded; if embedding fails the record stays searchable and is retried.
* Bulk: re-run `build_index.py --records new.jsonl` (upsert changed, embed only changed; add `--keep-missing` to avoid deleting records absent from the file).
* Integrated: `build_index.py --sync-source` or `POST /admin/sync`.
* Repair: `build_index.py --pending` (embed missing) · full rebuild `build_index.py` / `POST /admin/index/reindex?scope=full` (other workers detect the new epoch and reload).

## Restart / persistence
State lives in the database, not in memory; on start the service loads records and embeddings from it. Tested: restart persistence on SQLite and on PostgreSQL (records, embeddings, audit trail). **Ephemeral hosts** (Streamlit Community Cloud, containers without a volume) lose a SQLite file on restart → use a volume or an external PostgreSQL.

## Backup & restore
| Backend | Backup | Restore |
|---|---|---|
| SQLite | stop writers, or `sqlite3 rag.db ".backup 'rag-backup.db'"`; copy the file to encrypted storage | stop the service, replace `rag.db`, start; run `build_index.py --verify` |
| PostgreSQL | `pg_dump -Fc -t 'rag_*' dbname > rag.dump` (authoritative Prisma tables are backed up by the platform team) | `pg_restore -d dbname rag.dump`; then `build_index.py --verify` |
| Either | **Alternative that needs no backup of the index:** keep the original `Project.xlsx` (or the PostgreSQL source) and rebuild with `build_index.py` | |
Backups contain student names → encrypt, restrict access, define retention. A restore drill has been run only on SQLite/PostgreSQL test copies in the build environment, not on production.

## Monitoring
`GET /health` (liveness), `GET /ready` (503 until loaded), `GET /admin/index/status`, `POST /admin/index/verify`. Logs record method, path, status, latency and request id — not query text, tokens or names. Run uvicorn with `--no-access-log`.

## Replacing the dataset with a new version (tested procedure)
```bash
cp data/raw/Project.xlsx /secure/archive/Project_<date>.xlsx    # archive OUTSIDE the project folder
python scripts/compare_datasets.py /secure/archive/Project_<date>.xlsx /path/to/new/Project.xlsx    # writes docs/DATASET_COMPARISON.md
cp /path/to/new/Project.xlsx data/raw/Project.xlsx
python scripts/bootstrap.py        # incremental sync: only changed records are updated/re-embedded; reconcile must PASS
```
Column headers are matched through `canonical_header()` (both the `WORK | PUBLISHING_DATE` and the `' PUBLISHING_DATE'` layouts are accepted). A file missing any of the 9 expected columns is rejected with a message naming them.
