"""Embedding backends.

* ``sentence-transformers`` : neural multilingual model (default recommendation: intfloat/multilingual-e5-small).
  Needs ``pip install -r requirements-embeddings.txt`` and one-time model download from huggingface.co.
* ``hashing``               : deterministic OFFLINE fallback (signed feature hashing of word uni/bi-grams and
  character n-grams with frozen IDF). It captures spelling/morphology overlap, NOT meaning, and it is NOT
  cross-lingual. It exists so the pipeline, tests and offline pilots work without a model download.
"""
from __future__ import annotations

import json
import logging
import math
import zlib
from collections import Counter
from typing import Protocol

import numpy as np

from src.data.normalize_ar import normalize_text, search_terms


class Embedder(Protocol):
    model_id: str
    dim: int

    def fit(self, texts: list[str]) -> None: ...
    def get_state(self) -> str | None: ...
    def set_state(self, state: str | None) -> None: ...
    def encode_passages(self, texts: list[str]) -> np.ndarray: ...
    def encode_query(self, text: str) -> np.ndarray: ...


def _l2(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=-1, keepdims=True)
    n[n == 0] = 1.0
    return (m / n).astype(np.float32)


class HashingEmbedder:
    """Deterministic lexical-fuzzy embedder. See module docstring for limitations."""

    def __init__(self, dim: int = 1024, ngram_range: tuple[int, int] = (3, 5)):
        self.dim = dim
        self.ngram_range = ngram_range
        self.model_id = f"hashing-v1-d{dim}"
        self.idf = np.ones(dim, dtype=np.float32)

    # -- features
    def _features(self, text: str) -> Counter:
        toks = search_terms(text)
        feats: Counter = Counter()
        for t in toks:
            feats["w:" + t] += 1.0
        for a, b in zip(toks, toks[1:]):
            feats[f"b:{a}_{b}"] += 1.0
        lo, hi = self.ngram_range
        for t in toks:
            w = f"#{t}#"
            for n in range(lo, hi + 1):
                for i in range(len(w) - n + 1):
                    feats["c:" + w[i:i + n]] += 0.35
        return feats

    def _vec_counts(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        for f, c in self._features(text).items():
            b = f.encode("utf-8")
            h = zlib.crc32(b)
            sign = 1.0 if (zlib.crc32(b, 0x9E3779B1) & 1) else -1.0
            v[h % self.dim] += sign * (1.0 + math.log(c)) if c >= 1 else sign * c
        return v

    # -- fit / persist
    def fit(self, texts: list[str]) -> None:
        """Compute per-bucket IDF from the corpus (deterministic). Frozen afterwards."""
        df = np.zeros(self.dim, dtype=np.float32)
        for t in texts:
            df += (np.abs(self._vec_counts(t)) > 0)
        n = max(len(texts), 1)
        self.idf = (np.log((n + 1) / (df + 1)) + 1.0).astype(np.float32)

    def get_state(self) -> str | None:
        return json.dumps({"idf": [round(float(x), 6) for x in self.idf]})

    def set_state(self, state: str | None) -> None:
        if state:
            idf = np.asarray(json.loads(state)["idf"], dtype=np.float32)
            if len(idf) == self.dim:
                self.idf = idf

    def _enc(self, text: str) -> np.ndarray:
        return self._vec_counts(text) * self.idf

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return _l2(np.vstack([self._enc(t) for t in texts]))

    def encode_query(self, text: str) -> np.ndarray:
        return _l2(self._enc(text)[None, :])[0]


class SentenceTransformerEmbedder:
    """Neural multilingual embeddings via sentence-transformers.

    * ``model_path`` (a local directory) wins over ``model_name`` and, with ``local_only``, no network access is needed.
    * e5-family models get the required 'query: ' / 'passage: ' prefixes automatically; override with explicit prefixes.
    """

    def __init__(self, model_name: str = "intfloat/multilingual-e5-small", batch_size: int = 32, *, model_path: str = "",
                 local_only: bool = False, query_prefix: str | None = None, passage_prefix: str | None = None,
                 max_seq_length: int = 256):
        if local_only:
            import os
            os.environ.setdefault("HF_HUB_OFFLINE", "1")
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError as e:
            raise RuntimeError("sentence-transformers is not installed. Run: pip install -r requirements-embeddings.txt") from e
        src = model_path or model_name
        if model_path:
            from pathlib import Path
            if not Path(model_path).is_dir():
                raise FileNotFoundError(f"EMBEDDING_MODEL_PATH is not a directory: {model_path}")
        self.model_name = Path(model_path).name if model_path else model_name
        self.model_source = "local_path" if model_path else "hub"
        self.model = SentenceTransformer(src, local_files_only=bool(local_only))
        try:
            self.model.max_seq_length = int(max_seq_length)
        except Exception:  # noqa: BLE001 - not every model exposes it
            pass
        self.dim = int(self.model.get_sentence_embedding_dimension())
        self.model_id = f"st:{self.model_name}"
        self.batch_size = batch_size
        e5 = "e5" in self.model_name.lower()
        self.query_prefix = query_prefix if query_prefix is not None else ("query: " if e5 else "")
        self.passage_prefix = passage_prefix if passage_prefix is not None else ("passage: " if e5 else "")

    def fit(self, texts: list[str]) -> None:  # neural model: nothing to fit
        return None

    def get_state(self) -> str | None:
        return None

    def set_state(self, state: str | None) -> None:
        return None

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        v = self.model.encode([self.passage_prefix + t for t in texts], batch_size=self.batch_size,
                              normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True)
        return _l2(np.asarray(v, dtype=np.float32))

    def encode_query(self, text: str) -> np.ndarray:
        v = self.model.encode([self.query_prefix + text], normalize_embeddings=True, show_progress_bar=False,
                              convert_to_numpy=True)
        return _l2(np.asarray(v, dtype=np.float32))[0]


class FastEmbedEmbedder:
    """Torch-free multilingual embeddings through fastembed (ONNX runtime) - the Streamlit Community Cloud backend.

    Default model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (384-d, ~220 MB ONNX, 50+ languages incl.
    Arabic; trained with parallel data so AR<->EN queries land near each other). No prefixes are needed for it; if an
    E5 model is chosen, "query: " / "passage: " are applied automatically.
    A content-hash cache (npz) avoids re-embedding passages: build it once with scripts/build_embedding_cache.py and
    commit it to the PRIVATE repo, so the cloud app only embeds queries at run time."""

    def __init__(self, model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", *,
                 cache_dir: str = "", cache_file: str = "", batch_size: int = 32,
                 query_prefix: str | None = None, passage_prefix: str | None = None, _model=None):
        self.model_name, self.batch_size = model_name, batch_size
        e5 = "e5" in model_name.lower()
        self.query_prefix = query_prefix if query_prefix is not None else ("query: " if e5 else "")
        self.passage_prefix = passage_prefix if passage_prefix is not None else ("passage: " if e5 else "")
        if _model is None:
            from fastembed import TextEmbedding  # lazy: optional dependency
            _model = TextEmbedding(model_name=model_name, cache_dir=cache_dir or None)
        self.model = _model
        self.model_source = "fastembed-onnx"
        self.model_id = f"fe:{model_name}"
        self.dim = int(next(iter(self.model.embed(["probe"]))).shape[0])
        self.cache_file = cache_file
        self._cache: dict[str, np.ndarray] = {}
        self.cache_hits = self.cache_misses = 0
        self._load_cache()

    def _key(self, text: str) -> str:
        import hashlib
        return hashlib.sha1((self.passage_prefix + text).encode("utf-8")).hexdigest()

    def _load_cache(self) -> None:
        import os
        if not self.cache_file or not os.path.exists(self.cache_file):
            return
        try:
            z = np.load(self.cache_file, allow_pickle=False)
            if str(z["model_id"]) != self.model_id or int(z["vectors"].shape[1]) != self.dim:
                _LOG.warning("Embedding cache %s was built for another model; ignored.", self.cache_file)
                return
            self._cache = {k: v for k, v in zip(z["keys"].tolist(), z["vectors"].astype(np.float32))}
        except Exception as e:  # noqa: BLE001 - corrupt cache must never stop the app
            _LOG.warning("Embedding cache unreadable (%s); ignored.", e)

    def save_cache(self, path: str | None = None) -> int:
        path = path or self.cache_file
        keys = list(self._cache)
        np.savez_compressed(path, model_id=np.array(self.model_id), keys=np.array(keys),
                            vectors=np.vstack([self._cache[k] for k in keys]).astype(np.float16) if keys else np.zeros((0, self.dim), np.float16))
        return len(keys)

    def fit(self, texts: list[str]) -> None:
        return None

    def get_state(self) -> str | None:
        return None

    def set_state(self, state: str | None) -> None:
        return None

    def _embed(self, texts: list[str]) -> np.ndarray:
        return np.asarray(list(self.model.embed(texts, batch_size=self.batch_size)), dtype=np.float32)

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        keys = [self._key(t) for t in texts]
        missing = [i for i, k in enumerate(keys) if k not in self._cache]
        self.cache_hits += len(texts) - len(missing)
        self.cache_misses += len(missing)
        if missing:
            vecs = _l2(self._embed([self.passage_prefix + texts[i] for i in missing]))
            for i, v in zip(missing, vecs):
                self._cache[keys[i]] = v
        return _l2(np.vstack([self._cache[k] for k in keys])) if keys else np.zeros((0, self.dim), np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        return _l2(self._embed([self.query_prefix + text]))[0]


class OllamaEmbedder:
    """Free local embeddings through Ollama (/api/embed), e.g. `bge-m3` (multilingual, Arabic + English, 1024-d).
    No torch and no Hugging Face access needed: `ollama pull bge-m3` once, then everything is local."""

    def __init__(self, model: str = "bge-m3", base_url: str = "http://localhost:11434", batch_size: int = 16,
                 timeout: float = 120.0, transport=None):
        import httpx
        self.model_name, self.base_url, self.batch_size = model, base_url.rstrip("/"), batch_size
        self._client = httpx.Client(timeout=timeout, transport=transport)
        self.model_source = "ollama"
        self.model_id = f"ollama:{model}"
        probe = self._embed(["probe"])            # fails fast (and clearly) if Ollama or the model is missing
        self.dim = int(probe.shape[1])

    def _embed(self, texts: list[str]) -> np.ndarray:
        r = self._client.post(f"{self.base_url}/api/embed", json={"model": self.model_name, "input": texts})
        if r.status_code == 404:
            raise RuntimeError(f"Ollama model '{self.model_name}' not found. Run: ollama pull {self.model_name}")
        r.raise_for_status()
        return np.asarray(r.json()["embeddings"], dtype=np.float32)

    def fit(self, texts: list[str]) -> None:
        return None

    def get_state(self) -> str | None:
        return None

    def set_state(self, state: str | None) -> None:
        return None

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        out = [self._embed(texts[i:i + self.batch_size]) for i in range(0, len(texts), self.batch_size)]
        return _l2(np.vstack(out)) if out else np.zeros((0, self.dim), dtype=np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        return _l2(self._embed([text]))[0]


_LOG = logging.getLogger("rag.embeddings")
FASTEMBED_DEFAULT = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

HASHING_NOTE = ("Offline lexical-fuzzy mode (feature hashing of words and character n-grams). It matches spelling and "
                "word overlap; it is NOT semantic and NOT cross-lingual (an English query will not find an Arabic title "
                "about the same topic).")


def fastembed_model_name(configured: str) -> str:
    """The Settings default model (multilingual-e5-small) is not in fastembed's registry; when EMBEDDING_MODEL was left at that
    default, use the supported multilingual default instead of failing. Any explicit different name is used as given."""
    return FASTEMBED_DEFAULT if configured in ("", "intfloat/multilingual-e5-small") or "/" not in configured else configured


def is_neural(emb) -> bool:
    """Neural backends use model ids that start with 'st:' (sentence-transformers)."""
    return str(getattr(emb, "model_id", "")).startswith(("st:", "ollama:", "fe:"))


def describe_embedder(emb, requested: str | None = None, fallback_reason: str | None = None) -> dict:
    """Machine-readable description of the ACTIVE embedding mode (shown in /ready, /admin/index/status and the UI)."""
    neural = is_neural(emb)
    return {"requested_backend": requested or ("sentence-transformers" if neural else "hashing"),
            "active_backend": ("ollama" if str(emb.model_id).startswith("ollama:") else "fastembed" if str(emb.model_id).startswith("fe:") else "sentence-transformers") if neural else "hashing", "model_id": emb.model_id,
            "semantic": neural, "cross_lingual": neural,
            "fallback_reason": fallback_reason,
            "model_source": getattr(emb, "model_source", None),
            "note": ("Neural multilingual embeddings (retrieval quality on this dataset must be measured with scripts/eval_semantic.py)." if neural
                     else HASHING_NOTE)}


def get_embedder(settings) -> Embedder:
    """Build the configured embedder. A neural backend that cannot be loaded (package missing, model download
    blocked) does NOT stop the service: it falls back to the offline hashing mode and says so (status/UI/logs)."""
    reason = None
    if settings.embedding_backend == "ollama":
        try:
            emb = OllamaEmbedder(settings.embedding_model if "/" not in settings.embedding_model else "bge-m3", settings.ollama_url)
            emb.fallback_reason = None
            return emb
        except Exception as e:  # noqa: BLE001 - Ollama not running, model not pulled ...
            reason = f"{type(e).__name__}: {str(e)[:200]}"
            _LOG.warning("Ollama embedding backend unavailable (%s); falling back to offline hashing mode.", reason)
    elif settings.embedding_backend == "fastembed":
        try:
            emb = FastEmbedEmbedder(fastembed_model_name(settings.embedding_model),
                                    cache_dir=settings.embedding_model_cache_dir, cache_file=settings.embedding_cache_file,
                                    query_prefix=settings.embedding_query_prefix, passage_prefix=settings.embedding_passage_prefix)
            emb.fallback_reason = None
            return emb
        except Exception as e:  # noqa: BLE001
            reason = f"{type(e).__name__}: {str(e)[:200]}"
            _LOG.warning("fastembed backend unavailable (%s); falling back to LEXICAL hashing mode.", reason)
    elif settings.embedding_backend == "sentence-transformers":
        try:
            emb = SentenceTransformerEmbedder(
                settings.embedding_model, model_path=settings.embedding_model_path, local_only=settings.embedding_local_only,
                query_prefix=settings.embedding_query_prefix, passage_prefix=settings.embedding_passage_prefix,
                max_seq_length=settings.embedding_max_seq_length)
            emb.fallback_reason = None
            return emb
        except Exception as e:  # noqa: BLE001 - missing package, offline, bad model name ...
            reason = f"{type(e).__name__}: {str(e)[:200]}"
            _LOG.warning("Neural embedding backend unavailable (%s); falling back to offline hashing mode.", reason)
    emb = HashingEmbedder(settings.hashing_dim)
    emb.fallback_reason = reason
    emb.requested_backend = settings.embedding_backend
    return emb
