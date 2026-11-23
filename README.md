# SAMS Library Management System

Library system for SAMS: a React web app, an Express/Prisma API on PostgreSQL,
and a set of independent AI services (RAGs and models), each in its own folder.

## Repository layout

```
apps/
  web/                  React + Vite front end (port 5173)
  api/                  Express + Prisma API, the only entry point for the web app (port 4000)
services/               one folder per AI model / RAG, each runs on its own (see services/README.md)
  book-rag/             book search and Q&A                       (port 8001)
  research-rag/         projects / theses search and Q&A          (port 8002)
  subject-classifier/   subject suggestion from a title           (port 8003)
  book-clustering/      topic cluster of a book                   (port 8004)
ml/                     training code, notebooks and results (not part of the running system)
database/
  prisma/               schema.prisma, migrations, seed scripts
  sql/  reference/      PostgreSQL extras and the v1 reference schema
packages/               shared JS + UI design tokens
data/                   local data (raw/ and processed/ are not committed)
scripts/
  dev/                  npm run setup / npm run dev
  migration/            data import / migration scripts and their contracts
  archive/              old per-sprint smoke scripts, kept for reference
docs/                   architecture, database, design, requirements, guides
  archive/              sprint reports, manifests and release notes
```

## Run locally

Requirements: Node 20+, Docker Desktop (PostgreSQL only), Python 3.12 or 3.13.

```bash
npm run setup      # .env with generated secrets, npm install, PostgreSQL, migrations, one .venv per service
npm run db:seed    # first time only (or db:seed:frontend for demo data)
npm run dev        # starts the AI services that are enabled in .env, the API and the web app
```

Open http://localhost:5173. `npm run dev -- --only web,api` starts just those parts;
`npm run setup -- --only subject-classifier` (re)installs one service.

Which AI services start is decided by `.env`: a service runs when its URL is set.

| Service | Enable in `.env` | Also needs |
| --- | --- | --- |
| subject-classifier, book-clustering | `SUBJECT_CLASSIFIER_URL`, `BOOK_CLUSTERING_URL` (on by default) | nothing, the models are in the repo |
| research-rag | `RESEARCH_RAG_URL=http://127.0.0.1:8002` | `services/research-rag/data/raw/Project.xlsx`, then `python scripts/bootstrap.py` in that folder |
| book-rag | `AI_ENABLED=true`, `RAG_URL=http://127.0.0.1:8001` and the `AI_*` map settings | local models and `services/book-rag/.env` (see its README) |

When a service is off or down, the rest of the system keeps working. The old
Docker-based Book RAG launcher (`scripts/Start-Local.ps1`) still works for the full demo.

## AI endpoints (API)

- `POST /api/v1/ai/ask`, `/jobs/:id`, `/books/:code`, `/session/reset` — book assistant (book-rag)
- `POST /api/v1/ai/research/ask` — projects search; ranked by research-rag when enabled,
  local metadata search otherwise. Results are always SAMS catalog rows.
- `POST /api/v1/ai/classify-subject` `{ title }` — staff only, subject suggestion
- `POST /api/v1/ai/book-cluster` `{ title, subjects? }` — staff only, topic cluster
- `GET /api/v1/ai/services` — staff only, status of the two cataloguing models

## Tests

```bash
npm test              # API (Vitest) + web unit tests
npm run test:api      # API only
npm run test:web      # web unit tests only
```

Each Python service has its own tests: `python -m pytest -q` inside its folder (with its `.venv`).

## Data and privacy

The projects/theses data contains student names. Keep everything under
`data/raw/` and `data/processed/` on your machine only; those folders are
git-ignored.
