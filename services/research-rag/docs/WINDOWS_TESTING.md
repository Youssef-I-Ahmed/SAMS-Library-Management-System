# Testing this version on Windows (PowerShell)

```powershell
cd C:\work\sadat-rag                      # the extracted folder (it contains app.py)
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt        # runtime + test tools
$env:PYTHONUTF8="1"                       # Arabic output on Windows consoles (the scripts also set this themselves)
```

## 1. Focused tests for this fix (about 30 s; no Ollama needed)
```powershell
python -m pytest tests/integration/test_evidence_policy.py tests/evaluation/test_banking_service_quality_real_data.py -q
```
Expected: 80 passed.

## 2. Abstention evaluation on the real dataset (uses a throw-away index, your real store is untouched)
```powershell
$env:DATABASE_URL="sqlite:///C:/work/tmp_abstain.db"; $env:EMBEDDING_BACKEND="hashing"
python scripts/bootstrap.py
python scripts/evaluate_abstention.py
Remove-Item Env:DATABASE_URL; Remove-Item C:\work\tmp_abstain.db
```
Expected (unchanged by the fix): 0 false answers out of 196 must-abstain cases, 0 false abstentions out of 160 answerable cases.

## 3. Real Ollama test of the banking question (needs Ollama running)
```powershell
ollama pull qwen2.5:3b; ollama pull bge-m3
$env:LLM_PROVIDER="ollama"; $env:LLM_MODEL="qwen2.5:3b"; $env:LLM_TIMEOUT_S="240"
$env:EMBEDDING_BACKEND="ollama"; $env:EMBEDDING_MODEL="bge-m3"
python scripts/bootstrap.py                # re-embeds 3,983 records (~25 min on CPU in your earlier run)
python scripts/llm_smoke.py                # answerable + unanswerable questions through the real model
streamlit run app.py                       # then ask: Which projects deal with banking service quality?
```
Expected in the app: status OK, `generated_by: llm`, cited sources that are banking records, no generic "service quality" record as evidence.
If Qwen's wording fails citation checks the app shows the verified catalogue listing instead (`answer_withheld`) - that is the safeguard, not a crash.

## 4. Full regression (about 4-5 min)
```powershell
python -m pytest tests -q
```
(The PostgreSQL tests use the embedded server from `requirements-dev.txt`.)
