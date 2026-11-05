"""Server-only Book RAG: local extractive retrieval, pending/done jobs and dynamic catalog snapshots.

Start through container_entry; no provider/network download or browser CORS access.
The original wire fields remain compatible with the Express integration contract.
"""
from .runtime_safety import install
install()
from .operational_logging import record_operation

import hashlib
import hmac
import json
import logging
import os
import threading
import time
import uuid
from collections import OrderedDict, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from contextlib import asynccontextmanager
from typing import List, Optional, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .settings import SETTINGS
from .data_sources import PostgresProvider, ExcelProvider, SourceUnavailable
from .catalog_runtime import CatalogRuntime

log = logging.getLogger("sams_api")
ENGINE = {}                      # filled at startup: the engine module (loading it takes a few seconds)


# ---------------------------------------------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------------------------------------------
class Filters(BaseModel):
    author: Optional[Union[str, List[str]]] = None
    title: Optional[str] = None
    topics: Optional[List[str]] = None
    topics_mode: str = "any"
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    language: Optional[str] = Field(None, pattern="^(ar|en)$")
    publisher: Optional[str] = None


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: Optional[str] = Field(None, max_length=64)
    filters: Optional[Filters] = None


class ResetRequest(BaseModel):
    session_id: str = Field(..., max_length=64)


BUSY_NOTICE = {"ar": "هذه نتائج مستخرجة من بيانات فهرس المكتبة، دون مراجعة توليدية.",
               "en": "These results are extracted from the library catalog without generative review."}
PENDING_MESSAGE = {"ar": "نتائج البحث، والمساعد ما زال يكتب الرد...",
                   "en": "Search results -- the assistant is still writing the answer..."}
RATE_MESSAGE = {"ar": "عدد كبير من الأسئلة في وقت قصير. حاول مرة أخرى بعد دقيقة.",
                "en": "Too many questions in a short time. Please try again in a minute."}
ERROR_MESSAGE = {"ar": "حدث خطأ أثناء البحث. حاول مرة أخرى.", "en": "Something went wrong. Please try again."}


def _lang(text):
    return ENGINE["detect_language"](text)


# ---------------------------------------------------------------------------------------------------------------
# Stores (in memory; one server process. For several processes, move them to Redis -- same interface.)
# ---------------------------------------------------------------------------------------------------------------
class Sessions:
    def __init__(self):
        self._items, self._lock = {}, threading.Lock()

    def get(self, session_id):
        now = time.time()
        with self._lock:
            for sid in [s for s, v in self._items.items() if now - v["last"] > SETTINGS.session_ttl_s]:
                del self._items[sid]                                   # forget idle conversations
            if not session_id or session_id not in self._items:
                session_id = session_id or uuid.uuid4().hex
                self._items[session_id] = {"chat": ENGINE["ChatSession"](), "last": now, "lock": threading.Lock()}
            item = self._items[session_id]
            item["last"] = now
            return session_id, item

    def reset(self, session_id):
        with self._lock:
            if session_id in self._items:
                self._items[session_id]["chat"].reset()


class AnswerCache:
    # Final answers of FIRST questions (follow-ups depend on the conversation, so they are never cached).
    def __init__(self):
        self._items, self._lock = OrderedDict(), threading.Lock()

    @staticmethod
    def key(question, filters):
        f = json.dumps(filters or {}, ensure_ascii=False, sort_keys=True)
        return ENGINE["normalize_text"](question) + "||" + f

    def get(self, key):
        with self._lock:
            item = self._items.get(key)
            if not item or time.time() - item["t"] > SETTINGS.cache_ttl_s:
                self._items.pop(key, None)
                return None
            self._items.move_to_end(key)
            return item

    def put(self, key, result, history_entry):
        with self._lock:
            self._items[key] = {"t": time.time(), "result": result, "history_entry": history_entry}
            self._items.move_to_end(key)
            while len(self._items) > SETTINGS.cache_max_items:
                self._items.popitem(last=False)

    def clear(self):
        with self._lock:
            self._items.clear()


class RateLimiter:
    def __init__(self):
        self._hits, self._lock = defaultdict(deque), threading.Lock()

    def allow(self, client):
        if SETTINGS.rate_limit_per_min <= 0:                    # 0 = no limit for anyone
            return True
        now = time.time()
        with self._lock:
            q = self._hits[client]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= SETTINGS.rate_limit_per_min:
                return False
            q.append(now)
            return True


SESSIONS, CACHE, LIMITER = Sessions(), AnswerCache(), RateLimiter()
JOBS, JOBS_LOCK = {}, threading.Lock()
EXECUTOR = ThreadPoolExecutor(max_workers=SETTINGS.workers)


# ---------------------------------------------------------------------------------------------------------------
# One question, run in a worker thread
# ---------------------------------------------------------------------------------------------------------------
def _history_entry(question, out):
    # Same memory entry as ChatSession.ask() writes (used when a cached answer is replayed into a conversation).
    src = out["package"]["sources"]
    cited = set(out["citations"]["cited"])
    books = [f"{r.title} — {r.author}" for r in src.itertuples() if r.source in cited] if len(src) else []
    return {"question": question, "search_query": out["search_query"], "answer": out["answer"], "books": books}


def _public(out):
    data = ENGINE["serialize"](out)
    data.pop("fallback_errors", None)                    # internal: goes to the log, not to the page
    if out["provider"] not in ("gemini", "help"):
        data["notice"] = BUSY_NOTICE[_lang(out["query"])]
    else:
        data["notice"] = None
    return data


def _run_question(job):
    session, question, filters = job["session"], job["question"], job["filters"]
    first_turn = not session["chat"].history
    try:
        stage = session["chat"].begin(question, filters=filters)
        job["preview"] = ENGINE["preview"](stage)
        out = session["chat"].end(stage)
        result = _public(out)
        if first_turn and out["provider"] == "gemini":
            CACHE.put(job["cache_key"], result, _history_entry(question, out))
        record_operation("ask_completed")
        return result
    finally:
        session["lock"].release()                             # the conversation can take its next question


def _job_response(job, wait_s):
    try:
        result = job["future"].result(timeout=max(0.0, wait_s))
    except FutureTimeout:
        return {"status": "pending", "job_id": job["id"], "session_id": job["session_id"],
                "message": PENDING_MESSAGE[_lang(job["question"])], "preview": job.get("preview")}
    except Exception as exc:                                   # never show a technical error to a researcher
        record_operation("ask_failed")
        return {"status": "error", "session_id": job["session_id"], "message": ERROR_MESSAGE[_lang(job["question"])]}
    return {"status": "done", "session_id": job["session_id"], "result": result}


# ---------------------------------------------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app):
    if len(SETTINGS.service_key) < 32 or SETTINGS.allowed_origins:
        raise RuntimeError("Server-only runtime configuration required")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    from sams_rag.text import detect_language, normalize_text
    source = os.environ.get("BOOK_RAG_SOURCE", "postgres")
    if source == "postgres":
        provider = PostgresProvider()
    elif source == "excel" and os.environ.get("SAMS_DATA_PATH"):
        provider = ExcelProvider(os.environ["SAMS_DATA_PATH"])
    else:
        raise RuntimeError("Explicit catalog source required")
    runtime = CatalogRuntime(provider, interval=float(os.getenv("BOOK_RAG_REFRESH_SECONDS", "5")),
                             max_stale=float(os.getenv("BOOK_RAG_MAX_STALE_SECONDS", "30")), on_publish=CACHE.clear)
    runtime.start()
    ENGINE.update({"ChatSession": runtime.chat_class(), "SearchFilters": lambda **values: runtime.current().engine.SearchFilters(**values),
                   "serialize": runtime.serialize, "preview": runtime.preview, "status": runtime.status,
                   "book": runtime.book, "detect_language": detect_language, "normalize_text": normalize_text,
                   "runtime": runtime})
    try:
        yield
    finally:
        runtime.stop()
        EXECUTOR.shutdown(wait=True)


app = FastAPI(title="SAMS Library Search API", version="1.1.0", lifespan=lifespan)
if SETTINGS.allowed_origins:                                     # empty = no browser calls (server-to-server only)
    app.add_middleware(CORSMiddleware, allow_origins=SETTINGS.allowed_origins, allow_methods=["GET", "POST"],
                       allow_headers=["*"])


def require_service_key(x_service_key: Optional[str] = Header(None, description="Shared secret with the website server")):
    # With API_SERVICE_KEY set, only the website's server (which knows the key) can use the API.
    if not SETTINGS.service_key or not hmac.compare_digest((x_service_key or "").encode(), SETTINGS.service_key.encode()):
        raise HTTPException(401, "invalid or missing X-Service-Key")


def _roles(header):
    return {r.strip().upper() for r in (header or "").split(",") if r.strip()}


@app.get("/api/health", dependencies=[Depends(require_service_key)])
def health():
    try:
        status = ENGINE["status"]()
    except SourceUnavailable:
        raise HTTPException(503, "catalog unavailable") from None
    from .local_models import cache_status
    from .runtime_safety import network_status
    return {"status": "ok", "engine": status,
            "runtime": {**ENGINE["runtime"].stats, "cache": cache_status(), "network": network_status()},
            "settings": {"wait_s": SETTINGS.wait_s, "gemini_budget_s": SETTINGS.gemini_budget_s,
                         "rate_limit_per_min": SETTINGS.rate_limit_per_min}}


@app.post("/api/ask", dependencies=[Depends(require_service_key)])
def ask(req: AskRequest, request: Request,
        x_user_id: Optional[str] = Header(None, max_length=128, description="The researcher's id (from the website)"),
        x_user_role: Optional[str] = Header(None, max_length=200, description="The researcher's roles, e.g. STUDENT or LIBRARIAN")):
    try:
        ENGINE["runtime"].current()
    except SourceUnavailable:
        raise HTTPException(503, "catalog unavailable") from None
    question = req.question.strip()
    if not question:
        raise HTTPException(422, "empty question")
    if len(question) > SETTINGS.max_question_chars:
        raise HTTPException(422, f"question longer than {SETTINGS.max_question_chars} characters")
    roles = _roles(x_user_role)
    unlimited = bool(roles & set(SETTINGS.unlimited_roles))      # e.g. LIBRARIAN: no question limit
    client = f"user:{x_user_id}" if x_user_id else f"ip:{request.client.host if request.client else 'unknown'}"
    if not unlimited and not LIMITER.allow(client):              # the limit counts per user, not per server IP
        raise HTTPException(429, RATE_MESSAGE[_lang(question)])
    user_hash = hashlib.sha256(x_user_id.encode()).hexdigest()[:12] if x_user_id else None

    session_id, session = SESSIONS.get(req.session_id)
    if not session["lock"].acquire(blocking=False):            # one question at a time per conversation
        raise HTTPException(409, "the previous question of this conversation is still being answered")
    filters_dict = req.filters.model_dump(exclude_none=True) if req.filters else {}
    if filters_dict.get("topics_mode") == "any" and len(filters_dict) == 1:
        filters_dict = {}
    session_hash = hashlib.sha256(session_id.encode()).hexdigest()[:12]

    # cached first question -> answered at once, and remembered in the conversation like a normal answer
    cache_key = AnswerCache.key(question, filters_dict)
    if not session["chat"].history:
        hit = CACHE.get(cache_key)
        if hit:
            session["chat"].history.append(dict(hit["history_entry"]))
            session["lock"].release()
            record_operation("ask_cached", cached=True)
            return {"status": "done", "session_id": session_id, "result": hit["result"], "cached": True}

    try:
        filters = ENGINE["SearchFilters"](**filters_dict) if filters_dict else None
        job = {"id": uuid.uuid4().hex, "session_id": session_id, "session": session, "session_hash": session_hash,
               "user_hash": user_hash, "roles": sorted(roles),
               "question": question, "filters": filters, "cache_key": cache_key, "created": time.time()}
        with JOBS_LOCK:
            for jid in [j for j, v in JOBS.items() if time.time() - v["created"] > 3600]:
                del JOBS[jid]                                  # forget old jobs
            JOBS[job["id"]] = job
        job["future"] = EXECUTOR.submit(_run_question, job)   # the worker releases the lock when it is done
    except Exception:
        session["lock"].release()
        raise
    return _job_response(job, SETTINGS.wait_s)


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_service_key)])
def job_status(job_id: str, wait: float = 10.0):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "unknown or expired job")
    return _job_response(job, min(max(wait, 0.0), 25.0))


@app.get("/api/books/{book_code}", dependencies=[Depends(require_service_key)])
def book(book_code: str):
    try:
        result = ENGINE["book"](book_code)
    except SourceUnavailable:
        raise HTTPException(503, "catalog unavailable") from None
    if result is None:
        raise HTTPException(404, "book not found")
    return result


@app.post("/api/session/reset", dependencies=[Depends(require_service_key)])
def reset(req: ResetRequest):
    SESSIONS.reset(req.session_id)
    return {"status": "ok", "session_id": req.session_id}
