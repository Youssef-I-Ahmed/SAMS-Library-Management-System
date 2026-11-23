# Gemini Interactions API update (2026-11-23)

| File | Change |
|---|---|
| `src/rag/llm.py` | Gemini now calls `POST /v1beta/interactions`; sends system instruction and generation config; uses `store=false`; parses Interactions `model_output` steps; auto-selection restricted to supported Interactions models. |
| `scripts/gemini_check.py` | Live check now sends real Arabic and English requests through Interactions API; never prints the key. |
| `src/ui/views_ops.py` | Model list display filters to Interactions API-supported models. |
| `.env.example` | Default Gemini model set to `gemini-3.8-flash`. |
| `tests/integration/test_llm_providers.py`, `tests/evaluation/test_gemini_modes.py` | Updated mocked request/response tests for Interactions API and stateless requests. |
| `docs/GEMINI.md`, `docs/BACKEND_HANDOFF.md`, `docs/BACKEND_TESTING_REPORT.md` | Updated integration and testing guidance. |

Unchanged: dataset, embedding cache/model, retrieval, evidence/abstention rules, API routes/auth, and privacy defaults (`RAG_INCLUDE_STUDENTS=false`, `RAG_INCLUDE_SUPERVISORS=false`). No `.env` or API key is included in this ZIP.

# Changes for the standalone backend (this delivery) — original project preserved, dataset and embedding cache byte-identical

| File | Change |
|---|---|
| `api/routes/public.py`, `api/schemas/models.py` | **Added `POST /search`** (JSON body, `SearchRequest`); `GET /search` kept; both call one shared function (`_run_search`), retrieval logic untouched. Request examples added to `AskRequest`/`SearchRequest` |
| `scripts/gemini_check.py` (new) | Live Gemini verification (key list, model availability, Arabic + English generation); never prints the key |
| `scripts/sync_from_source.py` (new) | Cron-friendly incremental sync from the academy PostgreSQL view (`--dry-run`) |
| `requirements.txt`, `requirements-ui.txt` (new), `requirements-dev.txt` | Streamlit moved out of the backend requirements; unused `google-genai` line removed (code uses httpx REST) |
| `.env.example` | Standalone-backend section on top (Gemini, JWT secret, embeddings, privacy defaults); no real values |
| `Dockerfile`, `docker-compose.yml` | Image now includes `data/cache` (embedding cache); comments |
| `scripts/bootstrap.py` | Final message points to the API instead of Streamlit |
| `tests/api/test_api.py`, `tests/integration/test_sync_script.py` (new) | 5 new tests (POST /search, sync script on real PostgreSQL) |
| `docs/BACKEND_HANDOFF.md`, `docs/BACKEND_TESTING_REPORT.md` (new), `docs/INTEGRATION.md`, `docs/openapi.json`, `README.md` | Integration guide, actual test report, OpenAPI regenerated |

Not changed: `src/` (RAG core, retrieval, embeddings, evidence policy, privacy), `data/raw/Project.xlsx`, `data/cache/embeddings.npz`, `app.py` and the Streamlit UI.

---
(previous change log follows)

# Changed files — final delivery vs the original upload (A)

| File | Change |
|---|---|
| `src/rag/structured.py` (new), `src/rag/answer.py`, `src/rag/messages.py` | Arabic/English exact-ID route, SQL count route, zero-as-answer, `ask_safe`, premise-mismatch warnings (checkpoint), completion verbs (checkpoint), **topic+year route** (this round) |
| `src/storage/record_store.py` | parameterised SQL helpers incl. `topic_counts` |
| `src/stats.py` (new), `src/data/normalize_ar.py`, `src/retrieval/engine.py`, `src/indexing/indexer.py`, `src/rag/llm.py` | statistics, digit folding, empty-query safeguard + dense gate, non-blocking embedding, provider error parsing |
| `app.py`, `src/ui/*` (`style.py`, `i18n.py`, `i18n_v2.py`, `views.py`, `views_ops.py`) | redesigned UI; about-page privacy text updated to the academy's approval |
| `.streamlit/config.toml` | navy/gold theme |
| `requirements.txt` | `google-genai` kept as in the original (restored after an earlier removal); no other change |
| `scripts/ui_check.py` (new), `scripts/llm_smoke.py` | browser check; smoke message |
| `tests/…` | see `TEST_REPORT.md` §2 |
| `docs/` | new: `FINAL_DELIVERY_REPORT`, `VERSION_MERGE_REPORT`, `GEMINI`, `SEMANTIC_SEARCH`, `POST_DEPLOY_TEST_PLAN`, `GITHUB_STREAMLIT_UPDATE`, `ROOT_CAUSE_REPORT`, `UI_REDESIGN_REPORT`, `SOFTWARE_TEAM_HANDOVER`, `FINAL_ACCEPTANCE_CHECKLIST`; updated: approval wording in `PRIVATE_CLOUD_TESTING`, `DEPLOYMENT`, `EXTERNAL_REQUIREMENTS`, `SECURITY_REPORT`, `STREAMLIT_CLOUD_GUIDE`, `data/PRIVATE_DATA_README.md`; historical banners on `FINAL_AUDIT`, `UPDATE_REPORT`, `docs/TEST_REPORT.md` |

Unchanged: dataset (sha256 `34e2be486ecc37014e685d216f263920fd9404e6cf9b2b5a41245d55ad427528`), API (`api/`), Express reference gateway, Dockerfile, Gemini provider code and settings, `.env.example`, `.streamlit/secrets.toml.example` (except two comment lines about approval).
