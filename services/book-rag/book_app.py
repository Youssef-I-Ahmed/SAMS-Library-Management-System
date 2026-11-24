"""The SAMS library search with the open-book interface (same engine as streamlit_app.py, new look).

    streamlit run book_app.py

Nothing in sams_rag/ or streamlit_app.py is changed: this page calls the same engine functions
(ChatSession.begin/end, preview, serialize, book_card) and draws the result as an open book.
"""
import os
import sys
import threading

import streamlit as st
import streamlit.components.v1 as components

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from book_ui import (BOOK_HEIGHT, book_html, build_entry, inject_theme, ribbon_css,  # noqa: E402
                     sidebar_brand, status_line)
from book_ui.relevance import keep_relevant  # noqa: E402

BUDGET_S = float(os.getenv("API_GEMINI_BUDGET_S", 90))
BUSY_NOTICE = {"ar": "المساعد مشغول حالياً، فلم تتم مراجعة النتائج. هذه أقرب الكتب في الفهرس لسؤالك.",
               "en": "The assistant is busy right now, so these results were not reviewed. "
                     "These are the closest books in the catalog to your question."}
ERROR_TEXT = {"ar": "حدث خطأ أثناء البحث. حاول مرة أخرى.", "en": "Something went wrong. Please try again."}
EXAMPLES = ["كتب عن إدارة الجودة الشاملة", "كتب أحمد ماهر", "books about project management",
            "فين ألاقي كتب المحاسبة على الرف؟", "كتب عن الـ Marketing الإلكتروني", "تقدر تساعدني في إيه؟"]
BRAND = {"name": os.getenv("BOOK_BRAND_NAME", "أكاديمية السادات"),
         "sub": os.getenv("BOOK_BRAND_SUB", "أكاديمية السادات للعلوم الإدارية")}

st.set_page_config(page_title=f"البحث الذكي في مكتبة {BRAND['name']}", page_icon="📚", layout="wide",
                   initial_sidebar_state="auto")
inject_theme()


@st.cache_resource(show_spinner="جاري تحميل الفهرس والنماذج (مرة واحدة عند التشغيل)...")
def load_engine():
    from sams_rag import engine
    from sams_rag.config import CONFIG
    CONFIG["gemini_time_budget_s"] = BUDGET_S          # same limit as the website API
    # "closest books" list (only when the question has no narrow filter): the engine always fills it to a fixed size;
    # book_ui.relevance then keeps only the books the reranker finds relevant (see BOOK_MIN_RELEVANCE).
    CONFIG["all_books_limit"] = int(os.getenv("BOOK_LIST_LIMIT", 100))
    return engine


E = load_engine()
from sams_rag.text import detect_language  # noqa: E402  (after the engine is loaded)

ss = st.session_state
if "chat" not in ss:
    ss.chat = E.ChatSession()
    ss.book_history = []           # [build_entry(...)] oldest first
    ss.book_intro_seen = False

# ------------------------------------------------------------------ sidebar
with st.sidebar:
    sidebar_brand(BRAND["name"], "المكتبة الرقمية والمساعد البحثي")
    if st.button("+ صفحة جديدة", type="primary", key="book_new"):
        ss.chat.reset()
        ss.book_history = []
        st.rerun()
    st.markdown("### فلاتر")
    f_author = st.text_input("المؤلف", placeholder="اسم المؤلف (اختياري)")
    f_lang = st.radio("اللغة", ["الكل", "عربي", "إنجليزي"], horizontal=True, key="book_lang")
    use_years = st.checkbox("تحديد سنة النشر")
    y_from, y_to = (st.slider("من سنة / إلى سنة", 1950, 2026, (2000, 2026)) if use_years else (None, None))
    st.markdown("### أمثلة")
    keys = [f"book_ex_{i}" for i in range(len(EXAMPLES))]
    ribbon_css(keys)
    example = None
    for q, k in zip(EXAMPLES, keys):
        if st.button(q, key=k):
            example = q
    status = E.status()
    status_line(status["books"], bool(os.getenv("GEMINI_API_KEY")))


def current_filters():
    f = {}
    if f_author.strip():
        f["author"] = f_author.strip()
    if f_lang != "الكل":
        f["language"] = "ar" if f_lang == "عربي" else "en"
    if use_years:
        f["year_from"], f["year_to"] = y_from, y_to
    return E.SearchFilters(**f) if f else None


# ------------------------------------------------------------------ the book
book = st.empty()


def show(view, pending=None, animate=True, intro=False):
    page = book_html(view, ss.book_history, pending=pending, intro=intro, animate=animate,
                     brand=BRAND, books_total=status["books"], with_fonts=not ss.get("book_fonts_sent"))
    with book.container():
        if hasattr(st, "iframe"):                      # newer Streamlit (components.v1.html is being retired)
            st.iframe(page, height=BOOK_HEIGHT)
        else:
            components.html(page, height=BOOK_HEIGHT, scrolling=True)
    ss.book_fonts_sent = True             # the page now has the fonts; next frames reuse them (lighter)


def answer(question):
    lang = detect_language(question)
    chat = ss.chat                                     # the worker thread uses this object (not session_state)
    try:
        stage = chat.begin(question, filters=current_filters())     # search (instant)
        show("searching", pending={"q": question, "lang": lang, "preview": E.preview(stage)})
    except Exception:
        return {"answer": ERROR_TEXT[lang], "sources": [], "all_books": None, "provider": None, "is_refusal": False}, lang
    holder = {}

    def work():
        try:
            holder["out"] = chat.end(stage)
        except Exception as exc:                       # never show a technical error to a researcher
            holder["error"] = exc

    worker = threading.Thread(target=work)
    worker.start()
    worker.join()
    if "error" in holder:
        return {"answer": ERROR_TEXT[lang], "sources": [], "all_books": None, "provider": None, "is_refusal": False}, lang
    out = holder["out"]
    data = keep_relevant(E.serialize(out), question, E)
    data["notice"] = BUSY_NOTICE[lang] if out["provider"] not in ("gemini", "help") else None
    return data, lang


question = st.chat_input("اكتب سؤالك هنا...") or example
if question:
    data, lang = answer(question)
    ss.book_history.append(build_entry(question, lang, data, E))
    ss.book_intro_seen = True
    show("answer", animate=True)
else:
    first = not ss.book_intro_seen and not ss.book_history
    show("answer" if ss.book_history else "welcome", animate=first, intro=first)
    ss.book_intro_seen = True
