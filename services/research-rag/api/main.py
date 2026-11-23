"""FastAPI entry point:  uvicorn api.main:app --host 0.0.0.0 --port 8000"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.errors import install_error_handlers
from api.routes import admin, public
from src.admin_ops import RecordAdmin
from src.config.settings import Settings, get_settings
from src.rag.answer import AnswerService
from src.rag.llm import get_provider
from src.service import Services, build_services

log = logging.getLogger("api")


def create_app(services: Services | None = None, settings: Settings | None = None, llm_transport=None) -> FastAPI:
    s = settings or (services.settings if services else get_settings())
    logging.basicConfig(level=getattr(logging, s.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        svc = services or build_services(s)
        app.state.services = svc
        app.state.answers = AnswerService(svc.engine, get_provider(s, llm_transport), s)
        app.state.admin = RecordAdmin(svc)
        if s.auth_disabled:
            log.warning("AUTH_DISABLED=true: read endpoints are open. Local development ONLY.")
        if not s.service_jwt_secret or s.service_jwt_secret == "change-me":
            log.warning("SERVICE_JWT_SECRET not set: admin endpoints are disabled and authenticated reads return 503.")
        log.info("startup complete: %s", svc.engine.stats())
        yield

    app = FastAPI(title="SADAT Projects & Research RAG Service", version=s.app_version, lifespan=lifespan,
                  description="Catalogue search and grounded Q&A over SADAT Academy projects & research metadata. "
                              "Server-to-server API: authenticate with a short-lived HS256 service JWT (see docs/INTEGRATION.md).")
    install_error_handlers(app)
    if s.cors_origins.strip():
        app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                           allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def _req(request: Request, call_next):
        request.state.request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])[:64]
        t0 = time.time()
        resp = await call_next(request)
        resp.headers["X-Request-ID"] = request.state.request_id
        # method/path/status only: never log query text, tokens or bodies
        log.info("%s %s -> %s %dms rid=%s", request.method, request.url.path, resp.status_code,
                 int((time.time() - t0) * 1000), request.state.request_id)
        return resp

    app.include_router(public.router)
    app.include_router(admin.router)
    return app


app = create_app()
