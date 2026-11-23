"""The Streamlit demo page, driven like a researcher would (Streamlit AppTest; Gemini mocked)."""
import os
import time

import pytest
from streamlit.testing.v1 import AppTest

from sams_rag import chat as chat_module
from sams_rag import generation
from sams_rag.config import CONFIG

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "streamlit_app.py")


@pytest.fixture
def gemini(monkeypatch):
    g = {"text": "الكتب [S1] و [S2].", "delay": 0.0}

    def fake(system, user):
        time.sleep(g["delay"])
        return g["text"]

    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("API_WAIT_S", "1")
    monkeypatch.setitem(CONFIG, "llm_provider", "gemini")
    monkeypatch.setattr(generation, "call_gemini", fake)
    monkeypatch.setattr(chat_module, "call_gemini", lambda s, u: "كتب إدارة الجودة الشاملة باللغة الإنجليزية")
    return g


def ask(at, q):
    at.chat_input[0].set_value(q).run()
    return at.session_state["messages"][-1]["data"]


def test_page_answers_and_remembers(gemini):
    at = AppTest.from_file(APP, default_timeout=180).run()
    assert not at.exception
    data = ask(at, "كتب عن إدارة الجودة الشاملة")
    assert data["provider"] == "gemini" and [s["tag"] for s in data["sources"]] == ["S1", "S2"]
    ask(at, "وفيه منها كتب بالإنجليزي؟")
    assert len(at.session_state["chat"].history) == 2 and not at.exception


def test_slow_gemini_and_refusal(gemini):
    at = AppTest.from_file(APP, default_timeout=180).run()
    gemini["delay"] = 2.0                                       # longer than API_WAIT_S -> preview first
    assert ask(at, "books about project management")["provider"] == "gemini"
    gemini["delay"], gemini["text"] = 0.0, "المصادر المتاحة لا تحتوي على معلومات كافية للإجابة عن هذا السؤال، لا وصفات."
    data = ask(at, "إزاي أعمل كيكة شوكولاتة؟")
    assert data["is_refusal"] and not data["sources"] and data["all_books"] is None and data["hint"]


def test_full_list_and_card(gemini):
    at = AppTest.from_file(APP, default_timeout=180).run()
    ask(at, "كتب أحمد ماهر")
    assert any("كل الكتب المطابقة (33)" in e.label for e in at.expander)
    sb = [s for s in at.selectbox if s.label.startswith("اعرض البطاقة")][0]
    sb.select(sb.options[1]).run()
    assert any(len(d.value) == 22 for d in at.dataframe) and not at.exception
