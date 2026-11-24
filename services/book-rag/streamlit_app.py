"""Streamlit demo of the SAMS library search (same engine and behavior as the API, in one page).

    streamlit run streamlit_app.py

Answers like the website plan: the search is instant; if Gemini needs more than API_WAIT_S (10 s) the books found
so far are shown, then replaced by the final answer; Gemini stops after API_GEMINI_BUDGET_S (90 s).
"""
import os
import sys
import threading

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

WAIT_S = float(os.getenv("API_WAIT_S", 10))
BUDGET_S = float(os.getenv("API_GEMINI_BUDGET_S", 90))
BUSY_NOTICE = {"ar": "المساعد مشغول حالياً، فلم تتم مراجعة النتائج. هذه أقرب الكتب في الفهرس لسؤالك.",
               "en": "The assistant is busy right now, so these results were not reviewed. "
                     "These are the closest books in the catalog to your question."}
EXAMPLES = ["كتب عن إدارة الجودة الشاملة", "كتب أحمد ماهر", "books about project management",
            "فين ألاقي كتب المحاسبة على الرف؟", "كتب عن الـ Marketing الإلكتروني", "تقدر تساعدني في إيه؟"]

st.set_page_config(page_title="البحث الذكي في مكتبة SAMS", page_icon="📚", layout="wide")
st.markdown("""<style>
.stApp, [data-testid="stSidebar"], [data-testid="stChatMessage"], .stMarkdown, .stAlert, label {direction: rtl; text-align: right;}
code, pre {direction: ltr; text-align: left;}
</style>""", unsafe_allow_html=True)


@st.cache_resource(show_spinner="جاري تحميل الفهرس والنماذج (مرة واحدة عند التشغيل)...")
def load_engine():
    from sams_rag import engine
    from sams_rag.config import CONFIG
    CONFIG["gemini_time_budget_s"] = BUDGET_S          # same limit as the website API
    return engine


E = load_engine()
from sams_rag.text import detect_language  # noqa: E402  (after the engine is loaded)

if "chat" not in st.session_state:
    st.session_state.chat = E.ChatSession()
    st.session_state.messages = []                    # [{"role": "user"/"assistant", "text"/"data"}]


# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.header("📚 مكتبة SAMS")
    if st.button("🆕 محادثة جديدة", width="stretch"):
        st.session_state.chat.reset()
        st.session_state.messages = []
        st.rerun()
    st.subheader("فلاتر (اختيارية)")
    f_author = st.text_input("المؤلف")
    f_lang = st.selectbox("اللغة", ["الكل", "عربي", "إنجليزي"])
    use_years = st.checkbox("تحديد سنة النشر")
    y_from, y_to = (st.slider("من سنة / إلى سنة", 1950, 2026, (2000, 2026)) if use_years else (None, None))
    st.subheader("أمثلة")
    example = None
    for q in EXAMPLES:
        if st.button(q, width="stretch"):
            example = q
    status = E.status()
    st.caption(f"{status['books']:,} كتاب في الفهرس · Gemini: {'متصل' if os.getenv('GEMINI_API_KEY') else 'غير متصل (رد احتياطي فقط)'}")


def current_filters():
    f = {}
    if f_author.strip():
        f["author"] = f_author.strip()
    if f_lang != "الكل":
        f["language"] = "ar" if f_lang == "عربي" else "en"
    if use_years:
        f["year_from"], f["year_to"] = y_from, y_to
    return E.SearchFilters(**f) if f else None


# ------------------------------------------------------------------ rendering
def card_table(card):
    return pd.DataFrame(list(card.items()), columns=["الحقل", "القيمة"])


def render(data, key):
    if data.get("notice"):
        st.warning(data["notice"])
    st.markdown(data["answer"])
    if data.get("coverage_note"):
        st.info(data["coverage_note"])
    if data.get("hint"):
        st.info(data["hint"])
    if data["sources"]:
        with st.expander(f"📇 بطاقات الكتب المذكورة في الرد ({len(data['sources'])})"):
            for s in data["sources"]:
                st.markdown(f"**[{s['tag']}] {s['title']}**")
                st.dataframe(card_table(s["card"]), hide_index=True, width="stretch")
    ab = data.get("all_books")
    if ab and ab["items"]:
        title = (f"📚 كل الكتب المطابقة ({len(ab['items'])})" if ab["complete"]
                 else f"📚 أقرب {len(ab['items'])} كتاباً لسؤالك")
        with st.expander(title):
            df = pd.DataFrame([{"#": it["n"], "✓": "✓" if it["in_answer"] else "", "العنوان": it["title"],
                                "المؤلف": it["author"], "السنة": it["year"], "رقم الاستدعاء": it["call_number"],
                                "النسخ": it["copies"]} for it in ab["items"]])
            st.caption("✓ = مذكور في الرد")
            st.dataframe(df, hide_index=True, width="stretch")
            labels = {f"{it['n']}. {it['title']}": it["book_codes"][0] for it in ab["items"] if it["book_codes"]}
            pick = st.selectbox("اعرض البطاقة الكاملة لكتاب:", ["—"] + list(labels), key=f"pick_{key}")
            if pick != "—":
                ids = E.book_ids_for_code(labels[pick])
                st.dataframe(card_table(E.card_to_dict(E.book_card(ids))), hide_index=True, width="stretch")
    meta = [data["provider"]] + ([data["model"]] if data.get("model") else []) + [f"{data['latency_s']} ث"]
    st.caption(" · ".join(str(m) for m in meta))


def answer(question):
    lang = detect_language(question)
    holder, box = {}, st.empty()
    chat = st.session_state.chat                       # the worker thread uses this object (not session_state)
    box.info("🔍 يبحث في الفهرس...")
    stage = chat.begin(question, filters=current_filters())   # search (instant)

    def work():
        try:
            holder["out"] = chat.end(stage)
        except Exception as exc:                       # never show a technical error to a researcher
            holder["error"] = exc

    worker = threading.Thread(target=work)
    box.info("✍️ المساعد يكتب الرد...")
    worker.start()
    worker.join(WAIT_S)
    if worker.is_alive():                              # Gemini is slow: show the books found so far
        preview = E.preview(stage)
        with box.container():
            st.info("نتائج البحث، والمساعد ما زال يكتب الرد..." if lang == "ar"
                    else "Search results -- the assistant is still writing the answer...")
            for b in preview["books"]:
                st.markdown(f"- **{b['title']}** — {b['author']} · {b['call_number']}")
        worker.join()
    box.empty()
    if "error" in holder:
        st.error("حدث خطأ أثناء البحث. حاول مرة أخرى." if lang == "ar" else "Something went wrong. Please try again.")
        return None
    out = holder["out"]
    data = E.serialize(out)
    data["notice"] = BUSY_NOTICE[lang] if out["provider"] not in ("gemini", "help") else None
    return data


# ------------------------------------------------------------------ page
st.title("البحث الذكي في فهرس مكتبة SAMS")
st.caption("اسأل عن كتاب أو موضوع أو مؤلف، بالعربي أو بالإنجليزي. الإجابات من بيانات الفهرس فقط.")

for i, m in enumerate(st.session_state.messages):
    with st.chat_message(m["role"]):
        if m["role"] == "user":
            st.markdown(m["text"])
        else:
            render(m["data"], key=i)

question = st.chat_input("اكتب سؤالك هنا...") or example
if question:
    st.session_state.messages.append({"role": "user", "text": question})
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        data = answer(question)
        if data:
            render(data, key=len(st.session_state.messages))
            st.session_state.messages.append({"role": "assistant", "data": data})
