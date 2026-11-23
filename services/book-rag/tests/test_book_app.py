"""The open-book page (book_app.py), driven like a researcher would (Streamlit AppTest; Gemini mocked)."""
import os

from streamlit.testing.v1 import AppTest

from sams_rag import chat as chat_module
from sams_rag import generation
from sams_rag.config import CONFIG
from book_ui import book_html

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "book_app.py")


def _gemini(monkeypatch, text="الكتب [S1] و [S2]."):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setitem(CONFIG, "llm_provider", "gemini")
    monkeypatch.setattr(generation, "call_gemini", lambda s, u: text)
    monkeypatch.setattr(chat_module, "call_gemini", lambda s, u: "كتب أحمد ماهر")


def test_book_answers_and_keeps_cards(monkeypatch):
    _gemini(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=300).run()
    assert not at.exception
    at.chat_input[0].set_value("كتب أحمد ماهر").run()
    assert not at.exception
    entry = at.session_state["book_history"][-1]
    assert [s["tag"] for s in entry["data"]["sources"]] == ["S1", "S2"]
    assert len(entry["data"]["all_books"]["items"]) == 33
    assert all(len(c) == 22 for c in entry["data"]["cards"].values())


def test_example_button_and_new_page(monkeypatch):
    _gemini(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=300).run()
    [b for b in at.sidebar.button if b.label == "books about project management"][0].click().run()
    assert len(at.session_state["book_history"]) == 1 and not at.exception
    [b for b in at.sidebar.button if "صفحة جديدة" in b.label][0].click().run()
    assert at.session_state["book_history"] == [] and not at.exception


def test_html_is_safe():
    evil = {"q": "<script>alert(1)</script>", "lang": "ar",
            "data": {"answer": "</script><img src=x onerror=alert(1)>", "sources": [], "all_books": None, "cards": {}}}
    page = book_html("answer", [evil])
    data_part = page.split('id="book-data">', 1)[1].split("</script>", 1)[0]
    assert "</script" not in data_part and "<img" in data_part   # kept as JSON text, drawn with textContent


def test_fonts_are_bundled():
    with_f, without = book_html("welcome", []), book_html("welcome", [], with_fonts=False)
    assert with_f.count("@font-face") == 9 and "base64," in with_f        # no internet font service needed
    assert "@font-face" not in without and "googleapis" not in with_f


def test_relevance_cut_keeps_only_related_books():
    import types
    import pandas as pd
    from book_ui.relevance import keep_relevant, _INDEX
    books = pd.DataFrame({"merged_codes": [["1"], ["2"], ["3"], ["4"], ["5"]], "content": ["a", "b", "c", "d", "e"]})
    scores = {"a": 0.9, "b": 0.7, "c": 0.05, "d": 0.4, "e": 0.01}
    fake = types.SimpleNamespace(books_df=books, reranker=types.SimpleNamespace(
        available=True, score=lambda q, texts: [scores[t] for t in texts]))
    items = [{"n": i + 1, "book_codes": [str(i + 1)], "title": t, "in_answer": t == "e"} for i, t in enumerate("abcde")]
    data = {"search_query": "q", "all_books": {"complete": False, "items": items}}
    _INDEX.clear()
    import sams_rag.listing as rel
    rel.KEEP_TOP = 1                                        # only the first result is kept by rank in this test
    out = keep_relevant(data, "q", fake, min_score=0.2)
    rel.KEEP_TOP = 20
    assert [it["title"] for it in out["all_books"]["items"]] == ["a", "b", "d", "e"]     # e kept: cited in the answer
    assert [it["n"] for it in out["all_books"]["items"]] == [1, 2, 3, 4] and out["all_books"]["relevant_only"]
    complete = {"all_books": {"complete": True, "items": items}}
    assert keep_relevant(complete, "q", fake) is complete                               # filter lists are untouched


def test_relevance_without_reranker_keeps_a_short_list():
    import types
    from book_ui.relevance import keep_relevant, FALLBACK_LIMIT
    fake = types.SimpleNamespace(reranker=types.SimpleNamespace(available=False))
    items = [{"n": i, "book_codes": [str(i)], "title": str(i)} for i in range(1, 60)]
    out = keep_relevant({"all_books": {"complete": False, "items": items}}, "q", fake)
    assert len(out["all_books"]["items"]) == FALLBACK_LIMIT


def test_topic_list_keeps_subject_books_and_cuts_only_related_ones():
    import types
    import pandas as pd
    from book_ui.relevance import keep_relevant, _INDEX
    books = pd.DataFrame({"merged_codes": [["1"], ["2"], ["3"], ["4"], ["5"]], "content": ["a", "b", "c", "d", "e"]})
    scores = {"a": 0.01, "b": 0.02, "c": 0.9, "d": 0.05, "e": 0.01}
    fake = types.SimpleNamespace(books_df=books, reranker=types.SimpleNamespace(
        available=True, score=lambda q, texts: [scores[t] for t in texts]))
    items = [{"n": i + 1, "book_codes": [str(i + 1)], "title": t, "in_topic": t in "ab", "in_answer": t == "e"}
             for i, t in enumerate("abcde")]
    _INDEX.clear()
    import sams_rag.listing as rel
    rel.KEEP_TOP = 0                                        # no related book is kept by rank in this check
    out = keep_relevant({"search_query": "q", "all_books": {"complete": True, "items": items}}, "q", fake)
    rel.KEEP_TOP = 1                                        # the first related book (c) is kept by rank
    scores["c"] = 0.01
    _INDEX.clear()
    out2 = keep_relevant({"search_query": "q", "all_books": {"complete": True, "items": items}}, "q", fake)
    rel.KEEP_TOP = 20
    assert [it["title"] for it in out2["all_books"]["items"]] == ["a", "b", "c", "e"]   # c: low score, kept by rank
    ab = out["all_books"]
    assert [it["title"] for it in ab["items"]] == ["a", "b", "c", "e"]   # a, b: subject (low score kept); d cut
    assert ab["topic_count"] == 2 and ab["related_count"] == 2 and [it["n"] for it in ab["items"]] == [1, 2, 3, 4]


def test_serialize_trims_the_list_for_the_website_too():
    # v16: the API's serialize() applies the same list rules as the book page; a second call changes nothing
    from sams_rag.engine import rag_answer, serialize
    from sams_rag.listing import keep_relevant
    data = serialize(rag_answer("Introduction to Management Science"))
    ab = data["all_books"]
    assert ab is None or ab.get("complete") or ab.get("relevant_only") or len(ab["items"]) <= 15
    assert keep_relevant(data, "Introduction to Management Science") == data
