# Backend testing report — standalone FastAPI RAG

Date of execution: 2026-11-23. Environment: Linux sandbox, Python 3.12.3, packages from `requirements-dev.txt`.
Only results of commands that were actually run are listed. The sandbox could **not** reach `generativelanguage.googleapis.com`
or `huggingface.co` (DNS: "Could not resolve host"), which blocks every live-Gemini and neural-model test.

## Summary
| Result | Count / items |
|---|---|
| **Passed** | Full automated suite: **462 passed, 1 skipped, 0 failed** (baseline before changes: 457 passed, 1 skipped) · live HTTP checks below |
| **Failed** | none |
| **Blocked by network** | live Gemini connectivity · Gemini model listing/selection · real Gemini generation (Arabic and English) · neural (fastembed) query embeddings · embedding-model download |
| **Needs the academy** | connection to the academy's real database (schema unknown) · real Gemini key validation on a networked server |
| **Not run (tool unavailable)** | `docker build` / `docker compose` (no Docker in the sandbox) |

**The package is therefore NOT fully verified.** Acceptance items "connect to Gemini with the academy key" and "verified compatible Gemini model" are open until
`python scripts/gemini_check.py` is run on a server with internet access (it must exit with code 0).

## 1. Automated tests (`pytest`, run on the modified copy)
* Before any change (original copy): 457 passed, 1 skipped.
* After changes: **462 passed, 1 skipped** (+3 POST /search tests in `tests/api/test_api.py`, +2 sync-script tests in `tests/integration/test_sync_script.py`).
  The skipped test needs a pre-built `data/store/rag.db` (`tests/unit/test_operator_scripts.py`).
* Includes tests on the real dataset (3,983 records), real PostgreSQL (throw-away local server, synthetic rows) and a **local fake Gemini server** that exercises the real
  `GeminiProvider` code (request shape, parsing, bad key, quota, timeout, blocked prompt, unknown model, `auto` selection). The fake server does not prove that Google accepts the key.
* Targeted re-run (107 passed): `test_student_privacy_real_data`, `test_gemini_modes`, `test_llm_providers`, `test_evidence_policy` — including: no Gemini call for
  number/count/supervisor/title/abstention questions; prompt contains retrieved records only and **no student names**; invented titles/years/names/numbers are withheld; prompt-injection in the question cannot bypass the policy.

## 2. Live checks against a running server (uvicorn, real dataset, temporary SQLite store outside the project)
Setup: `scripts/bootstrap.py` → 3,983 records imported, reconciled against `Project.xlsx`, index consistency `ok: true` (0 problems).
Server started with a `streamlit` module that raises `ImportError` on `PYTHONPATH` (proves independence). `LLM_PROVIDER=none`, because Gemini was unreachable.
The embedder fell back to **lexical hashing mode** (model not downloadable), so these checks are lexical, not semantic.

| # | Check | Result |
|---|---|---|
| 1 | Start without Streamlit | **PASS** — `startup complete: records 3983, dense_vectors 3983, pending_embeddings 0` |
| 2 | `GET /health` | **PASS** — `{"status":"ok","version":"1.0.0"}` |
| 3 | `GET /ready` | **PASS** — `status: ready`; reports `retrieval_only: true`, embedding mode `hashing` (lexical, not semantic) |
| 4 | Auth | **PASS** — POST /search without token → 401 `unauthorized`; read token on `/admin/records` → 403 |
| 5 | `POST /search` Arabic (`التسويق الرقمي`, keyword) | **PASS** — 100 hits; top: 3420 «التسويق الرقمى ودوره فى تحقيق سعادة العملاء» |
| 6 | `POST /search` English (`supply chain`, keyword) | **PASS** — 11 hits; e.g. 1080, 3760, 802 (titles contain the phrase) |
| 7 | `POST /ask` project number (`المشروع رقم 3420`) | **PASS** — `answered_from_catalog`; title, year 2021, supervisor, students, call number 658.8, 82 pages, size — matches the search hit |
| 8 | `POST /ask` count by year (2021) | **PASS** — 80 (deterministic from data) |
| 9 | `POST /ask` supervisor (وسام رزة) | **PASS** — 12 projects, 10 listed on page 1 |
| 10 | `POST /ask` English topical (supply chain) | **PASS** — `llm_unavailable` (no LLM configured): 9+ matching records listed, no generated text, no invention |
| 11 | Unsupported question (Arabic, mixed topics) | **PASS** — `abstained` / `no_results` |
| 12 | Unsupported question (English, "quantum chemistry of dark matter") | **PASS** — `abstained` / `no_results` |
| 13 | Missing-detail question ("نتائج دراسة …") | **PASS** — `abstained` / `content_not_available`; states the dataset holds bibliographic data only |
| 14 | Data update: `POST /admin/records` | **PASS** — new record 4164 `created`, `embedding: indexed` |
| 15 | New record searchable | **PASS** — found by `POST /search` immediately |
| 16 | `PATCH` year, `POST /admin/index/verify`, `DELETE` | **PASS** — `updated/indexed`; verify `ok:true` (3,984 records = 3,984 embeddings); deleted, gone from search; store back to 3,983 |

**Observation (not a failure, nothing was changed):** the Arabic open question «ما المشروعات التي تناولت التسويق الرقمي؟» returned `abstained / insufficient_evidence`,
although the keyword search finds the projects (the dataset spells «الرقمى» with ى and my query used ي, and the strict evidence gate requires most distinctive terms to match).
Per the instructions, retrieval thresholds and evidence logic were **not** loosened. Re-test after deployment in neural mode; if Arabic phrasing variants matter, evaluate with `scripts/evaluate_abstention.py` before tuning anything.

## 3. Database and update mechanism
| Check | Result |
|---|---|
| SQLite store (standalone) open/read/write/verify | **PASS** (section 2) |
| PostgreSQL as RAG store and as read-only source view (local throw-away server, synthetic data) | **PASS** (`test_postgres.py`, `test_sync_script.py`) |
| `scripts/sync_from_source.py`: initial load, no-change run (0 re-embedded), new + edited + deleted rows, `--dry-run`, unreachable source (exit 1, password not printed) | **PASS** |
| Sync logic (`Indexer.sync_from_source`: upsert changed, delete vanished, embed only changed) against PostgreSQL | **PASS** (`test_postgres.py`, `test_admin_indexing.py`) |
| HTTP routes `POST /admin/sync` and `/admin/sync/records/{id}` | **Partly tested**: auth, role checks and the 409 `not_integrated_mode` response are covered; the routes were **not** exercised end-to-end in integrated mode against a PostgreSQL source (the CLI above runs the same code path) |
| Connection to the **academy's real database** | **NOT TESTED** — schema, credentials and network path not provided (see `BACKEND_HANDOFF.md` §4) |

## 4. Gemini
| Check | Result |
|---|---|
| Key supplied via environment only, never in source/logs/ZIP | **PASS** — key length checked, value never printed; ZIP scanned for it before packaging |
| `python scripts/gemini_check.py` (real key passed as a process environment variable) | **BLOCKED** — step 2 `ConnectError`: host cannot reach `generativelanguage.googleapis.com`; exit code 2 |
| Model list / selected model is supported by the Interactions API | **BLOCKED** (not verified) |
| Real Arabic and English generation | **BLOCKED** (not verified) |
| Gemini request/response handling and every failure mode | **PASS** against the local fake server only |
| Key format | Not validated. The supplied key begins `AQ.` rather than the usual `AIza…`; whether the Generative Language API accepts it can only be learned from a live call. |

No model was selected or pinned: the default `LLM_MODEL=auto` picks the newest stable `gemini-<ver>-flash[-lite]` the key can use once the check can run.
The embedding model was **not** changed.

## 5. Not verified / limitations (read before go-live)
1. Everything that needs Google or Hugging Face (above). Run `scripts/gemini_check.py`, then ask one topical Arabic and one English question through `POST /ask` and confirm `status: "ok"`, `generated_by: "llm"`.
2. Neural/semantic and cross-language retrieval (AR↔EN) were not exercised with the real model; live checks above ran in lexical mode. After the first start check `GET /ready` → `embedding.active_backend` is `fastembed`.
3. The shipped `data/cache/embeddings.npz` (3,800 vectors, model id `fe:sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`) is only used when that exact model loads; it was not used in these runs.
4. Docker image build and compose were not executed.
5. Quality of Gemini's wording is not measured; only that unsupported content cannot reach the user (policy tests).
6. The API returns student and supervisor names to authenticated callers (needed for name search). They are excluded from Gemini prompts by default. Use `HIDE_STUDENT_NAMES=true` or role filtering in your backend if students must not see them.
