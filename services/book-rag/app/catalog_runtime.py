"""Versioned module snapshots preserve the existing retrieval algorithm's globals."""
from dataclasses import dataclass
import importlib
import importlib.util
import os
from pathlib import Path
import shutil
import sys
import threading
import time
import uuid

from .data_sources import SNAPSHOT_INPUT, SourceUnavailable


@dataclass
class EngineSnapshot:
    revision: str
    engine: object
    namespace: str


def build_engine(source):
    store = Path(os.environ["SAMS_STORE_DIR"])
    store.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(store).free < 5 * 1024**3:
        raise SourceUnavailable()
    namespace = "_sams_snapshot_" + uuid.uuid4().hex
    root = Path(__file__).resolve().parents[1] / "sams_rag"
    spec = importlib.util.spec_from_file_location(namespace, root / "__init__.py", submodule_search_locations=[str(root)])
    package = importlib.util.module_from_spec(spec)
    sys.modules[namespace] = package
    token = SNAPSHOT_INPUT.set(source)
    try:
        spec.loader.exec_module(package)
        module = importlib.import_module(namespace + ".engine")
        return EngineSnapshot(source.revision, module, namespace)
    except Exception:
        retire_namespace(namespace)
        raise SourceUnavailable() from None
    finally:
        SNAPSHOT_INPUT.reset(token)


def retire_namespace(namespace):
    # Active requests retain their own module objects. Import-registry entries do
    # not retain every historical catalog after the last request releases it.
    for name in list(sys.modules):
        if name == namespace or name.startswith(namespace + "."):
            del sys.modules[name]


class CatalogRuntime:
    def __init__(self, provider, builder=build_engine, interval=5, max_stale=30, clock=time.monotonic, on_publish=None):
        if not 1 <= interval <= 30 or not 2 * interval <= max_stale <= 120:
            raise ValueError("Invalid refresh limits")
        self.provider, self.builder, self.interval, self.max_stale = provider, builder, interval, max_stale
        self.clock, self.on_publish = clock, on_publish
        self._lock, self._refresh_lock = threading.RLock(), threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._current = None
        self._confirmed = 0
        self._failed = False
        self.stats = {"polls": 0, "publications": 0, "last_build_seconds": None}

    def refresh(self):
        with self._refresh_lock:
            try:
                source = self.provider.fetch()
                observed_at = self.clock()
                with self._lock:
                    self.stats["polls"] += 1
                    if self._current and self._current.revision == source.revision:
                        self._confirmed, self._failed = observed_at, False
                        return False
                start = self.clock()
                snapshot = self.builder(source)
                with self._lock:
                    old = self._current
                    self._current, self._confirmed, self._failed = snapshot, observed_at, False
                    self.stats["publications"] += 1
                    self.stats["last_build_seconds"] = self.clock() - start
                    if self.on_publish:
                        self.on_publish()
                if old:
                    retire_namespace(old.namespace)
                return True
            except Exception:
                with self._lock:
                    self._failed = True
                raise SourceUnavailable() from None

    def current(self):
        with self._lock:
            if self._failed or self._current is None or self.clock() - self._confirmed > self.max_stale:
                raise SourceUnavailable()
            return self._current

    def start(self):
        self.refresh()
        def loop():
            while not self._stop.wait(self.interval):
                try:
                    self.refresh()
                except SourceUnavailable:
                    pass  # Fixed readiness failure; no payload or raw DB exception is logged.
        self._thread = threading.Thread(target=loop, name="book-catalog-refresh", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=4)

    def chat_class(self):
        runtime = self
        class DynamicChat:
            def __init__(self):
                self.history = []

            def begin(self, question, filters=None):
                snapshot = runtime.current()
                chat = snapshot.engine.ChatSession()
                chat.history = list(self.history)
                stage = chat.begin(question, filters=filters)
                stage["_sams_snapshot"], stage["_sams_chat"] = snapshot, chat
                return stage

            def end(self, stage):
                out = stage["_sams_chat"].end(stage)
                self.history = stage["_sams_chat"].history
                out["_sams_snapshot"] = stage["_sams_snapshot"]
                return out

            def reset(self):
                self.history = []
        return DynamicChat

    def preview(self, stage):
        return stage["_sams_snapshot"].engine.preview(stage)

    def serialize(self, out):
        return out["_sams_snapshot"].engine.serialize(out)

    def book(self, code):
        snapshot = self.current()
        ids = snapshot.engine.book_ids_for_code(code)
        if not ids:
            return None
        return {"book_code": code, "card": snapshot.engine.card_to_dict(snapshot.engine.book_card(ids))}

    def status(self):
        return self.current().engine.status()
