"""Prepare everything once (run after installing, and again whenever the Excel catalog changes):
downloads the models into SAMS_MODELS_DIR, computes and caches the chunk embeddings in SAMS_STORE_DIR,
writes near_duplicate_records.csv, then runs one check query.

    python scripts/build_index.py
"""
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

t0 = time.time()
from sams_rag.engine import hybrid_search, status  # noqa: E402  (importing builds everything)

print(json.dumps(status(), ensure_ascii=False, indent=2))
if status()["embedding_backend"] == "lsa-fallback":
    print("WARNING: the embedding model did not load (LSA fallback). Check the internet connection on the first run.")
res = hybrid_search("كتب عن إدارة الجودة الشاملة", k=3)
print("check query ->", res["title"].tolist())
print(f"ready in {time.time() - t0:.0f}s")
