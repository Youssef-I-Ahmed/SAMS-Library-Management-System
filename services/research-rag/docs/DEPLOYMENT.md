# Deployment

## A. Streamlit pilot (Streamlit Community Cloud)
1. Push to a **private** GitHub repo (dataset contains student names; `data/` is git-ignored). Provide data via the app: put `Project.xlsx` in `data/raw/` locally, or upload through your preferred private channel. On an empty store the app builds the index from `data/processed/records.jsonl` or `data/raw/Project.xlsx`.
2. App file: `app.py`, Python 3.13, `requirements.txt` (hashing embeddings, no torch).
3. Secrets (App → Settings → Secrets; template `.streamlit/secrets.toml.example`): `PILOT_ADMIN_PASSWORD`, optionally `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`.
4. **Streamlit Cloud's filesystem is ephemeral**: the SQLite store, edits and audit log vanish on restart. For persistence use an external PostgreSQL via `DATABASE_URL` (untested here) or treat the pilot as read-only demo.
5. Admin tab is gated by a single shared password — pilot only; production uses Express RBAC.

## B. FastAPI service (production)
Streamlit Cloud cannot host it. Use any container host/VM on a private network.
```bash
docker build -t sadat-rag .            # add --build-arg WITH_EMBEDDINGS=1 for neural embeddings
docker run -p 8000:8000 --env-file .env -v rag-store:/app/data/store sadat-rag
```
**Status: Dockerfile written but NOT built** — the Docker daemon started, but every registry (Docker Hub, ECR, GCR mirror, GHCR, Quay) was blocked, so the base image could not be pulled. The compose file validates (`docker compose config`), and the same `uvicorn` command was smoke-tested outside a container (`/health` 200, `/ready` 503 on an empty store, `/search` 401 without a token). Build and verify on your side.
Import the data privately (not baked into the image): `docker compose --profile import run --rm rag-import` with `Project.xlsx` in `./private-import/`. Non-container: `uvicorn api.main:app --host 0.0.0.0 --port 8000 --no-access-log` (access logs would record query strings).
Initial index: `python scripts/prepare_data.py && python scripts/build_index.py` (standalone) or `python scripts/build_index.py --sync-source` (integrated). The service also loads an existing store on start.
Probes: `/health` (liveness), `/ready` (503 until loaded). Run behind HTTPS; set a strong `SERVICE_JWT_SECRET`; keep `AUTH_DISABLED=false`.

## C. Neural embeddings (optional)
`pip install -r requirements-embeddings.txt`, `EMBEDDING_BACKEND=sentence-transformers`, then full rebuild. Downloads ≈470 MB model plus torch and needs more RAM. Untested here (network blocked) — evaluate with `scripts/evaluate.py` before adopting. For very large corpora consider pgvector; at 4k records in-memory numpy is ample.

## D. Repair & rebuild
* Check: `python scripts/build_index.py --verify` or `POST /admin/index/verify`.
* Embed only missing: `--pending` / `POST /admin/index/reindex?scope=pending`.
* Full rebuild: `python scripts/build_index.py` / `?scope=full`. Multiple workers pick up the change via the change-log epoch.
* Embedding failure never removes a record from keyword/structured search; it is retried by `--pending`.

## E. Troubleshooting
| Symptom | Check |
|---|---|
| `/ready` 503 | store empty → run build_index; DB URL wrong |
| 401 on every call | secret/iss/aud mismatch; token expired (≤10 min) |
| 409 `records_managed_externally` | integrated mode — edit in PostgreSQL, then sync |
| Ask always abstains | expected for findings/summary questions; `LLM_PROVIDER=none` gives catalog answers only |
| `llm_unavailable`/`llm_error` | key/model/base URL; structured search still works |
| Arabic name not found | spelling variants are matched; Latin transliterations are not |


## F. Docker (what was verified) and deployment status
* `docker build -t sadat-rag .` and `docker compose up` are the intended commands. Verified only with a locally assembled base (`--build-arg BASE_IMAGE=local/python:3.13-ubuntu-noble`, see `scripts/build_local_base_image.sh`); see TEST_REPORT §6.
* Required env: `SERVICE_JWT_SECRET` (compose refuses to start without it). Dataset import: put `Project.xlsx` in `./private-import/` with mode 0644 (the container user is uid 10001), then `docker compose --profile import run --rm rag-import`.
* **Not deployed by the developer.** Remaining blockers, precisely: (1) ~~approval~~ — granted by the academy (owner's statement); (2) no hosting account/credentials were provided for this project (the session environment contains its own cloud/GitHub tokens, which belong to the coding session and were deliberately not used); (3) container registries are unreachable from the build environment, so no image could be pushed; (4) TLS, rate limiting and a production PostgreSQL are the operator's to provide.
