import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture
def client_factory(monkeypatch):
    def make(key=""):
        monkeypatch.setenv("SERVICE_API_KEY", key)
        sys.modules.pop("api", None)
        return TestClient(importlib.import_module("api").app)
    return make


def test_health_and_clusters(client_factory):
    with client_factory() as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/clusters").status_code == 200


def test_predict_single_and_batch(client_factory):
    with client_factory() as client:
        one = client.post("/predict", json={"title": "Principles of Marketing"})
        assert one.status_code == 200
        batch = client.post("/predict_batch", json={"books": [{"title": "Financial accounting"}, {"title": "إدارة الموارد البشرية"}]})
        assert len(batch.json()["results"]) == 2


def test_service_key_is_enforced_when_set(client_factory):
    with client_factory("k" * 32) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/clusters").status_code == 401
        assert client.get("/clusters", headers={"X-Service-Key": "k" * 32}).status_code == 200
