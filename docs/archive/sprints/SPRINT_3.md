# SAMS Library System — Sprint 3

## Sprint 3: Student Search & Discovery

**Status: COMPLETE ✅ after final closeout commands pass**

Sprint 3 builds the student-facing discovery read model on top of Sprint 2 Catalog & Inventory. The portal can now search the catalog, filter/sort results, inspect item details, see safe aggregate availability by branch, and receive the metadata required to render search/filter UX.

The operational librarian catalog and raw inventory APIs remain separate from the student-facing read model.

---

## Sprint 3A — Student Discovery Search

### Endpoint

```text
GET /api/v1/discovery/items
```

All authenticated roles can read the endpoint.

Only active catalog items are returned.

### Search

`q` searches across:

```text
LibraryItem.title
LibraryItem.callNumber
LibraryItem.deweyCodeRaw
LibraryItem.abstractDescription
Category.name
DeweyClassification.code
DeweyClassification.name
BookDetails.isbn
BookDetails.publisher
BookDetails.edition
AcademicWorkDetails.academicYear
Contributor.fullName
```

### Filters

```text
type
categoryId
deweyClassificationId
language
publicationYear
branchId
availableOnly
page
pageSize
```

### Sort

```text
TITLE_ASC
TITLE_DESC
YEAR_DESC
YEAR_ASC
NEWEST
```

Default:

```text
TITLE_ASC
```

### Availability in Search Results

Every result receives:

```text
availability
├── totalCopies
├── availableCopies
├── available
└── branches[]
```

The discovery search endpoint does not expose:

```text
PhysicalCopy.id
barcode
copyCode
shelfLocation
```

### Branch / Availability Filtering

```text
branchId=<uuid>
```

requires a current non-archived holding at that active branch.

```text
branchId=<uuid>&availableOnly=true
```

requires an `AVAILABLE` copy at that branch.

Without `branchId`:

```text
availableOnly=true
```

means an available copy exists at any active branch.

---

## Sprint 3B — Student Item Detail

### Endpoint

```text
GET /api/v1/discovery/items/:id
```

Only active items are returned.

Archived/inactive item:

```text
404
```

### Student Detail Read Model

```text
LibraryItem
├── type
├── title
├── deweyCodeRaw
├── callNumber
├── language
├── publicationYear
├── abstractDescription
├── category
├── deweyClassification
├── BookDetails OR AcademicWorkDetails
├── contributors
├── availability
└── reservationReadiness
```

### Reservation-Ready Branch Selection

The detail endpoint returns:

```text
reservationReadiness
├── hasAvailableCopy
└── candidateBranches[]
    ├── branch
    └── availableCopies
```

This is intentionally **not** a final reservation-eligibility decision.

It only tells the UI which branches currently have at least one `AVAILABLE` copy.

Actual reservation creation must later validate, inside the reservation workflow:

```text
student academic/account status
duplicate active reservation
reservation limit
circulation policy
copy still available at transaction time
```

The final-copy race will use the Sprint 2 PostgreSQL locking primitive:

```text
FOR UPDATE SKIP LOCKED
```

### Privacy

Student item detail does not return raw:

```text
PhysicalCopy.id
barcode
copyCode
shelfLocation
```

---

## Sprint 3C — Discovery Facets + Search UX Metadata

### Endpoint

```text
GET /api/v1/discovery/facets
```

Response:

```text
types[]
categories[]
deweyClassifications[]
languages[]
publicationYears[]
branches[]
availabilityOptions[]
sortOptions[]
defaults
```

### Type Facets

All supported item types are represented:

```text
BOOK
THESIS
PROJECT
```

with active-catalog counts.

### Category / Dewey Facets

Only values used by active catalog items are returned.

Category entries:

```text
id
name
count
```

Dewey entries:

```text
id
code
name
count
```

### Language / Year Facets

Only values found on active catalog records are returned.

Years are ordered newest first.

### Branch Facets

Only active branches with non-archived holdings are included.

Each branch includes item-level counts:

```text
totalItems
availableItems
```

These count distinct `LibraryItem` records, not physical copies.

### Availability Facets

```text
ALL
AVAILABLE_ONLY
```

`AVAILABLE_ONLY.count` represents active catalog items with at least one available copy at an active branch.

### Search UX Metadata

Search pagination includes:

```text
page
pageSize
total
totalPages
hasPreviousPage
hasNextPage
```

Search also returns:

```text
meta
├── query
├── sort
└── appliedFilters
```

This gives the frontend enough information for:

```text
filter chips
sort control
pagination buttons
current search state
```

---

## Architecture Boundary

Student portal:

```text
GET /api/v1/discovery/items
GET /api/v1/discovery/items/:id
GET /api/v1/discovery/facets
```

Operational/admin APIs:

```text
/api/v1/catalog/items
/api/v1/catalog/contributors
/api/v1/inventory/copies
```

The discovery API is therefore a dedicated read boundary rather than exposing raw operational models to the student UI.

---

## Sprint 3D — Integration, Cleanup & Closeout

### Full Regression

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint3\sprint3-full-smoke.ps1
```

The full smoke runs:

```text
3A — Discovery Search
3B — Student Item Detail
3C — Discovery Facets
```

Expected:

```text
Sprint 3 FULL integration smoke PASSED.
```

### Cleanup

```powershell
node .\scripts\sprint3\cleanup-sprint3-smoke-data.js
```

The cleanup removes only known Sprint 3 smoke records:

```text
LibraryItem titles:
Sprint3A *
Sprint3B *
Sprint3C *

Contributors:
Sprint3A *
Sprint3B *

Categories:
Sprint3C Category *

Dewey:
S3C-*
```

Before deleting catalog items, cleanup checks for unexpected reservation/borrowing history and aborts if circulation data exists.

This is especially useful because early Sprint 3A retry attempts may have left old smoke records before the test was made rerun-safe.

### Clean-State Verification

```powershell
node .\scripts\sprint3\sprint3-verify-clean-state.js
```

Expected:

```text
STUDENT role: OK
LIBRARIAN role: OK
MANAGEMENT role: OK
DEV Faculty: OK
DEV Department: OK
MAIN branch: OK
Sprint 3 smoke records: CLEAN

Sprint 3 clean-state verification PASSED.
```

---

## Sprint 3 Final Deliverable

```text
Student Discovery
├── Full-text-style multi-field search
├── Filters
├── Sorting
├── Pagination
├── Item-type support
├── Contributor search
├── ISBN search
├── Category / Dewey search
└── Archived-item protection

Student Item Detail
├── Catalog metadata
├── Book details
├── Academic-work details
├── Contributors
├── Aggregate availability
├── Branch availability
└── Reservation candidate branches

Search UX Support
├── Facets
├── Counts
├── Sort metadata
├── Defaults
├── Applied filters
└── Pagination state

Privacy / Boundaries
├── No raw PhysicalCopy IDs
├── No barcodes
├── No copy codes
├── No shelf locations
└── Separate student read model
```

### Completed Verification

```text
Sprint 3A — Discovery Search               ✅
Sprint 3B — Student Item Detail            ✅
Sprint 3C — Discovery Facets               ✅
Sprint 3D — Full Integration               pending final command
Smoke Data Cleanup                         pending final command
Clean-State / Seed Verification            pending final command
```

After the final closeout commands pass, change those final three lines to ✅ if desired.

---

## Next Sprint

**Sprint 4 — Reservations**

The reservation workflow should consume the discovery branch selection and the Sprint 2 concurrency primitive, then perform real reservation eligibility validation and atomic copy allocation.
