# Test report — FINAL DELIVERY (2026-10-30) — authoritative

Environment: Linux sandbox, Python 3.13, 2 CPUs, hashing embedder, no LLM key, real dataset `data/raw/Project.xlsx`
(3,983 records), SQLite; disposable PostgreSQL via `pixeltable-pgserver`; Node 22. Nothing below is claimed unless it was executed.

## 1. Results
| Scope | Run | Result |
|---|---|---|
| Baseline (original upload, before any change) | pytest | 349 passed, 3 failed, 5 skipped |
| **Second-session checkpoint (not re-run by me)** | reported by that session | 437 passed, 0 failed, 0 skipped |
| My delivery B (previous ZIP) | pytest | 427 passed, 0 failed, 5 skipped (4 PostgreSQL + 1 needing a bootstrapped store) |
| **FINAL, after merge + new work** | `EMBEDDING_BACKEND=hashing pytest -q` (457 tests) **+** the one 3.5-minute test run alone | **458 passed, 0 failed, 0 skipped** |
| PostgreSQL tests (`tests/integration/test_postgres.py`) | included above | 4 passed (disposable embedded PostgreSQL, Prisma-*like* table; **not** the team's schema) |
| Express 5 + Prisma + PostgreSQL + Python service (`scripts/run_node_integration.py`) | final code | **11/11 passed** |
| Browser UI (`scripts/ui_check.py`, Playwright/Chromium, real server, real data): desktop AR+EN, tablet AR, phone AR+EN | final code | **95/95 passed** (incl. #1113 AR/EN, 2023 = 165, marketing+2023, no-match, unsupported, search→details, charts, no horizontal overflow) |
| Streamlit AppTest (`test_streamlit_app.py`) | included above | 14 passed (incl. Gemini configured with missing/unusable key) |
| Cold start from a clean ZIP extract (no DB, no env overrides, model download blocked) | manual run | app rendered in 54 s, DB built from the xlsx, keyword mode announced on the About page |
The full suite was run in two parts because one real-data test (all 8,951 students against the oracle) takes ~3.5 min on this machine; the environment was also restarted twice during the work.

## 2. Tests added or changed in this round
* `tests/evaluation/test_real_structured.py` (checkpoint's version + 11 topic/year tests), `tests/unit/test_structured.py`, `tests/evaluation/test_gemini_modes.py` (12, new), `tests/integration/test_streamlit_app.py` (rewritten for the new UI, + Gemini-misconfigured test).
* Contract changes made on purpose (not weakened): (1) pagination test browses with an explicit year range; (2) an empty query with no filters matches nothing; (3) a zero count is answered as a valid zero; (4) "مشروعات ديناصورات في 2023" is now answered "0, topic named" (was: abstain) because topic+year is answered from the subject/title/year fields; (5) `test_postgres.py`: missing `CREATE ROLE` added (test bug).
* Independent oracles: workbook read with `openpyxl` (counts, IDs, years); topic counts use a Python scan of the workbook with Arabic letter folding (it correctly counts «الأقتصاد» with hamza variants that a raw substring search misses).

## 3. Arabic / English search evidence (real data, executed)
#1113 (AR, EN, ١١١٣, "…رقم 1113 لسنة 2007") → same record, 2007 · #99999 → no match, no substitute · 2023 → 165 · every year 2001–2026 vs oracle · ranges, per-year breakdown · 90 supervisor×year combinations · marketing/banking/petroleum/economics × every year × AR/EN equal the oracle (marketing 2023 = 4 by subject field, 22 by title-or-subject) · premise mismatch (wrong year/supervisor asserted for an existing ID) is warned · empty / one-letter / gibberish queries safe · unsupported content (summary, methodology, findings) abstains.

## 4. Gemini (see `docs/GEMINI.md`)
12 tests run the REAL `GeminiProvider` over a local fake Gemini server: enabled (records-only context, key only in header, answer verified), invented content withheld, no call without evidence, no call for structured questions, and no key / 400 / 403 / 429 / 503 / network error / timeout → records fallback without crash; disabled mode works.

## 5. NOT tested (and why)
* **A real Gemini request** — the sandbox gateway rejects `generativelanguage.googleapis.com` (HTTP 403) and no key exists here.
* **The real multilingual embedding model / any semantic retrieval quality (AR, EN, cross-language)** — huggingface.co and fastembed's fallback bucket are unreachable. Only the pipeline with a synthetic double and the lexical fallback were tested.
* **The hosted Streamlit URL** — not opened, not deployed. Cloud memory/limits, cold-start time with the real model, concurrent users: unmeasured.
* The team's React/Vite, Express, Prisma, RBAC code and schema; production PostgreSQL; Docker build; Safari/Firefox/real phones; accessibility audit.
