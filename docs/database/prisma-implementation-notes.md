# SAMS Database Implementation Notes v1

This package converts the approved Database Design v1 into an implementation baseline for PostgreSQL + Prisma.

## Files

- `../../prisma/schema.prisma` — Prisma ORM model and source of truth for ORM-managed tables/enums.
- `../../database/reference/schema-v1-reference.sql` — PostgreSQL-ready reference snapshot of the full v1 schema. Do not run it on top of Prisma migrations.
- `../../database/sql/postgres-extensions.sql` — SQL to preserve/apply with Prisma migrations because Prisma cannot fully express partial indexes, cross-table validation triggers, and database views.

## Important Prisma Limitation

`../../prisma/schema.prisma` intentionally represents the relational model, but some database guarantees live only in SQL:

- Partial unique indexes:
  - one active/pending reservation per student+item
  - one active reservation per allocated copy
  - one active borrowing per physical copy
  - one open library visit per student
- CHECK constraints.
- Cross-table consistency triggers.
- Reporting views.

If Prisma Migrate is used, keep those rules in a custom SQL migration after the Prisma-generated migration.

## Recommended Migration Workflow

1. Create a PostgreSQL database.
2. Set `DATABASE_URL`.
3. Run the initial Prisma migration for ORM-managed tables/enums.
4. Apply the custom SQL from `../../database/sql/postgres-extensions.sql`.
5. Seed roles (`STUDENT`, `LIBRARIAN`, `MANAGEMENT`).
6. Run integration tests for reservation, borrowing, return, visit, and race-condition scenarios.

## Concurrency

The schema-level protections are not enough on their own. The Node.js service should still use explicit transactions and row locks for circulation operations.

For reservation allocation, use a transaction and a query equivalent to:

```sql
SELECT id
FROM physical_copies
WHERE item_id = $1
  AND branch_id = $2
  AND status = 'AVAILABLE'
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Then create/update the reservation and copy status in the same transaction.

For borrowing/return, lock the target copy/borrowing row and update all affected records before COMMIT.

## Before Production

The following are still TBC with the university:

- Actual SSO provider and claims.
- Reservation duration.
- Maximum active loans/reservations.
- Borrowing period by item type/branch.
- Whether theses/projects are borrowable or view-only.
- Branches included in Phase 1.
- Student database access method.
- Exact legacy call-number conventions.

These should change policy/configuration, not the core schema.
