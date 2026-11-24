# subject-classifier (port 8003)

```bash
python -m venv .venv && .venv/Scripts/activate     # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt -r requirements-dev.txt
uvicorn server:app --host 127.0.0.1 --port 8003
python -m pytest -q
```

The model lives in `models/`. Set `SERVICE_API_KEY` to require the `X-Service-Key` header.
The model must be loaded with scikit-learn 1.8.0 (pinned in requirements.txt).

---

# Model server package (Logistic Regression subject classifier)

Contents
- model/best_model.pkl     full pipeline: text normalizer + TF-IDF + Logistic Regression
- data_preprocessing.py    REQUIRED next to server.py (the pickle imports normalize_text from it)
- server.py                FastAPI app: GET /health, POST /predict, POST /predict_batch
- requirements.txt         pinned versions (use Python 3.11+; scikit-learn MUST be 1.8.0)
- batch_predict.py         Excel/CSV in -> Excel/CSV out, no server needed
- Dockerfile               optional container

Run
    pip install -r requirements.txt
    uvicorn server:app --host 0.0.0.0 --port 8000
    open http://localhost:8000/docs

Example
    curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" \
         -d '{"title": "دور البنوك فى تمويل المشروعات الصغيرة"}'

Response: {"title":..., "subject":..., "confidence":0.53, "top_k":[...]}

Batch (no server)
    python batch_predict.py input.xlsx output.xlsx --column TITLE

Use the model directly in Python (no server)
    import joblib; m = joblib.load("model/best_model.pkl")   # keep data_preprocessing.py importable
    m.predict(["..."])

Notes
- Test accuracy 83.4%, macro-F1 0.696 (weak on Economics and Marketing: tiny classes).
- confidence = model probability, NOT calibrated. Send low-confidence titles to a human.
- Add authentication (API key / reverse proxy) before exposing it publicly.
