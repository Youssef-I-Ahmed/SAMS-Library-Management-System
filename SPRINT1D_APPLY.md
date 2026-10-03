# SAMS Sprint 1D — Categories + Dewey

## Added APIs

```text
GET   /api/v1/catalog-master/categories
POST  /api/v1/catalog-master/categories
PATCH /api/v1/catalog-master/categories/:id

GET   /api/v1/catalog-master/dewey
POST  /api/v1/catalog-master/dewey
PATCH /api/v1/catalog-master/dewey/:id
```

## Permissions

- STUDENT: read only
- LIBRARIAN: read/create/update
- MANAGEMENT: read only

## Important rules

### Categories
- Soft activation/deactivation through `isActive`
- No hard delete

### Dewey
- Code remains text, not numeric
- Supports parent/child hierarchy
- Duplicate codes are rejected by the database
- Self-parent and hierarchy cycles are rejected

This matters because real library classification values can contain formatting that should never be coerced to a number.

## Apply

Copy the patch over the project root.

No Prisma migration and no new package are required.

Run:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1d-catalog-master-smoke.ps1
```

Expected:

```text
Sprint 1D smoke test PASSED.
```

## Next

Sprint 1E:
- Sprint-wide integration smoke test
- Cleanup
- documentation update
- final commit/tag for Sprint 1
