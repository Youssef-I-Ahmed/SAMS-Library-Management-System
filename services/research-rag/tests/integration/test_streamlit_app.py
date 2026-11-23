"""Headless Streamlit smoke tests (streamlit.testing AppTest): the pilot renders, searches, asks, and gates admin."""
from pathlib import Path

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

from src.config.settings import get_settings
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings

APP = str(Path(__file__).resolve().parents[2] / "app.py")


@pytest.fixture()
def env(tmp_path, monkeypatch, records):
    s = make_settings(tmp_path, hashing_dim=256)
    svc = build_services(s, load=False, embedder=HashingEmbedder(256))
    svc.indexer.full_rebuild(records)
    monkeypatch.setenv("DATABASE_URL", s.database_url)
    monkeypatch.setenv("HASHING_DIM", "256")
    monkeypatch.setenv("EMBEDDING_BACKEND", "hashing")   # never download a model in unit tests
    monkeypatch.setenv("PILOT_ADMIN_PASSWORD", "pilot-pass")
    monkeypatch.setenv("RAW_DATASET_PATH", str(tmp_path / "none.xlsx"))
    monkeypatch.setenv("SERVICE_JWT_SECRET", "x" * 40)
    get_settings.cache_clear(); st.cache_resource.clear()
    yield svc
    get_settings.cache_clear(); st.cache_resource.clear()


def md(at):
    return " ".join(m.value for m in at.markdown)


def go(at, page):
    at.session_state["page"] = page
    return at.run()


def clicked(at, label_part, key=None):
    btn = [b for b in at.button if (b.key == key if key else label_part in b.label)] or \
          [b for b in at.get("form_submit_button") if label_part in b.label]
    assert btn, f"no button {label_part!r}"
    return btn[0].click().run()


def ask(at, q):
    go(at, "assistant")
    at.text_input[0].set_value(q)
    clicked(at, "إرسال") if at.session_state["lang_choice"] == "العربية" else clicked(at, "Send")
    return at


def test_renders_in_arabic_and_english_without_exceptions(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert not at.exception and "direction:rtl" in md(at).replace(" ", "")
    assert [r.value for r in at.sidebar.radio][0] == "home"                       # sidebar navigation is present
    at.radio(key="lang_choice").set_value("English").run()
    assert not at.exception and "direction:ltr" in md(at).replace(" ", "")
    at.radio(key="lang_choice").set_value("العربية").run()
    assert "direction:rtl" in md(at).replace(" ", "")


def test_every_page_renders_without_exception_in_both_languages(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    for lang in ("العربية", "English"):
        at.radio(key="lang_choice").set_value(lang).run()
        for page in ("home", "assistant", "search", "details", "stats", "about", "status", "admin"):
            go(at, page)
            assert not at.exception, (lang, page, [e.value for e in at.exception])


def test_home_statistics_come_from_the_database(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert str(env.store.count()) in md(at).replace(",", "")


def test_assistant_exact_id_arabic_and_english_return_the_same_record(env):
    rec = env.store.get("10")
    for lang, q in (("العربية", "ما عنوان المشروع رقم ١٠ وفي أي سنة تم نشره؟"),
                    ("English", "What is the title of project number 10 and in which year was it published?")):
        at = AppTest.from_file(APP, default_timeout=60).run()
        at.radio(key="lang_choice").set_value(lang).run()
        ask(at, q)
        assert not at.exception
        text = md(at)
        assert rec.title in text and str(rec.year) in text, lang


def test_assistant_nonexistent_id_is_no_match_and_unsupported_info_is_not_invented(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    ask(at, "ما عنوان المشروع رقم 99999؟")
    assert "99999" in md(at) and "لا يوجد" in md(at) and not at.exception
    ask(at, "ما نتائج المشروع رقم 10؟")
    assert "غير متوفر" in md(at) and not at.exception


def test_assistant_counts_by_sql_and_empty_question_is_not_an_error(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    ask(at, "كم مشروع أشرف عليه كريم فؤاد؟")
    assert "130" in md(at)
    n = env.store.count_where(years=[2023]) if hasattr(env.store, "count_where") else None
    ask(at, "كم عدد المشروعات المسجلة في سنة 2023؟")
    assert not at.exception and (n is None or str(n) in md(at))


def test_search_by_number_and_details_and_empty_state(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    go(at, "search")
    at.text_input(key="f_number").set_value("١٠")                              # Arabic-Indic digits
    clicked(at, "بحث")
    assert not at.exception and env.store.get("10").title in md(at)
    at.text_input(key="f_number").set_value("99999")
    clicked(at, "بحث")
    assert not at.exception and env.store.get("10").title not in md(at)


def test_search_supervisor_total_is_complete(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    go(at, "search")
    at.text_input(key="f_sup").set_value("كريم فؤاد")
    clicked(at, "بحث")
    assert not at.exception and "130" in md(at)


def test_details_lookup_and_missing_record(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    go(at, "details")
    at.text_input(key="det_num").set_value("10")
    clicked(at, "فتح")
    assert not at.exception and env.store.get("10").title in md(at)
    at.text_input(key="det_num").set_value("99999")
    clicked(at, "فتح")
    assert not at.exception and env.store.get("10").title not in md(at)


def test_admin_requires_password_and_can_add_record(env):
    at = AppTest.from_file(APP, default_timeout=60).run()
    go(at, "admin")
    [t for t in at.text_input if t.label == "كلمة المرور"][0].set_value("wrong")
    clicked(at, "دخول")
    assert any("غير صحيحة" in e.value for e in at.error)
    [t for t in at.text_input if t.label == "كلمة المرور"][0].set_value("pilot-pass")
    clicked(at, "دخول")
    assert at.session_state["is_admin"] is True
    before = env.store.count()
    [t for t in at.text_area if t.key == "addt"][0].set_value("سجل مضاف من واجهة الإدارة التجريبية")
    clicked(at, "حفظ")
    assert not at.exception and env.store.count() == before + 1


def test_admin_disabled_without_password(env, monkeypatch):
    monkeypatch.setenv("PILOT_ADMIN_PASSWORD", "")
    get_settings.cache_clear(); st.cache_resource.clear()
    at = AppTest.from_file(APP, default_timeout=60).run()
    go(at, "status")
    assert not at.exception
    assert "admin" not in [o for o in at.sidebar.radio[0].options]


def test_empty_store_does_not_crash_and_says_technical_not_no_data(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'empty.db'}")
    monkeypatch.setenv("RAW_DATASET_PATH", str(tmp_path / "none.xlsx"))
    monkeypatch.setenv("PROCESSED_DIR", str(tmp_path))
    monkeypatch.setenv("EMBEDDING_BACKEND", "hashing")
    get_settings.cache_clear(); st.cache_resource.clear()
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert not at.exception and "FileNotFoundError" in md(at)
    get_settings.cache_clear(); st.cache_resource.clear()


@pytest.mark.parametrize("key", ["", "PLACEHOLDER-NOT-A-REAL-KEY"])
def test_gemini_configured_but_missing_or_unusable_key_does_not_break_the_app(env, monkeypatch, key):
    """Existing Streamlit Secrets keep LLM_PROVIDER=gemini. With no key (or a key that cannot reach Google from this sandbox)
    the app must keep working: the topical answer falls back to the records, structured questions are unaffected."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_MODEL", "gemini-test")
    monkeypatch.setenv("LLM_API_KEY", key)
    monkeypatch.setenv("LLM_MAX_RETRIES", "0")
    monkeypatch.setenv("LLM_TIMEOUT_S", "3")
    get_settings.cache_clear(); st.cache_resource.clear()
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert not at.exception
    ask(at, "ما المشاريع عن الاستثمار في سوق الأوراق المالية؟")
    assert not at.exception and ("R1" in md(at) or "الاستثمار" in md(at))
    ask(at, "ما عنوان المشروع رقم 10؟")
    assert not at.exception and env.store.get("10").title in md(at)
