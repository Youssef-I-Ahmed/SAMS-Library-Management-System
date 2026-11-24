"""Page renderers for the Streamlit interface. Every value shown comes from the database / engine; nothing is hard-coded."""
from __future__ import annotations

import html
import logging
from dataclasses import dataclass
from typing import Any

import streamlit as st

from src.rag.answer import AnswerService, AskResponse
from src.retrieval.types import Filters
from src.stats import overview, version_key

log = logging.getLogger("rag.ui")
esc = html.escape

ICONS = {
    "folder": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    "calendar": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    "cap": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
    "users": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M17 5a3.5 3.5 0 0 1 0 6M22 20c0-2.6-1.7-4.6-4-5.5"/></svg>',
}

PALETTE = ["#0B2447", "#1c4a86", "#3f77b8", "#7ea6d6", "#C9A24B", "#E3C57B", "#8896ab", "#cdd6e4"]


@dataclass
class Ctx:
    svc: Any
    answers: AnswerService
    admin: Any
    T: dict
    L: str
    bg: dict

    @property
    def eng(self):
        return self.svc.engine

    @property
    def S(self):
        return self.svc.settings


def goto(page: str, **state) -> None:
    st.session_state.page = page
    for k, v in state.items():
        st.session_state[k] = v
    st.rerun()


def chip(text, cls="") -> str:
    return f'<span class="chip {cls}">{esc(str(text))}</span>'


def fmt_int(n) -> str:
    return f"{int(n):,}"


@st.cache_data(show_spinner=False, ttl=3600)
def _overview(_svc, vkey: str) -> dict:
    """Statistics keyed by a data-version string, so an admin edit / import / rebuild can never leave stale numbers."""
    return overview(_svc.store, _svc.engine)


def get_overview(c: Ctx) -> dict:
    return _overview(c.svc, version_key(c.svc.store))


# ============================================================================================ HOME
def home(c: Ctx) -> None:
    T = c.T
    o = get_overview(c)
    st.markdown(f"""<div class="hero"><div class="kicker">{esc(T['hero_kicker'])}</div><h1>{esc(T['hero_title'])}</h1>
<p>{esc(T['hero_text'])}</p><div class="acad">{esc(T['academy'])}</div></div>""", unsafe_allow_html=True)
    b1, b2, _ = st.columns([1, 1, 2])
    if b1.button(T["cta_ask"], key="cta_ask", type="primary"):
        goto("assistant")
    if b2.button(T["cta_search"], key="cta_search"):
        goto("search")
    cards = [("folder", fmt_int(o["total_records"]), T["st_total"])]
    if o["year_min"] is not None:
        cards.append(("calendar", f"{o['year_min']} – {o['year_max']}", T["st_years"]))
    cards.append(("cap", fmt_int(o["distinct_subjects"]), T["st_subjects"]))
    if o["distinct_students"] is not None:
        cards.append(("users", fmt_int(o["distinct_students"]), T["st_students"]))
    else:
        cards.append(("users", fmt_int(o["distinct_supervisors"]), T["st_supervisors"]))
    st.markdown('<div class="stats">' + "".join(
        f'<div class="stat"><div class="ic">{ICONS[i]}</div><div class="n">{esc(n)}</div><div class="l">{esc(l)}</div></div>' for i, n, l in cards)
        + '</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="note">{esc(T["st_note"])}</div>', unsafe_allow_html=True)
    f1, f2 = st.columns(2)
    with f1:
        st.markdown(f'<div class="card feature"><h3>{esc(T["card_assistant_t"])}</h3><p>{esc(T["card_assistant_d"])}</p></div>', unsafe_allow_html=True)
        if st.button(T["cta_ask"], key="home_ask"):
            goto("assistant")
    with f2:
        st.markdown(f'<div class="card feature"><h3>{esc(T["card_search_t"])}</h3><p>{esc(T["card_search_d"])}</p></div>', unsafe_allow_html=True)
        if st.button(T["cta_search"], key="home_search"):
            goto("search")


# ============================================================================================ shared record card
def record_card(c: Ctx, rid: str, key: str, *, reason: str | None = None) -> None:
    T = c.T
    rec = c.svc.store.get(rid) or c.eng.get_record(rid)
    if rec is None:
        return
    sup = " · ".join(c.eng.sup_display(s.key) for s in rec.supervisors) or T["empty_val"]
    chips = (chip(rec.year, "gold") if rec.year else chip(T["empty_val"], "warn")) + "".join(chip(s, "navy") for s in rec.subjects)
    st.markdown(f"""<div class="card"><div class="t">{esc(rec.title)}</div>
<div class="meta"><bdi>#{esc(rec.record_id)}</bdi> · {esc(T['supervisors'])}: <bdi>{esc(sup)}</bdi></div>
{f'<div class="meta">{esc(reason)}</div>' if reason else ''}<div>{chips}</div></div>""", unsafe_allow_html=True)
    if st.button(T["f_view"], key=key):
        goto("details", detail_id=rid)


# ============================================================================================ ASSISTANT
def render_answer(c: Ctx, r: AskResponse, turn: int) -> None:
    T = c.T
    if r.status == "error":
        st.markdown(f'<div class="banner error"><b>{esc(T["ans_state_error"])}</b><br>{esc(r.answer or "")}</div>', unsafe_allow_html=True)
        return
    if r.status == "abstained":
        label, cls = {"record_not_found": (T["ans_state_nomatch"], "warn"), "no_results": (T["ans_state_nomatch"], "warn"),
                      "content_not_available": (T["ans_state_unavailable"], "warn"), "empty_question": (T["ans_state_empty"], "warn")
                      }.get(r.abstain_reason or "", (T["ans_state_insufficient"], "warn"))
    else:
        label, cls = T["ans_state_ok"], "ok"
    st.markdown(f'<div class="answer"><span class="st {cls}">{esc(label)}</span><br>{esc(r.answer or "")}</div>', unsafe_allow_html=True)
    for w in r.warnings:
        st.markdown(f'<div class="banner warn">{esc(w)}</div>', unsafe_allow_html=True)
    shown = r.sources
    unconfirmed = False
    if not shown and r.retrieved:
        shown = r.retrieved
        unconfirmed = r.abstain_reason not in ("content_not_available",)
    if shown:
        st.markdown(f'<div class="src-label">{esc(T["ans_retrieved"] if unconfirmed else T["ans_sources"])}</div>', unsafe_allow_html=True)
        for s in shown[:10]:
            record_card(c, s.record_id, f"src_{turn}_{s.record_id}", reason=s.support_reason if not unconfirmed else None)
    with st.expander(T["ans_how"]):
        st.json({"status": r.status, "abstain_reason": r.abstain_reason, "strategy": r.strategy, "facts": r.facts,
                 "generated_by": r.generated_by, "total_matching": r.total_matching})


def assistant(c: Ctx) -> None:
    T = c.T
    st.markdown(f'<h2 class="page-title">{esc(T["assistant_title"])}</h2><p class="page-sub">{esc(T["assistant_sub"])}</p>', unsafe_allow_html=True)
    chat = st.session_state.setdefault("chat", [])

    def run(q: str) -> None:
        with st.spinner(T["thinking"]):
            st.session_state.chat.append({"q": q, "r": c.answers.ask_safe(q)})
        st.session_state.chat = st.session_state.chat[-12:]

    st.markdown(f'<div class="src-label">{esc(T["assistant_examples"])}</div>', unsafe_allow_html=True)
    ex = [T[f"ex{i}"] for i in range(1, 6)]
    cols = st.columns(len(ex) if len(ex) <= 3 else 3)
    for i, q in enumerate(ex):
        if cols[i % len(cols)].button(q, key=f"ex_{i}"):
            run(q)
            st.rerun()
    if not chat:
        st.markdown(f'<div class="banner info">{esc(T["assistant_empty"])}</div>', unsafe_allow_html=True)
    for n, turn in enumerate(chat):
        st.markdown(f'<div class="bubble-user">{esc(turn["q"])}</div>', unsafe_allow_html=True)
        render_answer(c, turn["r"], n)
    with st.form("ask_form", clear_on_submit=True):
        q = st.text_input(T["assistant_ph"], placeholder=T["assistant_ph"], label_visibility="collapsed", max_chars=c.S.ask_max_question_chars)
        a, b = st.columns([4, 1])
        sent = b.form_submit_button(T["assistant_send"], type="primary")
    if sent:
        run(q)
        st.rerun()
    if chat and st.button(T["assistant_clear"], key="chat_clear"):
        st.session_state.chat = []
        st.rerun()


# ============================================================================================ SEARCH
def _rows_header(T, show_students: bool) -> str:
    cols = [T["col_no"], T["col_title"]] + ([T["col_student"]] if show_students else []) + [T["col_sup"], T["col_year"], T["col_subject"], ""]
    return '<div class="rowh" style="grid-template-columns:' + (".7fr 4fr 2fr 2fr .8fr 1.6fr 1.1fr" if show_students else ".7fr 4.5fr 2.2fr .8fr 1.8fr 1.1fr") + '">' + "".join(f"<div>{esc(x)}</div>" for x in cols) + "</div>"


def _result_rows(c: Ctx, rids: list[str], ns: str) -> None:
    T, eng = c.T, c.eng
    show_st = c.S.expose_students
    ratios = [.7, 4, 2, 2, .8, 1.6, 1.1] if show_st else [.7, 4.5, 2.2, .8, 1.8, 1.1]
    st.markdown(_rows_header(T, show_st), unsafe_allow_html=True)
    for rid in rids:
        rec = c.svc.store.get(rid) or eng.get_record(rid)
        if rec is None:
            continue
        with st.container(key=f"row_{ns}_{rid}"):
            cols = st.columns(ratios)
            i = 0
            cells = [f'<span class="mlabel">{esc(T["col_no"])} </span><bdi>{esc(rec.record_id)}</bdi>',
                     f'<b>{esc(rec.title)}</b>']
            if show_st:
                cells.append(f'<span class="mlabel">{esc(T["col_student"])}: </span><bdi>{esc(" · ".join(rec.students) or T["empty_val"])}</bdi>')
            cells.append(f'<span class="mlabel">{esc(T["col_sup"])}: </span><bdi>{esc(" · ".join(eng.sup_display(s.key) for s in rec.supervisors) or T["empty_val"])}</bdi>')
            cells.append(f'<span class="mlabel">{esc(T["col_year"])}: </span><bdi>{esc(str(rec.year) if rec.year else T["empty_val"])}</bdi>')
            cells.append(f'<span class="mlabel">{esc(T["col_subject"])}: </span>{esc(" · ".join(rec.subjects) or T["empty_val"])}')
            for cell in cells:
                cols[i].markdown(cell, unsafe_allow_html=True)
                i += 1
            if cols[i].button(T["f_view"], key=f"v_{ns}_{rid}"):
                goto("details", detail_id=rid)
    st.markdown('<div class="rowend"></div>', unsafe_allow_html=True)


def search(c: Ctx) -> None:
    T, eng = c.T, c.eng
    st.markdown(f'<h2 class="page-title">{esc(T["search_title"])}</h2><p class="page-sub">{esc(T["search_sub"])}</p>', unsafe_allow_html=True)
    years = [y["year"] for y in eng.list_years()]
    subjects = [x["name"] for x in eng.list_subjects()]
    any_ = T["f_all"]
    with st.form("search_form"):
        r1a, r1b = st.columns([1, 3])
        number = r1a.text_input(T["f_number"], key="f_number")
        text = r1b.text_input(T["f_text"], key="f_text")
        r2 = st.columns(4 if c.S.expose_students else 3)
        sup = r2[0].text_input(T["f_supervisor"], key="f_sup")
        stu = r2[1].text_input(T["f_student"], key="f_stu") if c.S.expose_students else ""
        subj = r2[-2].selectbox(T["f_subject"], [any_] + subjects, key="f_subj")
        mode = r2[-1].selectbox(T["f_search_in"], ["title", "topic"], format_func=lambda m: T["f_mode_title"] if m == "title" else T["f_mode_topic"], key="f_mode")
        r3 = st.columns([1, 1, 1, 1])
        yf = r3[0].selectbox(T["f_year_from"], [any_] + years, key="f_yf")
        yt = r3[1].selectbox(T["f_year_to"], [any_] + years, key="f_yt")
        size = r3[2].selectbox(T["f_size"], [10, 20, 50, 100], index=1, key="f_size")
        go = r3[3].form_submit_button(T["f_go"], type="primary")
    if go:
        st.session_state.s_page = 1
        st.session_state.s_active = True
    if not st.session_state.get("s_active"):
        st.markdown(f'<div class="banner info">{esc(T["f_empty"])}</div>', unsafe_allow_html=True)
        return
    page = st.session_state.get("s_page", 1)
    number = (number or "").strip()
    text = (text or "").strip()
    # ---- exact project number: database lookup by primary key, never similarity
    if number:
        from src.data.normalize_ar import to_western_digits
        n = to_western_digits(number).strip().lstrip("#")
        if not n.isdigit():
            st.markdown(f'<div class="banner warn">{esc(T["f_id_bad"])}</div>', unsafe_allow_html=True)
            return
        rec = c.svc.store.get(n)
        st.markdown(f'<div class="banner info">{esc(T["f_id_note"])}</div>', unsafe_allow_html=True)
        if rec is None:
            st.markdown(f'<div class="banner warn">{esc(T["det_notfound"])}</div>', unsafe_allow_html=True)
            return
        st.markdown(f"**1** {T['f_total']}")
        _result_rows(c, [rec.record_id], "id")
        return
    lo = None if yf == any_ else int(yf)
    hi = None if yt == any_ else int(yt)
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
    f = Filters(year_from=lo, year_to=hi, subject=None if subj == any_ else subj, supervisor=(sup or "").strip() or None,
                student=(stu or "").strip() or None)
    if not text and f.is_empty():
        st.markdown(f'<div class="banner info">{esc(T["f_empty"])}</div>', unsafe_allow_html=True)
        return
    try:
        with st.spinner(T["searching"]):
            res = eng.search(text, ("title" if mode == "title" else "hybrid") if text else "auto", f,
                             "relevance" if text else "year_desc", page, size)
    except Exception:  # noqa: BLE001 - technical failure: reported as such, never as "no results"
        log.exception("search failed")
        st.markdown(f'<div class="banner error">{esc(T["f_error"])}</div>', unsafe_allow_html=True)
        return
    st.markdown(f"**{res.total:,}** {T['f_total']} · {T['f_page']} {res.page}/{res.total_pages}")
    if res.total:
        st.markdown(f'<div class="banner {"ok" if res.exhaustive else "info"}">{esc(T["f_complete"] if res.exhaustive else T["f_ranked"])}</div>', unsafe_allow_html=True)
    elif "query_too_short" in res.strategy:
        st.markdown(f'<div class="banner warn">{esc(T["too_short"])}</div>', unsafe_allow_html=True)
    else:
        st.markdown(f'<div class="banner warn">{esc(T["f_none"])}</div>', unsafe_allow_html=True)
    for n in res.notes:
        if n.startswith("Supervisor filter") or n.startswith("Student filter"):
            st.caption(n)
    _result_rows(c, [h.record_id for h in res.hits], "s")
    p1, p2, _ = st.columns([1, 1, 4])
    if p1.button(T["prev"], disabled=res.page <= 1, key="pg_prev"):
        st.session_state.s_page = page - 1
        st.rerun()
    if p2.button(T["next"], disabled=res.page >= res.total_pages, key="pg_next"):
        st.session_state.s_page = page + 1
        st.rerun()


# ============================================================================================ DETAILS
def details(c: Ctx) -> None:
    T, eng = c.T, c.eng
    st.markdown(f'<h2 class="page-title">{esc(T["det_title"])}</h2>', unsafe_allow_html=True)
    rid = st.session_state.get("detail_id")
    b1, b2 = st.columns([1, 3])
    if st.session_state.get("s_active") and b1.button(T["det_back"], key="det_back"):
        goto("search")
    with st.form("lookup_form"):
        a, b = st.columns([3, 1])
        num = a.text_input(T["det_lookup"], key="det_num")
        opened = b.form_submit_button(T["det_open"], type="primary")
    if opened and num.strip():
        from src.data.normalize_ar import to_western_digits
        n = to_western_digits(num).strip().lstrip("#")
        st.session_state.detail_id = n
        rid = n
    if not rid:
        st.markdown(f'<div class="banner info">{esc(T["det_none"])}</div>', unsafe_allow_html=True)
        return
    rec = c.svc.store.get(str(rid)) if str(rid).isdigit() or str(rid) else None
    if rec is None:
        st.markdown(f'<div class="banner warn">{esc(T["det_notfound"])}</div>', unsafe_allow_html=True)
        return
    nr = T["empty_val"]
    year = str(rec.year) if rec.year is not None else (f"{nr} ({rec.year_raw})" if rec.year_raw else nr)
    rows = [(T["record_id"], rec.record_id), (T["title"], rec.title),
            (T["year"], year), (T["supervisors"], " | ".join(eng.sup_display(s.key) for s in rec.supervisors) or nr),
            (T["subjects"], " | ".join(rec.subjects) or nr), (T["call_number"], rec.call_number or nr),
            (T["extent"], rec.extent_raw or nr), (T["dimension"], rec.dimension_raw or nr)]
    if c.S.expose_students:
        rows.insert(4, (T["students"], " | ".join(rec.students) or nr))
    kv = "".join(f'<div class="k">{esc(k)}</div><div><bdi>{esc(str(v))}</bdi></div>' for k, v in rows)
    st.markdown(f'<div class="card"><div class="src-label" style="margin-top:0">{esc(T["det_avail"])}</div><div class="kv">{kv}</div></div>', unsafe_allow_html=True)
    st.markdown(f'<div class="banner info">{esc(T["det_not_in_dataset"])}<br>{esc(T["det_note_empty"])}</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="card"><div class="src-label" style="margin-top:0">{esc(T["det_source"])}</div>'
                f'{esc(T["det_source_text"].format(id=rec.record_id))}</div>', unsafe_allow_html=True)
    if rec.flags:
        st.markdown(f"**{T['flags']}:** " + " ".join(chip(f, "warn") for f in rec.flags), unsafe_allow_html=True)
    d = eng.possible_duplicates(rec.title, exclude_id=rec.record_id)
    if d:
        st.markdown(f"**{T['dups']}:**")
        for x in d[:8]:
            st.markdown(f"- `{x['record_id']}` — {x['title']} ({x['similarity']}%)")


# ============================================================================================ STATISTICS
def stats(c: Ctx) -> None:
    import altair as alt
    import pandas as pd
    T = c.T
    o = get_overview(c)
    st.markdown(f'<h2 class="page-title">{esc(T["stats_title"])}</h2><p class="page-sub">{esc(T["stats_sub"])}</p>', unsafe_allow_html=True)
    cards = [("folder", fmt_int(o["total_records"]), T["st_total"])]
    if o["year_min"] is not None:
        cards.append(("calendar", f"{o['year_min']} – {o['year_max']}", T["st_years"]))
    cards.append(("cap", fmt_int(o["distinct_subjects"]), T["st_subjects"]))
    cards.append(("users", fmt_int(o["distinct_students"] if o["distinct_students"] is not None else o["distinct_supervisors"]),
                  T["st_students"] if o["distinct_students"] is not None else T["st_supervisors"]))
    st.markdown('<div class="stats">' + "".join(
        f'<div class="stat"><div class="ic">{ICONS[i]}</div><div class="n">{esc(n)}</div><div class="l">{esc(l)}</div></div>' for i, n, l in cards)
        + '</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="note">{esc(T["st_note"])}</div>', unsafe_allow_html=True)

    st.markdown(f'<div class="card"><div class="src-label" style="margin-top:0">{esc(T["ch_year"])}</div></div>', unsafe_allow_html=True)
    py = pd.DataFrame(o["per_year"]).rename(columns={"year": "Y", "count": "N"})
    if not py.empty:
        py["Y"] = py["Y"].astype(str)
        ch = alt.Chart(py).mark_bar(color="#1c4a86", cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
            x=alt.X("Y:O", title=T["ch_year_axis"], axis=alt.Axis(labelAngle=-45)), y=alt.Y("N:Q", title=T["ch_count_axis"]),
            tooltip=[alt.Tooltip("Y:O", title=T["ch_year_axis"]), alt.Tooltip("N:Q", title=T["ch_count_axis"])]).properties(height=300)
        st.altair_chart(ch)
    if o["records_without_valid_year"]:
        st.caption(f'{o["records_without_valid_year"]} {T["ch_no_year"]}')

    d1, d2 = st.columns(2)
    with d1:
        st.markdown(f'<div class="src-label">{esc(T["ch_subject"])}</div>', unsafe_allow_html=True)
        sub = [{"S": s["name"], "N": s["count"]} for s in o["subjects"]]
        if o["subjects_other_count"]:
            sub.append({"S": T["ch_other"], "N": o["subjects_other_count"]})
        sdf = pd.DataFrame(sub)
        if not sdf.empty:
            donut = alt.Chart(sdf).mark_arc(innerRadius=62, stroke="#fff").encode(
                theta=alt.Theta("N:Q"), color=alt.Color("S:N", scale=alt.Scale(range=PALETTE + ["#aab6c8"] * 8), legend=alt.Legend(title=None, orient="bottom", columns=2)),
                tooltip=[alt.Tooltip("S:N", title=T["subjects"]), alt.Tooltip("N:Q", title=T["ch_count_axis"])]).properties(height=340)
            st.altair_chart(donut)
        if o["records_without_subject"]:
            st.caption(f'{o["records_without_subject"]} {T["ch_no_subject"]}')
    with d2:
        st.markdown(f'<div class="src-label">{esc(T["ch_sup"])}</div>', unsafe_allow_html=True)
        sdf2 = pd.DataFrame([{"S": s["name"], "N": s["count"]} for s in o["top_supervisors"]])
        if not sdf2.empty:
            bar = alt.Chart(sdf2).mark_bar(color="#C9A24B", cornerRadiusEnd=3).encode(
                y=alt.Y("S:N", sort="-x", title=None, axis=alt.Axis(labelLimit=220)), x=alt.X("N:Q", title=T["ch_count_axis"]),
                tooltip=[alt.Tooltip("S:N", title=T["supervisors"]), alt.Tooltip("N:Q", title=T["ch_count_axis"])]).properties(height=340)
            st.altair_chart(bar)
    with st.expander(T["ch_year"] + " — table"):
        st.dataframe(py.rename(columns={"Y": T["ch_year_axis"], "N": T["ch_count_axis"]}) if not py.empty else py, hide_index=True)


# ============================================================================================ ABOUT
def about(c: Ctx) -> None:
    from src.retrieval.embeddings import describe_embedder
    T = c.T
    st.markdown(f'<h2 class="page-title">{esc(T["about_title"])}</h2><p class="page-sub">{esc(T["about_sub"])}</p>', unsafe_allow_html=True)

    def block(title, body):
        st.markdown(f'<div class="card"><div class="src-label" style="margin-top:0">{esc(title)}</div>{body}</div>', unsafe_allow_html=True)

    lis = lambda items: "<ul>" + "".join(f"<li>{esc(i).replace('**', '')}</li>" for i in items) + "</ul>"  # noqa: E731
    block(T["about_how_t"], lis(T["about_how"]))
    block(T["about_data_t"], f"<p>{esc(T['about_data'])}</p>")
    block(T["about_read_t"], lis(T["about_read"]))
    e = describe_embedder(c.eng.embedder, c.S.embedding_backend, getattr(c.eng.embedder, "fallback_reason", None))
    st_ = c.eng.stats()
    total, done = st_["records"], st_["dense_vectors"]
    if e["semantic"] and done >= 0.99 * total:
        mode = T["about_mode_sem"]
    elif e["semantic"]:
        mode = T["about_mode_build"].format(done=done, total=total)
    else:
        mode = T["about_mode_lex"]
    block(T["about_mode_t"], f"<p>{esc(mode)}</p>")
    block(T["about_privacy_t"], f"<p>{esc(T['about_privacy'])}</p>")
