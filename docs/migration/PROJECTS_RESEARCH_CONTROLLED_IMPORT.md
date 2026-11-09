# Projects and research controlled local import

This Sprint 10D.6 import promotes the approved 3,983 academic-work identities into the existing catalog and circulation model. It is intentionally locked to the local Docker database at `localhost:5433/sams_library` and refuses production mode.

## Canonical result

- One unified `ACADEMIC_WORK` item type, labelled **Graduation Projects & Theses** in English and **مشروعات تخرج ورسائل علمية** in Arabic.
- 3,983 catalog items and 3,988 verified source copy rows.
- Student/researcher and supervisor names are authenticated metadata, as approved on 2026-11-09.
- Eleven normalized subjects with 3,951 item-subject links.
- Historical item and copy identities are source-namespaced so numeric book codes cannot collide with academic-work codes.
- Four year conflicts use the curated `Project.xlsx` value and remain recorded for librarian review.
- Two project-only subject exceptions are retained by taking the union of the two approved sources.

No PDF, full text, summary or document body is imported.

## Runbook

From the repository root in PowerShell:

```powershell
node scripts/migration/import-projects-research.mjs --plan
node --test scripts/migration/projects-research-transform.test.mjs
```

Create and verify a recoverable backup before the migration:

```powershell
.\scripts\migration\backup-sams-before-academic-works.ps1
```

Then deploy the checked-in migrations, regenerate the client and run the controlled import:

```powershell
npx prisma migrate deploy --schema=prisma/schema.prisma
npm run db:generate
node scripts/migration/import-projects-research.mjs --apply --branch-code=MAIN
node scripts/migration/import-projects-research.mjs --verify --branch-code=MAIN
```

On a new local database, follow the database setup runbook for the custom PostgreSQL extensions and seed the `MAIN` branch before importing. On an already initialized database, use the migration status to confirm that the tracked migrations are current.

Apply uses one serializable transaction and skips existing rows. Identity collisions or inconsistent totals roll back the entire transaction. After import, apply `scripts/migration/enable-main-academic-work-circulation.sql` to the local demo database if the `MAIN` academic-work policy is missing.

## Acceptance checks

1. Search the student catalog by academic-work title, participant, supervisor, subject and legacy code.
2. Filter by the unified academic-work type, year, language, category, branch and availability.
3. Open an item and verify metadata, participants, legacy code, subjects and real copy availability.
4. Reserve an available academic work, borrow it as the librarian and return it.
5. Add a new academic-work record through the application only after the staff form supports the unified type; PostgreSQL is authoritative after import.

## Research assistant reader

The migration creates `sams_research.catalog` and denies access to `PUBLIC`. Provision `sams_research_rag_ro` as a dedicated login with no elevated attributes or role memberships. Grant it database `CONNECT`, `USAGE` on `sams_research` and `SELECT` on `sams_research.catalog`. Keep it out of the application tables and set its default transactions to read only. Set the password interactively through the database administrator's credential workflow, then inject `RESEARCH_RAG_DATABASE_URL` into Express at launch.

The assistant reads that view in a read-only transaction and refreshes its in-memory index every five seconds. The authenticated API provides only approved catalogue metadata. It accepts questions and uses fixed SQL without model or credential access.
