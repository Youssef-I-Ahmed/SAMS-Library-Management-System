# Database Directory

The project uses **Prisma + PostgreSQL**.

- `../prisma/schema.prisma` is the application ORM schema and the primary source of truth for Prisma-managed tables and enums.
- `sql/postgres-extensions.sql` contains PostgreSQL-only protections/features that Prisma cannot fully express (partial indexes, checks, triggers, views). Apply it after the base Prisma migration.
- `reference/schema-v1-reference.sql` is a full SQL reference snapshot of Database Design v1. **Do not run it on top of Prisma migrations.**
- Database design/rules/specification documentation lives under `../docs/database/`.
