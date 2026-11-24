"""Central configuration. Everything comes from environment variables (or a local .env file)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    rag_mode: Literal["standalone", "integrated"] = "standalone"
    database_url: str = f"sqlite:///{ROOT / 'data' / 'store' / 'rag.db'}"
    source_database_url: str = ""
    source_table: str = "rag_projects_v"

    # data
    raw_dataset_path: Path = ROOT / "data" / "raw" / "Project.xlsx"
    processed_dir: Path = ROOT / "data" / "processed"
    supervisor_aliases_path: Path = ROOT / "data" / "supervisor_aliases.csv"
    min_valid_year: int = 1990
    max_valid_year: int = 2027

    # embeddings
    embedding_backend: Literal["hashing", "sentence-transformers", "ollama", "fastembed"] = "hashing"
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_model_path: str = ""          # local model directory (offline use); wins over embedding_model
    embedding_local_only: bool = False      # never contact huggingface.co (use with a local path / pre-downloaded cache)
    embedding_query_prefix: str | None = None     # None = automatic ("query: " for e5 models, none otherwise)
    embedding_passage_prefix: str | None = None   # None = automatic ("passage: " for e5 models, none otherwise)
    embedding_max_seq_length: int = 256
    embedding_model_cache_dir: str = ""     # fastembed: where the ONNX model is stored (default: fastembed temp dir)
    embedding_cache_file: str = "data/cache/embeddings.npz"   # precomputed passage vectors (content-hash keyed); optional
    semantic_calibration_file: str = "data/cache/semantic_calibration.json"  # written by scripts/eval_semantic.py
    hashing_dim: int = 1024

    # retrieval
    rrf_k: int = 60
    bm25_weight: float = 1.0
    semantic_weight: float = 1.0
    candidate_pool: int = 100
    semantic_min_score: float = 0.30           # cosine floor for the offline HASHING embedder
    semantic_min_score_neural: float = 0.35    # cosine floor for NEURAL embedders; UNCALIBRATED fallback (paraphrase-multilingual scores are ~0.3-0.7; e5 ~0.7-0.9)
                                               # starting point - run scripts/eval_semantic.py with the real model and tune)
    min_query_chars: int = 2
    max_upload_mb: int = 10          # admin Excel import: maximum file size
    max_import_rows: int = 20000     # admin Excel import: maximum data rows
    default_page_size: int = 20
    max_page_size: int = 100
    refresh_interval_s: float = 1.0

    # llm
    llm_provider: Literal["none", "gemini", "openai", "anthropic", "ollama"] = "none"
    llm_model: str = ""
    llm_api_key: str = Field(default="", repr=False)
    llm_base_url: str = ""
    llm_timeout_s: float = 30.0
    llm_max_retries: int = 2
    llm_num_ctx: int = 8192                 # Ollama only: context window (its default of 2048 would truncate the retrieved records)
    ollama_url: str = "http://localhost:11434"   # free local Ollama server (LLM and/or embeddings)
    rag_top_k: int = 8
    rag_max_context_records: int = 40
    rag_min_semantic_score: float = 0.25
    # ---- evidence / abstention policy (all tunable; evaluated by scripts/evaluate_abstention.py)
    evidence_min_coverage: float = 0.67         # share of distinctive question terms a record must contain to count as EXPLICIT support
    evidence_common_term_df: float = 0.08       # terms present in > 8% of records are too common to be distinctive
    evidence_allow_semantic_only: bool = False  # similarity alone is never proof; if True it only upgrades to 'uncertain' support
    evidence_min_supported_records: int = 1     # records with explicit support required before any answer is generated
    evidence_similar_title_ratio: int = 88      # near-miss titles are suggested as UNCERTAIN, never treated as the same record

    # service auth
    service_jwt_secret: str = Field(default="", repr=False)
    service_jwt_issuer: str = "sadat-express"
    service_jwt_audience: str = "sadat-rag"
    admin_roles: str = "ADMIN,LIBRARIAN"
    auth_disabled: bool = False  # ONLY for local development; never in deployed environments

    # privacy
    expose_students: bool = True
    rag_include_students: bool = False  # send student names to the external LLM? default NO (privacy)
    rag_include_supervisors: bool = False  # send supervisor names to the external LLM? default NO (privacy)
    hide_student_names: bool = False       # demo mode: student names are never displayed (overrides expose_students)
    app_access_password: str = Field(default="", repr=False)  # Streamlit: shared password gate for the whole app

    pilot_admin_password: str = Field(default="", repr=False)
    log_level: str = "INFO"
    cors_origins: str = ""  # comma separated; empty = no CORS (server-to-server only)
    ask_max_question_chars: int = 1000
    app_version: str = "1.0.0"

    @model_validator(mode="after")
    def _demo_mode(self):
        if self.hide_student_names:      # demo mode: student names are never shown in UI/API responses
            self.expose_students = False
            self.rag_include_students = False
        return self

    @property
    def admin_role_set(self) -> set[str]:
        return {r.strip().upper() for r in self.admin_roles.split(",") if r.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
