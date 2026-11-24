"""Service-to-service authentication.

Express (which enforces the application's RBAC) mints a SHORT-LIVED HS256 JWT per call:
  iss=SERVICE_JWT_ISSUER, aud=SERVICE_JWT_AUDIENCE, sub=<user id>, role=<RBAC role>, scope="rag:read" | "rag:read rag:admin",
  iat, exp (<= 10 minutes). FastAPI verifies signature/claims and RE-CHECKS scope and role for admin operations
  (defence in depth: a leaked read token cannot modify data, and a valid token is useless without the secret).
"""
from __future__ import annotations

import hmac
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request

from api.errors import ApiError
from src.config.settings import Settings

MAX_TOKEN_LIFETIME_S = 600


@dataclass
class Principal:
    subject: str
    role: str | None
    scopes: set[str]


def _settings(request: Request) -> Settings:
    return request.app.state.services.settings


def _decode(request: Request, s: Settings) -> Principal:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "Missing bearer token")
    token = auth[7:].strip()
    try:
        claims = jwt.decode(token, s.service_jwt_secret, algorithms=["HS256"], audience=s.service_jwt_audience,
                            issuer=s.service_jwt_issuer, leeway=5,
                            options={"require": ["exp", "iat", "iss", "aud", "sub"]})
    except jwt.ExpiredSignatureError as e:
        raise ApiError(401, "token_expired", "Token expired") from e
    except jwt.PyJWTError as e:
        raise ApiError(401, "unauthorized", "Invalid token") from e
    if claims["exp"] - claims["iat"] > MAX_TOKEN_LIFETIME_S:
        raise ApiError(401, "unauthorized", "Token lifetime too long")
    sc = claims.get("scope", "")
    scopes = set(sc.split()) if isinstance(sc, str) else set(sc or [])
    return Principal(str(claims["sub"])[:200], (str(claims["role"]).upper() if claims.get("role") else None), scopes)


def require_read(request: Request) -> Principal:
    s = _settings(request)
    if s.auth_disabled:  # local development only
        return Principal("dev-anonymous", None, {"rag:read"})
    if not s.service_jwt_secret:
        raise ApiError(503, "auth_not_configured", "SERVICE_JWT_SECRET is not configured")
    p = _decode(request, s)
    if "rag:read" not in p.scopes and "rag:admin" not in p.scopes:
        raise ApiError(403, "forbidden", "Missing scope rag:read")
    return p


def require_admin(request: Request) -> Principal:
    """Admin ALWAYS requires a valid signed token - AUTH_DISABLED never opens admin endpoints."""
    s = _settings(request)
    if not s.service_jwt_secret or hmac.compare_digest(s.service_jwt_secret, "change-me"):
        raise ApiError(503, "auth_not_configured", "Admin endpoints are disabled until SERVICE_JWT_SECRET is set")
    p = _decode(request, s)
    if "rag:admin" not in p.scopes:
        raise ApiError(403, "forbidden", "Missing scope rag:admin")
    if not p.role or p.role not in s.admin_role_set:
        raise ApiError(403, "forbidden", "Role not permitted for administrative operations")
    return p
