# Evidence and abstention policy

Implemented in code (`src/rag/analyze.py`, `evidence.py`, `answer.py`), not only in the prompt.
The LLM is never the source of truth: it is called only when retrieved records explicitly support the question, and its output is verified afterwards.

## Order of decisions
1. **Analyse the question** — entities, quoted titles (words inside quotes are ignored for intent), requested attributes, and whether it asks for content the dataset lacks.
2. **Specific record asked about** (quoted title, or a title contained in the question plus an attribute): exact normalized-title match only; answered deterministically from that record's fields. If several records share the title and differ, all are disclosed and none is chosen. Near-miss titles are shown only as *uncertain* suggestions (`record_not_found`).
3. **Findings / methodology / statistics / summary / full text / hypotheses / conclusions** → abstain (`content_not_available`), no LLM call. Records may be listed as "listed", not as evidence.
4. **Entity questions** (supervisor, year, subject): counts and lists computed deterministically, no LLM; response points to `/supervisors/records` for the complete paginated list.
5. **Topical questions**: a record is *explicit* support only if it lexically covers ≥ `EVIDENCE_MIN_COVERAGE` (0.67) of the question's distinctive terms (document-frequency < `EVIDENCE_COMMON_TERM_DF`). Similarity-only matches are *uncertain* and never used as evidence. Fewer than `EVIDENCE_MIN_SUPPORTED_RECORDS` explicit records → `insufficient_evidence`.
6. **LLM output verification** (`verify_answer`): citations must be real retrieved records; numbers must appear in context; named supervisors/quoted titles must be in context; no content/findings claims; no uncited claims. Failure → `answer_withheld` with a deterministic listing.

Statuses: `ok`, `answered_from_catalog`, `abstained` (reasons: `no_results`, `insufficient_evidence`, `content_not_available`, `record_not_found`), `llm_unavailable`, `llm_error`, `answer_withheld`. Abstentions are in the user's language (Arabic/English; mixed questions use the dominant language).
Each source carries `support`: `explicit` | `uncertain` | `listed`. Conflicting records are reported in `conflicts`.

## Without the LLM
Exact title/supervisor/subject/year lookup, counts, record facts and all abstentions work with `LLM_PROVIDER=none` or if the provider fails.

## Tuning
`python scripts/evaluate_abstention.py --sweep` — results in EVALUATION.md. Default 0.67 chosen because 0.34/0.5 let 40/40 partially-overlapping fake topics through.

## Known limitations
* Coverage is lexical: synonyms/morphology not covered by light stemming can cause a **false abstention** (cheaper error than a false answer).
* The verifier is rule-based; adversarial phrasing (e.g. negations) could in principle slip through. It reduces, not eliminates, risk.
* Real-LLM faithfulness has **not** been measured (no API key in the build environment); verifier was tested with scripted LLM outputs.


## Generic terms and the two-thirds boundary (2026-10-26)
Observed problem: for "Which projects deal with banking service quality?" the best records matched 2 of 3 distinctive terms
(0.6667) against `EVIDENCE_MIN_COVERAGE=0.67`, so nothing was explicit and the LLM was never called.
Rules now in `assess_candidates` (`src/rag/evidence.py`):
1. **Generic words** (`GENERIC_TERMS`: service, quality, impact, effect, role, analysis, study; خدمات، جودة، أثر، تأثير، دور، تحليل، دراسة — stemmed with the index normalizer)
   still count toward coverage but a record whose overlap is ONLY generic words is never explicit when the question also names a subject term.
2. **Boundary:** coverage within 0.005 below the configured value (2/3 vs 0.67) counts as meeting it **only if every subject (non-generic) term of the question matches**. Any other partial match is judged exactly as before, so "investment in the real-estate market" is still not supported by stock-market records.
3. Unchanged: the configured threshold, similarity alone is never explicit, content questions (findings/methods) abstain, and answers are verified.
A question made only of generic words ("impact of service quality") is judged as before.
