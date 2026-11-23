# Zero-cost real testing on your own machine (semantic search + LLM)

Everything below is free and local. Nothing leaves your computer, so the student names stay private.
**Status in this package:** the code paths, the runner and the scripts were executed against a *simulated* Ollama server only
(wiring verified, numbers meaningless). **No real model has been run yet. Step 3 below is what makes it real.**

## What you need
* A laptop with ~8 GB free RAM and ~6 GB disk (CPU is fine; a GPU only makes it faster).
* Python 3.13 and this project (`pip install -r requirements.txt`), the dataset already in `data/raw/Project.xlsx`.
* **Ollama** (free, open source): https://ollama.com/download

## 3 steps
1. `python scripts/bootstrap.py` (normal index; takes ~10 s).
2. Install and start Ollama (desktop app, or `ollama serve` in a terminal).
3. `python scripts/free_local_check.py --pull`
   * pulls **bge-m3** (multilingual embeddings, Arabic + English, ~1.2 GB) and **qwen2.5:3b** (small LLM, ~2 GB; use
     `--llm-model qwen2.5:7b` if you have 8+ GB RAM for better Arabic answers),
   * re-embeds all 3,983 records into a **separate** store (`data/store/rag_free_check.db`; your normal index is untouched),
   * measures lexical vs semantic vs hybrid retrieval in Arabic and English, **cross-language** (Arabic query → English titles and back),
     author/title/student completeness against the Excel file, and irrelevant queries,
   * **selects the similarity threshold from the measured gap** between irrelevant and on-topic queries and prints
     `RECOMMENDED: SEMANTIC_MIN_SCORE_NEURAL=…` (or says honestly that the ranges overlap),
   * runs the real LLM smoke test (`/ask`: LLM actually used, every `[R#]` citation points to a retrieved record, no invented
     facts, a "findings" question is not answered),
   * writes `data/processed/free_local_report.json` (scores and counts only, no names).
4. Send me that JSON file (or paste it). I will record the real results and set the threshold.

## Using it afterwards (production-like)
```bash
export EMBEDDING_BACKEND=ollama EMBEDDING_MODEL=bge-m3 SEMANTIC_MIN_SCORE_NEURAL=<value from the report>
export LLM_PROVIDER=ollama LLM_MODEL=qwen2.5:3b LLM_TIMEOUT_S=240        # no API key needed
python scripts/bootstrap.py       # re-embeds the index with the neural model
uvicorn api.main:app --port 8000 --no-access-log
```
`/ready` then shows `"semantic": true, "active_backend": "ollama"` and `"llm_provider": "ollama"`. If Ollama is down or a model is
missing the service still starts in lexical/retrieval-only mode and says why (`fallback_reason`, `/ask` warnings).

## Alternative: embedding model downloaded on the laptop and copied (sentence-transformers)
```bash
pip install huggingface_hub
huggingface-cli download intfloat/multilingual-e5-small --local-dir models/multilingual-e5-small     # free
pip install -r requirements-embeddings.txt
python scripts/free_local_check.py --st-path models/multilingual-e5-small --skip-llm
```
To use it in *this* cloud workspace instead, copy the `models/multilingual-e5-small` folder into the project and set
`EMBEDDING_BACKEND=sentence-transformers EMBEDDING_MODEL_PATH=models/multilingual-e5-small EMBEDDING_LOCAL_ONLY=true`.

## What is NOT free / not recommended
* Hosted notebooks (Colab/Kaggle) are free, but the dataset has real student names: do not upload it without the data owner's approval.
* Free hosted LLM APIs (Gemini free tier etc.) also work through `LLM_PROVIDER=gemini`, but they send retrieved titles/supervisor names
  to a third party. Prefer local Ollama for this dataset.
