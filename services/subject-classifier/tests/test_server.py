import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load(monkeypatch, key=""):
    monkeypatch.setenv("SERVICE_API_KEY", key)
    sys.modules.pop("server", None)
    return TestClient(importlib.import_module("server").app)


def test_health_lists_classes(monkeypatch):
    body = load(monkeypatch).get("/health").json()
    assert body["status"] == "ok" and len(body["classes"]) > 1


def test_predict_returns_top_k(monkeypatch):
    res = load(monkeypatch).post("/predict", json={"title": "دور البنوك فى تمويل المشروعات الصغيرة"})
    assert res.status_code == 200
    body = res.json()
    assert body["subject"] == body["top_k"][0]["subject"]
    assert 0 <= body["confidence"] <= 1


def test_batch_skips_blank_titles(monkeypatch):
    res = load(monkeypatch).post("/predict_batch", json={"titles": ["Marketing strategy", "  "]})
    assert len(res.json()["results"]) == 1


@pytest.mark.parametrize("header,status", [({}, 401), ({"X-Service-Key": "wrong"}, 401), ({"X-Service-Key": "k" * 32}, 200)])
def test_service_key_is_enforced_when_set(monkeypatch, header, status):
    client = load(monkeypatch, "k" * 32)
    assert client.get("/health").status_code == 200
    assert client.post("/predict", json={"title": "accounting"}, headers=header).status_code == status
