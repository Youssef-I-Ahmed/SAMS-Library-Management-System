"""Actual CPU inference for both pinned model folders, with Docker --network none."""
import json
import os
from pathlib import Path
import time

from app.runtime_safety import install, network_status
install()
from app.local_models import encoder, reranker, encode, predict
import numpy as np

started = time.monotonic()
root = Path(os.environ['SAMS_MODELS_DIR'])
embedding = encoder(str(root/'intfloat__multilingual-e5-small'))
ranking = reranker(str(root/'cross-encoder__mmarco-mMiniLMv2-L12-H384-v1'))
loaded = time.monotonic()
vectors = encode(embedding, ['query: إدارة المكتبات', 'query: library management'],
                 convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
scores = predict(ranking, [('إدارة المكتبات', 'فهرس كتب المكتبة'),
                          ('library management', 'Library catalog reference')], show_progress_bar=False)
assert vectors.shape == (2, 384) and np.isfinite(vectors).all()
assert len(scores) == 2 and np.isfinite(scores).all()
assert network_status()['denied_attempts'] == 0
print(json.dumps({'model_load_seconds': loaded-started, 'inference_seconds': time.monotonic()-loaded,
                  'embedding_shape': list(vectors.shape), 'reranker_scores': len(scores),
                  'network': network_status(), 'docker_network': 'none'}))
