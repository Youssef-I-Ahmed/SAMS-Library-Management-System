# Deployment guide (Streamlit Community Cloud, private GitHub repo)

Status of this package: code complete and regression-tested; **real neural model, a live Gemini call and the live deployment are NOT yet verified** (see TEST_REPORT.md). Exact steps: `docs/GITHUB_STREAMLIT_UPDATE.md`.

## 0. Before sharing anything
The academy has approved publication of this dataset (statement by the project owner, 2026-10-30; the approval document itself is not part of the repository and was not seen by the developer). The data has real student and supervisor names and they stay visible (nothing is anonymised). Git history is permanent: choose the repository visibility deliberately. Optional access control: `APP_ACCESS_PASSWORD` (built in) or Streamlit's viewer list (Share); neither was tested on the live app by me.
Names stay searchable by default (`HIDE_STUDENT_NAMES=false`). Names are NOT sent to Gemini (`RAG_INCLUDE_SUPERVISORS=false`, `RAG_INCLUDE_STUDENTS=false`).

## 1. Push to your private repo
```powershell
cd sadat-rag
git add .
git add -f data/raw/Project.xlsx          # .gitignore blocks it by default
python scripts/predeploy_check.py         # must print no FAIL
git commit -m "Semantic pilot update"; git push
```
(Existing repo: replace its files with this ZIP's contents, then run the same commands.)

## 2. Streamlit Secrets (Manage app -> Settings -> Secrets)
```toml
APP_ACCESS_PASSWORD  = "long-random-password"
EMBEDDING_BACKEND    = "fastembed"
EMBEDDING_MODEL      = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
LLM_PROVIDER         = "gemini"
LLM_MODEL            = "auto"
LLM_API_KEY          = "<paste your Google AI Studio key here, only here>"
RAG_INCLUDE_SUPERVISORS = "false"
RAG_INCLUDE_STUDENTS    = "false"
HIDE_STUDENT_NAMES   = "false"
PILOT_ADMIN_PASSWORD = ""
```
Choose Python 3.12 in Advanced settings. Reboot the app; the first start downloads ~220 MB (model) and builds the index.
Google quota: check in AI Studio that your key may use a flash model at no cost; I could not verify any quota.

## 3. Verify on the live app (System status tab) - this is the first real test
1. No yellow "LEXICAL FALLBACK" banner; Diagnostics show `active_backend: fastembed`, `semantic_active: true`.
2. *Run semantic self-test*: AR->AR, EN->EN and AR->EN rows return sensible titles.
3. *Test the LLM*: "LLM reachable: gemini / <model>". Ask an answerable question ("how many projects did <supervisor> supervise?") and an unanswerable one ("what were the findings of <title>?"); the second must abstain.
4. Search a student name and a supervisor name; both lists complete; try a 1-character and a gibberish query.

## Optional (laptop, recommended): faster start and a measured threshold
```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
$env:EMBEDDING_BACKEND="fastembed"; $env:EMBEDDING_MODEL="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
python scripts/build_embedding_cache.py   # data/cache/embeddings.npz
python scripts/bootstrap.py
python scripts/eval_semantic.py           # real AR/EN/cross-language metrics + data/cache/semantic_calibration.json
git add data/cache; git commit -m "embedding cache + calibration"; git push
$env:LLM_PROVIDER="gemini"; $env:LLM_MODEL="auto"; $env:LLM_API_KEY="<key>"; python scripts/llm_smoke.py   # real Gemini smoke test
```
Please send me the output of `eval_semantic.py` and `llm_smoke.py` (never the key) and I will record the real results.

## Limits and behaviour on Streamlit Cloud (docs as read Oct 2026; may change)
~0.7-2.7 GB RAM, 2 cores, ephemeral disk, sleeps after 12 h idle: the model download and index are rebuilt after a restart (once per container, cached in memory). Admin edits are lost on restart: keep `PILOT_ADMIN_PASSWORD` empty on the cloud.
If the model cannot load, the app still runs in labelled lexical mode (banner + reason).

## API / team integration
The FastAPI service, JWT/RBAC, OpenAPI and the reference Express/Prisma gateway are included and were tested earlier (reference gateway 11/11). The team's own React/Vite/Express/Prisma code was never available, so integration with it is **not verified**.
