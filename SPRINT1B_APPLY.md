# SAMS Sprint 1B — Master Data APIs

## What this adds

Authenticated APIs for:

- Faculties
- Departments
- Branches

Base path:

```text
/api/v1/master-data
```

## Permissions

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---|---|---|
| Read Faculties | Yes | Yes | Yes |
| Read Departments | Yes | Yes | Yes |
| Read Branches | Yes | Yes | Yes |
| Create/Update Faculties | No | Yes | No |
| Create/Update Departments | No | Yes | No |
| Create/Update Branches | No | Yes | No |

Management is intentionally read-only at this stage.

## Endpoints

```text
GET   /api/v1/master-data/faculties
POST  /api/v1/master-data/faculties
PATCH /api/v1/master-data/faculties/:id

GET   /api/v1/master-data/departments
POST  /api/v1/master-data/departments
PATCH /api/v1/master-data/departments/:id

GET   /api/v1/master-data/branches
POST  /api/v1/master-data/branches
PATCH /api/v1/master-data/branches/:id
```

Query options:

```text
?includeInactive=true
?facultyId=<uuid>
```

## No migration required

This checkpoint uses the existing Sprint 0 database schema.

## Apply

Copy this patch over the project root.

Then, with the API running:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1b-master-data-smoke.ps1
```

Expected final line:

```text
Sprint 1B smoke test PASSED.
```

## Important design choices

- No hard delete: `isActive` is used.
- Duplicate faculty/branch codes return HTTP 409.
- Departments cannot be created under inactive faculties.
- Branch updates use the existing `version` field for optimistic concurrency.
