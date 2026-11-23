"""API tests (FastAPI TestClient; Gemini is mocked).

    pytest -q tests/test_api.py
"""
import time

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import CACHE, LIMITER, SESSIONS, app
from app.settings import SETTINGS
from sams_rag import chat as chat_module
from sams_rag import generation
from sams_rag.config import CONFIG


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:                                  # runs the startup (loads the engine)
        yield c


@pytest.fixture
def gemini(monkeypatch, tmp_path):
    # Controllable fake Gemini: reply text, delay, or failure.
    g = {"text": "الكتب المناسبة [S1] و [S2].", "delay": 0.0, "fail": False, "rewrite": None, "calls": 0}

    def fake(system, user):
        g["calls"] += 1
        time.sleep(g["delay"])
        if g["fail"]:
            raise RuntimeError("all Gemini models failed")
        return g["text"]

    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setitem(CONFIG, "llm_provider", "gemini")
    monkeypatch.setattr(generation, "call_gemini", fake)
    monkeypatch.setattr(chat_module, "call_gemini", lambda system, user: g["rewrite"] or user.split("<latest_message>\n")[-1].split("\n")[0])
    monkeypatch.setattr(SETTINGS, "log_dir", str(tmp_path))
    monkeypatch.setattr(SETTINGS, "wait_s", 10)
    CACHE.clear()
    LIMITER._hits.clear()
    return g


def ask(client, question, session_id=None, **extra):
    return client.post("/api/ask", json={"question": question, "session_id": session_id, **extra})


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["engine"]["books"] == 2821


def test_ask_done(client, gemini):
    r = ask(client, "كتب عن إدارة الجودة الشاملة").json()
    assert r["status"] == "done" and r["session_id"]
    res = r["result"]
    assert res["provider"] == "gemini" and res["notice"] is None
    assert [s["tag"] for s in res["sources"]] == ["S1", "S2"] and len(res["sources"][0]["card"]) == 22
    assert res["all_books"]["items"] and "fallback_errors" not in res


def test_cache_and_follow_up(client, gemini):
    first = ask(client, "كتب أحمد ماهر").json()
    calls = gemini["calls"]
    second = ask(client, "كتب احمد ماهر").json()                # same question, other spelling, new conversation
    assert second.get("cached") and gemini["calls"] == calls     # no new Gemini call
    assert second["result"] == first["result"]
    gemini["rewrite"] = "كتب أحمد ماهر عن الموارد البشرية"
    follow = ask(client, "وفيه كتب تانية لنفس المؤلف عن الموارد البشرية؟", second["session_id"]).json()
    assert follow["status"] == "done" and follow["result"]["search_query"] == "كتب أحمد ماهر عن الموارد البشرية"
    _, s = SESSIONS.get(second["session_id"])
    assert len(s["chat"].history) == 2                           # the cached answer is part of the conversation


def test_slow_gemini_returns_preview_then_answer(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "wait_s", 0.5)
    gemini["delay"] = 2.0
    r = ask(client, "books about project management").json()
    assert r["status"] == "pending" and r["job_id"] and r["preview"]["books"]
    busy = ask(client, "another question", r["session_id"])
    assert busy.status_code == 409                               # one question at a time per conversation
    done = client.get(f"/api/jobs/{r['job_id']}", params={"wait": 10}).json()
    assert done["status"] == "done" and done["result"]["provider"] == "gemini"


def test_gemini_down_gives_books_with_notice(client, gemini):
    gemini["fail"] = True
    res = ask(client, "كتب عن التسويق").json()["result"]
    assert res["provider"] == "extractive" and res["notice"] and res["sources"]
    assert CACHE.get(CACHE.key("كتب عن التسويق", {})) is None   # a fallback answer is never cached


def test_refusal(client, gemini):
    gemini["text"] = "المصادر المتاحة لا تحتوي على معلومات كافية للإجابة عن هذا السؤال، حيث لا توجد وصفات."
    res = ask(client, "إزاي أعمل كيكة شوكولاتة؟").json()["result"]
    assert res["is_refusal"] and res["sources"] == [] and res["all_books"] is None and res["hint"]


def test_help_question(client, gemini):
    res = ask(client, "تقدر تساعدني في إيه؟").json()["result"]
    assert res["provider"] == "help" and res["sources"] == [] and gemini["calls"] == 0


def test_filters(client, gemini):
    res = ask(client, "leadership", filters={"author": "عبد الرحمن توفيق"}).json()["result"]
    assert res["filters_applied"]["author"] == "عبد الرحمن توفيق"


def test_book_card(client):
    r = client.get("/api/books/1687").json()
    assert r["card"]["Number of copies"] == "4" and r["card"]["Book code"] == "1687; 1896"
    assert client.get("/api/books/does-not-exist").status_code == 404


def test_validation(client, gemini):
    assert ask(client, "").status_code == 422
    assert ask(client, "x" * 501).status_code == 422
    assert ask(client, "finance", filters={"language": "fr"}).status_code == 422


def test_rate_limit(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "rate_limit_per_min", 3)
    codes = [ask(client, "تقدر تساعدني في إيه؟").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_reset_and_log(client, gemini):
    r = ask(client, "كتب عن المحاسبة").json()
    client.post("/api/session/reset", json={"session_id": r["session_id"]})
    _, s = SESSIONS.get(r["session_id"])
    assert s["chat"].history == []
    log_file = main.os.path.join(SETTINGS.log_dir, "queries.jsonl")
    assert main.os.path.exists(log_file) and "كتب عن المحاسبة" in open(log_file, encoding="utf-8").read()


# ---------------- website integration: service key, per-user / per-role limit, CORS ----------------
def _ask_as(client, user=None, role=None, key=None):
    headers = {k: v for k, v in {"X-User-Id": user, "X-User-Role": role, "X-Service-Key": key}.items() if v}
    return client.post("/api/ask", json={"question": "تقدر تساعدني في إيه؟"}, headers=headers).status_code


def test_service_key_required_when_set(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "service_key", "s3cret")
    assert _ask_as(client) == 401                                 # no key
    assert _ask_as(client, key="wrong") == 401                    # wrong key
    assert _ask_as(client, key="s3cret") == 200                   # the website's server
    assert client.get("/api/books/1687").status_code == 401
    assert client.get("/api/books/1687", headers={"X-Service-Key": "s3cret"}).status_code == 200
    assert client.get("/api/jobs/abc").status_code == 401
    assert client.post("/api/session/reset", json={"session_id": "x"}).status_code == 401
    assert client.get("/api/health").status_code == 200           # monitoring stays open


def test_no_service_key_means_open(client, gemini):
    assert _ask_as(client) == 200                                 # local testing, Colab, /docs


def test_limit_counts_per_user_not_per_server(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "rate_limit_per_min", 2)
    assert [_ask_as(client, "student-a") for _ in range(3)] == [200, 200, 429]
    assert _ask_as(client, "student-b") == 200                    # same server IP, another researcher: not blocked


def test_librarian_has_no_limit(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "rate_limit_per_min", 2)
    assert all(_ask_as(client, "lib-1", "LIBRARIAN") == 200 for _ in range(6))
    assert all(_ask_as(client, "lib-2", "STUDENT, librarian") == 200 for _ in range(6))   # several roles, any case
    assert [_ask_as(client, "stu-1", "STUDENT") for _ in range(3)] == [200, 200, 429]
    assert [_ask_as(client, "stu-2") for _ in range(3)] == [200, 200, 429]               # no role -> limited


def test_zero_means_no_limit(client, gemini, monkeypatch):
    monkeypatch.setattr(SETTINGS, "rate_limit_per_min", 0)
    assert all(_ask_as(client, "anyone") == 200 for _ in range(30))


def test_settings_lists():
    from app.settings import parse_list
    assert parse_list("") == [] and parse_list(" * ") == ["*"]
    assert parse_list("librarian, admin,,", upper=True) == ["LIBRARIAN", "ADMIN"]


def test_cors_off_when_origins_empty():
    import os
    import subprocess
    import sys
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = "from app.main import app; print([m.cls.__name__ for m in app.user_middleware])"
    def middlewares(origins):
        env = {**os.environ, "API_ALLOWED_ORIGINS": origins}
        return subprocess.run([sys.executable, "-c", code], env=env, cwd=root, capture_output=True, text=True).stdout
    assert "CORSMiddleware" not in middlewares("")                              # server-to-server only
    assert "CORSMiddleware" in middlewares("https://library.example.edu")       # browser calls from one domain
