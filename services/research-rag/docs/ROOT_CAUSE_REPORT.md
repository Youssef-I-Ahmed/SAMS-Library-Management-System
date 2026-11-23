# Root-cause report (2026-10-30)

All "before" results below were produced by running the **unmodified uploaded code** against the real dataset
(3,983 records, hashing embedder, no LLM). "After" results are in `tests/evaluation/test_real_structured.py`.

## 1. Arabic exact-ID question returned the wrong / no record
| | |
|---|---|
| Question | `ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟` |
| English twin | `What is the title of project number 1113 and in which year was it published?` |
| Before (English) | answered from catalogue: **#1113, "Development and analysis of sadat academy's Digital library", 2007** (correct) |
| Before (Arabic) | **abstained, no source**; neighbours were offered only as "similar records" — fuzzy retrieval, not an ID lookup |
| After (both) | the same record: #1113, same title, 2007, source card #1113 |

**Root cause.** The ID detector in `answer.py` only recognised English markers (`project|record … number N`). Arabic phrasing
("المشروع رقم 1113") never matched, so the question fell through to similarity retrieval, where the number "1113" is just
a token; a near-by number/title (e.g. #1198) can then outrank the true record. An ID is a primary key, so similarity must
never be involved.

**Fix.** `src/rag/structured.py::parse_project_ids` (Arabic + English markers, `#N`, bare "رقم N", multiple IDs, guards
against law numbers / call numbers / years), digits folded by `normalize_ar.to_western_digits` (Western, Arabic-Indic ٠-٩,
Eastern ۰-۹). The record is fetched with `store.get(id)` (a primary-key read). A missing ID returns an explicit "no project
with this number" and **no substitute record**.

## 2. Arabic count question (`كم عدد المشروعات المسجلة في سنة 2023؟`)
**What I could and could not reproduce.** With no LLM configured the original code returned the correct 165 (it counted
by filtering retrieved records). I could **not** reproduce a crash locally. Likely hosted-failure paths, all removed or
contained: (a) the answer depended on the retrieval/LLM path, and a provider error (quota, 404 with a non-JSON body → the
`'str' object has no attribute 'get'` crash I did reproduce in `llm.py`) escaped to the UI; (b) a hardcoded-looking
filter chain rather than one SQL aggregate.

**Fix.** Counts are one parameterised SQL `COUNT` (`record_store.count_where`, `year_counts`, …) routed by
`AnswerService._structured_route`; years/ranges/after/before parsed in `structured.py`; a legitimate **zero** is an answer
("0 records … this is not an error"); an empty question is `empty_question`, never "match everything"; every exception in
`ask_safe` becomes `status="error"` with a technical message instead of a stack trace. Verified for every year
2000–2027, 90 supervisor×year combinations and ranges against an independent oracle read straight from the xlsx
(2023 → **165**).

## 3. Contributing defects found and fixed
* Empty search query matched everything → now `strategy="empty_query"`, 0 hits.
* Zero counts were treated as "no evidence" → now answered as a real zero.
* Topical words next to an ID/count ("projects about banking in 2023") were silently dropped → now deferred to the topical
  path (`_leftover_terms`).
* `total_matching` leaked on abstentions → cleared.
* Ollama/OpenAI error bodies that are not JSON crashed the provider layer → `_error_detail`.
* Six distinct states are kept apart in code and UI: empty field ("not recorded"), field not in the schema ("not part of
  the dataset"), record missing, record without the info, no evidence, technical error.

## 4. Baseline test failures (before my changes): 3
`test_llm_smoke_reports_not_tested_without_credentials` (message contract), the Ollama request-shape/error test (the
`_error_detail` crash above) and `test_abstention_policy_on_real_cases` (passes after the leftover-terms / evidence-gate
work; I did not keep a separate trace isolating its single cause). All pass now.
