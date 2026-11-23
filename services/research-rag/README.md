# SADAT Smart Digital Library — Projects & Research RAG

> **Standalone backend (FastAPI, no Streamlit):** start with `docs/BACKEND_HANDOFF.md` (integration guide, database information needed from the software team)
> and read `docs/BACKEND_TESTING_REPORT.md` (what was and was not verified). `POST /search` was added next to the existing `GET /search`.
> Streamlit is optional and only for the legacy pilot UI: `pip install -r requirements-ui.txt`.


Search + grounded Q&A over the **metadata** of 3,983 student projects/theses (`Project.xlsx`; bilingual Arabic/English).

| Component | Where |
|---|---|
| Retrieval engine (structured title / supervisor / **student** / subject search, BM25, semantic, hybrid, filters, sorting, pagination) | `src/` |
| RAG with evidence & abstention policy, configurable LLM provider (**Gemini optional**, OpenAI-compatible, Anthropic, Ollama, or none) — see [docs/GEMINI.md](docs/GEMINI.md) | `src/rag/` |
| Production API (FastAPI, OpenAPI, service-JWT auth, RBAC, admin CRUD, index ops) | `api/` |
| Streamlit UI (navy/gold, AR/RTL + EN/LTR; Home, Assistant, Search, Details, Statistics, About, status, admin) | `app.py`, `src/ui/` |
| Deterministic structured layer (exact project number in AR/EN, SQL counts, year ranges) — no LLM needed | `src/rag/structured.py`, `src/storage/record_store.py` |
| Import / index / reconcile / evaluate scripts | `scripts/` |
| Tests, docs | `tests/`, `docs/` |

Key guarantees
* Supervisor, student, title and subject search are **structured and exhaustive**: every matching record, true total, lossless pagination, exact vs approximate labels. Similar names are **never merged**. Ranked modes are labelled non-exhaustive.
* The dataset is bibliographic metadata only → the system **abstains** on findings / methodology / full-text questions (`docs/EVIDENCE_POLICY.md`). Structured lookups work without an LLM.
* The original spreadsheet is never modified; nothing is deleted for being duplicate or incomplete.
* No secrets or personal data in the repo/ZIP. **The dataset contains student names — keep it out of public repositories.**

## Quick start (Python 3.13)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt                 # + requirements-dev.txt for tests
cp .env.example .env                            # fill in secrets; never commit .env
# the ZIP already contains the CURRENT dataset (data/raw/Project.xlsx, v2). Real student names: private use only.
python scripts/bootstrap.py                     # ONE COMMAND: prepare + index + reconcile + verify (exit 0 = all OK)
streamlit run app.py                            # pilot UI
uvicorn api.main:app --port 8000 --no-access-log        # API docs: http://localhost:8000/docs
python scripts/make_token.py --admin            # dev token for the curl examples (needs SERVICE_JWT_SECRET)
```
For local API development without Express you can set `AUTH_DISABLED=true` (read endpoints only; admin stays locked).

## Tests
```bash
EMBEDDING_BACKEND=hashing pytest -q            # full suite (see TEST_REPORT.md for the last actual run)
playwright install chromium && streamlit run app.py --server.port 8765 --server.headless true &
python scripts/ui_check.py --url http://localhost:8765 --out ui_report     # browser check, 3 viewports
```
```bash
pip install -r requirements-dev.txt
pytest -q                      # synthetic corpus; real-data and PostgreSQL tests skip themselves when unavailable
pytest -q -m realdata          # needs data/raw/Project.xlsx
pytest -q -m postgres          # needs TEST_POSTGRES_URL or the optional pixeltable-pgserver (in requirements-dev.txt)
python scripts/evaluate.py && python scripts/evaluate_abstention.py     # evaluation (separate from unit tests)
```
Actual results and what was not run: `docs/TEST_REPORT.md`.

## Docs
[Final delivery report](docs/FINAL_DELIVERY_REPORT.md) · [Version merge](docs/VERSION_MERGE_REPORT.md) · [Gemini](docs/GEMINI.md) · [Semantic search](docs/SEMANTIC_SEARCH.md) · [Post-deploy test plan](docs/POST_DEPLOY_TEST_PLAN.md) · [Root-cause report](docs/ROOT_CAUSE_REPORT.md) · [UI redesign](docs/UI_REDESIGN_REPORT.md) · [Software-team handover](docs/SOFTWARE_TEAM_HANDOVER.md) · [GitHub/Streamlit update](docs/GITHUB_STREAMLIT_UPDATE.md) · [Acceptance checklist](docs/FINAL_ACCEPTANCE_CHECKLIST.md) · [Update report (semantic/LLM)](docs/UPDATE_REPORT.md) · [Final audit](docs/FINAL_AUDIT.md) · [Dataset v1→v2 comparison](docs/DATASET_COMPARISON.md) · [Impact assessment](docs/DATASET_UPDATE_IMPACT.md) · [Test report](docs/TEST_REPORT.md) · [Data reconciliation](docs/DATA_RECONCILIATION_REPORT.md) · [Data quality](docs/DATA_QUALITY_REPORT.md) · [API & integration](docs/INTEGRATION.md) (+ [openapi.json](docs/openapi.json)) · [Operations: import, index, backup](docs/OPERATIONS.md) · [Deployment](docs/DEPLOYMENT.md) · [Private cloud testing](docs/PRIVATE_CLOUD_TESTING.md) · [Security report](docs/SECURITY_REPORT.md) · [Evidence policy](docs/EVIDENCE_POLICY.md) · [Evaluation](docs/EVALUATION.md) · [What blocks deployment](docs/EXTERNAL_REQUIREMENTS.md)

## Semantic search and LLM answers: what is real today
**Zero-cost real test on your laptop:** `python scripts/free_local_check.py --pull` (Ollama, bge-m3, qwen2.5) — see `docs/FREE_LOCAL_TESTING.md`.
* **Default = offline lexical-fuzzy retrieval** (BM25 + hashing vectors): exact/partial/fuzzy matching, **not semantic and not cross-lingual**. `/ready` says so.
* **Streamlit Cloud pilot: see `docs/STREAMLIT_CLOUD_GUIDE.md`** (fastembed/ONNX backend, private repo, password gate). Real multilingual embeddings are implemented but could not be run here (no model download possible). To enable: `pip install -r requirements-embeddings.txt`, `python scripts/download_model.py`, set `EMBEDDING_BACKEND=sentence-transformers EMBEDDING_MODEL_PATH=models/multilingual-e5-small EMBEDDING_LOCAL_ONLY=true`, `python scripts/bootstrap.py`, then `python scripts/eval_semantic.py` (measures lexical vs semantic vs hybrid, AR/EN, and calibrates `SEMANTIC_MIN_SCORE_NEURAL`). Name/supervisor/student/title searches stay exact and complete in every mode.
* **`/ask` runs retrieval-only unless `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY` are set** (never in code/Git). `python scripts/llm_smoke.py` performs real-call checks once a key exists.

## Integration and containers
* `python scripts/run_node_integration.py` — real HTTP test of Express + Prisma + PostgreSQL + this service (reference gateway in `integration/express`).
* `docker compose up` (set `SERVICE_JWT_SECRET`); registry-less hosts: `scripts/build_local_base_image.sh` then `--build-arg BASE_IMAGE=…`. See `docs/DEPLOYMENT.md` §F.

## Not verified (honest status, final delivery 2026-10-30)
* **The hosted Streamlit app** (nothing was deployed or opened by the developer) · **the real multilingual embedding model** (download blocked in the sandbox; the app falls back to keyword mode and says so) · **a live Gemini request** (Google is unreachable from the sandbox; request/response handling is tested against a fake Gemini server).
* The team's own React/Vite, Express, Prisma and RBAC code (a reference gateway and a disposable PostgreSQL *were* tested) · production PostgreSQL · Docker build on the official base image.
Details: `TEST_REPORT.md`, `docs/FINAL_DELIVERY_REPORT.md`, `docs/EXTERNAL_REQUIREMENTS.md`.

Existing pilot URL (from the previous README; **not opened or verified by me**): https://sadat-smart-digital-rag-wobypjjdajxzlymyvmypdz.streamlit.app/
