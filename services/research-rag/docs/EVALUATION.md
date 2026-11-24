# Evaluation (kept separate from unit tests)

Run on the real `Project.xlsx` (3,983 records), seed 13, embedder `hashing-v1-d1024`.
Reproduce: `python scripts/evaluate.py --seed 13` and `python scripts/evaluate_abstention.py --seed 13` (outputs in `data/processed/eval_*.json`).
Queries are **generated from the dataset itself** (titles, supervisor names, rule-labelled topics), not written by librarians — treat numbers as engineering checks, not user-satisfaction measures.

## Retrieval
| Check | Result |
|---|---|
| Supervisor completeness vs independent oracle (289 spellings, 196 people) | 0 mismatches |
| Student search: every distinct normalised student name (8,951 in the dataset) vs independent oracle; lossless pagination on the most prolific student; partial-name union | 0 mismatches (`tests/evaluation/test_real_data.py`) |
| Exact title lookup (300 queries) / partial phrase (254) | 0 set mismatches / 0 missing |
| Subject structured filter (11 queries) | recall 1.0, precision 1.0 |

Ranked retrieval from degraded titles (263 queries):

| Method | Recall@1 | Recall@10 | nDCG@10 | MRR |
|---|---|---|---|---|
| Keyword (BM25) | 0.738 | 0.960 | 0.877 | 0.850 |
| Semantic (hashing) | 0.707 | 0.960 | 0.860 | 0.823 |
| Hybrid (RRF) | 0.731 | 0.962 | 0.877 | 0.851 |

Hybrid ≈ keyword here. The offline hashing embedder is lexical-fuzzy, **not semantic or cross-lingual**; the benefit of a neural model (`intfloat/multilingual-e5-small`, coded, optional) is **unmeasured** because model download was blocked in the build environment.

## Abstention / faithfulness (generated cases)
* Must-abstain cases: 196 (findings 60, methodology/summary 40, off-domain 16, fake titles 40, partial overlap 40) → **0 false answers**.
* Should-answer cases: 160 (record facts 40, supervisor counts 40, topical 80) → **0 false abstentions**; target record in explicit support 79/80 topical.
* Verifier on 106 contexts: 0 false rejects of faithful answers; 7 corruption types (fake citation, invented year/person/title, findings claim in AR/EN, uncited) caught 106/106 each.
* Threshold sweep: 0.34 and 0.5 → 20.4% false answers; 0.67 and 0.75 → 0%.

These are results on synthetic tests written by the same authors; 100% should not be read as real-world accuracy. Needed before production: librarian-written question set and real-LLM run.


## Note on the semantic score floor
The dense-retrieval floor `SEMANTIC_MIN_SCORE` is now 0.30 (earlier 0.15, then 0.20) so nonsense queries (e.g. `zzzqqq`) return nothing. Evaluations were re-run on dataset v2 at 0.30 (seed 13): the tables above are unchanged to the reported precision.
