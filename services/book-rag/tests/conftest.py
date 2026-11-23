import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
REPO = os.path.dirname(os.path.dirname(ROOT))
os.environ.setdefault("SAMS_DATA_PATH", os.path.join(REPO, "data", "raw", "SAMS_Books_Merged_Book_Names_Corrected.xlsx"))
os.environ.setdefault("BOOK_RAG_SOURCE", "excel")
os.environ["LLM_PROVIDER"] = "extractive"          # tests never call Gemini (it is mocked where needed)
if not os.environ.get("SAMS_STORE_DIR"):
    import tempfile
    os.environ["SAMS_STORE_DIR"] = tempfile.mkdtemp(prefix="book-rag-test-store-")

import pytest

# The engine reads the catalog from a snapshot that the runtime sets per request
# (app/catalog_runtime.py). Engine-level tests use the Excel catalog as that snapshot.
ENGINE_TESTS = {"test_author_list.py", "test_book_app.py", "test_engine.py", "test_recency.py",
                "test_staged.py", "test_streamlit.py", "test_topic_list.py", "test_untagged.py"}
MODELS_DIR = os.environ.get("SAMS_MODELS_DIR", os.path.join(ROOT, "models"))
_HAS_MODELS = os.path.isdir(os.path.join(MODELS_DIR, "intfloat__multilingual-e5-small"))
_HAS_DATA = os.path.isfile(os.environ["SAMS_DATA_PATH"])


def pytest_ignore_collect(collection_path, config):
    # Engine tests need the local models and the catalog spreadsheet (see README).
    if collection_path.name in ENGINE_TESTS and not (_HAS_MODELS and _HAS_DATA):
        return True
    return None


# sams_rag.catalog reads the catalog at import time, so the snapshot must be in
# place before any test module imports the engine: set it while conftest loads.
if _HAS_MODELS and _HAS_DATA:
    os.environ.setdefault("SAMS_MODELS_DIR", MODELS_DIR)
    from app.data_sources import SNAPSHOT_INPUT, ExcelProvider
    SNAPSHOT_INPUT.set(ExcelProvider(os.environ["SAMS_DATA_PATH"]).fetch())
