# Private Streamlit Cloud testing — read BEFORE deploying

**Status: NOT deployed by the developer.** The academy has approved publication of this dataset (statement by the project owner, 2026-10-30; the approval document itself is not part of the repository and was not seen by the developer). Hosting on Streamlit Community Cloud (a third-party US-hosted service) is therefore not blocked by approval; access control below remains optional.

## What the data exposes
`Project.xlsx` holds real student names (3,857 of 3,983 rows have them), supervisor names, titles and years. The app displays student names in record details and in Student search results. Anyone who can open the app URL can read them.

## Required configuration
1. **Private GitHub repo** containing only code. `data/raw/`, `data/processed/`, `data/store/`, `.env`, `.streamlit/secrets.toml` are git-ignored — verify with `git status` / `git ls-files | grep -E "xlsx|jsonl|\.db"` (must print nothing) before the first push.
2. **App access restricted**: in Streamlit Cloud → Share, set the app to *private* and invite only named viewers (email/SSO). Do not use "public".
3. **Getting the data to the app without committing it** (pick one, after authorization):
   a. Store the xlsx as base64 in Streamlit *Secrets* and decode to `data/raw/Project.xlsx` at start (needs a small code addition; not implemented), or
   b. Use an external private PostgreSQL via `DATABASE_URL` (untested here), or
   c. Use the Streamlit file-upload in the Administration tab (not implemented).
   Until one is chosen the app will start with an empty catalogue.
4. Secrets (App settings → Secrets): `PILOT_ADMIN_PASSWORD` (strong), optionally `LLM_PROVIDER/LLM_MODEL/LLM_API_KEY`. With an LLM key, only *explicitly supported record metadata* is sent to the provider, **student names are excluded by default** (`RAG_INCLUDE_STUDENTS=false`); still confirm the provider's data policy.
5. The filesystem is ephemeral: edits/audit log are lost on restart.
6. Hide student names in the cloud pilot if not needed: not implemented as a switch for the detail view — raise as a change request.

## Limitations to accept
Third-party hosting of personal data; shared single admin password; no per-user audit; no rate limiting; cold-start index build ~10 s.
