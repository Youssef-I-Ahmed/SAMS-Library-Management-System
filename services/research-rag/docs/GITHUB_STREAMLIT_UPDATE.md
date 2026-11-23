# Updating the EXISTING GitHub repository and the EXISTING Streamlit app (no new repo, no new app, same URL)

Repository: <https://github.com/missalaasalah/sadat-smart-digital-rag> · The developer did **not** push, deploy or open the live URL.
Everything below is done by you (it needs your GitHub/Streamlit login).

## A. Before you touch anything (2 minutes)
1. Keep your current Streamlit **Secrets exactly as they are** (Settings → Secrets). Do not delete `LLM_API_KEY`. Nothing in this package requires a new secret. `.streamlit/secrets.toml.example` only documents the names.
2. Python version for the app: choose **3.13** (the version everything here was tested on) in Streamlit → app → Settings → Python version; 3.12 should also resolve but was not tested.

## B. Update the repository
```bash
git clone https://github.com/missalaasalah/sadat-smart-digital-rag.git repo-update   # or use your existing clone; git pull first
cd repo-update && git checkout main && git pull
# replace the working tree with the delivered package, KEEPING the .git folder:
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
unzip -q ../sadat-smart-digital-final-delivery.zip && cp -a sadat-smart-digital-final-delivery/. . && rm -rf sadat-smart-digital-final-delivery   # skip if the ZIP has no wrapper folder
git add -A
git add -f data/raw/Project.xlsx          # .gitignore blocks data/raw/*; -f is needed (a no-op if it is already tracked)
git status                                  # must NOT list .env, .streamlit/secrets.toml, *.db, data/store, data/processed
python scripts/predeploy_check.py           # FAIL lines must be zero (two WARN lines about data/cache are expected)
git commit -m "Arabic exact-ID + SQL counts + topic/year, new UI, merged fixes, Gemini kept optional"
git push origin main                        # <- only when you decide to
```
`data/raw/Project.xlsx` must be byte-identical to the approved file (sha256 `34e2be48…d427528`, checked by `predeploy_check.py`).

## C. What Streamlit does next
* Streamlit Community Cloud redeploys the same app when `main` changes (main file `app.py`, unchanged). If it does not, open the app → *Manage app* → **Reboot**. The URL does not change.
* First start after a (re)boot takes longer: the database is rebuilt from `Project.xlsx` (seconds), then the embedding model (~220 MB) downloads and the records are embedded **in the background**. During that time keyword mode is shown on the About page; project-number, count and filter questions work immediately. (Measured only in the sandbox with the model blocked: first render 54 s, then fully usable in keyword mode.)
* Optional speed-up (needs a machine with internet): `EMBEDDING_BACKEND=fastembed python scripts/build_embedding_cache.py`, commit `data/cache/embeddings.npz` (~3 MB).

## D. Storage and stability on the hosted app (no assumption of permanence)
| Item | Behaviour |
|---|---|
| SQLite file `data/store/rag.db` | lives on the container's **ephemeral** disk; lost on reboot/sleep/redeploy. Safe by design: it is rebuilt from `data/raw/Project.xlsx` on every cold start (tested from a clean ZIP extract) |
| Embedding vectors | stored in that same SQLite → recomputed after each cold start unless `data/cache/embeddings.npz` is committed |
| Admin edits (`PILOT_ADMIN_PASSWORD`) | would be **lost** on restart → keep `PILOT_ADMIN_PASSWORD` empty on the cloud (admin page hidden) |
| Concurrency | all sessions share one cached service (`st.cache_resource`); SQLite runs in WAL mode with a 30 s busy timeout while the background thread writes vectors. Not load-tested with many simultaneous users |
| Idle sleep | the app sleeps when idle and cold-starts on the next visit (the platform's rule; exact duration not verified) |
| Memory | Streamlit documents a ~1 GB per-app limit for Community Cloud (blog, read 2026-10-30; may change). If the app shows "over its resource limits", set `EMBEDDING_BACKEND = "hashing"` in Secrets |
| Need real persistence | external PostgreSQL via `DATABASE_URL` (code supports it; tested only on a disposable local PostgreSQL) |

## E. If something goes wrong
* *App shows "technical error" banner on start*: the message names the exception (e.g. `FileNotFoundError` = `Project.xlsx` was not committed).
* *Gemini errors*: the app keeps working in records-only mode; check the key on the status page (*Test the LLM*).
* Roll back: `git revert <commit>` and push; or Streamlit → Manage app → choose the previous commit/branch.
