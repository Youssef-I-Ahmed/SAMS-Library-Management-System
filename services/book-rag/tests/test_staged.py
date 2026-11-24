"""retrieve() + finish() must give exactly what rag_answer() gives; begin() + end() exactly what ask() gives."""
import json

import pytest

from sams_rag import chat as chat_module
from sams_rag import generation
from sams_rag.config import CONFIG
from sams_rag.engine import ChatSession, SearchFilters, finish, rag_answer, retrieve, serialize

QUESTIONS = [("كتب عن إدارة الجودة الشاملة", None), ("كتب أحمد ماهر", None), ("تقدر تساعدني في إيه؟", None),
             ("وفيه منها كتب بالإنجليزي؟", None), ("leadership", {"author": "عبد الرحمن توفيق"}),
             ("كتب عن تصميم ألعاب الفيديو", {"topics": ["ألعاب الفيديو"]})]


def _same(a, b):
    da, db = serialize(a), serialize(b)
    da.pop("latency_s"); db.pop("latency_s")
    return json.dumps(da, ensure_ascii=False, sort_keys=True, default=str) == json.dumps(db, ensure_ascii=False, sort_keys=True, default=str)


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setitem(CONFIG, "llm_provider", "gemini")
    monkeypatch.setattr(generation, "call_gemini", lambda s, u: "الكتب [S1] و [S2]." if "كيكة" not in u else
                        "المصادر المتاحة لا تحتوي على معلومات كافية للإجابة عن هذا السؤال.")
    monkeypatch.setattr(chat_module, "call_gemini", lambda s, u: "كتب إدارة الجودة الشاملة باللغة الإنجليزية")


@pytest.mark.parametrize("q,f", QUESTIONS)
def test_finish_retrieve_equals_rag_answer(gemini, q, f):
    sf = SearchFilters(**f) if f else None
    assert _same(rag_answer(q, filters=sf), finish(retrieve(q, filters=sf)))


def test_begin_end_equals_ask(gemini):
    a, b = ChatSession(), ChatSession()
    for q in ["كتب عن إدارة الجودة الشاملة", "وفيه منها كتب بالإنجليزي؟", "تقدر تساعدني في إيه؟", "إزاي أعمل كيكة شوكولاتة؟"]:
        assert _same(a.ask(q), b.end(b.begin(q)))
    assert a.history == b.history
