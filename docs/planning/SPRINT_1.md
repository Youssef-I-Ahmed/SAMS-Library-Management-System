# SAMS Library System — Sprint 1

## Sprint 1: Identity & Master Data

**Status: COMPLETE ✅**

Sprint 1 establishes the system's identity, authorization, university master data, student synchronization boundary, and catalog master data required before building the actual catalog and inventory workflows.

---

## Sprint 1A — Development Authentication + RBAC Foundation

### Scope

Sprint 1A introduced the development authentication layer and the internal RBAC foundation without changing the existing Sprint 0 database schema, migrations, Docker configuration, or database port setup.

### Authentication

Development endpoints:

```text
POST /api/v1/auth/dev-login
GET  /api/v1/auth/me
```

Development users:

```text
student@sams.dev
librarian@sams.dev
management@sams.dev
```

Authentication behavior:

- Development login issues a JWT access token.
- `/api/v1/auth/me` returns the authenticated user profile and roles.
- `authenticate` middleware validates the Bearer token.
- `authorize(...)` middleware enforces role-based permissions.
- The development login endpoint is disabled when `NODE_ENV=production`.
- Production University SSO can replace the external identity verification step later without changing the internal User/RBAC model.

Environment variables:

```env
AUTH_TOKEN_SECRET="<private-development-secret>"
AUTH_TOKEN_EXPIRES_IN="8h"
DEV_AUTH_ENABLED="true"
```

The real secret belongs only in `.env`; `.env.example` should contain a safe placeholder.

### Roles

```text
STUDENT
LIBRARIAN
MANAGEMENT
```

---

## Sprint 1B — University Master Data APIs

### Scope

Authenticated master-data APIs were added for:

- Faculties
- Departments
- Branches

Base path:

```text
/api/v1/master-data
```

### Endpoints

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

### Permissions

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---:|---:|---:|
| Read Faculties | Yes | Yes | Yes |
| Read Departments | Yes | Yes | Yes |
| Read Branches | Yes | Yes | Yes |
| Create/Update Faculties | No | Yes | No |
| Create/Update Departments | No | Yes | No |
| Create/Update Branches | No | Yes | No |

Management is intentionally read-only at this stage.

### Important Rules

- No hard delete for master data; `isActive` is used.
- Duplicate unique values return HTTP `409`.
- Departments cannot be created under inactive faculties.
- Branch updates use the existing `version` field for optimistic concurrency control.

---

## Sprint 1C — Students Import / Sync Adapter

### Scope

Sprint 1C introduced a stable internal synchronization boundary for student data. It works now with JSON/CSV and can later be reused by a University Student DB/API adapter.

### Endpoints

```text
GET  /api/v1/students
GET  /api/v1/students/:studentId
POST /api/v1/students/import
```

### Permissions

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---:|---:|---:|
| Browse/Search Students | No | Yes | Yes |
| Student Detail | No | Yes | Yes |
| Import / Sync | No | Yes | No |

Students continue to access their own identity through:

```text
GET /api/v1/auth/me
```

### Sync Rules

- New `studentId` → create `User` + `Student`.
- Existing `studentId` → update the linked records instead of duplicating them.
- `STUDENT` role is attached automatically.
- Faculty and department must already exist.
- Department must belong to the supplied faculty.
- Duplicate university-email conflicts are rejected.
- Batch imports run inside one database transaction.
- Import does not silently invent university master data.

### CSV Adapter

Template:

```text
data/templates/students-import-template.csv
```

Importer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-students-csv.ps1 -Path .\data\templates\students-import-template.csv
```

Do not import real university student data until the field mapping, access method, and university rules are confirmed.

### Future Integration Boundary

```text
University Student DB / API
        ↓
UniversityStudentProvider
        ↓
normalize records
        ↓
importStudents(...)
```

This keeps borrowing, reservations, visits, and student lookup independent from the external university data source.

---

## Sprint 1D — Categories + Dewey Master Data

### Scope

Catalog master-data APIs were added for:

- Categories
- Dewey classifications

Base path:

```text
/api/v1/catalog-master
```

### Endpoints

```text
GET   /api/v1/catalog-master/categories
POST  /api/v1/catalog-master/categories
PATCH /api/v1/catalog-master/categories/:id

GET   /api/v1/catalog-master/dewey
POST  /api/v1/catalog-master/dewey
PATCH /api/v1/catalog-master/dewey/:id
```

### Permissions

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---:|---:|---:|
| Read Categories | Yes | Yes | Yes |
| Read Dewey | Yes | Yes | Yes |
| Create/Update Categories | No | Yes | No |
| Create/Update Dewey | No | Yes | No |

### Category Rules

- Soft activation/deactivation through `isActive`.
- No hard delete.

### Dewey Rules

- Dewey code is stored as **text**, never numeric.
- Parent/child hierarchy is supported.
- Duplicate codes are rejected by the database.
- A classification cannot be its own parent.
- Hierarchy cycles are rejected.

Keeping Dewey codes as text preserves formatting and leading zeroes such as `004`.

---

## Sprint 1E — Full Integration, Cleanup & Closeout

### Full Verification

The completed Sprint 1 was verified using:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1-full-smoke.ps1
```

The full integration smoke test verified:

```text
Authentication / JWT / RBAC
        ↓
Faculties / Departments / Branches
        ↓
Students Import / Sync
        ↓
Categories / Dewey
```

Expected successful completion:

```text
Sprint 1 FULL integration smoke PASSED.
```

### Smoke-Test Data Cleanup

Command:

```powershell
node .\scripts\cleanup-sprint1-smoke-data.js
```

The cleanup targets only known Sprint 1 smoke-test records such as:

```text
SYNC-*
Sprint1B Faculty *
Sprint1B Department
Sprint1B Branch *
Sprint1D Category *
DEV-* Dewey smoke classifications
```

Permanent development seed data is preserved:

```text
student@sams.dev
librarian@sams.dev
management@sams.dev

DEV Faculty
DEV Department
MAIN branch
```

### Persistent Seed Verification

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1-verify-dev-data.ps1
```

Expected result:

```text
Persistent Sprint 1 development seed verified.
```

---

## Sprint 1 Final Deliverable

At the end of Sprint 1, the backend provides:

```text
Identity
├── Development authentication adapter
├── JWT authentication
├── Authenticated user profile
└── Role-based authorization

University Master Data
├── Faculties
├── Departments
└── Branches

Students
├── Search
├── Detail
├── Batch import
├── Update/sync
├── CSV adapter
└── Future university integration boundary

Catalog Master Data
├── Categories
└── Dewey hierarchy
```

### Completed Verification

```text
Sprint 1A — Auth + JWT + RBAC            ✅
Sprint 1B — University Master Data       ✅
Sprint 1C — Students Import / Sync       ✅
Sprint 1D — Categories + Dewey           ✅
Sprint 1E — Full Integration             ✅
Smoke Data Cleanup                       ✅
Persistent Seed Verification             ✅
```

---

## Recommended Repository Documentation

Keep this file as the single Sprint 1 summary:

```text
docs/planning/SPRINT_1.md
```

The old temporary patch-application documents can be removed after this merged document is committed:

```text
SPRINT1_APPLY.md
SPRINT1B_APPLY.md
SPRINT1C_APPLY.md
SPRINT1D_APPLY.md
SPRINT1E_APPLY.md
```

The executable smoke-test and cleanup scripts should remain in `scripts/` because they are still useful for regression testing and development verification.

---

## Next Sprint

**Sprint 2 — Catalog & Inventory**

Planned areas:

```text
LibraryItem
BookDetails
AcademicWorkDetails
Contributors
ItemContributors
PhysicalCopies
Availability
Inventory concurrency rules
```
