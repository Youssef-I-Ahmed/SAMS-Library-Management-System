# Gemini — optional answer generation (preserved, not required)

## What it does
For **open topical questions only** ("which projects deal with banking service quality?") the app retrieves records with the
structured/lexical/semantic engine and may ask Gemini to phrase a short Arabic/English answer **from those records only**.
Everything else never touches Gemini: exact project number, counts, years, topic+year counts, supervisor/student/title search,
statistics, abstentions (`tests/evaluation/test_gemini_modes.py` proves zero Gemini requests for these).

## Files (inspected in the final source)
| File | Role | State |
|---|---|---|
| `src/rag/llm.py` — `GeminiProvider`, `get_provider`, `pick_gemini_model` | Gemini REST client over `httpx` (`generativelanguage.googleapis.com/v1beta/interactions`, key in the `x-goog-api-key` header, `store=false`, retries, typed errors, `LLM_MODEL=auto` selects a supported Interactions model) | **Updated** (Interactions API endpoint, stateless requests, Interactions response parser, supported-model selection) |
| `src/rag/context.py` | system prompt + context: only retrieved records, no student/supervisor names unless enabled | preserved |
| `src/rag/evidence.py`, `src/rag/answer.py` | evidence gate (no LLM call without evidence) + `verify_answer` (withholds answers with invented titles, years, names, numbers, content claims, uncited statements) | preserved + extended |
| `src/config/settings.py`, `.env.example`, `.streamlit/secrets.toml.example` | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `RAG_INCLUDE_*` | **byte-identical to the original** (the example still says `LLM_PROVIDER = "gemini"`) |
| `requirements.txt` | Uses existing `httpx` dependency for the Interactions REST API; no Google SDK required | unchanged |
| `scripts/gemini_check.py`, `scripts/llm_smoke.py`, status page | live check through Interactions API once a key exists | updated |

## How to enable (nothing to change if your Streamlit Secrets already have it)
Secrets → `LLM_PROVIDER = "gemini"`, `LLM_API_KEY = "<your key>"`, `LLM_MODEL = "gemini-3.8-flash"` (or another supported Interactions model).
`app.py` copies Secrets into environment variables before settings are read, so the existing Secrets keep working unchanged.
**Do not delete the key from Secrets.** To switch Gemini off temporarily set `LLM_PROVIDER = "none"` (the key may stay).

## Behaviour matrix (all rows tested with a fake Gemini server — see below)
| Situation | Result |
|---|---|
| Enabled, evidence found | Gemini phrases the answer; each statement must cite `[R#]`; verified before display |
| Enabled, Gemini invents a title/year/number/name/claim | answer **withheld**, the verified record list is shown, warning displayed |
| No evidence for the question | **no Gemini call**; explicit abstention |
| Provider configured but key empty / rejected (400, 403) / quota (429) / Google down (503) / network error / timeout | status `llm_unavailable` or `llm_error`; the retrieved records and a notice are shown; **no crash**; structured operations unaffected |
| `LLM_PROVIDER=none` | records listing; everything structured works |
Independent of embeddings (`EMBEDDING_BACKEND`) and of the database.

## What was and was not tested
* **Tested (this session, executed):** `tests/evaluation/test_gemini_modes.py` (12 tests: real `GeminiProvider` code over a local fake Gemini
  server, real dataset) · `tests/integration/test_llm_providers.py` (request shape, parse, blocked prompt, bad key, unknown model, auto model) ·
  `test_evidence_policy.py` (unfaithful answers withheld, context contains retrieved records only) · AppTest with `LLM_PROVIDER=gemini` and an empty / unusable key.
* **NOT tested: a real request to Google from this build environment.** The local fake-server tests verify request/response handling, but the academy key must be used on a machine with internet access via `python scripts/gemini_check.py`.
  After deployment: status page → *Test the LLM*, then ask the topical example question (`docs/POST_DEPLOY_TEST_PLAN.md`).
* Quality of Gemini's wording is not measured; only that unsupported content cannot reach the user.
* Free-tier quota/limits for your key depend on Google's current terms for your account — not verified.
