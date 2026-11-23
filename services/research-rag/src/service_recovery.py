"""Composition root: wires store + embedder + engine + indexer (+ LLM later). Used by API, Streamlit, scripts."""
from __future__ import annotations

from dataclasses import dataclass

from src.config.settings import Settings, get_settings
from src.indexing.indexer import Indexer
from src.retrieval.embeddings import Embedder, get_embedder
from src.retrieval.engine import SearchEngine
from src.storage.db import make_engine
from src.storage.record_store import RecordStore


@dataclass
class Services:
    settings: Settings
    store: RecordStore
    embedder: Embedder
    engine: SearchEngine
    indexer: Indexer


def build_services(settings: Settings | None = None, *, load: bool = True, embedder: Embedder | None = None) -> Services:
    s = settings or get_settings()
    store = RecordStore(make_engine(s.database_url))
    emb = embedder or get_embedder(s)
    eng = SearchEngine(store, emb, s)
    idx = Indexer(store, emb, s)
    if load:
        eng.load()
    return Services(s, store, emb, eng, idx)
