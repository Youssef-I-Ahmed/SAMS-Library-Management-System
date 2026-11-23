# Semantic (embedding) search — exact configuration and honest status

| Item | Value |
|---|---|
| Backend on Streamlit Cloud | `fastembed` (ONNX Runtime, no torch). `app.py` sets `EMBEDDING_BACKEND=fastembed` by default when the package is installed; override in Secrets |
| Model | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (50+ languages incl. Arabic; trained on parallel data → Arabic and English queries land near each other) |
| Dimensions | 384 (measured at start-up from the model; cached vectors are ignored if model or dimension differ) |
| Size / download | ~220 MB ONNX from huggingface.co on first start (cached only for the life of the container) |
| Independent of Gemini | yes — embeddings never call any LLM; Ollama is not used |
| Local machine / Ollama required | no |
| Offline fallback | `hashing` (lexical features): works everywhere, **not semantic, not cross-language**; the About page says which mode is active |
| Start-up design | records are stored and indexed immediately; embedding runs in a background thread; dense ranking is switched on only when ≥ 99 % of records have vectors; until then keyword mode, never a half-built semantic index |
| Optional pre-computed vectors | `scripts/build_embedding_cache.py` → `data/cache/embeddings.npz` (~3 MB). Needs internet access to Hugging Face, so it must be run on a machine that has it (your laptop). Commit it: the cloud app then embeds only queries. Not present in this package |
| Calibration | `scripts/eval_semantic.py` measures AR→AR, EN→EN and cross-language recall and writes `data/cache/semantic_calibration.json`. Without it the neural similarity floor is the **uncalibrated** default 0.35 and is reported as such; it is not proof of correct retrieval |

## Status — NOT verified with the real model
In the developer sandbox Hugging Face, ModelScope, GCS (fastembed's fallback bucket) are all unreachable, so the real model could not be
downloaded. Therefore: **no Arabic/English/cross-language semantic result was measured with the real model, and none is claimed.**
What *was* tested: the pipeline with a synthetic embedder double (`tests/integration/test_neural_pipeline.py`), the lexical/structured
paths on the real data, the graceful fallback (cold start from a clean copy with the model blocked: the app renders in ~54 s, shows
"semantic search is not enabled; keyword and spelling search is active; number/count/filter search is unaffected"), and the
non-blocking start/≥99 % gate with the hashing embedder.
Evidence gate: topical answers also require lexical support of the question's key terms (`docs/EVIDENCE_POLICY.md`), so a semantic-only
neighbour is not presented as an answer.

## How to obtain the real evidence after deployment (cannot be done earlier)
1. Status page → *Run semantic self-test (AR→AR, EN→EN, AR→EN)*; read the returned titles.
2. Or on a machine with internet: `EMBEDDING_BACKEND=fastembed python scripts/bootstrap.py && python scripts/eval_semantic.py`.
3. Compare with `docs/POST_DEPLOY_TEST_PLAN.md` §4.
Known resource risk: Community Cloud documents a ~1 GB per-app resource limit (Streamlit blog, read 2026-10-30; may change). Model + runtime + index
may approach it; if the app is reported "over its resource limits", set `EMBEDDING_BACKEND = "hashing"` in Secrets (keyword mode) — nothing else changes.
