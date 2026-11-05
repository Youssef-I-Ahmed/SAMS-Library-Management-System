"""Website settings (environment variables / .env). The engine's own settings stay in sams_rag/config.py."""
import os
from dataclasses import dataclass, field


def _int(name, default):
    return int(os.getenv(name, default))


def parse_list(value, upper=False):
    # "a, b,,c" -> ["a", "b", "c"]  (empty string -> [])
    items = [x.strip() for x in (value or "").split(",") if x.strip()]
    return [x.upper() for x in items] if upper else items


@dataclass
class Settings:
    # How long /api/ask waits for the final answer before returning the books found so far ("pending").
    wait_s: float = float(os.getenv("API_WAIT_S", 10))
    # Upper limit for all Gemini tries of one question (engine CONFIG["gemini_time_budget_s"]).
    gemini_budget_s: float = float(os.getenv("API_GEMINI_BUDGET_S", 90))
    # Questions per minute per user (X-User-Id from the website; client IP when absent). 0 = no limit for anyone.
    rate_limit_per_min: int = _int("API_RATE_LIMIT_PER_MIN", 20)
    # Roles with no question limit (X-User-Role, comma-separated, case-insensitive). The website's roles: STUDENT, LIBRARIAN.
    unlimited_roles: list = field(default_factory=lambda: parse_list(os.getenv("API_UNLIMITED_ROLES", ""), upper=True))
    # Shared secret with the website's server (header X-Service-Key). Empty = open (local testing, Colab, /docs).
    service_key: str = os.getenv("API_SERVICE_KEY", "")
    # Answer cache (first question of a conversation only).
    cache_ttl_s: int = _int("API_CACHE_TTL_S", 24 * 3600)
    cache_max_items: int = _int("API_CACHE_MAX_ITEMS", 2000)
    # A conversation is forgotten after this much inactivity.
    session_ttl_s: int = _int("API_SESSION_TTL_S", 2 * 3600)
    max_question_chars: int = _int("API_MAX_QUESTION_CHARS", 500)
    # Questions answered at the same time (each runs search + Gemini).
    workers: int = _int("API_WORKERS", 4)
    # Origins allowed to call the API from a browser: "*" = any (testing); EMPTY = none -- use this when only the
    # website's server (Express) calls the API, server to server.
    allowed_origins: list = field(default_factory=lambda: parse_list(os.getenv("API_ALLOWED_ORIGINS", "")))
    log_dir: str = os.getenv("API_LOG_DIR", "logs")


SETTINGS = Settings()
