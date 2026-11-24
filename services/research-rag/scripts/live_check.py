#!/usr/bin/env python
"""Black-box check of a RUNNING API against the real dataset, using independent ground truth computed from the Excel
file (src/evaluation/oracle.py). Nothing here reads the RAG store.

    uvicorn api.main:app --port 8000 --no-access-log &
    python scripts/live_check.py --base http://127.0.0.1:8000 [--xlsx data/raw/Project.xlsx]

Token: SERVICE_JWT_SECRET etc. from the environment/.env (same as the server). Exit code 0 only if every check passes.
Output contains counts only (no student names).
"""
from __future__ import annotations

import argparse
import random
import sys
# Windows consoles default to cp1252 and crash on Arabic text: force UTF-8 output (and for child processes).
__import__("os").environ.setdefault("PYTHONUTF8", "1")
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - not a text stream (e.g. redirected in tests)
        pass
import time
from pathlib import Path

import httpx
import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config.settings import ROOT, get_settings  # noqa: E402
from src.evaluation.oracle import load_oracle, norm, person  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def tok(s, scope, role):
    n = int(time.time())
    return {"Authorization": "Bearer " + jwt.encode({"iss": s.service_jwt_issuer, "aud": s.service_jwt_audience, "sub": "live-check",
                                                      "role": role, "scope": scope, "iat": n, "exp": n + 300}, s.service_jwt_secret, algorithm="HS256")}


def all_pages(c, path, params, h, size=100):
    ids, page, total = [], 1, None
    while True:
        r = c.get(path, params={**params, "page": page, "page_size": size}, headers=h)
        r.raise_for_status()
        j = r.json()
        total = j["total"]
        ids += [x["record_id"] for x in j["hits"]]
        if page >= j["total_pages"]:
            return ids, total, j
        page += 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--xlsx", type=Path, default=ROOT / "data" / "raw" / "Project.xlsx")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--sample", type=int, default=40, help="random names/titles per category (top-10 by size are always included)")
    a = ap.parse_args()
    s, rnd = get_settings(), random.Random(a.seed)
    orc = load_oracle(a.xlsx)
    n_src = len(orc["records"])
    rd, ad = tok(s, "rag:read", "USER"), tok(s, "rag:read rag:admin", "ADMIN")
    c = httpx.Client(base_url=a.base, timeout=60)

    r = c.get("/health"); check("health 200", r.status_code == 200)
    r = c.get("/ready"); j = r.json()
    check("ready: records == source rows", r.status_code == 200 and j["records"] == n_src, f"{j.get('records')} vs {n_src}")
    check("ready reports embedding mode and retrieval-only flag", "embedding" in j and "retrieval_only" in j)

    # ---- supervisors: complete lists for every sampled spelling (independent oracle)
    import re
    spell = {}
    for r_ in orc["records"].values():
        for part in re.split(r"\||\s+(?=(?:[أا]\s*\.?\s*)?د\s*[/.]\s*\S)", r_["supervisor_raw"]):
            if part.strip() and part.strip().upper() != "NA":
                spell.setdefault(person(part), part.strip())
    keys = sorted(orc["by_sup"], key=lambda k: -len(orc["by_sup"][k]))
    pick = keys[:10] + rnd.sample(keys[10:], min(a.sample, len(keys) - 10))
    bad = 0
    for k in pick:
        ids, total, _ = all_pages(c, "/supervisors/records", {"name": spell.get(k, k)}, rd)
        bad += not (total == len(orc["by_sup"][k]) == len(ids) == len(set(ids)) and set(ids) == orc["by_sup"][k])
    check(f"supervisor: complete lists, lossless pages ({len(pick)} people)", bad == 0, f"{bad} mismatches")
    big = keys[0]
    ids, total, j = all_pages(c, "/supervisors/records", {"name": spell[big]}, rd, size=7)
    check("supervisor: page_size=7 pagination lossless", set(ids) == orc["by_sup"][big] and len(ids) == len(set(ids)) and j["exhaustive"])

    # ---- students
    snames = sorted(orc["by_stu"], key=lambda k: -len(orc["by_stu"][k]))
    pick = snames[:10] + rnd.sample(snames[10:], a.sample)
    bad = 0
    for k in pick:
        ids, total, j = all_pages(c, "/students/records", {"name": k}, rd)
        bad += not (set(ids) == orc["by_stu"][k] and total == len(orc["by_stu"][k]) == len(ids) and j["exhaustive"])
    check(f"student: complete lists for exact names ({len(pick)} students)", bad == 0, f"{bad} mismatches")
    top = snames[0]
    ids, total, _ = all_pages(c, "/students/records", {"name": top}, rd, size=2)
    check("student: page_size=2 pagination lossless", set(ids) == orc["by_stu"][top] and len(ids) == len(set(ids)))
    # a 2-token prefix that is NOT itself a full student name (otherwise the exact name wins by design)
    first2 = next(" ".join(k.split()[:2]) for k in snames if len(k.split()) >= 3 and " ".join(k.split()[:2]) not in orc["by_stu"])
    exp = set().union(*(v for k, v in orc["by_stu"].items() if all(any(t == q or (len(q) >= 2 and t.startswith(q)) for t in k.split()) for q in first2.split())))
    ids, total, j = all_pages(c, "/students/records", {"name": first2, "include_partial": "true"}, rd)
    check("student: partial name returns union of matching people, labelled", set(ids) == exp and j["student_resolution"]["status"] in ("partial", "ambiguous_partial", "exact"))

    # ---- titles / subjects / ranked modes
    titles = [t for t in orc["by_title"] if len(t.split()) >= 3]
    bad = 0
    for t in rnd.sample(titles, a.sample):
        raw = next(r_["title"] for r_ in orc["records"].values() if r_["title_norm"] == t)
        ids, total, j = all_pages(c, "/search", {"q": raw, "mode": "title"}, rd)
        exact = {x["record_id"] for x in c.get("/search", params={"q": raw, "mode": "title", "page_size": 100}, headers=rd).json()["hits"] if x["match_type"] == "exact"}
        bad += not (exact == orc["by_title"][t] and j["exhaustive"])
    check(f"title: exact lookup equals oracle ({a.sample} titles)", bad == 0, f"{bad} mismatches")
    part = c.get("/search", params={"q": "الاندماج", "mode": "title", "page_size": 100}).json() if False else None
    sub = "بنوك"
    ids, total, j = all_pages(c, "/search", {"q": sub, "mode": "subject"}, rd)
    check("subject: structured search == oracle", set(ids) == orc["by_subject"][norm(sub)] and j["exhaustive"], f"{total}")
    r = c.get("/search", params={"q": "التسويق الالكتروني", "mode": "hybrid"}, headers=rd).json()
    check("Arabic topic (hybrid) returns ranked, non-exhaustive results", r["total"] > 0 and r["exhaustive"] is False)
    r = c.get("/search", params={"q": "digital marketing", "mode": "hybrid"}, headers=rd).json()
    check("English topic (hybrid) returns ranked, non-exhaustive results", r["total"] > 0 and r["exhaustive"] is False)
    r = c.get("/search", params={"q": "marketing", "year_from": 2015, "year_to": 2020, "sort": "year_asc", "page_size": 100}, headers=rd).json()
    ys = [x["year"] for x in r["hits"] if x["year"]]
    check("filters + sort: year range respected and ascending", r["total"] > 0 and all(2015 <= y <= 2020 for y in ys) and ys == sorted(ys))
    # year filter == oracle for every year in the dataset (covers the records whose suspect year was corrected)
    by_year = {}
    for rec in orc["records"].values():
        if rec["year"]:
            by_year.setdefault(rec["year"], set()).add(rec["id"])
    badyr = 0
    for y, want in sorted(by_year.items()):
        got = {x["record_id"] for p_ in range(1, 10) for x in c.get("/search", params={"year": y, "mode": "all", "page": p_, "page_size": 100}, headers=rd).json()["hits"]}
        badyr += got != want
    check(f"year filter == oracle for all {len(by_year)} years", badyr == 0, f"{badyr} mismatches")

    # ---- robustness
    for q in ["ا", "zzzqqq", "asdfghjkl", "'; DROP TABLE x;--", "<script>alert(1)</script>"]:
        r = c.get("/search", params={"q": q, "mode": "student"}, headers=rd)
        check(f"safe on hostile/short query {q[:12]!r} (student mode)", r.status_code == 200 and r.json()["total"] == 0)
    r = c.get("/search", params={"q": "ا", "mode": "auto"}, headers=rd).json()
    check("single-letter query is refused with a note, not thousands of hits", r["total"] == 0 and "query_too_short" in r["strategy"])
    check("empty student search is not 'everything'", c.get("/search", params={"q": "", "mode": "student"}, headers=rd).json()["total"] == 0)

    # ---- errors / auth
    check("no token -> 401", c.get("/search", params={"q": "x"}).status_code == 401)
    check("read token on admin -> 403", c.delete("/admin/records/1", headers=rd).status_code == 403)
    check("admin route without token -> 401", c.post("/admin/index/verify").status_code == 401)
    check("invalid param -> 422 with error body", c.get("/search", params={"year": "abc"}, headers=rd).json()["error"]["code"] == "validation_error")
    check("unknown record -> 404", c.get("/records/NOPE-0", headers=rd).json()["error"]["code"] == "record_not_found")
    check("unknown student key -> 404", c.get("/students/records", params={"key": "no such student zzz"}, headers=rd).status_code == 404)

    # ---- RAG (retrieval-only unless an LLM is configured on the server)
    r = c.post("/ask", json={"question": "ما نتائج دراسة «Internet Security»؟"}, headers=rd).json()
    check("ask: findings question abstains (metadata-only dataset)", r["status"] == "abstained" and r["abstain_reason"] == "content_not_available")
    r = c.post("/ask", json={"question": "What were the conclusions of the study on mobile banking?"}, headers=rd).json()
    check("ask (English): abstains in English", r["status"] == "abstained" and r["language"] == "en")
    k = keys[0]
    r = c.post("/ask", json={"question": f"كم مشروعا أشرف عليه {spell[k]}؟"}, headers=rd).json()
    check("ask: supervisor count equals oracle", str(len(orc['by_sup'][k])) in (r.get("answer") or ""), f"{len(orc['by_sup'][k])}")

    # ---- admin lifecycle on a throw-away record (deleted afterwards)
    body = {"title": "سجل فحص حي مؤقت للحذف", "supervisors": ["مشرف فحص مؤقت"], "students": ["طالب فحص مؤقت"], "year": 2024, "subjects": ["بنوك"]}
    r = c.post("/admin/records", json=body, headers=ad); rid = r.json().get("record_id")
    check("admin: create -> 201", r.status_code == 201 and rid)
    check("admin: new record searchable by title/student/supervisor",
          c.get("/search", params={"q": body["title"], "mode": "title"}, headers=rd).json()["total"] == 1
          and c.get("/students/records", params={"name": "طالب فحص مؤقت"}, headers=rd).json()["total"] == 1
          and c.get("/supervisors/records", params={"name": "مشرف فحص مؤقت"}, headers=rd).json()["total"] == 1)
    r = c.patch(f"/admin/records/{rid}", json={"title": "عنوان فحص حي معدل"}, headers=ad)
    check("admin: edit visible in search", r.status_code == 200 and c.get("/search", params={"q": "عنوان فحص حي معدل", "mode": "title"}, headers=rd).json()["total"] == 1
          and c.get("/search", params={"q": body["title"], "mode": "title"}, headers=rd).json()["total"] == 0)
    r = c.delete(f"/admin/records/{rid}", headers=ad)
    check("admin: delete removes it from every search", r.status_code == 200
          and c.get("/students/records", params={"name": "طالب فحص مؤقت"}, headers=rd).json()["total"] == 0
          and c.get("/search", params={"q": "عنوان فحص حي معدل", "mode": "title"}, headers=rd).json()["total"] == 0)
    r = c.get("/ready").json()
    check("other records untouched after the lifecycle", r["records"] == n_src, f"{r['records']} vs {n_src}")
    v = c.post("/admin/index/verify", headers=ad).json()
    check("index verify ok", v["ok"] is True)

    bad = [x for x in RESULTS if not x[1]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} checks passed")
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
