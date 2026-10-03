# Sprint 0 Checklist

## Local execution — Windows PowerShell

### Project + Prisma
1. `Copy-Item .env.example .env`
2. `npm install`
3. `npm run db:validate`
4. `npm run db:generate`

### PostgreSQL
5. Confirm either Docker Desktop is running (`docker --version`) **or** native PostgreSQL is available.
6. Docker path: `docker compose up -d`
7. `npm run db:migrate -- --name init`
8. Apply `database/sql/postgres-extensions.sql` to the same PostgreSQL database.
9. `npm run db:seed`

### Verification
10. `npm test`
11. `npm run dev:api`
12. `npm run dev:web`
13. Verify `http://localhost:4000/api/v1/health`.
14. Commit: `chore: initialize SAMS library project`.

## Sprint 0 exit criteria
- Web starts.
- API starts.
- PostgreSQL connection succeeds.
- `npm run db:validate` succeeds.
- Prisma Client generation succeeds.
- Prisma migration succeeds.
- Role seed succeeds.
- Basic API test passes.
- Health endpoint reports `database: connected`.
