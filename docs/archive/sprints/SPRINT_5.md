# SAMS Library System — Sprint 5

## Sprint 5: Borrow / Return / Library Visits

**Status: COMPLETE ✅ after final closeout commands pass**

Sprint 5 implements the core physical circulation workflow after Sprint 4 reservations.

---

## Sprint 5A — Checkout + Borrowing Core

### Checkout endpoint

```text
POST /api/v1/borrowings/checkout
```

Role:

```text
LIBRARIAN
```

Two checkout modes are supported.

### Reservation checkout

```json
{
  "reservationId": "<uuid>"
}
```

Flow:

```text
ACTIVE Reservation
        ↓
lock Reservation
        ↓
validate hold not expired
        ↓
lock Student
        ↓
validate academic eligibility
        ↓
lock allocated PhysicalCopy
        ↓
RESERVED → BORROWED
        ↓
create ACTIVE Borrowing
        ↓
Reservation → FULFILLED
```

### Direct walk-in checkout

```json
{
  "studentNumber": "<student-id>",
  "copyId": "<uuid>"
}
```

Flow:

```text
resolve + lock Student
        ↓
validate ACTIVE status
        ↓
lock PhysicalCopy
        ↓
require AVAILABLE
        ↓
resolve CirculationPolicy
        ↓
enforce maxActiveLoans
        ↓
AVAILABLE → BORROWED
        ↓
create ACTIVE Borrowing
```

### Policy-driven due date

The client does not send a due date.

```text
dueAt = borrowedAt + policy.loanDays
```

### Concurrency

The Student row is locked before checking `maxActiveLoans`.

The PhysicalCopy row is locked before checkout.

A real API race verified that two requests competing for one physical copy produce one successful checkout and one conflict.

---

## Sprint 5B — Return + Damaged/Lost + Overdue

### Return endpoint

```text
POST /api/v1/borrowings/:id/return
```

Role:

```text
LIBRARIAN
```

Supported outcomes:

```text
GOOD
FAIR
DAMAGED
LOST
```

### GOOD

```text
Borrowing ACTIVE → RETURNED
Copy BORROWED → AVAILABLE
Copy condition → GOOD
```

### FAIR

```text
Borrowing ACTIVE → RETURNED
Copy BORROWED → AVAILABLE
Copy condition → FAIR
```

### DAMAGED

```text
Borrowing ACTIVE → RETURNED
Copy BORROWED → DAMAGED
Copy condition → DAMAGED
```

### LOST

```text
Borrowing ACTIVE → LOST
Copy BORROWED → LOST
returnedAt remains null
```

The schema has no `LOST` copy condition, so loss is represented by copy status.

### Return transaction

```text
lock Borrowing
      ↓
require ACTIVE
      ↓
lock PhysicalCopy
      ↓
require BORROWED
      ↓
update Borrowing
      ↓
update PhysicalCopy
      ↓
COMMIT
```

This also protects against double return.

### Overdue

Overdue remains derived, not stored.

For active loans:

```text
isOverdue
overdueDays
```

For completed returns:

```text
wasReturnedOverdue
overdueAtReturnDays
```

Operations can filter:

```text
GET /api/v1/borrowings?overdueOnly=true
```

---

## Borrowing Read Models

### Student

```text
GET /api/v1/borrowings/me
```

Student-facing data excludes raw:

```text
PhysicalCopy.id
barcode
copyCode
shelfLocation
```

### Operations

```text
GET /api/v1/borrowings
GET /api/v1/borrowings/:id
```

Roles:

```text
LIBRARIAN
MANAGEMENT
```

Operations data includes student identity, item, branch, copy location/identity, status, condition, and checkout actor.

Management remains read-only.

---

## Sprint 5C — Physical Library Visit Logging

The system distinguishes online use from physical presence.

Students may search and reserve from home, but a physical library visit is recorded by staff at the library.

### Endpoints

```text
POST /api/v1/visits/check-in
POST /api/v1/visits/:id/check-out

GET /api/v1/visits
GET /api/v1/visits/:id
```

### Permissions

```text
STUDENT
→ cannot create physical-presence records

LIBRARIAN
→ check in
→ check out
→ read visit operations

MANAGEMENT
→ read-only
```

### Visit sources

```text
MANUAL
BARCODE
QR
```

These values represent how staff registered the presence event. Future scanner integration can reuse the same endpoint.

### Check-in transaction

```text
resolve Student
      ↓
lock Student
      ↓
validate active account/status
      ↓
validate active Branch
      ↓
ensure no open visit
      ↓
create LibraryVisit
```

### One-open-visit invariant

A student can have only one visit where:

```text
checkedOutAt IS NULL
```

The rule applies globally, not once per branch.

A real concurrent API test verified one successful check-in and one HTTP 409 for simultaneous requests.

### Check-out

```text
lock Visit
      ↓
require open visit
      ↓
checkedOutAt = now
checkoutBy = Librarian
```

After checkout the student may enter again and create another visit.

### Visit operations filters

```text
q
branchId
studentNumber
source
openOnly
from
to
page
pageSize
```

Derived values:

```text
isOpen
durationMinutes
```

---

## Database Model Reuse

No Sprint 5 migration was required.

The existing `Borrowing` model already contains student/copy/branch/reservation relations, checkout/return actors, due/return timestamps, return condition, and status. The existing `LibraryVisit` model contains student/branch, check-in/check-out timestamps, registering/check-out staff, and visit source. filecitefile_00000000efb4820ab9e7f4042c755edeL348-L413

---

## Sprint 5D — Closeout

### Full regression

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint5\sprint5-full-smoke.ps1
```

Expected:

```text
Sprint 5 FULL integration smoke PASSED.
```

### Cleanup

```powershell
node .\scripts\sprint5\cleanup-sprint5-smoke-data.js
```

Cleanup removes known Sprint 5 test-only data:

```text
Sprint5A / Sprint5B LibraryItems
Borrowings
Sprint5A reservations
PhysicalCopies
Sprint5A/B/C temporary students
Sprint5C LibraryVisits
temporary CirculationPolicy fixture
```

Persistent Sprint 1 seed users/master data are preserved.

### Clean-state verification

```powershell
node .\scripts\sprint5\sprint5-verify-clean-state.js
```

Expected:

```text
STUDENT role: OK
LIBRARIAN role: OK
MANAGEMENT role: OK
DEV Faculty: OK
DEV Department: OK
MAIN branch: OK
Sprint 5 smoke records: CLEAN

Sprint 5 clean-state verification PASSED.
```

---

## Sprint 5 Final Deliverable

```text
Physical Circulation
├── Reservation fulfillment checkout
├── Walk-in checkout
├── Policy-based due dates
├── Loan limits
├── Borrowing queue
├── Return
├── Damage handling
├── Lost handling
└── Overdue derivation

Concurrency
├── Student loan-limit locking
├── PhysicalCopy checkout locking
├── Borrowing return locking
├── PhysicalCopy return locking
└── Visit check-in locking

Physical Presence
├── Check-in
├── Check-out
├── One-open-visit invariant
├── MANUAL / BARCODE / QR source
├── Duration
└── Operations history
```

---

## Next Sprint

**Sprint 6 — Analytics**

Sprint 6 can now build metrics on stable transactional data for:

```text
catalog holdings
availability
reservations
borrowings
overdue activity
returns
library visits
branch usage
```

KPI definitions should remain explicit and documented so the analytics team and backend use the same formulas.
