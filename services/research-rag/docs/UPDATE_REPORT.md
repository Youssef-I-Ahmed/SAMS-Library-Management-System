> **Historical document (earlier round).** Test counts and statements here are from that round only; the current, authoritative status is the root `TEST_REPORT.md` and `docs/FINAL_DELIVERY_REPORT.md` (2026-10-30).

# Update report (latest: zero-cost real testing path)

**Question:** can the real multilingual evaluation and real-LLM smoke test be done at zero cost?
**Answer:** yes, on your machine, with free tools; not in this cloud workspace (models are unreachable from here).

| | Actually run here | Not run (needs your machine) |
|---|---|---|
| Embeddings via free **Ollama `bge-m3`** | client `OllamaEmbedder` + config + fallback, pipeline (index → hybrid search, exact names complete) against a **simulated** Ollama server: 4 tests pass; the full runner executed end to end on the real dataset against the simulation (3,983 records indexed, consistency OK, 0 supervisor / 0 student / 0 title mismatches vs the Excel oracle) | real model quality, cross-language recall, threshold selection |
| Embeddings via a **model folder copied from your laptop** | loader/offline/prefix plumbing (earlier round, fake loader) | real run |
| LLM via free **Ollama** (`LLM_PROVIDER=ollama`, no key) | provider (native `/api/chat`, `num_ctx`), errors, fallback; `/ask` end-to-end through the provider over HTTP against the simulation | real answers, citations/faithfulness with a real model |
| Hugging Face / Ollama registry / cloud APIs from this workspace | re-probed: blocked | – |

The simulation's scores are **meaningless** and nothing from it is reported as a result. Mechanics-only findings: the evaluation script, the
runner and the smoke test run without errors; a calibration "ranges overlap" outcome is handled (no threshold is invented).

**Minimum action from you:** install Ollama, run `python scripts/free_local_check.py --pull`, send back `data/processed/free_local_report.json`
(details and alternatives: `docs/FREE_LOCAL_TESTING.md`).

---
# Update report (latest round: model/LLM re-check, Docker, Express/Prisma integration, deployment)

Nothing was rebuilt. `data/raw/Project.xlsx` (sha256 `34e2be48…8528`, 3,983 records) was not modified.

## Status board
| Category | Items |
|---|---|
| **Verified and passing** | Full suite **306 passed / 0 failed / 0 skipped** (host venv, Python 3.13.16, PostgreSQL tests included) and the same **306/0/0 inside a Docker container**. Live API check **36/36** against the host service and against the container. Real Dockerfile built and run (healthcheck, non-root, bootstrap, compose import + API) on a **locally assembled base**. Reference **Express 5 + Prisma 7 ↔ PostgreSQL ↔ Python service: 11/11** real-HTTP tests with the real dataset (RBAC, complete author lists vs Excel oracle, create/edit/delete via Prisma + sync). Logs: 0 Arabic characters / 0 query strings. |
| **Implemented but not tested** | Neural embeddings (local-model path, offline mode, prefixes, neural floor, calibration/eval script): tested only with a synthetic double and a fake loader. LLM providers: mocked HTTP only; `scripts/llm_smoke.py` ready. |
| **Blocked** | **Real multilingual model**: re-probed this round (Hugging Face, ModelScope, fbaipublicfiles, Kaggle, S3, Zenodo, GitLab unreachable; 246 npm packages returned by 16 embedding/multilingual searches were size-checked and the largest inspected, plus ~20 PyPI package names and `wordllama`: they bundle English-only models, hash test embedders, or fetch weights from the blocked hubs) → no retrieval evaluation or similarity threshold could be measured; the 0.80 neural floor remains an **unmeasured default**. **Real LLM**: no project API key exists; the session's own model endpoint and the cloud/GitHub tokens in the environment were **not** used. **Official Docker base image** and registry push: registries 403. **`prisma migrate`**: engine download blocked. **Team's Express/Prisma/React code and schema**: not available. **Deployment**: no credentials/approval (see DEPLOYMENT §F). |
| **Known limitations** | Hashing mode is lexical, not cross-lingual; student identity is name-only; no TLS/rate limiting; one shared Streamlit admin password; the container image was built on a stand-in base; the Express gateway is a reference harness, not production code. |

## Defects found and fixed this round
1. `scripts/reconcile.py` crashed in a container (no/read-only `docs/`): now falls back to `data/processed/`.
2. `docker-compose.yml`: added `BASE_IMAGE` build arg and a **required** `SERVICE_JWT_SECRET`.
3. `Dockerfile`: `ARG BASE_IMAGE` (default unchanged `python:3.13-slim`).
4. Documented: 0600 dataset files are unreadable by the container user; use a 0644 copy for the import mount.
(One test bug in the new Node tests was also fixed: an empty body hit validation before the mode check.)

## Next actions needed from you
1. Machine with huggingface.co access: `python scripts/download_model.py`, set the three `EMBEDDING_*` variables, `python scripts/bootstrap.py`, `python scripts/eval_semantic.py`, then set `SEMANTIC_MIN_SCORE_NEURAL` from its output.
2. Put `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` in your secret store and run `python scripts/llm_smoke.py`.
3. Machine with registry access: `docker build -t sadat-rag . && docker compose up`.
4. Software team: run the contract tests against their Express/Prisma/PostgreSQL (`integration/express` shows the exact requests) and share the real table/column names for the view.
5. ~~Written approval from the data owner before any hosting~~ — granted by the academy (owner's statement, 2026-10-30).

---
# Earlier in this update: semantic search, LLM `/ask`, API contracts

Starting point: the previous ZIP (dataset v2, 294 tests passing). Nothing was rebuilt; `data/raw/Project.xlsx` (sha256
`34e2be48…8528`, 3,983 records) and the processed data were **not touched**.

## What was found to be missing (confirmed by inspecting the code)
1. The neural embedder could only load a model by hub name: no local folder, no offline switch, no prefix override.
2. One cosine floor (0.30, tuned for hashing) was applied to every embedder; neural cosines sit much higher, so it would have admitted noise.
3. No script to measure/calibrate neural retrieval or to run a real-LLM check; no JSON contract text for retrieval-only vs LLM `/ask` and the semantic mode.

## Changes (small, additive)
| Area | Change |
|---|---|
| `src/retrieval/embeddings.py` | `EMBEDDING_MODEL_PATH` (local folder), `EMBEDDING_LOCAL_ONLY`, optional query/passage prefixes (automatic `query:`/`passage:` for e5), `EMBEDDING_MAX_SEQ_LENGTH`; `is_neural()`; `/ready` shows `model_source`; bad path/missing package → visible fallback to hashing |
| `src/retrieval/engine.py` + settings | `SEMANTIC_MIN_SCORE_NEURAL` (default 0.80, **uncalibrated**) used only for neural embedders; hashing keeps 0.30 |
| `scripts/download_model.py` | one-time model download (needs huggingface.co) |
| `scripts/eval_semantic.py` | AR/EN topic probes, lexical vs semantic vs hybrid recall/nDCG, noise-vs-topic cosine ranges → suggested floor; **refuses to run (exit 2) on the hashing embedder** |
| `scripts/llm_smoke.py` | real-call checks for `/ask` (LLM used, citations ⊆ retrieved sources, findings question not LLM-answered); exit 2 "NOT TESTED" without a key |
| Docs | `INTEGRATION.md` (modes table, real `/ready` and `/ask` JSON, how `generated_by` works), `.env.example`, `EXTERNAL_REQUIREMENTS.md`, README |
Preserved unchanged: all endpoints, auth/RBAC, search logic of the structured modes, evidence/abstention policy, UI, data.

## Tests actually run
| Run | Result |
|---|---|
| Full suite (`pytest -q`, Python 3.13, PostgreSQL 18 tests included) | **306 passed, 0 failed, 0 skipped** (294 earlier + 12 new) |
| New `tests/integration/test_neural_pipeline.py` (10) | re-indexing when the embedder changes (stale vectors detected, then consistent); cross-lingual hybrid hit **with a synthetic bilingual test double** while hashing misses it; exact title kept first in hybrid; **supervisor lists (130 records, 3 names), student and title searches identical with and without the neural embedder**; neural floor applied (not the hashing floor); admin-added record is embedded and found semantically; local-path/offline/prefix plumbing via a fake `sentence_transformers`; fallback with visible reasons |
| New `tests/unit/test_operator_scripts.py` (2) | `eval_semantic.py` refuses on hashing; `llm_smoke.py` reports NOT TESTED without credentials |
| Data integrity | Excel sha256 unchanged; 3,983 records; real-data tests (supervisor/student/title/subject completeness vs independent oracle, abstention) pass; live API check on the packaged copy (see end) |

## What is NOT proven (honest)
* **No real multilingual model was run.** huggingface.co, ModelScope, fbaipublicfiles, Kaggle, S3, Zenodo are blocked here; the PyPI/npm packages examined either bundle no weights or download them from the blocked hubs. The neural tests use a synthetic test double: they prove the *pipeline*, **not the quality** of e5/LaBSE on Arabic/English. Real cross-lingual quality and the 0.80 floor are untested.
* **No real LLM call.** No API key exists in this environment (the session's own model endpoint is not a project credential and was not used). Provider adapters are tested with mocked HTTP only.
* Docker, Express/React/Prisma integration: still untested.

## What needs an external key/service
| Need | For |
|---|---|
| Access to huggingface.co once (or a copied model folder) + ~470 MB + torch | real multilingual semantic search |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` from the owner's secret store | real LLM answers |
| Docker registry access; the team's Express/React/PostgreSQL | container build; integration tests |

## Commands to finish the two open items (on a machine with access)
```bash
pip install -r requirements-embeddings.txt && python scripts/download_model.py
export EMBEDDING_BACKEND=sentence-transformers EMBEDDING_MODEL_PATH=models/multilingual-e5-small EMBEDDING_LOCAL_ONLY=true
python scripts/bootstrap.py && python scripts/eval_semantic.py      # then set SEMANTIC_MIN_SCORE_NEURAL from its output
export LLM_PROVIDER=gemini LLM_MODEL=<model> LLM_API_KEY=<key>      # never in files/Git
python scripts/llm_smoke.py
```
