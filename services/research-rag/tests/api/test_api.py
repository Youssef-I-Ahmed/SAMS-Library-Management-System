import time

import jwt
import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from tests.conftest import SECRET, FakeLLM, token
from src.rag.answer import AnswerService


def err(r, status, code):
    assert r.status_code == status, r.text
    e = r.json()["error"]
    assert e["code"] == code and e["message"] and e["request_id"]
    return e


# ------------------------------------------------------------------ open endpoints
def test_health_and_ready(client):
    assert client.get("/health").json()["status"] == "ok"
    r = client.get("/ready")
    assert r.status_code == 200 and r.json()["checks"]["database"] and r.json()["checks"]["embeddings_complete"]
    assert r.json()["checks"]["llm_configured"] is False


def test_ready_503_when_index_empty(tmp_path):
    from tests.conftest import make_settings
    from src.service import build_services
    from src.retrieval.embeddings import HashingEmbedder
    s = build_services(make_settings(tmp_path), embedder=HashingEmbedder(256))
    with TestClient(create_app(services=s)) as c:
        assert c.get("/ready").status_code == 503 and c.get("/ready").json()["status"] == "not_ready"
        assert c.get("/health").status_code == 200


def test_openapi_and_docs_available(client):
    spec = client.get("/openapi.json").json()
    for path in ("/health", "/ready", "/search", "/ask", "/records/{record_id}", "/supervisors/records",
                 "/admin/records", "/admin/records/{record_id}", "/admin/index/status", "/admin/index/reindex"):
        assert path in spec["paths"], path
    assert client.get("/docs").status_code == 200


# ------------------------------------------------------------------ authentication
def test_missing_or_bad_token_is_401(client):
    err(client.get("/search", params={"q": "x"}), 401, "unauthorized")
    err(client.get("/search", params={"q": "x"}, headers={"Authorization": "Bearer garbage"}), 401, "unauthorized")
    err(client.get("/search", headers={"Authorization": "Basic abc"}), 401, "unauthorized")


def test_wrong_secret_audience_issuer_and_expiry_rejected(client):
    s = client.settings
    n = int(time.time())
    base = {"iss": s.service_jwt_issuer, "aud": s.service_jwt_audience, "sub": "u", "scope": "rag:read", "iat": n, "exp": n + 60}

    def h(secret=SECRET, **o):
        return {"Authorization": "Bearer " + jwt.encode({**base, **o}, secret, algorithm="HS256")}
    err(client.get("/search", headers=h(secret="y" * 48)), 401, "unauthorized")
    err(client.get("/search", headers=h(aud="other")), 401, "unauthorized")
    err(client.get("/search", headers=h(iss="evil")), 401, "unauthorized")
    err(client.get("/search", headers=h(exp=n - 100, iat=n - 200)), 401, "token_expired")
    err(client.get("/search", headers=h(exp=n + 100000)), 401, "unauthorized")        # lifetime too long
    err(client.get("/search", headers={"Authorization": "Bearer " + jwt.encode({**base, "sub": None}, SECRET, algorithm="HS256")}), 401, "unauthorized")
    assert client.get("/search", headers=h()).status_code == 200


def test_alg_none_token_rejected(client):
    n = int(time.time())
    t = jwt.encode({"iss": client.settings.service_jwt_issuer, "aud": client.settings.service_jwt_audience, "sub": "u",
                    "scope": "rag:read", "iat": n, "exp": n + 60}, None, algorithm="none")
    err(client.get("/search", headers={"Authorization": f"Bearer {t}"}), 401, "unauthorized")


def test_scope_required_for_read(client):
    err(client.get("/search", headers=token(client.settings, scope="other:thing")), 403, "forbidden")


# ------------------------------------------------------------------ authorization (RBAC) on admin
ADMIN_CALLS = [("post", "/admin/records", {"json": {"title": "x"}}), ("put", "/admin/records/1", {"json": {"title": "x"}}),
               ("patch", "/admin/records/1", {"json": {"year": 2000}}), ("delete", "/admin/records/1", {}),
               ("get", "/admin/index/status", {}), ("post", "/admin/index/verify", {}), ("post", "/admin/index/reindex", {}),
               ("get", "/admin/audit", {}), ("post", "/admin/sync", {}), ("post", "/admin/sync/records/1", {})]


@pytest.mark.parametrize("method,path,kw", ADMIN_CALLS)
def test_admin_endpoints_reject_anonymous_read_scope_and_wrong_role(client, method, path, kw):
    f = getattr(client, method)
    err(f(path, **kw), 401, "unauthorized")
    err(f(path, headers=token(client.settings), **kw), 403, "forbidden")                                   # read scope only
    err(f(path, headers=token(client.settings, "rag:read rag:admin", "VIEWER"), **kw), 403, "forbidden")    # scope ok, role not
    err(f(path, headers=token(client.settings, "rag:read rag:admin"), **kw), 403, "forbidden")             # no role claim
    assert client.get("/records/1", headers=token(client.settings)).json()["title"]                          # nothing was modified


def test_admin_locked_when_secret_not_configured_even_with_auth_disabled(svc):
    svc.settings.service_jwt_secret = ""
    svc.settings.auth_disabled = True
    with TestClient(create_app(services=svc)) as c:
        assert c.get("/search", params={"q": "x"}).status_code == 200            # dev read access
        err(c.post("/admin/records", json={"title": "x"}), 503, "auth_not_configured")
        err(c.delete("/admin/records/1"), 503, "auth_not_configured")


def test_placeholder_secret_never_enables_admin(svc):
    svc.settings.service_jwt_secret = "change-me"
    with TestClient(create_app(services=svc)) as c:
        h = token(svc.settings, "rag:read rag:admin", "ADMIN")
        err(c.post("/admin/records", json={"title": "x"}, headers=h), 503, "auth_not_configured")


# ------------------------------------------------------------------ validation & errors
def test_search_validation_errors(client, read_h):
    for params in ({"mode": "nope"}, {"page": 0}, {"page_size": 0}, {"year": 12}, {"sort": "random"}, {"language": "fr"},
                   {"q": "x" * 501}):
        e = err(client.get("/search", params=params, headers=read_h), 422, "validation_error")
        assert e["details"]
    err(client.get("/search", params={"page_size": 101}, headers=read_h), 422, "validation_error")
    err(client.get("/search", params={"year_from": 2020, "year_to": 2010}, headers=read_h), 422, "validation_error")


def test_not_found_shapes(client, read_h):
    err(client.get("/records/nope", headers=read_h), 404, "record_not_found")
    err(client.get("/nonexistent"), 404, "not_found")
    err(client.get("/supervisors/records", params={"key": "nobody"}, headers=read_h), 404, "supervisor_not_found")
    err(client.get("/supervisors/records", headers=read_h), 422, "validation_error")
    err(client.get("/supervisors/records", params={"key": "a", "name": "b"}, headers=read_h), 422, "validation_error")
    err(client.post("/health"), 405, "method_not_allowed")


def test_ask_validation(client, read_h):
    err(client.post("/ask", json={}, headers=read_h), 422, "validation_error")
    err(client.post("/ask", json={"question": "x"}, headers=read_h), 422, "validation_error")
    err(client.post("/ask", json={"question": "a" * 1001}, headers=read_h), 422, "validation_error")
    err(client.post("/ask", content=b"not json", headers={**read_h, "content-type": "application/json"}), 422, "validation_error")


# ------------------------------------------------------------------ read endpoints
def test_search_response_contract_and_pagination_metadata(client, read_h):
    r = client.get("/search", params={"q": "Internet Security", "mode": "title"}, headers=read_h).json()
    assert r["total"] == 1 and r["exhaustive"] is True and r["strategy"] == ["structured_title"]
    assert r["hits"][0]["match_type"] == "exact" and r["hits"][0]["record_id"] == "10"
    assert {"page", "page_size", "total_pages", "sort", "notes", "normalized_query"} <= set(r)
    h = client.get("/search", params={"q": "social media", "mode": "hybrid"}, headers=read_h).json()
    assert h["exhaustive"] is False and any("not a complete list" in n for n in h["notes"])


def test_supervisor_records_endpoint_returns_everything_paginated(client, read_h, records):
    seen, page = set(), 1
    while True:
        r = client.get("/supervisors/records", params={"name": "د/ كريم فؤاد", "page": page, "page_size": 40}, headers=read_h).json()
        assert r["total"] == 130 and r["exhaustive"] and r["supervisor_resolution"]["status"] == "exact"
        seen |= {h["record_id"] for h in r["hits"]}
        if page >= r["total_pages"]:
            break
        page += 1
    assert len(seen) == 130 and page == 4
    r = client.get("/supervisors/records", params={"name": "ليلى"}, headers=read_h).json()
    assert r["total"] == 0                                    # partial names are NOT returned unless include_partial
    r = client.get("/supervisors/records", params={"name": "ليلى", "include_partial": True}, headers=read_h).json()
    assert r["total"] == 4 and r["supervisor_resolution"]["status"] == "ambiguous_partial"


def test_supervisor_list_facets_and_record_detail(client, read_h):
    s = client.get("/supervisors", params={"q": "كريم"}, headers=read_h).json()
    assert s["total"] == 1 and s["items"][0]["record_count"] == 130
    assert {x["name"] for x in client.get("/facets/subjects", headers=read_h).json()} >= {"بنوك"}
    assert client.get("/facets/years", headers=read_h).json()[0]["year"] == 2000
    d = client.get("/records/17", headers=read_h).json()
    assert d["record_id"] == "17" and d["possible_duplicates"][0]["record_id"] == "18" and d["supervisors"][0]["key"]
    assert client.get("/records/ب19", headers=read_h).status_code == 200                     # non-ascii id in path


def test_ask_endpoint_end_to_end_without_llm(client, read_h):
    r = client.post("/ask", json={"question": "كم مشروع أشرف عليه سامي منصور؟"}, headers=read_h).json()
    assert r["status"] == "answered_from_catalog" and r["total_matching"] == 6
    r = client.post("/ask", json={"question": "ما نتائج دراسة «Internet Security»؟"}, headers=read_h).json()
    assert r["status"] == "abstained" and r["abstain_reason"] == "content_not_available" and r["sources"] == []
    r = client.post("/ask", json={"question": "quantum chemistry of dark matter"}, headers=read_h).json()
    assert r["abstain_reason"] == "no_results"


def test_ask_with_llm_error_still_returns_200_with_sources(client, read_h):
    client.app.state.answers = AnswerService(client.svc.engine, FakeLLM(error="timeout"), client.settings)
    r = client.post("/ask", json={"question": "ما المشاريع التي تتناول التسويق الرقمى فى البنوك والجامعات؟"}, headers=read_h)
    assert r.status_code == 200 and r.json()["status"] == "llm_error" and r.json()["sources"] and r.json()["llm"]["error_kind"] == "timeout"


# ------------------------------------------------------------------ admin flows over HTTP
def test_admin_crud_roundtrip_with_audit_and_search_visibility(client, admin_h, read_h):
    c = client.post("/admin/records", json={"title": "دراسة تجريبية حول التحول الرقمي في القطاع المصرفي", "supervisors": ["د/ سامي منصور"],
                                            "year": 2025, "subjects": ["بنوك"]}, headers=admin_h)
    assert c.status_code == 201, c.text
    rid = c.json()["record_id"]
    assert c.json()["operation"] == "created" and c.json()["embedding"] == "indexed"
    assert client.get("/search", params={"q": "التحول الرقمي المصرفي", "mode": "title"}, headers=read_h).json()["total"] == 1
    u = client.patch(f"/admin/records/{rid}", json={"year": 2026}, headers=admin_h)
    assert u.status_code == 200 and u.json()["operation"] == "updated" and u.json()["record"]["year"] == 2026
    p = client.put(f"/admin/records/{rid}", json={"title": "عنوان جديد تماما عن الحوكمة", "year": 2026}, headers=admin_h)
    assert p.status_code == 200 and client.get(f"/records/{rid}", headers=read_h).json()["title"].startswith("عنوان جديد")
    assert client.get("/search", params={"q": "الحوكمة", "mode": "keyword"}, headers=read_h).json()["hits"][0]["record_id"] == rid
    d = client.delete(f"/admin/records/{rid}", headers=admin_h)
    assert d.status_code == 200 and d.json() == {"record_id": rid, "deleted": True}
    err(client.get(f"/records/{rid}", headers=read_h), 404, "record_not_found")
    audit = client.get("/admin/audit", params={"record_id": rid}, headers=admin_h).json()
    assert [a["action"] for a in audit] == ["delete", "update", "update", "create"] and audit[0]["actor"] == "user-1" and audit[0]["role"] == "ADMIN"
    assert client.post("/admin/index/verify", headers=admin_h).json()["ok"]


def test_admin_error_responses(client, admin_h):
    err(client.post("/admin/records", json={"record_id": "1", "title": "dup id"}, headers=admin_h), 409, "conflict")
    err(client.post("/admin/records", json={"title": "x", "year": 3014}, headers=admin_h), 422, "validation_error")
    err(client.post("/admin/records", json={"title": ""}, headers=admin_h), 422, "validation_error")
    err(client.post("/admin/records", json={"title": "x", "record_id": "bad id"}, headers=admin_h), 422, "validation_error")
    err(client.put("/admin/records/zzz", json={"title": "x"}, headers=admin_h), 404, "record_not_found")
    err(client.patch("/admin/records/zzz", json={"year": 2000}, headers=admin_h), 404, "record_not_found")
    err(client.delete("/admin/records/zzz", headers=admin_h), 404, "record_not_found")
    err(client.put("/admin/records/1", json={"record_id": "2", "title": "x"}, headers=admin_h), 422, "validation_error")
    err(client.post("/admin/sync", headers=admin_h), 409, "not_integrated_mode")
    dup = client.post("/admin/records", params={"reject_duplicates": True}, json={"title": "الاندماج المصرفى"}, headers=admin_h)
    err(dup, 409, "conflict")


def test_admin_blocked_in_integrated_mode(svc):
    svc.settings.rag_mode = "integrated"
    with TestClient(create_app(services=svc)) as c:
        h = token(svc.settings, "rag:read rag:admin", "ADMIN")
        err(c.post("/admin/records", json={"title": "x"}, headers=h), 409, "records_managed_externally")


def test_index_status_and_reindex(client, admin_h):
    st = client.get("/admin/index/status", headers=admin_h).json()
    assert st["records"] == st["embeddings"] and st["engine"]["pending_embeddings"] == 0 and "last_full_rebuild" in st
    assert client.post("/admin/index/reindex", params={"scope": "pending"}, headers=admin_h).json()["embedded"] == 0
    full = client.post("/admin/index/reindex", params={"scope": "full"}, headers=admin_h).json()
    assert full["unchanged"] == st["records"] and full["embedded"] == st["records"]
    err(client.post("/admin/index/reindex", params={"scope": "bogus"}, headers=admin_h), 422, "validation_error")


def test_logs_do_not_contain_tokens_or_query_text(client, read_h, caplog):
    import logging
    caplog.set_level(logging.INFO)
    client.get("/search", params={"q": "سر-استعلام-خاص"}, headers=read_h)
    text = caplog.text
    assert read_h["Authorization"][7:] not in text and "سر-استعلام-خاص" not in text.split("httpx")[0]


def test_no_cors_by_default(client, read_h):
    r = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_every_openapi_path_is_documented_in_integration_guide(client):
    """Contract guard: docs/INTEGRATION.md must mention every route the service actually exposes."""
    from pathlib import Path
    doc = (Path(__file__).resolve().parents[2] / "docs" / "INTEGRATION.md").read_text(encoding="utf-8")
    paths = client.get("/openapi.json").json()["paths"]
    missing = [p for p in paths if p.replace("{record_id}", "{id}") not in doc and p not in doc]
    assert not missing, f"undocumented routes: {missing}"
    # response contract fields used in the docs exist in the schema
    props = client.get("/openapi.json").json()["components"]["schemas"]["SearchResponse"]["properties"]
    for f in ("total", "page", "page_size", "total_pages", "exhaustive", "hits", "supervisor_resolution", "student_resolution"):
        assert f in props


def test_students_not_exposed_without_auth_and_validation(client, read_h):
    assert client.get("/students/records?name=x").status_code == 401
    assert client.get("/students/records", headers=read_h).status_code == 422


# ------------------------------------------------------------------ POST /search (JSON body) - added for the standalone backend
def test_post_search_matches_get_search_exactly(client, read_h):
    """POST /search must be a thin JSON wrapper over the SAME engine call as GET /search (no second retrieval path)."""
    for q, mode in (("Internet Security", "title"), ("social media", "hybrid"), ("كريم", "supervisor")):
        g = client.get("/search", params={"q": q, "mode": mode}, headers=read_h).json()
        p = client.post("/search", json={"q": q, "mode": mode}, headers=read_h)
        assert p.status_code == 200, p.text
        assert p.json() == g


def test_post_search_contract_filters_arabic_and_pagination(client, read_h):
    r = client.post("/search", json={"q": "Internet Security", "mode": "title"}, headers=read_h).json()
    assert r["total"] == 1 and r["exhaustive"] is True and r["hits"][0]["record_id"] == "10"
    r = client.post("/search", json={"q": "", "year_from": 2000, "year_to": 2005, "page_size": 5, "sort": "year_asc"}, headers=read_h).json()
    assert r["page_size"] == 5 and len(r["hits"]) <= 5
    r = client.post("/search", json={"q": "د/ كريم فؤاد", "mode": "supervisor", "page_size": 40}, headers=read_h).json()
    assert r["total"] == 130                                    # Arabic UTF-8 JSON body round-trips unchanged


def test_post_search_auth_and_validation(client, read_h):
    err(client.post("/search", json={"q": "x"}), 401, "unauthorized")
    err(client.post("/search", json={"q": "x"}, headers={"Authorization": "Bearer garbage"}), 401, "unauthorized")
    for body in ({"mode": "nope"}, {"page": 0}, {"page_size": 0}, {"year": 12}, {"sort": "random"}, {"language": "fr"}, {"q": "x" * 501}):
        e = err(client.post("/search", json=body, headers=read_h), 422, "validation_error")
        assert e["details"]
    err(client.post("/search", json={"page_size": 101}, headers=read_h), 422, "validation_error")
    err(client.post("/search", json={"year_from": 2020, "year_to": 2010}, headers=read_h), 422, "validation_error")
    err(client.post("/search", content=b"not json", headers={**read_h, "content-type": "application/json"}), 422, "validation_error")
    assert client.get("/search", params={"q": "x"}, headers=read_h).status_code == 200     # GET /search preserved
