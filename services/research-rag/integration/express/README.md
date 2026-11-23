# Reference Express gateway + contract tests (NOT the software team's backend)

Purpose: prove the agreed contract (`docs/INTEGRATION.md`) with real HTTP, real PostgreSQL and real Prisma writes:

```
node:test ──HTTP──> Express gateway (login → app JWT → RBAC) ──service JWT──> Python RAG service (RAG_MODE=integrated)
                          │ Prisma 7 (adapter-pg)                                   │ read-only role
                          └────────────────> PostgreSQL <── view rag_projects_v ────┘
```
Run everything with one command (needs node ≥ 22, `pip install -r requirements-dev.txt`, and the private dataset):
```bash
python scripts/run_node_integration.py
```
It starts a disposable PostgreSQL, loads the real dataset into Prisma-style tables, starts the Python service, runs `npm install`,
`prisma generate`, then `node --test` (11 tests: auth/RBAC, complete supervisor & student lists vs the Excel oracle, title/record detail,
safe short/nonsense queries, `/ask` retrieval-only, create→edit→delete through Prisma with index sync, full sync).

Limits (honest): `schema.sql` mirrors `prisma/schema.prisma` by hand because `prisma migrate/db push` need the schema-engine binary from
binaries.prisma.sh (blocked here); client generation works without it. The team's real schema, React/Vite client and production
PostgreSQL were not available. Copy the **ideas** (token minting, relay, sync-after-commit), not necessarily this code.
