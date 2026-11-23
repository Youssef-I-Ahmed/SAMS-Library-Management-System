"""SADAT Smart Digital - Streamlit interface.  Run:  streamlit run app.py

Pages: Home · Smart Assistant · Project Search · Project Details · Statistics · Sources & About (+ System status, and
Administration only when PILOT_ADMIN_PASSWORD is set). Exact project-ID lookup, counts and filters are deterministic
database operations and need no LLM, no embedding model and no external API.
The production interface for the wider platform is the FastAPI service (api/main.py) called by Express.
"""
from __future__ import annotations

import hmac
import logging
import os
import threading

import streamlit as st

# ---- secrets -> environment BEFORE settings are read (Streamlit Cloud: Settings -> Secrets)
try:
    for _k, _v in dict(st.secrets).items():
        if isinstance(_v, (str, int, float, bool)) and _k.upper() not in os.environ:
            os.environ[_k.upper()] = str(_v)
except Exception:  # noqa: BLE001 - no secrets file locally
    pass

# Hosted default: real multilingual embeddings when fastembed is installed (override with EMBEDDING_BACKEND=hashing).
import importlib.util  # noqa: E402
if importlib.util.find_spec("fastembed") is not None:
    os.environ.setdefault("EMBEDDING_BACKEND", "fastembed")

from src.admin_ops import RecordAdmin  # noqa: E402
from src.config.settings import get_settings  # noqa: E402
from src.data.schema import Record  # noqa: E402
from src.rag.answer import AnswerService  # noqa: E402
from src.rag.llm import get_provider  # noqa: E402
from src.retrieval.embeddings import describe_embedder, is_neural  # noqa: E402
from src.service import build_services  # noqa: E402
from src.ui import views, views_ops  # noqa: E402
from src.ui.i18n import TEXT  # noqa: E402
from src.ui.style import CSS, EMBLEM_SVG, LTR, RTL  # noqa: E402

log = logging.getLogger("rag.app")

st.set_page_config(page_title="SADAT Smart Digital", page_icon="📚", layout="wide", initial_sidebar_state="auto")

# ------------------------------------------------------------------ language (first, so every string below follows it)
if "lang_choice" not in st.session_state:
    st.session_state["lang_choice"] = "العربية"
with st.container(key="topbar"):      # visible on every screen size (the sidebar is a drawer on phones)
    choice = st.radio("Language / اللغة", ["العربية", "English"], key="lang_choice", horizontal=True)
L = "ar" if choice == "العربية" else "en"
T = TEXT[L]
with st.sidebar:
    st.markdown(f'<div class="brand">{EMBLEM_SVG}<div><b>{TEXT["en"]["brand"]}</b><small>{T["brand_sub"]}</small></div></div>', unsafe_allow_html=True)
st.markdown(f"<style>{CSS}{RTL if L == 'ar' else LTR}</style>", unsafe_allow_html=True)

# ------------------------------------------------------------------ optional shared-password gate (private pilots)
_gate = get_settings().app_access_password
if _gate and not st.session_state.get("_authed"):
    st.markdown(f"### 🔒 {T['pw_title']}")
    _pw = st.text_input(T["pw_label"], type="password")
    if _pw and hmac.compare_digest(_pw.encode(), _gate.encode()):
        st.session_state["_authed"] = True
        st.rerun()
    elif _pw:
        st.error(T["pw_bad"])
    st.stop()


def _embed_job(svc, prog: dict) -> None:
    """Background: embed every record that lacks a fresh vector, then reload the engine. Never blocks a page load and
    never takes structured search down: on failure the app simply stays in keyword mode."""
    try:
        prog["running"] = True
        svc.indexer.embed_pending()
        svc.engine.refresh(force=True)
    except Exception as exc:  # noqa: BLE001
        prog["error"] = type(exc).__name__
        log.exception("background embedding failed (%s)", type(exc).__name__)
    finally:
        prog["running"] = False


@st.cache_resource(show_spinner=False)
def get_app_services():
    s = get_settings()
    svc = build_services(s, load=False)
    neural = is_neural(svc.embedder)
    if svc.store.count() == 0:  # first start on an empty / ephemeral filesystem -> build from prepared data or the raw file
        recs = None
        jl = s.processed_dir / "records.jsonl"
        if jl.exists():
            recs = [Record.model_validate_json(l) for l in jl.open(encoding="utf-8") if l.strip()]
        elif s.raw_dataset_path.exists():
            from src.data.loader import read_raw_rows, rows_to_records
            from src.data.supervisors import apply_display_map, canonical_display_map
            _, rows, _ = read_raw_rows(s.raw_dataset_path)
            recs, _ = rows_to_records(rows, min_year=s.min_valid_year, max_year=s.max_valid_year)
            apply_display_map(recs, canonical_display_map(recs))
        if not recs:
            raise FileNotFoundError("dataset not found: add data/raw/Project.xlsx to the PRIVATE repository (docs/STREAMLIT_CLOUD_GUIDE.md)")
        # neural model: store + index the records now, embed in the background (first page load stays fast)
        svc.indexer.full_rebuild(recs, embed=not neural)
    svc.engine.load()
    prog = {"running": False, "error": None}
    if neural and svc.engine.stats()["pending_embeddings"]:
        threading.Thread(target=_embed_job, args=(svc, prog), daemon=True, name="embed-pending").start()
    return svc, AnswerService(svc.engine, get_provider(s), s), RecordAdmin(svc), prog


try:
    svc, answers, admin, bg = get_app_services()
except Exception as exc:  # noqa: BLE001 - a technical fault must not look like "no data"
    log.exception("service start failed (%s)", type(exc).__name__)
    st.markdown(f'<div class="banner error"><b>{T["ans_state_error"]}</b><br>{T["svc_error"]}<br><code>{type(exc).__name__}: {str(exc)[:200]}</code></div>', unsafe_allow_html=True)
    st.stop()

c = views.Ctx(svc=svc, answers=answers, admin=admin, T=T, L=L, bg=bg)
S = svc.settings

# ------------------------------------------------------------------ navigation (sidebar + a compact top bar for narrow screens)
PAGES = ["home", "assistant", "search", "details", "stats", "about", "status"] + (["admin"] if S.pilot_admin_password else [])
ICON = {"home": "home", "assistant": "smart_toy", "search": "search", "details": "article", "stats": "bar_chart", "about": "info",
        "status": "monitor_heart", "admin": "admin_panel_settings"}
if st.session_state.get("page") not in PAGES:
    st.session_state["page"] = "home"
page = st.session_state["page"]
st.session_state["nav_side"] = page
st.session_state["nav_top"] = page


def _nav(key: str) -> None:
    st.session_state["page"] = st.session_state[key]


def _label(p: str) -> str:
    return f":material/{ICON[p]}: {T['nav_' + p]}"


with st.sidebar:
    st.radio(T["nav_label"], PAGES, key="nav_side", format_func=_label, on_change=_nav, args=("nav_side",))
    st.markdown(f'<div class="side-foot">{T["academy"]}<br>{T["footer"]}</div>', unsafe_allow_html=True)
with st.container(key="topnav"):
    st.radio(T["nav_label"], PAGES, key="nav_top", horizontal=True, format_func=lambda p: T["nav_" + p], on_change=_nav, args=("nav_top",))

# ------------------------------------------------------------------ dispatch
if page == "home":
    views.home(c)
elif page == "assistant":
    views.assistant(c)
elif page == "search":
    views.search(c)
elif page == "details":
    views.details(c)
elif page == "stats":
    views.stats(c)
elif page == "about":
    views.about(c)
elif page == "status":
    views_ops.status(c)
elif page == "admin":
    views_ops.admin_page(c)
