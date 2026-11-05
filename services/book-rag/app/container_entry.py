"""Receive ephemeral secrets on stdin, never Docker image/configuration or argv."""
import json
import os
import sys


def main():
    try:
        raw = sys.stdin.buffer.readline(8193)
        secrets = json.loads(raw)
        if len(raw) > 8192 or set(secrets) != {"BOOK_RAG_PGPASSWORD", "API_SERVICE_KEY"}:
            raise ValueError()
        if any(not isinstance(v, str) or not v or len(v) > 4096 or "\x00" in v for v in secrets.values()):
            raise ValueError()
        if len(secrets["API_SERVICE_KEY"]) < 32:
            raise ValueError()
        os.environ.update(secrets)
        del raw, secrets
    except Exception:
        print("Required runtime credentials unavailable", file=sys.stderr)
        return 78
    os.execvp(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                             "--host", "0.0.0.0", "--port", "8000", "--no-access-log"])


if __name__ == "__main__":
    sys.exit(main())
