"""REST API for the subject classifier (Logistic Regression).

Run:  uvicorn server:app --host 127.0.0.1 --port 8003
Docs: http://localhost:8003/docs

Environment:
  MODEL_PATH       model file (default: models/best_model.pkl)
  SERVICE_API_KEY  when set, every request except /health must send X-Service-Key
"""
import os
import secrets
from pathlib import Path
from typing import List

import joblib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MODEL_PATH = Path(os.environ.get("MODEL_PATH") or Path(__file__).parent / "models" / "best_model.pkl")
SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY", "")
model = joblib.load(MODEL_PATH)          # needs data_preprocessing.py next to this file
CLASSES = list(model.named_steps["clf"].classes_)



def require_key(x_service_key: str = Header(default="")):
    if SERVICE_API_KEY and not secrets.compare_digest(x_service_key, SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="invalid service key")


app = FastAPI(title="Academic Subject Classifier", version="1.0")


class TitleIn(BaseModel):
    title: str = Field(..., min_length=1, examples=["دور البنوك فى تمويل المشروعات الصغيرة"])


class BatchIn(BaseModel):
    titles: List[str] = Field(..., min_length=1, max_length=1000)


def _predict(titles: List[str], top_k: int = 3):
    proba = model.predict_proba(titles)
    out = []
    for t, p in zip(titles, proba):
        idx = np.argsort(-p)[:top_k]
        out.append({
            "title": t,
            "subject": CLASSES[idx[0]],
            "confidence": round(float(p[idx[0]]), 4),   # model probability, not calibrated
            "top_k": [{"subject": CLASSES[j], "confidence": round(float(p[j]), 4)} for j in idx],
        })
    return out


@app.get("/health")
def health():
    return {"status": "ok", "classes": CLASSES}


@app.post("/predict", dependencies=[Depends(require_key)])
def predict(body: TitleIn):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is empty")
    return _predict([body.title])[0]


@app.post("/predict_batch", dependencies=[Depends(require_key)])
def predict_batch(body: BatchIn):
    titles = [t for t in body.titles if t and t.strip()]
    if not titles:
        raise HTTPException(status_code=422, detail="no non-empty titles")
    return {"results": _predict(titles)}
