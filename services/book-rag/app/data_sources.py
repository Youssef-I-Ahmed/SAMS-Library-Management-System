"""Read-only catalog sources. PostgreSQL is authoritative for SAMS integration."""
from contextvars import ContextVar
from dataclasses import dataclass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import uuid
from .runtime_safety import database_host_allowed

import psycopg
from psycopg.rows import dict_row

CATALOG_COLUMNS = ["TITLE", "EDITORS", "SUBJECTS", "SUBJECT_CODES", "PUBLISHING_DATE", "PUBLISHERS",
                   "PUBLISHER_COUNTRIES", "EDITION_STATMENT", "REMAN_EDITION_STATMENT", "ISBN", "BOOK_CODE",
                   "CALL_NUM", "SECTION_NUM", "EXTENT", "DIMENSION", "NUM_OF_COPIES", "NUM_OF_VOLUMES",
                   "GENERAL_NOTE", "SERIAL_ADDRESSES", "COPY_GENERAL_CODE", "COPY_general_number", "COPY_other_number"]
TABLES = ["library_items", "book_details", "contributors", "item_contributors", "categories", "dewey_classifications"]
SNAPSHOT_INPUT = ContextVar("book_rag_snapshot_input", default=None)


class SourceUnavailable(RuntimeError):
    def __init__(self):
        super().__init__("Catalog source unavailable")


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate artifact key")
        value[key] = item
    return value


def load_legacy_map(path, expected_sha, expected_source_sha):
    try:
        data = Path(path).read_bytes()
        if len(data) > 4 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected_sha:
            raise ValueError()
        artifact = json.loads(data, object_pairs_hook=_unique)
        if set(artifact) != {"map", "sourceSha256"} or artifact["sourceSha256"] != expected_source_sha:
            raise ValueError()
        if not isinstance(artifact["map"], dict) or not 1 <= len(artifact["map"]) <= 50000:
            raise ValueError()
        result = {}
        for code, target in artifact["map"].items():
            if not isinstance(code, str) or not 1 <= len(code) <= 64 or re.search(r"[\s;/\\\x00-\x1f]", code) or ".." in code or code.startswith("sams:"):
                raise ValueError()
            result[code] = str(uuid.UUID(target))
        return result
    except Exception:
        raise SourceUnavailable() from None


def connection_parameters():
    try:
        host = os.environ["BOOK_RAG_PGHOST"]
        if not database_host_allowed(host, os.environ["BOOK_RAG_PGPORT"]):
            raise ValueError()
        return dict(host=host, port=int(os.environ["BOOK_RAG_PGPORT"]), dbname=os.environ["BOOK_RAG_PGDATABASE"],
                    user=os.environ["BOOK_RAG_PGUSER"], password=os.environ["BOOK_RAG_PGPASSWORD"], connect_timeout=3)
    except Exception:
        raise SourceUnavailable() from None


QUERY = """
SELECT li.id::text,li.title,li.call_number,li.language,li.publication_year,li.abstract_description,
       li.dewey_code_raw,bd.isbn,bd.publisher,bd.edition,
       CASE WHEN cat.is_active THEN cat.name END AS category,
       dc.code AS dewey_code,dc.name AS dewey_name,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('name',c.full_name,'role',ic.role::text)
                    ORDER BY ic.role,c.full_name,ic.contributor_id)
                 FROM public.item_contributors ic JOIN public.contributors c ON c.id=ic.contributor_id
                 WHERE ic.item_id=li.id),'[]'::jsonb) AS contributors
FROM public.library_items li JOIN public.book_details bd ON bd.item_id=li.id
LEFT JOIN public.categories cat ON cat.id=li.category_id
LEFT JOIN public.dewey_classifications dc ON dc.id=li.dewey_classification_id
WHERE li.type='BOOK' AND li.is_active ORDER BY li.id
"""


@dataclass(frozen=True)
class CatalogSnapshot:
    revision: str
    records: list
    item_count: int


def convert_rows(rows, mapping):
    """Exact codes are aliases; native UUID codes cover new books without a DB column."""
    reverse = {}
    for code, target in mapping.items():
        reverse.setdefault(target, []).append(code)
    records = []
    for row in rows:
        target = str(uuid.UUID(row["id"]))
        codes = sorted(reverse.get(target, [])) or ["sams:" + target]
        authors = list(dict.fromkeys(c["name"] for c in row.get("contributors", []) if c.get("name")))
        # These are actual catalog classification labels, not an invented Subjects relation.
        topics = list(dict.fromkeys(v for v in [row.get("category"), row.get("dewey_name")] if v))
        for code in codes:
            record = dict.fromkeys(CATALOG_COLUMNS)
            record.update(TITLE=row["title"], EDITORS=" | ".join(authors) or None, SUBJECTS=" | ".join(topics) or None,
                          SUBJECT_CODES=row.get("dewey_code_raw") or row.get("dewey_code"),
                          PUBLISHING_DATE=str(row["publication_year"]) if row.get("publication_year") else None,
                          PUBLISHERS=row.get("publisher"), EDITION_STATMENT=row.get("edition"), ISBN=row.get("isbn"),
                          BOOK_CODE=code, CALL_NUM=row.get("call_number"), GENERAL_NOTE=row.get("abstract_description"),
                          SAMS_LANGUAGE=row.get("language") if row.get("language") in ["ar", "en"] else None)
            # No physical-copy query/count or fabricated availability is present.
            records.append(record)
    # Include the actual selected relation values too: e.g. a contributor's role
    # can change while its flattened searchable name remains identical.
    canonical = json.dumps({"rows": rows, "records": records}, ensure_ascii=False,
                           sort_keys=True, separators=(",", ":")).encode()
    return CatalogSnapshot(hashlib.sha256(canonical).hexdigest(), records, len(rows))


class PostgresProvider:
    def __init__(self, parameters=None, mapping=None):
        self.parameters = parameters if parameters is not None else connection_parameters()
        self.mapping = mapping if mapping is not None else load_legacy_map(
            os.environ["BOOK_RAG_MAP_PATH"], os.environ["BOOK_RAG_MAP_SHA256"], os.environ["BOOK_RAG_SOURCE_SHA256"])

    def fetch(self):
        try:
            conn = psycopg.connect(**self.parameters, row_factory=dict_row)
            try:
                conn.read_only = True
                role = conn.execute("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()
                if not role or any(role.values()):
                    raise SourceUnavailable()
                if conn.execute("SHOW transaction_read_only").fetchone()["transaction_read_only"] != "on":
                    raise SourceUnavailable()
                # A metadata check protects against accidentally reusing a privileged login.
                for table in TABLES:
                    permission = conn.execute("SELECT has_table_privilege(current_user,%s,'SELECT') AS can_read, has_table_privilege(current_user,%s,'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write", ("public."+table, "public."+table)).fetchone()
                    if not permission["can_read"] or permission["can_write"]:
                        raise SourceUnavailable()
                rows = conn.execute(QUERY).fetchall()
                if not rows or len(rows) > 10000:
                    raise SourceUnavailable()
                return convert_rows(rows, self.mapping)
            finally:
                conn.rollback()
                conn.close()
        except Exception:
            raise SourceUnavailable() from None


class ExcelProvider:
    """Explicit independent legacy source, never an automatic PostgreSQL fallback."""
    def __init__(self, path):
        self.path = path

    def fetch(self):
        import pandas as pd
        data = pd.read_excel(self.path, dtype=str).astype(object)
        data = data.where(data.notna(), None)
        records = data.to_dict("records")
        return CatalogSnapshot(hashlib.sha256(Path(self.path).read_bytes()).hexdigest(), records, len(records))


def snapshot_frame():
    import pandas as pd
    snapshot = SNAPSHOT_INPUT.get()
    if snapshot is None:
        raise SourceUnavailable()
    return pd.DataFrame(snapshot.records, columns=CATALOG_COLUMNS+["SAMS_LANGUAGE"], dtype=object)
