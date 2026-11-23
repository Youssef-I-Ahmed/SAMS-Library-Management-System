> **Historical document (earlier round).** Test counts and statements here are from that round only; the current, authoritative status is the root `TEST_REPORT.md` and `docs/FINAL_DELIVERY_REPORT.md` (2026-10-30).

# Final audit (dataset v2 only)

All results below were produced by running the commands in section 7 on an **extracted copy of the ZIP**, in a fresh
venv (Python 3.13.16, `requirements-dev.txt`). Nothing is claimed that was not executed.

## 1. Old dataset removed
* `data/history/Project_OLD_v1_HISTORICAL_DO_NOT_USE.xlsx` is **not in the ZIP**; the folder no longer exists.
* Search of every `.py`, config, script, test, Docker file and doc: no code, test, script, endpoint or Docker file references the old
  file or its checksum. The only mentions are in documentation describing the v1→v2 comparison
  (`DATASET_COMPARISON.md`, `DATASET_UPDATE_IMPACT.md`), which is audit history, not data.
* `data/PRIVATE_DATA_README.md` (the dataset inventory) lists only `data/raw/Project.xlsx`.

## 2. New dataset, calculated from the actual workbook (`data/raw/Project.xlsx`)
sha256 `34e2be486ecc37014e685d216f263920fd9404e6cf9b2b5a41245d55ad427528`

| Item | Value |
|---|---|
| Sheets | 1: `Research` |
| Rows | 3,984 including header → **3,983 data rows**, 0 blank rows |
| Columns | `BOOK_CODE`, `TITLE`, `Students`, `Supervisor`, ` PUBLISHING_DATE`, ` CALL_NUM`, ` EXTENT`, `DIMENSION`, `SUBJECTS` (note leading spaces on three) |
| Duplicate BOOK_CODE | 0 |
| Repeated titles (whitespace-normalised) | 155 titles / 356 rows (215 groups / 523 rows after Arabic normalisation) — reported, none deleted or merged |
| Rows identical except id | 4 groups by exact text (5 if whitespace is ignored) — reported only |
| Missing (NA/blank) | Students 126, Supervisor 26, year 10, extent 995, dimension 779, subjects 33, call number 0, title 0 |
| Arabic titles | 2,371 |

Ingestion: `prepare_data` 3,983 rows → 3,983 records, **0 rejected**; `reconcile.py` **PASS** (0 missing, 0 extra, 0 mismatches);
missing values stay missing (never filled); no author/title/summary is invented (the dataset has no abstract column).

## 3. Derived data (all rebuilt from the v2 file only)
| Artifact | Status |
|---|---|
| `data/processed/*` (records.jsonl, quality_report, candidate CSVs, manifest, eval_*.json) | regenerated from v2; manifest sha256 = v2 |
| `data/store/rag.db` (records, embeddings, index state) | **not shipped**; `bootstrap.py` builds it (≈6 s). On the packaged copy: 3,983 created, 3,983 embeddings, consistency check all-zero problems |
| Stale-record check | the 4 corrected records hold years 2014/2014/2015/2023 in the store; 0 records with the old bad years; engine stats: records 3,983, bm25 3,983, dense 3,983, pending embeddings 0 |

## 4. Clean-environment audit
See section 7 for commands. Counts (final run, from the extracted ZIP): see the table at the end of this file (§8).
* Lint: **no linter is configured** in the repo. An ad-hoc `ruff` pass (errors/unused only) found 14 harmless unused imports/variables, left untouched (smallest-change rule). No type checker configured; none run.
* Security: `pip-audit -r requirements.txt` → no known vulnerabilities (needs network to PyPI). No `.env`, key or credential in the ZIP (pattern scan for `sk-`, `AIza`, private keys: none; only `.env.example` / `secrets.toml.example` placeholders).
* Startup: API `GET /health` → ok; `/ready` reports records 3,983, retrieval-only; Streamlit `/_stcore/health` → ok.

## 5. Real search behaviour (real data)
Verified by `scripts/live_check.py` (36/36, ground truth computed independently from the Excel file) and by direct engine calls:
* **Student full name → all works**: exact lookup equals the oracle for 50 sampled students; most prolific student: 6 records, `exhaustive=true`, 2 pages of 5 → 6 unique ids, lossless. **Supervisor**: 749 records for the most prolific; same count for every spelling variant tested.
* **Title**: exact lookup equals oracle for 40 titles; partial and approximate are labelled.
* **Topics**: Arabic and English queries return ranked hybrid results, `exhaustive=false` (a top-100 candidate list, never presented as complete). Subject (structured) search equals the oracle.
* **Spelling/normalisation**: ي/ى, ة/ه, hamza forms, diacritics, tatweel; different people with similar names are not merged (shown as `similar_not_merged`).
* **Edge queries**: empty query in browse mode lists everything (paged); in structured modes it returns 0; one character → 0 with note `query_too_short`; gibberish (`zzzqqq`, `xqvbnm lkjhg`, SQL/HTML strings) → 0 results, no error.
* **Pagination / year filter**: lossless; year filter equals the oracle for all 26 years (e.g. 2014 → 46 records, including the two corrected ones).
* **CRUD**: create → searchable by title, student and supervisor; edit visible; delete removed from every search; other 3,983 records untouched; index verify ok; audit rows written.
* **Citations / details**: every hit carries record id and original field values; record detail returns the original spellings.
* **Modes, honestly**: lexical = BM25/exact/partial/fuzzy; "semantic" = **offline hashing embeddings, which are lexical-fuzzy, NOT semantic and NOT cross-lingual** (the optional multilingual neural model is coded but untested: Hugging Face is unreachable here); **no LLM is configured** — `/ask` runs retrieval-only with evidence/abstention rules; real-LLM answer quality is untested.

## 6. Unresolved issues and impact
| Issue | Impact |
|---|---|
| Docker image not built (registry 403) | Dockerfile/compose unverified |
| Express/React integration not tested | contract documented (`INTEGRATION.md`), tested only through HTTP/JWT |
| Production PostgreSQL schema unknown; tested on a disposable PostgreSQL 18 with a Prisma-like table | integrated-mode view may need adapting |
| Real LLM and neural embeddings untested | no claim on answer quality / cross-lingual semantic search |
| Student identity name-only (no id in the data) | same-name students would be indistinguishable; disclosed in results |
| No rate limiting/TLS in the service; Streamlit uses one shared admin password | add at gateway before any exposure |
| Data contains real student names | publication approved by the academy (owner's statement, 2026-10-30); names are kept as in the approved file |
| 14 unused imports/variables; no lint/type config | cosmetic |

## 7. Exact commands (clean environment, Python 3.13)
```bash
unzip sadat-rag-final.zip && cd sadat-rag
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt        # runtime + test deps (+ pixeltable-pgserver: disposable PostgreSQL for tests)
python scripts/bootstrap.py                # prepare + index + reconcile + verify (≈10 s); exit 0 = OK
cp .env.example .env                       # then set SERVICE_JWT_SECRET (32+ chars) – placeholders only in the file
export SERVICE_JWT_SECRET=<your-secret>
uvicorn api.main:app --port 8000 --no-access-log        # API (docs at /docs)
streamlit run app.py                                    # pilot UI
python scripts/live_check.py --base http://127.0.0.1:8000   # 36 black-box checks (admin writes on this store – use a copy)
python -m pytest -q -rs                                 # full suite (~5 min)
```

## 8. Actual test counts (extracted ZIP, fresh venv, Python 3.13.16)
| Run | passed | failed | skipped | blocked |
|---|---|---|---|---|
| `pytest -q -rs` (full suite incl. 4 PostgreSQL tests on a disposable PostgreSQL 18 and 11 real-data tests) | **294** | **0** | **0** | 0 |
| `scripts/live_check.py` against the live API | **36** | 0 | – | – |
| `scripts/bootstrap.py` | OK (reconcile PASS, index verify ok) | | | |
| Docker build | not run to completion: **blocked** (registry 403) | | | |
| Express / React integration | **not tested** | | | |
(A harmless "I/O operation on closed file" logging message from the pgserver package appears at interpreter exit.)
