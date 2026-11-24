# Version comparison and merge (2026-10-30)

| Source | What it is | Role |
|---|---|---|
| **A** | original uploaded `sadat-smart-digital-rag-main.zip` | recovery reference |
| **B** | my previous delivery (`sadat-smart-digital-rag-final.zip`: Arabic ID/count fixes, UI redesign, 415→427 tests) | **baseline** |
| **C** | `sadat-smart-digital-CHECKPOINT-not-final.zip` from a second session (reports 437 passed / 0 failed / 0 skipped, `EMBEDDING_BACKEND=hashing`, PostgreSQL available there) | source of selective improvements |

`diff -rq B C` showed that C is B plus six changed files and nothing else (no deletions, no new modules; `requirements.txt`, `llm.py`,
settings, secrets example identical to B). C also carried a generated `data/processed/` folder (not merged: derived data is regenerated, git-ignored).

| Difference (C vs B) | Classification | Decision |
|---|---|---|
| `src/rag/answer.py`: completion verbs ("completed", "finished", "أُنجزت"…) no longer block counts; `_premise_mismatches` warns when the question states a supervisor/year that contradicts the stored record | improvement | **merged** |
| `src/rag/structured.py`: "المشروع رقم 1113 لسنة 2007" parsed as project 1113 + year (law-number guard no longer swallows project IDs) | improvement (bug fix) | **merged** |
| `src/rag/messages.py`: `premise_mismatch` AR/EN | improvement | **merged** |
| `tests/integration/test_postgres.py`: read-only role was altered but never created → idempotent `CREATE ROLE` | test bug fix (identical in spirit to the one I made in parallel) | **merged** (C's version) |
| `tests/evaluation/test_real_structured.py`, `tests/unit/test_structured.py`: more tests (E2, E3, F1, F2, ID+year) | improvement | **merged** |
| `CHANGED_FILES.md` | documentation | superseded by the final one |

## Gemini: compared across A, B, C
* `GeminiProvider`, `get_provider`, settings, `.env.example`, `.streamlit/secrets.toml.example`, status-page tools: identical in A, B and C (Gemini code was never removed or disabled; B and C only added the shared `_error_detail` helper in `llm.py`).
* The only Gemini-related removal in B (inherited by C): the `google-genai` line in `requirements.txt`. **Restored** (see `docs/GEMINI.md`).
* The example Secrets still say `LLM_PROVIDER = "gemini"`; nothing was changed to `none`.

## Added after the merge (this session)
* Topic + year questions answered from the subject/title/year fields by SQL (`AnswerService._topic_year_route`, `RecordStore.topic_counts`), with both definitions stated; sibling-subject note for exact subject counts.
* `tests/evaluation/test_gemini_modes.py` (12), topic+year tests (+11 in `test_real_structured.py`), AppTest for Gemini configured with a missing/unusable key (+2).
* Browser check extended (marketing + 2023); PostgreSQL tests and the Node gateway executed (see TEST_REPORT).
* Documentation aligned to the academy's approval of publication; test documentation unified.
