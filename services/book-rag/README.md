# Controlled PostgreSQL Book RAG — Sprint 10D.3 / Linux runtime

Original `RAG/sams-library-search` remains immutable (34 files pinned in SOURCE_PROVENANCE.json). This controlled copy contains no workbook/model/index copies. The opt-in Linux Docker runtime requires no change to Windows security policy. Ordinary SAMS and the Student flag remain disabled by default. requirements-source.txt is provenance, not an install instruction; requirements-linux.lock pins all Linux CPython 3.12 dependencies and wheel hashes, with CPU-only PyTorch.

PostgresProvider reads active BOOK/BookDetails and the six allowed catalog tables with the restricted login. ExcelProvider is explicit legacy-only, never a PostgreSQL-error fallback. Canonical joined-content fingerprints drive 5s background polling, isolated module snapshots and content-keyed embeddings. Model/algorithm retrieval settings and prompts are preserved; models are mandatory local CPU assets, with no network/download or silent downgrade. Operational logs exclude payloads and secrets. See .env.example for names only; decrypted credentials must remain process-local.

Gateway UUID-native codes require explicit server AI_BOOK_IDENTITY_MODE=postgres_uuid; legacy is the default. Codes use sams:<UUID> only for new items with no legacy alias, and all targets still require the existing batched active BOOK/BookDetails DB validation. No title/ISBN/description identity matching. No RAG availability/reservation authority.

## Build and test locally

```powershell
docker build --tag sams-book-rag:10d3 services/book-rag
& services/book-rag/Test-LiveBookRag.ps1 `
  -CredentialPath 'D:\Digi\SAMS_Library_System_Root\SAMS_Book_RAG_Runtime_10D3\credentials\book-rag-postgres.clixml' `
  -ModelsPath 'D:\Digi\SAMS_Library_System_Root\SAMS_Book_RAG_Runtime_10D3\models' `
  -EvidencePath 'D:\Digi\SAMS_Library_System_Root\sprint10d3-review-local'
```

The opt-in live harness uses existing local Node/browser tools and an active Student; it installs nothing. The main catalog is read with the supplied restricted account. Refresh/fault writes run only in a separate synthetic tmpfs PostgreSQL container. That fixture's trust authentication is confined to its own internal network, without a published DB port or production data. Express uses its existing credential with default_transaction_read_only=on. No users or main catalog records are created. Test containers stop afterward; the main vector store is retained.

For foreground FastAPI, supply RAG_SERVICE_KEY securely in the calling server environment (32+ printable characters), then:

```powershell
& services/book-rag/Start-BookRag.ps1 `
  -CredentialPath 'D:\Digi\SAMS_Library_System_Root\SAMS_Book_RAG_Runtime_10D3\credentials\book-rag-postgres.clixml' `
  -ModelsPath 'D:\Digi\SAMS_Library_System_Root\SAMS_Book_RAG_Runtime_10D3\models'
```

The launcher creates only labeled resources, attaches sams-postgres to an additional internal bridge with fixed alias postgres, and publishes FastAPI on 127.0.0.1:18000. Existing PostgreSQL network/data remain intact. compose.yaml has an opt-in book-rag profile and equivalent isolation; secrets still require stdin, so detached compose up alone is insufficient. No public/LAN DB host or host.docker.internal exception exists.

Docker 29 does not publish ports on an internal-only network. A separate stdlib TCP ingress container therefore publishes the loopback port and relays bytes only to the fixed Book RAG container/8000 within its internal subnet. FastAPI remains attached to the internal network only. Ingress has no configured credentials, model/store mounts, HTTP parsing or payload logs; opaque headers transit memory only. It is bounded to 32 connections, 64KiB stream buffers and 30s idle reads. This is transport plumbing, not another API or a browser endpoint.

The image contains code/dependencies only. Models and map are read-only mounts, passage vectors use a separate named Docker volume, and the root filesystem is read-only/non-root with dropped capabilities. Password/key enter PID 1 on stdin; they are absent from image layers, build arguments, Docker configuration environment, argv, repository and evidence. Never capture stdin or enable command tracing.

Express must explicitly enable AI_ENABLED, use loopback RAG_URL and the same server-only key/fingerprints, and select postgres_uuid identity mode. Restart Express with a fresh AI_SERVICE_EPOCH whenever FastAPI restarts. This retires old public handles without replaying uncertain ask/reset dispatches. React uses Express only; VITE_AI_ASSISTANT_ENABLED remains absent/false by default. The live harness configures this in memory.

Canonical joined-content fingerprints detect relation/detail changes without updatedAt. Changed snapshots publish atomically; no per-question rebuild. DB/refresh failure fails readiness, ask and cards closed. The store requires 5GiB free. NPZ writes use temporary-file/atomic replacement; invalid cache fails explicitly without deletion. Restart restores vectors and rebuilds in-memory FAISS/BM25. MODEL_PROVENANCE.json pins local model files; local_files_only, offline flags and an internal Docker network prohibit download/provider fallback.

The source projection itself participates in the fingerprint, so a role-only contributor edit also invalidates the snapshot even when the flattened searchable name stays the same. Unchanged passage text still reuses its vectors. The 5s poll is not a universal indexing SLA: local fixture visibility is measured in the sprint report; bulk changes/first builds take longer and fail closed when the observed-data stale guard is exceeded.

See [the sprint report](../../docs/planning/SPRINT_10D3_REAL_RUNTIME.md) for actual results, commands, limitations and exact file inventory. No model, prompt, retrieval/evaluation parameter, paid service, schema migration or persistent production-data write is part of this runtime.
