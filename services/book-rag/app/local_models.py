"""One local model pair and a bounded content-keyed embedding cache per process."""
from collections import OrderedDict
import hashlib
import json
import os
from pathlib import Path
import threading

_lock = threading.RLock()
_encoder = None
_reranker = None
_vectors = OrderedDict()
_loaded_cache = False
_metrics = {"restored_vectors": 0, "encoded_vectors": 0}
_verified = False


def verify_models():
    global _verified
    with _lock:
        if _verified:
            return
        try:
            root = Path(os.environ["SAMS_MODELS_DIR"]).resolve()
            manifest = json.loads((Path(__file__).resolve().parents[1] / "MODEL_PROVENANCE.json").read_text())
            for name, expected in manifest.items():
                path = (root / name).resolve()
                if not path.is_relative_to(root) or path.stat().st_size != expected["bytes"]:
                    raise ValueError()
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != expected["sha256"]:
                    raise ValueError()
            _verified = True
        except Exception:
            raise RuntimeError("Required local model provenance unavailable") from None


def cache_status():
    with _lock:
        return {**_metrics, "vectors": len(_vectors)}


def encoder(path):
    global _encoder
    with _lock:
        if _encoder is None:
            verify_models()
            import torch
            from sentence_transformers import SentenceTransformer
            if not path or not Path(path, "config.json").is_file():
                raise RuntimeError("Required local encoder unavailable")
            torch.set_num_threads(2)
            _encoder = SentenceTransformer(path, device="cpu", local_files_only=True)
        return _encoder


def reranker(path):
    global _reranker
    with _lock:
        if _reranker is None:
            verify_models()
            from sentence_transformers import CrossEncoder
            if not path or not Path(path, "config.json").is_file():
                raise RuntimeError("Required local reranker unavailable")
            _reranker = CrossEncoder(path, max_length=256, device="cpu", local_files_only=True)
        return _reranker


def predict(model, *args, **kwargs):
    with _lock:
        return model.predict(*args, **kwargs)


def encode(model, *args, **kwargs):
    with _lock:
        return model.encode(*args, **kwargs)


def passages(model, texts, batch_size):
    global _loaded_cache
    import numpy as np
    with _lock:
        root = Path(os.environ["SAMS_STORE_DIR"]).resolve()
        root.mkdir(parents=True, exist_ok=True)
        # The configured model is fixed; the local checkpoint config is part of every key.
        model_dir = Path(os.environ["SAMS_MODELS_DIR"]) / "intfloat__multilingual-e5-small"
        fingerprint = hashlib.sha256((model_dir / "config.json").read_bytes() +
                      (Path(__file__).resolve().parents[1] / "MODEL_PROVENANCE.json").read_bytes()).hexdigest()
        cache = root / ("passages-e5-" + fingerprint + ".npz")
        if not _loaded_cache:
            if cache.is_file():
                with np.load(cache, allow_pickle=False) as stored:
                    if len(stored.files) > 20000:
                        raise RuntimeError("Embedding cache limit")
                    for key in stored.files:
                        value = stored[key]
                        if value.shape != (384,) or value.dtype != np.float32 or not np.isfinite(value).all():
                            raise RuntimeError("Invalid embedding cache")
                        _vectors[key] = value
                    _metrics["restored_vectors"] = len(_vectors)
            _loaded_cache = True
        keys = [hashlib.sha256((fingerprint + "\0passage: " + text).encode()).hexdigest() for text in texts]
        missing = list(dict.fromkeys(key for key in keys if key not in _vectors))
        if len(set(keys)) > 20000:
            raise RuntimeError("Active embedding limit")
        lookup = dict(zip(keys, texts))
        if missing:
            values = model.encode(["passage: " + lookup[key] for key in missing], batch_size=batch_size,
                                  convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False).astype("float32")
            for key, value in zip(missing, values):
                _vectors[key] = value
            _metrics["encoded_vectors"] += len(missing)
            # Protect this snapshot's vectors while evicting old revisions.
            active = set(keys)
            while len(_vectors) > 20000:
                discard = next(key for key in _vectors if key not in active)
                del _vectors[discard]
            temporary = cache.with_suffix(".tmp")
            with temporary.open("wb") as stream:
                np.savez_compressed(stream, **_vectors)
            os.replace(temporary, cache)
        result = np.stack([_vectors[key] for key in keys]).astype("float32")
        for key in keys:
            _vectors.move_to_end(key)
        return result
