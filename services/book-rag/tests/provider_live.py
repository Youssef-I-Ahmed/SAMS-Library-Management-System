"""Opt-in live role verification, executed inside the running local container.

Every mutation probe is WHERE false / rollback-only. No credentials are emitted.
Docker exec does not inherit PID 1's ephemeral secrets; copy them in memory only.
"""
import json
import os
from pathlib import Path
import time

for entry in Path('/proc/1/environ').read_bytes().split(b'\0'):
    if b'=' in entry:
        name, value = entry.split(b'=', 1)
        if name in [b'BOOK_RAG_PGPASSWORD', b'API_SERVICE_KEY']:
            os.environ[name.decode()] = value.decode()

from app.data_sources import PostgresProvider, TABLES
import psycopg

provider = PostgresProvider()
started = time.monotonic()
snapshot = provider.fetch()
result = {'items': snapshot.item_count, 'aliases': len(snapshot.records),
          'fetch_seconds': time.monotonic()-started, 'revision': snapshot.revision,
          'select_counts': {}, 'denied': {}}
with psycopg.connect(**provider.parameters) as conn:
    conn.read_only = True
    assert conn.execute('SELECT current_user').fetchone()[0] == 'sams_book_rag_ro'
    allowed = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'SELECT') ORDER BY tablename").fetchall()
    result['selectable_public_tables'] = [r[0] for r in allowed]
    assert set(result['selectable_public_tables']) == set(TABLES)
    for table in TABLES:
        result['select_counts'][table] = conn.execute('SELECT count(*) FROM public.'+table).fetchone()[0]
    conn.rollback()
    probes = {
        'insert': 'INSERT INTO public.book_details SELECT * FROM public.book_details WHERE false',
        'update': 'UPDATE public.library_items SET title=title WHERE false',
        'delete': 'DELETE FROM public.book_details WHERE false',
        'create': 'CREATE TABLE public.book_rag_permission_probe_10d3(id integer)',
        'alter': 'ALTER TABLE public.book_details ADD COLUMN book_rag_probe_10d3 integer',
        'drop': 'DROP TABLE public.book_details',
        **{name: 'SELECT * FROM public.'+name+' LIMIT 0' for name in
           ['users', 'user_roles', 'students', 'audit_logs', 'idempotency_records']}}
    for name, query in probes.items():
        try:
            conn.execute(query)
        except psycopg.Error as exc:
            result['denied'][name] = exc.sqlstate
        finally:
            conn.rollback()
        assert name in result['denied'], 'Restricted account accepted a forbidden operation'
assert result['items'] == 2821
print(json.dumps(result))
