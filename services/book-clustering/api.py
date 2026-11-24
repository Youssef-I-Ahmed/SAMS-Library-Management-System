# -*- coding: utf-8 -*-
"""
api.py - a small web service (FastAPI) that predicts the topic cluster of new books.

Run:
    uvicorn api:app --host 127.0.0.1 --port 8004

The model file path comes from the MODEL_PATH environment variable
(default: models/book_clusters.joblib). Interactive docs: http://localhost:8004/docs
When SERVICE_API_KEY is set, every request except /health must send X-Service-Key.
"""
import os
import secrets
from contextlib import asynccontextmanager
from typing import List, Optional, Union

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from clustering_core import BookClusterer

MODEL_PATH = os.environ.get(
    "MODEL_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "book_clusters.joblib"))
SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY", "")


def require_key(x_service_key: str = Header(default="")):
    if SERVICE_API_KEY and not secrets.compare_digest(x_service_key, SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="invalid service key")
state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model ONCE when the server starts (not on every request).
    state["clusterer"] = BookClusterer.load(MODEL_PATH)
    yield
    state.clear()


app = FastAPI(title="Book Cluster API", version="1.0.0", lifespan=lifespan)


# ----------------------------------------------------------------- request / response shapes
class BookIn(BaseModel):
    title: str = Field(..., max_length=500, description="Book title (Arabic or English)")
    subjects: Optional[str] = Field(None, max_length=2000,
                                    description="Optional subjects, e.g. 'Marketing | Management'")
    subject_codes: Optional[Union[List[int], str]] = Field(
        None, description="Optional subject codes, e.g. [12, 40] or '12 | 40'")

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be empty")
        return v


class BatchIn(BaseModel):
    books: List[BookIn] = Field(..., min_length=1, max_length=500)


def _model() -> BookClusterer:
    if "clusterer" not in state:
        raise HTTPException(status_code=503, detail="Model is not loaded.")
    return state["clusterer"]


# ----------------------------------------------------------------- endpoints
@app.get("/health")
def health():
    m = _model()
    return {"status": "ok",
            "trained_at_utc": m.meta.get("trained_at_utc"),
            "scikit_learn_version": m.meta.get("scikit_learn_version"),
            "n_training_books": m.meta.get("n_training_books"),
            "n_clusters": sum(len(lm.labels) for lm in m.models.values())}


@app.get("/clusters", dependencies=[Depends(require_key)])
def clusters():
    """All clusters with their readable names and the number of books they were trained on."""
    return _model().clusters()


@app.post("/predict", dependencies=[Depends(require_key)])
def predict(book: BookIn):
    """Predict the cluster of ONE book."""
    return _model().predict(book.title, book.subjects, book.subject_codes)


@app.post("/predict_batch", dependencies=[Depends(require_key)])
def predict_batch(batch: BatchIn):
    """Predict the clusters of up to 500 books in one call. Results keep the input order."""
    m = _model()
    return {"results": [m.predict(b.title, b.subjects, b.subject_codes) for b in batch.books]}
