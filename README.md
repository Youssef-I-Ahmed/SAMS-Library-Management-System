# SAMS Library Management System

Library system for SAMS: a React web app, an Express/Prisma API on PostgreSQL,
and a set of independent AI services (RAGs and models), each in its own folder.

## Repository layout

```
apps/
  web/                  React + Vite front end (port 5173)
  api/                  Express + Prisma API, the only entry point for the web app (port 4000)
services/               one folder per AI model / RAG, each runs on its own
  book-rag/             book search and Q&A
database/
  prisma/               schema.prisma, migrations, seed scripts
  sql/  reference/      PostgreSQL extras and the v1 reference schema
packages/               shared JS + UI design tokens
data/                   local data (raw/ and processed/ are not committed)
scripts/
  migration/            data import / migration scripts and their contracts
  archive/              old per-sprint smoke scripts, kept for reference
docs/                   architecture, database, design, requirements, guides
  archive/              sprint reports, manifests and release notes
```

Planned services (being moved in, see the refactor plan): `research-rag`,
`subject-classifier`, `book-clustering`.

## Run locally

Requirements: Node 20+, Docker (for PostgreSQL), Python 3.11+ for the AI services.

```bash
cp .env.example .env            # then set AUTH_TOKEN_SECRET
docker compose up -d            # PostgreSQL on localhost:5433
npm install
npm run db:generate
npm run db:migrate
npm run db:seed                 # or db:seed:frontend for demo data
npm run dev:api                 # http://localhost:4000
npm run dev:web                 # http://localhost:5173
```

AI features are off by default (`AI_ENABLED=false`). The current full local
demo with the Book RAG still uses `scripts/Start-Local.ps1`; a single
`npm run dev` that starts every part is the next refactor step.

## Tests

```bash
npm test              # API (Vitest) + web unit tests
npm run test:api      # API only
npm run test:web      # web unit tests only
```

## Data and privacy

The projects/theses data contains student names. Keep everything under
`data/raw/` and `data/processed/` on your machine only; those folders are
git-ignored.
