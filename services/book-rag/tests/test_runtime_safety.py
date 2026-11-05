import ast
import io
import logging
import os
from unittest.mock import patch
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.operational_logging import record_operation
from app.runtime_safety import database_host_allowed


class RuntimeSafetyTests(unittest.TestCase):
    def test_database_allowlist_is_fixed_not_arbitrary_private_network(self):
        with patch.dict(os.environ, {"BOOK_RAG_CONTAINER": "1"}):
            self.assertTrue(database_host_allowed("postgres", "5432"))
            for host, port in [("postgres", 5433), ("host.docker.internal", 5432),
                               ("192.168.1.2", 5432), ("8.8.8.8", 5432), ("example.com", 5432)]:
                self.assertFalse(database_host_allowed(host, port))
        with patch.dict(os.environ, {"BOOK_RAG_CONTAINER": "0"}):
            self.assertFalse(database_host_allowed("postgres", 5432))
            self.assertTrue(database_host_allowed("127.0.0.1", 5433))

    def test_container_entry_missing_credentials_fails_without_echo(self):
        result = subprocess.run([sys.executable, "-m", "app.container_entry"], input=b'{}\n',
                                cwd=ROOT, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 78)
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr.decode().strip(), "Required runtime credentials unavailable")

    def test_operational_log_never_serializes_payload(self):
        output = io.StringIO()
        logger = logging.getLogger("sams_api")
        handler = logging.StreamHandler(output)
        previous = logger.level
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)
        try:
            record_operation("ask_completed", cached={"question": "PRIVATE_CANARY", "filters": "PRIVATE_CANARY"})
            self.assertEqual(output.getvalue().strip(), '{"event":"ask_completed","cached":false}')
            self.assertNotIn("PRIVATE_CANARY", output.getvalue())
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous)

    def test_arbitrary_log_event_is_rejected(self):
        with self.assertRaises(ValueError):
            record_operation("PRIVATE_CANARY")

    def test_no_raw_question_log_or_exception_dump_in_entry_point(self):
        source = (ROOT / "app/main.py").read_text(encoding="utf-8")
        self.assertNotIn("QUERY_LOG", source)
        self.assertNotIn("queries.jsonl", source)
        self.assertNotIn("log.exception", source)
        for path in ROOT.rglob("*.py"):
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    def test_network_policy_allows_only_loopback_and_forces_offline(self):
        code = '''
from app.runtime_safety import install
import socket,os
install()
assert os.environ['HF_HUB_OFFLINE']=='1'
assert os.environ['TRANSFORMERS_OFFLINE']=='1'
assert socket.getaddrinfo('127.0.0.1',5433)
try: socket.getaddrinfo('example.invalid',443)
except OSError: pass
else: raise AssertionError('External DNS must fail before network access')
try: socket.socket().connect(('8.8.8.8',443))
except OSError: pass
else: raise AssertionError('External connection must be denied')
'''
        result = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True,
                                env={**os.environ, "LLM_PROVIDER": "extractive"}, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_model_loaders_require_local_files_and_no_dotenv(self):
        found = []
        for path in [ROOT / "app/local_models.py"]:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"SentenceTransformer", "CrossEncoder"}:
                    found.append(node)
                    self.assertTrue(any(k.arg == "local_files_only" and isinstance(k.value, ast.Constant) and k.value.value is True for k in node.keywords))
        self.assertEqual(len(found), 2)
        self.assertNotIn("load_dotenv", (ROOT / "sams_rag/config.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
