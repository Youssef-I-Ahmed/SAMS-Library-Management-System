"""System status and administration pages (ported unchanged in behaviour from the v1 pilot)."""
from __future__ import annotations

import hmac
import json
import logging
import os

import streamlit as st

from src.admin_ops import AdminError
from src.data.schema import RecordIn
from src.retrieval.embeddings import describe_embedder
from src.ui.views import Ctx


def status(c: Ctx) -> None:
    T, svc, eng, S, answers = c.T, c.svc, c.eng, c.S, c.answers
    st.markdown(f"### {T['status_header']}")
    stt = svc.indexer.status(eng)
    m = st.columns(5)
    m[0].metric(T["records_n"], f"{stt['records']:,}")
    m[1].metric(T["sup_n"], f"{stt['engine']['supervisors']:,}")
    m[2].metric(T["emb_n"], f"{stt['embeddings']:,}")
    m[3].metric(T["pending_n"], stt["engine"]["pending_embeddings"])
    m[4].metric(T["errors_n"], stt["index_errors"])
    st.markdown(f"**{T['model']}:** `{stt['active_embedding_model']}` · **{T['last_rebuild']}:** `{stt['last_full_rebuild']}` · mode: `{S.rag_mode}` · LLM: `{S.llm_provider}`")
    if S.embedding_backend == "hashing":
        st.caption("Embedding backend 'hashing' = offline lexical fallback (no semantic/cross-lingual understanding). See README for the neural model.")
    _e = describe_embedder(eng.embedder, S.embedding_backend, getattr(eng.embedder, "fallback_reason", None))
    _c = eng.calibration()
    st.markdown("**Diagnostics**")
    st.json({"requested_backend": _e["requested_backend"], "active_backend": _e["active_backend"], "model_id": _e["model_id"],
             "semantic_active": _e["semantic"], "fallback_reason": _e["fallback_reason"],
             "similarity_floor": _c["floor"], "floor_source": _c["source"], "floor_calibrated": _c["calibrated"],
             "passage_cache_hits": getattr(eng.embedder, "cache_hits", None), "passage_cache_misses": getattr(eng.embedder, "cache_misses", None),
             "llm_provider": S.llm_provider, "llm_model": (getattr(answers.provider, "model", None) or S.llm_model or "(unset)") if answers.provider is not None else (S.llm_model or "(unset)"),
             "llm_mode": "configured (verify with the LLM test below)" if answers.provider is not None else "OFF - retrieval-only",
             "llm_receives": {"titles/subjects/years": True, "supervisor_names": S.rag_include_supervisors, "student_names": S.rag_include_students},
             "students_shown_in_ui": S.expose_students})
    if _e["semantic"] and st.button("Run semantic self-test (AR→AR, EN→EN, AR→EN)"):
        from src.evaluation.probes import TOPICS
        rows = []
        for ar, en, kws in TOPICS[:4]:
            for tag, q in (("AR→AR", ar), ("EN→EN", en)):
                h = eng.search(q, "semantic", page_size=3).hits
                rows.append({"test": tag, "query": q, "top1": h[0].title if h else "(no hit above floor)", "top1_score": round(h[0].score or 0, 3) if h else None})
        for ar, en, kws in TOPICS[:4]:     # Arabic query, English-language titles expected
            h = [x for x in eng.search(ar, "semantic", page_size=10).hits if x.language == "en"][:1]
            rows.append({"test": "AR→EN doc", "query": ar, "top1": h[0].title if h else "(none)", "top1_score": round(h[0].score or 0, 3) if h else None})
        st.dataframe(rows)
    if answers.provider is not None and st.button("Test the LLM (one tiny call)"):
        try:
            _r = answers.provider.generate("Reply with the single word OK.", "ping")
            st.success(f"LLM reachable: {answers.provider.name} / {answers.provider.model}")
        except Exception as ex:  # noqa: BLE001
            st.error(f"LLM NOT working: {type(ex).__name__}: {str(ex)[:200]}")
    if S.llm_provider == "gemini" and S.llm_api_key and st.button("List Gemini models available to my key"):
        import httpx
        try:
            from src.rag.llm import _GEMINI_INTERACTIONS_MODELS
            _m = httpx.get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers={"x-goog-api-key": S.llm_api_key}, timeout=20)
            _m.raise_for_status()
            _visible = {x["name"].removeprefix("models/") for x in _m.json().get("models", [])}
            st.write(sorted(_visible & _GEMINI_INTERACTIONS_MODELS))
        except Exception as ex:  # noqa: BLE001
            st.error(f"Could not list models: {type(ex).__name__}")
    if st.button(T["verify"]):
        rep = svc.indexer.verify_consistency(eng)
        (st.success(T["ok"]) if rep["ok"] else st.error(T["problems"]))
        st.json(rep["problem_counts"])
    if stt["recent_errors"]:
        st.dataframe(stt["recent_errors"])


def admin_page(c: Ctx) -> None:
    T, svc, eng, S, admin = c.T, c.svc, c.eng, c.S, c.admin
    pw = S.pilot_admin_password
    if not pw:
        st.info(T["admin_disabled"])
    elif S.rag_mode == "integrated":
        st.info(T["admin_standalone_only"])
    else:
        if not st.session_state.get("is_admin"):
            p = st.text_input(T["password"], type="password")
            if st.button(T["login"]):
                if hmac.compare_digest(p.encode(), pw.encode()):
                    st.session_state.is_admin = True
                    st.rerun()
                else:
                    st.error(T["bad_password"])
        else:
            if st.button(T["logout"]):
                st.session_state.is_admin = False
                st.rerun()
            actor = "streamlit-pilot-admin"

            def friendly(e: Exception) -> str:
                from pydantic import ValidationError
                if isinstance(e, ValidationError):
                    return " · ".join(T.get("err_" + str(er["loc"][0]), f"{er['loc'][0]}: {er['msg']}") if er["loc"] else er["msg"]
                                      for er in e.errors())
                return str(e)

            def checked(d):
                d = dict(d)
                yt = d.pop("_year_text", "").strip()
                if yt and not yt.isdigit():
                    raise ValueError(T["invalid_year"])
                return d

            def form_fields(prefix, rec=None):
                title = st.text_area(T["title"], value=rec.title if rec else "", key=f"{prefix}t")
                sup = st.text_input(f"{T['supervisors']} ({T['multi_hint']})", value=" | ".join(s.name for s in rec.supervisors) if rec else "", key=f"{prefix}s")
                stu = st.text_input(f"{T['students']} ({T['multi_hint']})", value=" | ".join(rec.students) if rec else "", key=f"{prefix}st")
                c = st.columns(4)
                year = c[0].text_input(T["year"], value=str(rec.year or "") if rec else "", key=f"{prefix}y")
                sub = c[1].text_input(f"{T['subjects']}", value=" | ".join(rec.subjects) if rec else "", key=f"{prefix}su")
                cn = c[2].text_input(T["call_number"], value=(rec.call_number or "") if rec else "", key=f"{prefix}c")
                ext = c[3].text_input(T["extent"], value=(rec.extent_raw or "") if rec else "", key=f"{prefix}e")
                return dict(title=title, _year_text=year, supervisors=[x for x in sup.split("|")], students=[x for x in stu.split("|")],
                            year=int(year) if year.strip().isdigit() else None, subjects=[x for x in sub.split("|")],
                            call_number=cn or None, extent=ext or None)

            a1, a2 = st.columns(2)
            with a1:
                st.markdown(f"#### {T['add_record']}")
                with st.form("add"):
                    data = form_fields("add")
                    if st.form_submit_button(T["save"]):
                        try:
                            res = admin.create(RecordIn(**checked(data)), actor, "PILOT_ADMIN")
                            st.success(f"{T['created']}: #{res['record_id']}")
                            if res["possible_duplicates"]:
                                st.warning(T["dup_warn"] + ": " + ", ".join(f"#{d['record_id']}" for d in res["possible_duplicates"][:5]))
                        except (AdminError, ValueError) as e:
                            st.error(friendly(e))
            with a2:
                st.markdown(f"#### {T['edit_record']}")
                rid = st.text_input(T["record_to_edit"], key="edit_id")
                rec = eng.get_record(rid.strip()) if rid.strip() else None
                if rec:
                    with st.form("edit"):
                        data = form_fields("ed" + rec.record_id, rec)
                        if st.form_submit_button(T["save"]):
                            try:
                                admin.replace(rec.record_id, RecordIn(**checked(data)), actor, "PILOT_ADMIN")
                                st.success(T["updated"])
                            except (AdminError, ValueError) as e:
                                st.error(friendly(e))
                    if st.checkbox(T["confirm_delete"], key="cdel") and st.button(T["delete"], key="del"):
                        admin.delete(rec.record_id, actor, "PILOT_ADMIN")
                        st.success(T["deleted"])
                        st.rerun()
            st.markdown("---")
            st.markdown(f"#### {T['upload_header']}")
            st.caption(T["upload_hint"])
            up = st.file_uploader(T["upload_header"], type=["xlsx"], key="import_file", label_visibility="collapsed")
            if up is not None:
                data = up.getvalue()
                try:
                    rep = admin.import_workbook(data, up.name, actor, "PILOT_ADMIN", apply=False)
                    m = st.columns(4)
                    m[0].metric(T["import_new"], rep["new"]); m[1].metric(T["import_changed"], rep["changed"])
                    m[2].metric(T["import_same"], rep["unchanged"]); m[3].metric(T["import_rejected"], rep["rejected_count"])
                    if rep["rejected"]:
                        st.dataframe(rep["rejected"])
                    if (rep["new"] or rep["changed"]) and st.checkbox(T["confirm_import"], key="cimp") and st.button(T["apply_btn"], key="apply_import"):
                        done = admin.import_workbook(data, up.name, actor, "PILOT_ADMIN", apply=True)
                        st.success(f"{T['import_done']}: {done['new']} / {done['changed']}")
                except (AdminError, ValueError) as e:
                    st.error(str(e))
            st.markdown("---")
            b = st.columns(3)
            if b[0].button(T["reindex_pending"]):
                st.success(f"{svc.indexer.embed_pending()}")
                eng.refresh(force=True)
            if b[1].button(T["reindex_full"]):
                rep = svc.indexer.full_rebuild(svc.store.all_records())
                eng.load()
                st.success(f"{rep['records']} / {rep['seconds']}s")
            st.markdown(f"#### {T['audit']}")
            st.dataframe(svc.store.audit_entries(30))
