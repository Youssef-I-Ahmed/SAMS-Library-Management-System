# SAMS Library System — Sprint 2

## Sprint 2: Catalog & Inventory

**Status: COMPLETE ✅**

Sprint 2 implements the library catalog and physical inventory foundation on top of Sprint 1 identity/master data. It separates bibliographic records from physical shelf copies, adds item-type details and contributors, exposes safe student-facing availability, and establishes the PostgreSQL row-locking primitive required for race-safe reservations.

---

## Sprint 2A — LibraryItem CRUD

### Scope

Sprint 2A introduced the base catalog API for:

```text
BOOK
THESIS
PROJECT
```

Endpoints:

```text
GET   /api/v1/catalog/items
GET   /api/v1/catalog/items/:id
POST  /api/v1/catalog/items
PATCH /api/v1/catalog/items/:id
```

### Permissions

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---:|---:|---:|
| Read active catalog | Yes | Yes | Yes |
| Read archived catalog | No | Yes | Yes |
| Create item | No | Yes | No |
| Update/archive item | No | Yes | No |

### Search / Filters

```text
search
type
categoryId
deweyClassificationId
language
publicationYear
includeInactive
page
pageSize
```

Search covers catalog text and, after Sprint 2C, contributor names.

### Catalog Rules

- `LibraryItem` is the bibliographic/intellectual record, not a physical shelf copy.
- `type` is chosen at creation and is not changed through the generic update API.
- No hard delete; catalog records are archived through `isActive=false`.
- Updates require `version` and use optimistic locking.
- `deweyCodeRaw` and `callNumber` remain text.
- Inactive categories cannot be assigned.
- Referenced Dewey classifications must exist.

### Prisma Mapping Correction

The API keeps convenient IDs while the service uses the actual Prisma relations:

```text
API field                   Prisma write/read mapping
---------------------------------------------------------------
categoryId                  category connect / disconnect
deweyClassificationId      deweyClassification connect / disconnect
abstract                    abstractDescription
```

Filtering was also corrected to use Prisma relation filters.

No database migration, Prisma regeneration, or DB reset was required for this correction.

---

## Sprint 2B — BookDetails + AcademicWorkDetails

### Existing Schema

```text
BookDetails
├── itemId
├── isbn
├── publisher
└── edition

AcademicWorkDetails
├── itemId
├── facultyId
├── departmentId
├── academicYear
└── workType
```

### Endpoints

```text
PUT /api/v1/catalog/items/:id/book-details
PUT /api/v1/catalog/items/:id/academic-work-details
```

`GET /api/v1/catalog/items/:id` returns the relevant nested item details.

### Type Rules

```text
BOOK
└── BookDetails

THESIS / PROJECT
└── AcademicWorkDetails
```

A `BOOK` cannot receive academic-work details, and a `THESIS`/`PROJECT` cannot receive book details.

`workType` is derived from the parent `LibraryItem.type`; it is not trusted from client input.

### Academic Placement Rules

If faculty/department information is supplied:

- Faculty must exist and be active.
- Department must exist and be active.
- The department's faculty must be active.
- If both `facultyId` and `departmentId` are supplied, they must match.
- A supplied department determines the stored faculty.

### Concurrency

Updating subtype details increments `LibraryItem.version`, so core catalog metadata and subtype metadata share one optimistic-lock boundary.

---

## Sprint 2C — Contributors + ItemContributors

### Contributor Model

```text
Contributor
├── id
└── fullName

ItemContributor
├── itemId
├── contributorId
└── role
```

Supported roles:

```text
AUTHOR
RESEARCHER
SUPERVISOR
PROJECT_MEMBER
```

### Contributor API

```text
GET   /api/v1/catalog/contributors
GET   /api/v1/catalog/contributors/:id
POST  /api/v1/catalog/contributors
PATCH /api/v1/catalog/contributors/:id
```

Permissions:

| Action | STUDENT | LIBRARIAN | MANAGEMENT |
|---|---:|---:|---:|
| Read/search contributors | Yes | Yes | Yes |
| Create/update contributor | No | Yes | No |

`fullName` is intentionally not unique because different real people can share a name and the current schema has no external contributor identifier.

### Item Contributor API

```text
GET /api/v1/catalog/items/:id/contributors
PUT /api/v1/catalog/items/:id/contributors
```

`PUT` replaces the complete contributor-role set for the item.

Important behavior:

- Replacement runs in one database transaction.
- `LibraryItem.version` is checked and incremented.
- A stale version returns HTTP `409`.
- Unknown contributor IDs are rejected.
- Duplicate `contributorId + role` pairs are rejected.
- An empty list intentionally removes all contributor links.
- The same contributor may have multiple roles because the database key is `(itemId, contributorId, role)`.

No unsupported role-vs-item-type rule was invented; such a rule can be added only if the library confirms it.

### Search Integration

Catalog search also matches `Contributor.fullName`.

---

## Sprint 2D — Physical Copies + Inventory Status

### LibraryItem vs PhysicalCopy

```text
LibraryItem
    │
    ├── PhysicalCopy #1 — MAIN — AVAILABLE
    ├── PhysicalCopy #2 — MAIN — BORROWED
    └── PhysicalCopy #3 — another branch — DAMAGED
```

`LibraryItem` describes what the work is.

`PhysicalCopy` describes the actual shelf copy, branch, barcode/copy code, shelf location, condition, and operational status.

### Inventory API

```text
GET   /api/v1/inventory/copies
GET   /api/v1/inventory/copies/:id
POST  /api/v1/inventory/copies
PATCH /api/v1/inventory/copies/:id
```

### Permissions

```text
STUDENT
→ no raw inventory access

LIBRARIAN
→ read / create / update

MANAGEMENT
→ read only
```

### Search / Filters

```text
search
itemId
branchId
status
condition
page
pageSize
```

Search can match:

- copy code
- barcode
- shelf location
- LibraryItem title

### Inventory Rules

A new copy requires:

```text
itemId
branchId
```

Optional fields include:

```text
copyCode
barcode
shelfLocation
status
condition
```

Default status is:

```text
AVAILABLE
```

The parent item and target branch must exist and be active.

Barcode uniqueness is enforced by the existing schema.

`copyCode` is not forced unique because the schema and branch/local numbering convention do not currently require that.

### Circulation-Owned Statuses

The generic inventory API cannot manually assign:

```text
RESERVED
BORROWED
```

Those states belong to circulation workflows:

```text
Reservation → RESERVED
Checkout    → BORROWED
Return      → AVAILABLE / another valid result
```

If a copy is already `RESERVED` or `BORROWED`, generic inventory editing cannot manually move/change its operational branch/status.

### Concurrency

Every copy update requires `version` and increments `PhysicalCopy.version`. Stale updates return HTTP `409`.

---

## Sprint 2E — Availability + Reservation-Safe Concurrency

### Student Availability API

```text
GET /api/v1/catalog/items/:itemId/availability
```

All authenticated roles can read this endpoint.

The response is deliberately aggregated. Student-facing availability does **not** expose raw:

```text
physicalCopyId
barcode
shelf-level inventory records
```

It returns:

```text
item
totalCopies
availableCopies
available
branches[]
```

with per-branch counts.

### Availability Counting Rule

Availability considers:

```text
active LibraryItem
+ active Branch
+ non-ARCHIVED PhysicalCopy
```

A copy contributes to `availableCopies` only when:

```text
status = AVAILABLE
```

### Critical Last-Copy Race Rule

The availability endpoint is a snapshot only. Reservation code must never rely on:

```text
1. read availability
2. choose a copy later
3. update it later
```

because two requests can observe the same final available copy.

Sprint 2E introduced:

```js
lockOneAvailableCopy(tx, itemId, branchId)
```

which uses PostgreSQL:

```sql
SELECT ...
FROM physical_copies
WHERE ...
  AND status = 'AVAILABLE'
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

The helper must be used inside the same transaction that eventually creates/activates the reservation and changes the selected copy to `RESERVED`.

When one transaction locks the last available copy, a competing transaction skips that row and receives no lockable available copy instead of double-reserving it.

The real two-transaction concurrency smoke test passed.

---

## Sprint 2F — Integration, Cleanup & Closeout

### Full Regression Verification

Sprint 2 is covered by:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint2\sprint2-full-smoke.ps1
```

The full smoke executes:

```text
2A — LibraryItem
2B — Item Details
2C — Contributors
2D — Physical Copies
2E — Availability + real DB concurrency
```

Final result:

```text
Sprint 2 FULL integration smoke PASSED.
```

### Smoke-Test Cleanup

Command:

```powershell
node .\scripts\sprint2\cleanup-sprint2-smoke-data.js
```

Cleanup is deliberately limited to known Sprint 2 smoke-test naming prefixes.

Before deletion it checks for unexpected circulation history. If a reservation or borrowing is linked to a Sprint 2 smoke item, cleanup aborts instead of deleting that history.

The cleanup script explicitly loads the repository-root `.env`, so direct `node` execution does not depend on the caller's current environment setup.

Final cleanup completed successfully and preserved the persistent Sprint 1 development seed.

### Clean-State Verification

Command:

```powershell
node .\scripts\sprint2\sprint2-verify-clean-state.js
```

Final verification confirmed:

```text
STUDENT role: OK
LIBRARIAN role: OK
MANAGEMENT role: OK
DEV Faculty: OK
DEV Department: OK
MAIN branch: OK
Sprint 2 smoke records: CLEAN
```

Final result:

```text
Sprint 2 clean-state verification PASSED.
```

---

## Sprint 2 Final Deliverable

```text
Catalog
├── LibraryItem CRUD
├── BOOK / THESIS / PROJECT
├── BookDetails
├── AcademicWorkDetails
├── Contributors
├── ItemContributors
├── Category / Dewey relationships
├── Search / filters / pagination
└── Optimistic locking

Inventory
├── PhysicalCopy
├── Branch placement
├── Copy code
├── Optional barcode
├── Shelf location
├── Status
├── Condition
├── Inventory search
├── Management read-only access
└── PhysicalCopy optimistic locking

Student Availability
├── Aggregate availability
├── Per-branch availability
├── Raw-copy privacy boundary
└── Active/non-archived counting rules

Concurrency Foundation
├── LibraryItem version checks
├── PhysicalCopy version checks
├── Transactional contributor replacement
└── Last-copy row locking
    └── SELECT ... FOR UPDATE SKIP LOCKED
```

### Completed Verification

```text
Sprint 2A — LibraryItem CRUD              ✅
Sprint 2A — Prisma mapping correction     ✅
Sprint 2B — Item Type Details             ✅
Sprint 2C — Contributors                  ✅
Sprint 2D — Physical Inventory            ✅
Sprint 2E — Availability                  ✅
Sprint 2E — Last-copy concurrency         ✅
Sprint 2F — Full Integration              ✅
Smoke Data Cleanup                        ✅
Clean-State / Seed Verification           ✅
```

---

## Repository Scripts

Sprint 2 scripts remain under:

```text
scripts/sprint2/
├── sprint2a-library-items-smoke.ps1
├── sprint2b-item-details-smoke.ps1
├── sprint2c-contributors-smoke.ps1
├── sprint2d-physical-copies-smoke.ps1
├── sprint2e-availability-smoke.ps1
├── sprint2e-concurrency-smoke.js
├── sprint2-full-smoke.ps1
├── cleanup-sprint2-smoke-data.js
└── sprint2-verify-clean-state.js
```

The full-smoke script resolves sibling scripts via `$PSScriptRoot`.

Database-backed standalone JavaScript scripts explicitly load the repository-root `.env`.

---

## Recommended Repository Documentation

Keep this file as the single Sprint 2 summary:

```text
docs/planning/SPRINT_2.md
```

After this merged document is committed, the temporary Sprint 2 patch/application notes can be removed:

```text
SPRINT2A_APPLY.md
SPRINT2A_FIX.md
SPRINT2B_APPLY.md
SPRINT2C_APPLY.md
SPRINT2D_APPLY.md
SPRINT2E_APPLY.md
SPRINT2F_APPLY.md
SPRINT2F_ENV_FIX.md
```

The executable scripts should remain because they are useful regression and development-verification tools.

---

## Next Sprint

**Sprint 3 — Student Search & Discovery**

Sprint 3 should build the student-facing discovery experience on top of the catalog search and availability APIs completed in Sprint 2.
