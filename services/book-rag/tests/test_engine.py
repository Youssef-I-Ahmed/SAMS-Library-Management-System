"""Acceptance checks taken from the notebook v12 run (data and behavior; Gemini is mocked).

    pytest -q
"""
import json

import pytest

from sams_rag import chat as chat_module
from sams_rag import generation
from sams_rag.answer import is_help_question, requested_language
from sams_rag.catalog import books_df, language_changes_df, raw_df
from sams_rag.config import CONFIG
from sams_rag.context import near_duplicates_df
from sams_rag.engine import (ChatSession, SearchFilters, apply_filters, book_card, book_ids_for_code,
                             hybrid_search, rag_answer, serialize)


# ---------------- catalog (notebook Sections 2, 4, 10.0) ----------------
def test_catalog_counts():
    assert len(raw_df) == 2842
    assert len(books_df) == 2821                                   # 21 exact duplicates merged
    assert sum(len(c) for c in books_df["merged_codes"]) == 2842   # no record dropped
    assert len(language_changes_df) == 42                          # v11 main-title language rule
    assert len(near_duplicates_df) == 19                           # v6 near-duplicate pairs


def test_card_has_22_fields_and_keeps_NA():
    card = books_df.loc[0, "content"].split("\n")
    assert len(card) == 22
    assert any(line.endswith(": NA") for c in books_df["content"].head(50) for line in c.split("\n"))


def test_near_duplicate_card_combines_copies():
    ids = book_ids_for_code("1687")                                # تخطيط القوى العاملة (two records)
    assert len(ids) == 2
    card = book_card(ids)
    assert "Book code: 1687; 1896" in card and "Number of copies: 4" in card


# ---------------- query understanding (Sections 7, 11) ----------------
@pytest.mark.parametrize("q", ["تقدر تساعدني في إيه؟", "مرحبا", "What can you do?"])
def test_help_detected(q):
    assert is_help_question(q)


@pytest.mark.parametrize("q", ["كتب عن إدارة الجودة الشاملة", "كتب أحمد ماهر", "books about project management"])
def test_not_help(q):
    assert not is_help_question(q)


@pytest.mark.parametrize("q,lang", [("وفيه منها كتب بالإنجليزي؟", "en"), ("English books on marketing", "en"),
                                    ("Arabic books about finance", "ar"), ("كتب عن الدول العربية", None),
                                    ("books about project management", None)])
def test_language_request(q, lang):
    assert requested_language(q) == lang


# ---------------- filters (Section 12.2) ----------------
@pytest.mark.parametrize("query,f", [
    ("leadership", SearchFilters(author="عبد الرحمن توفيق")),
    ("marketing", SearchFilters(topics=["التسويق"], year_from=2008, year_to=2012)),
    ("finance", SearchFilters(language="en", topics=["Finance"])),
    ("banks", SearchFilters(topics=["البنوك", "الاسلامية"], topics_mode="all")),
    ("management", SearchFilters(publisher="Pearson")),
    ("الاستثمار", SearchFilters(author=["فريد النجار", "محمد الصيرفى"])),
])
def test_filter_compliance(query, f):
    allowed = set(apply_filters(f))
    res = hybrid_search(query, filters=f, k=10, auto_filters=False)
    assert len(res) > 0 and set(res["book_id"]) <= allowed


# ---------------- pipeline behavior (Section 11.3, manual review) ----------------
def test_help_answer_has_no_books():
    out = rag_answer("تقدر تساعدني في إيه؟")
    assert out["provider"] == "help" and out["package"]["num_sources"] == 0


def test_author_question_lists_all_33_books():
    out = rag_answer("كتب أحمد ماهر")
    assert out["filters"].get("author")                             # author detected from the text
    assert out["all_books_complete"] and len(out["all_books"]) == 33
    assert "من أصل 33" in out["coverage_note"]


def test_no_matching_books_refuses_with_hint():
    out = rag_answer("كتب عن تصميم ألعاب الفيديو", filters=SearchFilters(topics=["ألعاب الفيديو"]))
    assert out["citations"]["is_refusal"] and out["hint"] and out["all_books"] is None


def test_serialize_is_json():
    data = serialize(rag_answer("كتب عن إدارة الجودة الشاملة"))
    json.dumps(data, ensure_ascii=False)
    assert data["sources"] and len(data["sources"][0]["card"]) == 22


# ---------------- display rules with a mocked Gemini (v8, v10, v12) ----------------
@pytest.fixture
def gemini(monkeypatch):
    reply = {"text": ""}
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setitem(CONFIG, "llm_provider", "gemini")
    monkeypatch.setattr(generation, "call_gemini", lambda system, user: reply["text"])
    monkeypatch.setattr(chat_module, "call_gemini", lambda system, user: reply.get("rewrite") or user)
    return reply


def test_refusal_with_extra_text_is_trimmed(gemini):
    gemini["text"] = ("المصادر المتاحة لا تحتوي على معلومات كافية للإجابة عن هذا السؤال، "
                      "ويمكنك الرجوع إلى كتب المطاعم: **فن انشاء وادارة المطاعم** [S1]")
    out = rag_answer("إزاي أعمل كيكة شوكولاتة؟")
    assert out["citations"]["is_refusal"]
    assert out["answer"] == generation.REFUSAL_AR and "raw_answer" in out
    assert out["all_books"] is None and out["hint"]


def test_books_named_without_tags_are_found(gemini):
    res = hybrid_search("كتب عن إدارة الجودة الشاملة", k=10)
    title = res["title"].iloc[0]
    gemini["text"] = f"تتوفر الكتب التالية:\n1. **{title}**"
    out = rag_answer("كتب عن إدارة الجودة الشاملة")
    assert out["citations"]["cited"] == [] and out["citations"]["inferred"]
    assert out["all_books"] is not None and out["hint"] is None


def test_chat_memory_and_language_follow_up(gemini):
    gemini["text"] = "الكتب [S1]."
    gemini["rewrite"] = "كتب إدارة الجودة الشاملة باللغة الإنجليزية"
    chat = ChatSession()
    chat.ask("كتب عن إدارة الجودة الشاملة")
    out = chat.ask("وفيه منها كتب بالإنجليزي؟")
    assert out["search_query"] == "كتب إدارة الجودة الشاملة باللغة الإنجليزية"
    assert out["filters"].get("language") == "en"
    assert len(chat.history) == 2


# ---------------- evaluation harness (notebook Section 12) ----------------
def test_eval_set_is_the_notebook_set():
    from sams_rag.evaluation import build_eval_set
    df = build_eval_set()
    assert len(df) == 84
    assert df["family"].value_counts().to_dict() == {"known_item": 25, "author": 15, "topic_heading": 15,
                                                     "concept": 12, "arabic_morph": 9, "mixed_lang": 8}


def test_evaluation_filter_compliance():
    from sams_rag.evaluation import filter_compliance
    assert (filter_compliance()["compliance"] == 1.0).all()
