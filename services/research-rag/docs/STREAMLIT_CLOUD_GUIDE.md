# Streamlit Community Cloud — notes (superseded step list: see GITHUB_STREAMLIT_UPDATE.md)

**Data.** `data/raw/Project.xlsx` contains real student and supervisor names; the academy has approved publication (owner's
statement, 2026-10-30). Access control is optional and a product decision: `APP_ACCESS_PASSWORD` (built in) or Streamlit's
viewer list (Share). Neither has been tested on the live app by the developer.

## What you must do yourself (accounts, secrets, approvals)
1. Create a **private** GitHub repository (e.g. `sadat-rag`). Unzip the project, then in the folder:
   ```
   git init && git add . && git add -f data/raw/Project.xlsx     # -f: .gitignore blocks data/raw by default
   python scripts/predeploy_check.py                              # must print no FAIL
   git commit -m "SADAT RAG pilot" && git branch -M main
   git remote add origin https://github.com/<you>/sadat-rag.git && git push -u origin main
   ```
2. *(Recommended, on your laptop — it can download the model):*
   ```
   pip install -r requirements.txt
   EMBEDDING_BACKEND=fastembed python scripts/build_embedding_cache.py      # writes data/cache/embeddings.npz (~3 MB)
   EMBEDDING_BACKEND=fastembed python scripts/bootstrap.py && EMBEDDING_BACKEND=fastembed python scripts/eval_semantic.py
   git add data/cache && git commit -m "embedding cache + calibration" && git push
   ```
   `eval_semantic.py` measures AR→AR / EN→EN / cross-language recall and writes `data/cache/semantic_calibration.json`
   (the similarity floor measured for this exact model). Without these files the app still works: it embeds the records at
   first start (slower) and uses the UNCALIBRATED floor 0.35, shown as such in the diagnostics.
3. Go to <https://share.streamlit.io> → sign in with GitHub, authorise access to the private repo → **Create app** →
   repo, branch `main`, main file `app.py` → **Advanced settings**: choose Python **3.12** (3.13 also resolves) and paste Secrets (below) → Deploy.
4. **Gemini key**: <https://aistudio.google.com/apikey> → create key (no purchase needed to create one). Whether your key has a
   free quota for a given model, and its limits, depend on Google's current terms **for your account/region — not verified here**;
   check them in AI Studio. If a model needs billing, use `LLM_PROVIDER = "none"` (retrieval-only) rather than paying.
5. Open the app → **System status** tab → press *List Gemini models available to my key*, copy a current text model id into the
   `LLM_MODEL` secret (the app does not hardcode one because model ids change), then *Test the LLM*.
6. Share → invite viewers (option 1) or give testers the password (option 2).

## Secrets (placeholders — paste in Streamlit → Settings → Secrets)
See `.streamlit/secrets.toml.example`. Never commit real values.

## Platform facts (Streamlit docs, as read on 2026-10-24; limits may change without notice)
- ~690 MB–2.7 GB RAM, up to 2 CPU cores; apps idle for 12 h go to sleep and wake on visit. The filesystem is ephemeral, so the
  model download and the in-memory index are rebuilt after each restart/wake (cached within one run via `st.cache_resource`,
  not on every rerun). The MiniLM ONNX model is ~220 MB; the embedding cache avoids embedding 3,983 records at start-up.
- Admin edits made in the pilot are lost on restart (ephemeral disk): leave `PILOT_ADMIN_PASSWORD` empty on the cloud.

## Manual acceptance checklist
- [ ] Password gate rejects a wrong password; accepts the right one.
- [ ] No yellow "LEXICAL FALLBACK" banner (if present, the diagnostics show why the model failed to load).
- [ ] System status → *Run semantic self-test*: AR→AR, EN→EN, AR→EN rows show sensible titles.
- [ ] Search "ماجد" style name/supervisor/student queries return full lists; 1-char and gibberish queries are refused or empty.
- [ ] *Test the LLM* succeeds; ask an answerable question → answer with [R#] citations and `generated_by: llm`.
- [ ] Ask something the catalogue cannot answer (e.g. "what were the findings of …") → explicit abstention.
- [ ] Diagnostics show `llm_receives.supervisor_names=false` and `student_names=false` unless you approved otherwise.
- [ ] Arabic UI is RTL; English UI is LTR.


---
## Update an EXISTING deployment (hashing mode -> semantic + Gemini)
Why the live app says "LEXICAL MODE" / "retrieval-only": nothing is broken. `Settings.embedding_backend` defaults to `hashing`,
`llm_provider` defaults to `none`, and no Secrets were set. Setting Secrets switches both on.
1. In the repo, replace the files with the ones from the updated ZIP (see CHANGES below), then commit and push to `main`. Streamlit redeploys automatically.
2. Streamlit Cloud -> your app -> **Settings -> Secrets**, paste (replace placeholders; keep quotes):
```toml
APP_ACCESS_PASSWORD  = "long-random-password"          # gate for the whole app
EMBEDDING_BACKEND    = "fastembed"                     # real multilingual model (hashing = lexical only)
EMBEDDING_MODEL      = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"   # REQUIRED: the code default is not a fastembed model
LLM_PROVIDER         = "gemini"
LLM_MODEL            = "auto"                          # picks a stable flash model your key can use; or an exact id from the in-app list
LLM_API_KEY          = "<your Google AI Studio key>"    # enter it only in this Secrets box
RAG_INCLUDE_SUPERVISORS = "false"                      # keep false: names are not sent to Google
RAG_INCLUDE_STUDENTS    = "false"
HIDE_STUDENT_NAMES   = "false"                         # "true" = demo mode: student lookup is DISABLED, not just hidden
PILOT_ADMIN_PASSWORD = ""                              # see "Admin" below
```
3. Reboot the app (Manage app -> Reboot). First start downloads the ~220 MB model; watch the logs for download errors.
4. Open **System status**: confirm `active_backend: fastembed` and no yellow banner. Press *List Gemini models available to my key*, put one
   id into `LLM_MODEL`, save Secrets, then press *Test the LLM*. Error meanings: invalid key -> "rejected the API key";
   unknown model -> "does not know the model in LLM_MODEL"; quota -> "rate-limiting".
5. Press *Run semantic self-test*. Until you have done steps 3-5 on the live app, semantic search and Gemini are **not verified**.

### Admin
`PILOT_ADMIN_PASSWORD` is the correct variable (`app.py`, `with tab_admin`). Empty = admin tab disabled. When set, the tab asks for that
password (constant-time compare) before showing any form; all edit operations live only in that tab (the Streamlit pilot has no
other admin page or endpoint). **Cloud caveat:** edits go to the container's SQLite file and are LOST when the app restarts or
sleeps; the original spreadsheet in the repo is never modified. Recommendation: leave it empty on the cloud pilot.
Tested: wrong password rejected, right password admits, delete needs explicit confirmation (`tests/integration/test_streamlit_app.py`, synthetic data).

### Who can see names? (read this before sharing)
A private GitHub repo does NOT make the Streamlit URL private. Anyone who reaches the app and passes the gate sees supervisor names
and (unless `HIDE_STUDENT_NAMES=true`) student names. Verified here: with `APP_ACCESS_PASSWORD` set, no record text renders before
the password is entered (AppTest on the real dataset). Not verified here: Streamlit's own viewer restriction (Share -> specific
emails) - check it in the Streamlit dashboard before sharing. If a stricter guarantee is needed, run the app on infrastructure
you control (e.g. a university server) instead of Community Cloud.
