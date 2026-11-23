"""Database schema (SQLAlchemy Core) - portable between SQLite (pilot) and PostgreSQL (production)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import (Column, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, MetaData, String, Table,
                        Text, create_engine, event, func)
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

SCHEMA_VERSION = 1
metadata = MetaData()

records = Table(
    "rag_records", metadata,
    Column("record_id", String(64), primary_key=True),
    Column("title", Text, nullable=False),
    Column("title_norm", Text, nullable=False, index=True),
    Column("year", Integer, nullable=True, index=True),
    Column("year_raw", String(32)),
    Column("call_number", String(50)),
    Column("extent_raw", String(100)),
    Column("pages", Integer),
    Column("dimension_raw", String(100)),
    Column("language", String(10)),
    Column("students", Text, nullable=False, default="[]"),   # JSON array
    Column("subjects", Text, nullable=False, default="[]"),   # JSON array
    Column("flags", Text, nullable=False, default="[]"),      # JSON array
    Column("raw", Text, nullable=False, default="{}"),        # JSON object: untouched source values
    Column("content_hash", String(64), nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)

record_supervisors = Table(
    "rag_record_supervisors", metadata,
    Column("record_id", String(64), ForeignKey("rag_records.record_id", ondelete="CASCADE"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("key", Text, nullable=False),
    Column("name", Text, nullable=False),
    Column("raw", Text, nullable=False),
    Index("ix_rag_sup_key", "key", mysql_length=190),
)

record_subjects = Table(
    "rag_record_subjects", metadata,
    Column("record_id", String(64), ForeignKey("rag_records.record_id", ondelete="CASCADE"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("subject", Text, nullable=False),
    Column("subject_norm", Text, nullable=False),
    Index("ix_rag_subj_norm", "subject_norm", mysql_length=190),
)

embeddings = Table(
    "rag_embeddings", metadata,
    Column("record_id", String(64), ForeignKey("rag_records.record_id", ondelete="CASCADE"), primary_key=True),
    Column("model_id", String(200), nullable=False),
    Column("dim", Integer, nullable=False),
    Column("vector", LargeBinary, nullable=False),      # float32 little-endian
    Column("text_hash", String(64), nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)

change_log = Table(
    "rag_change_log", metadata,
    Column("seq", Integer, primary_key=True, autoincrement=True),
    Column("record_id", String(64), nullable=False),
    Column("op", String(10), nullable=False),            # upsert | delete
    Column("ts", DateTime(timezone=True), server_default=func.now()),
)

index_state = Table(
    "rag_index_state", metadata,
    Column("key", String(100), primary_key=True),
    Column("value", Text, nullable=False),
)

index_errors = Table(
    "rag_index_errors", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ts", DateTime(timezone=True), server_default=func.now()),
    Column("record_id", String(64)),
    Column("stage", String(40), nullable=False),
    Column("message", Text, nullable=False),
)

audit_log = Table(
    "rag_audit_log", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ts", DateTime(timezone=True), server_default=func.now()),
    Column("actor", String(200), nullable=False),
    Column("role", String(100)),
    Column("action", String(40), nullable=False),
    Column("record_id", String(64)),
    Column("details", Text, nullable=False, default="{}"),   # JSON; never contains secrets
)


def make_engine(url: str) -> Engine:
    kwargs: dict = {"future": True}
    if url.startswith("sqlite"):
        if ":memory:" in url or url in ("sqlite://", "sqlite:///"):
            kwargs.update(connect_args={"check_same_thread": False}, poolclass=StaticPool)
        else:
            path = url.split("sqlite:///", 1)[-1]
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            kwargs.update(connect_args={"check_same_thread": False, "timeout": 30})
        eng = create_engine(url, **kwargs)

        @event.listens_for(eng, "connect")
        def _pragmas(dbapi_con, _):  # noqa: ANN001
            cur = dbapi_con.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()
        return eng
    if url.startswith("postgres"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1).replace("postgres://", "postgresql+psycopg://", 1)
        kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=5)
    return create_engine(url, **kwargs)


def init_db(engine: Engine) -> None:
    metadata.create_all(engine)
