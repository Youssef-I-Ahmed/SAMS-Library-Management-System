#!/usr/bin/env python
"""Download a multilingual embedding model ONCE (needs access to huggingface.co) into ./models/<name> so the service
can run fully offline afterwards:

    pip install -r requirements-embeddings.txt
    python scripts/download_model.py [intfloat/multilingual-e5-small]
    export EMBEDDING_BACKEND=sentence-transformers EMBEDDING_MODEL_PATH=models/multilingual-e5-small EMBEDDING_LOCAL_ONLY=true
    python scripts/bootstrap.py          # re-embeds all records with the neural model
    python scripts/eval_semantic.py      # measures it on the real data and suggests the score floor
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "intfloat/multilingual-e5-small"
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("Install first: pip install -r requirements-embeddings.txt")
        return 2
    dest = ROOT / "models" / name.split("/")[-1]
    try:
        snapshot_download(repo_id=name, local_dir=str(dest))
    except Exception as e:  # noqa: BLE001
        print(f"DOWNLOAD FAILED ({type(e).__name__}): {str(e)[:300]}\nThis host cannot reach huggingface.co. Download the model on a machine that can "
              f"and copy the folder to {dest}.")
        return 1
    print("OK:", dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
