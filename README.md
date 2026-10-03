# SAMS Library Management System

Root repository for the SAMS Library Management System. This repository combines the Sprint 0 application starter, the approved database design, UI/UX documentation, planning documents, brand assets, and recovered legacy datasets.

## Stack

- React + Vite
- Node.js + Express
- PostgreSQL 16+
- Prisma
- npm workspaces
- Vitest + Supertest

## Repository Structure

```text
.
├── apps/
│   ├── api/                 # Express backend
│   └── web/                 # React/Vite frontend + public brand assets
├── packages/
│   ├── shared/              # Shared code/contracts
│   └── ui/                  # Reusable UI package + design tokens
├── prisma/
│   ├── schema.prisma        # Prisma source of truth
│   ├── seed.js
│   └── migrations/
├── database/
│   ├── sql/                 # PostgreSQL-only extensions used with Prisma
│   └── reference/           # Full SQL reference snapshot (not a Prisma migration)
├── data/
│   ├── raw/                 # Legacy/recovered source datasets
│   └── processed/           # Clean/import-ready datasets
├── docs/                    # Requirements, planning, DB, architecture, UI/UX
├── scripts/                 # Future data/import/admin scripts
├── .env.example
├── docker-compose.yml
└── package.json
```

## Requirements

- Node.js 20+
- npm
- Docker Desktop (recommended) or PostgreSQL 16+

## Sprint 0 Quick Start — Windows PowerShell

### 1. Prepare environment

```powershell
Copy-Item .env.example .env
npm install
npm run db:validate
npm run db:generate
```

`db:validate` checks the Prisma schema before any database migration is attempted.

### 2. Start PostgreSQL

**Option A — Docker Desktop (recommended)**

First verify Docker is installed and running:

```powershell
docker --version
docker compose version
```

Then:

```powershell
docker compose up -d
```

If PowerShell says `docker is not recognized`, install/start Docker Desktop, then close and reopen PowerShell. The `docker compose` command will not work until the Docker CLI is available.

**Option B — Native PostgreSQL**

If PostgreSQL 16+ is installed locally, create a database named `sams_library` and make sure `.env` matches its username/password/port. Docker is not required in this mode.

### 3. Create schema and seed baseline data

After PostgreSQL is running:

```powershell
npm run db:migrate -- --name init
npm run db:seed
npm test
```

Then run the API and web app in separate terminals:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/api/v1/health`

Expected health response:

```json
{
  "status": "ok",
  "service": "sams-api",
  "database": "connected"
}
```

## Sprint 0 Troubleshooting

- **`docker` is not recognized:** Docker Desktop / Docker CLI is not installed or not available in the current terminal PATH. Install/start Docker Desktop and reopen PowerShell, or use native PostgreSQL instead.
- **Prisma P1012 relation validation:** run `npm run db:validate`. The current schema includes the required inverse `Branch.circulationPolicies` relation.
- **`@prisma/client did not initialize yet`:** this is a downstream symptom of `prisma generate` failing. Fix schema validation first, then run `npm run db:generate` again.
- **Seed warning about ESM/module type:** the repository root declares `"type": "module"` so `prisma/seed.js` is parsed consistently as ESM.
- **npm audit warnings:** do not use `npm audit fix --force` blindly. Run `npm audit` first and review which direct/transitive packages are affected before accepting breaking upgrades.

See `docs/planning/sprint-0-troubleshooting.md` for the current failure chain and recovery order.

## Database Workflow

`prisma/schema.prisma` is the Prisma ORM schema used by the application. Some PostgreSQL guarantees cannot be fully represented in Prisma, so after the initial Prisma migration apply:

`database/sql/postgres-extensions.sql`

The file `database/reference/schema-v1-reference.sql` is a complete SQL reference snapshot of Database Design v1. It is documentation/reference and should **not** be executed on top of a Prisma-created schema.

See `docs/database/prisma-implementation-notes.md` for details.

## Data Safety

Files in `data/raw/` are recovered/legacy inputs. Keep them unchanged and perform cleaning/transformation into `data/processed/` using reproducible scripts. Do not make the running application depend directly on the raw recovery CSVs.

## Sprint 0

Use `docs/planning/sprint-0-checklist.md` as the execution checklist.

Recommended first commit:

```text
chore: initialize SAMS library project
```
