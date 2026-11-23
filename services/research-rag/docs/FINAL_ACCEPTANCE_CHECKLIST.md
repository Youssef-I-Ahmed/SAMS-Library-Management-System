# Final acceptance checklist (final delivery, 2026-10-30)
Legend: **TESTED** (executed here) · **CONFIGURED, NOT LIVE-TESTED** · **NOT DONE**

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Versions A/B/C compared; checkpoint fixes merged | TESTED | `docs/VERSION_MERGE_REPORT.md` |
| 2 | Gemini preserved/restored, optional, Secrets-compatible | code + fake-server tests TESTED; **live Google call NOT tested** | `docs/GEMINI.md`, `test_gemini_modes.py` |
| 3 | Dataset integrity (3,983; #1113=2007; 2023=165; sha256; no duplicate IDs) | TESTED | `data/raw/Project.xlsx` unchanged, historical file absent |
| 4 | Arabic/English exact-ID, SQL counts, year/range, topic+year, warnings, safeguards | TESTED | 458 tests, 95 browser checks |
| 5 | Semantic multilingual search | pipeline + fallback TESTED; **real model NOT tested** (download blocked) | `docs/SEMANTIC_SEARCH.md` |
| 6 | Streamlit UI desktop/tablet/phone, AR/EN | TESTED on Chromium | 95/95 |
| 7 | Independent of the user's PC / Ollama / local model | TESTED (cold start from clean ZIP) | no local service used |
| 8 | Streamlit Cloud readiness | CONFIGURED, **NOT live-tested** | `docs/GITHUB_STREAMLIT_UPDATE.md`, `docs/POST_DEPLOY_TEST_PLAN.md` |
| 9 | Persistence assumptions (SQLite ephemeral, rebuilt at start) | documented + cold start TESTED | GITHUB_STREAMLIT_UPDATE §D |
| 10 | PostgreSQL tests and Express gateway | TESTED on disposable servers (4/4, 11/11); team's stack NOT tested | TEST_REPORT |
| 11 | React/Vite, team RBAC, production PostgreSQL, Docker | **NOT DONE / NOT TESTED** | SOFTWARE_TEAM_HANDOVER |
| 12 | No secrets in ZIP; no push/deploy | verified by scan; nothing pushed | final report |
