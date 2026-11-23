"""v14: questions asking for the newest books are ordered by publication year; nothing else changes."""
import pytest

from sams_rag import chat as chat_module
from sams_rag.engine import ChatSession, finish, rag_answer, retrieve, serialize
from sams_rag.evaluation import build_eval_set
from sams_rag.recency import wants_recent, year_of


@pytest.mark.parametrize("q", ["وإيه الأحدث فيهم؟", "أحدث كتب التسويق", "عايز الأجدد في المحاسبة",
                               "آخر الإصدارات في الإدارة", "latest books on marketing", "newest accounting books",
                               "the most recent books about finance"])
def test_recency_detected(q):
    assert wants_recent(q)


@pytest.mark.parametrize("q", ["الاتجاهات الحديثة في إدارة الأعمال",       # "الحديثة" is in 31 titles
                               "كتب عن الإدارة الجديدة", "new product development", "كتب عن التسويق",
                               "recent developments in marketing",
                               "الأساليب الحديثة للعلاقات العامة والتسويق أحدث ثورة"])   # a book title with "أحدث"
def test_not_recency(q):
    assert not wants_recent(q)


def test_no_evaluation_question_is_affected():
    assert not any(wants_recent(q) for q in build_eval_set()["query"])


def _years_desc(years):
    ys = [year_of(y) for y in years]
    return all(a >= b for a, b in zip(ys, ys[1:]))


def test_newest_question_is_ordered_by_year():
    out = rag_answer("أحدث كتب عن التسويق")
    assert out["recency"] and serialize(out)["recency"]
    assert _years_desc(out["package"]["sources"]["year"])
    assert _years_desc([it["year"] for it in serialize(out)["all_books"]["items"]])
    assert not rag_answer("كتب عن التسويق")["recency"]


def test_newest_books_of_an_author_full_list_by_year():
    data = serialize(rag_answer("أحدث كتب أحمد ماهر"))
    assert data["recency"] and data["all_books"]["complete"] and len(data["all_books"]["items"]) == 33
    assert _years_desc([it["year"] for it in data["all_books"]["items"]])


def test_follow_up_newest(monkeypatch):
    monkeypatch.setattr(chat_module, "call_gemini", lambda s, u: "أحدث كتب التسويق")
    chat = ChatSession()
    chat.ask("كتب عن التسويق")
    out = chat.ask("وإيه الأحدث فيهم؟")
    assert out["recency"] and _years_desc(out["package"]["sources"]["year"])


def test_staged_equals_rag_answer_for_newest():
    a, b = serialize(rag_answer("أحدث كتب عن التسويق")), serialize(finish(retrieve("أحدث كتب عن التسويق")))
    a.pop("latency_s"); b.pop("latency_s")
    assert a == b
