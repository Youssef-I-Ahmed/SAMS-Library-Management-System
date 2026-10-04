# SAMS Library System — Sprint 4

## Sprint 4: Reservations

**Status: COMPLETE ✅ after final closeout commands pass**

Sprint 4 implements the reservation lifecycle on top of Sprint 2 inventory concurrency and Sprint 3 student discovery.

---

## Sprint 4A — Reservation Core

### Endpoints

```text
POST /api/v1/reservations
GET  /api/v1/reservations/me
```

### Student reservation flow

The authenticated student supplies:

```text
itemId
branchId
```

The server validates:

```text
active Student profile
academicStatus = ACTIVE
active LibraryItem
active Branch
applicable CirculationPolicy
no duplicate PENDING/ACTIVE reservation for same item
maxActiveReservations
```

Then, in the same transaction:

```text
SELECT AVAILABLE copy
FOR UPDATE SKIP LOCKED
        ↓
PhysicalCopy AVAILABLE → RESERVED
        ↓
Reservation ACTIVE
        ↓
expiresAt from reservationHoldHours
```

### Policy specificity

Highest priority:

```text
branch + item type
```

then:

```text
branch + all types
all branches + item type
global policy
```

For equal specificity, the newest `effectiveFrom` wins.

No circulation-policy values are invented by the API.

### Last-copy race

A real API-level concurrency smoke verified that two students competing for one final available copy result in:

```text
one HTTP 201
one HTTP 409
one RESERVED copy
```

---

## Sprint 4B — Cancellation + Expiration

### Cancellation endpoint

```text
POST /api/v1/reservations/:id/cancel
```

Allowed:

```text
reservation owner
LIBRARIAN
```

Cancellation locks the reservation and allocated copy, then:

```text
Reservation ACTIVE → CANCELLED
PhysicalCopy RESERVED → AVAILABLE
```

`cancelledAt` and `cancelledByUserId` are recorded.

Repeating cancellation returns the existing final state.

`EXPIRED` and `FULFILLED` are terminal for cancellation.

### Expiration worker

```text
POST /api/v1/reservations/expire-due
```

Role:

```text
LIBRARIAN
```

Due rows are selected with:

```sql
FOR UPDATE SKIP LOCKED
```

Then:

```text
Reservation ACTIVE → EXPIRED
PhysicalCopy RESERVED → AVAILABLE
```

The endpoint provides a reusable business workflow for later scheduling through cron/platform workers.

---

## Sprint 4C — Librarian Queue + Idempotency

### Operations queue

```text
GET /api/v1/reservations
GET /api/v1/reservations/:id
```

Roles:

```text
LIBRARIAN
MANAGEMENT
```

Management remains read-only.

Queue filters:

```text
q
status
branchId
itemId
studentUserId
studentNumber
holdState=VALID|OVERDUE
page
pageSize
```

Search supports:

```text
student number
university email
display name
item title
call number
```

### Internal detail

Operations users can see:

```text
student identity
academic status
faculty / department
item
branch
allocated physical copy
copy code
barcode
shelf location
condition
copy status
```

Student-facing reservation history does not expose that raw inventory information.

### Idempotent create

Reservation creation accepts:

```http
Idempotency-Key: <key>
```

Same user + same key + same request:

```text
returns original reservation
does not allocate another copy
```

Same key with different request:

```text
409 IDEMPOTENCY_KEY_REUSED
```

Technical retention:

```text
24 hours
```

The existing `IdempotencyRecord` table is used; no schema migration was needed.

---

## Privacy Boundary

Student APIs expose:

```text
reservation id
status
reservedAt
expiresAt
item summary
branch summary
```

They do not expose:

```text
allocatedCopyId
PhysicalCopy.id
barcode
copyCode
shelfLocation
```

Internal librarian/management views may expose allocated-copy information because library staff need it operationally.

---

## Sprint 4D — Closeout

### Full regression

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint4\sprint4-full-smoke.ps1
```

Expected:

```text
Sprint 4 FULL integration smoke PASSED.
```

### Cleanup

```powershell
node .\scripts\sprint4\cleanup-sprint4-smoke-data.js
```

Cleanup removes known Sprint 4-only records:

```text
Sprint4A/B/C LibraryItems
their reservations
their physical copies
Sprint4C idempotency records
Sprint4A temporary student users
temporary circulation-policy fixture
```

It refuses destructive cleanup if a real Borrowing is linked to a Sprint 4 smoke reservation.

### Clean-state verification

```powershell
node .\scripts\sprint4\sprint4-verify-clean-state.js
```

Expected:

```text
STUDENT role: OK
LIBRARIAN role: OK
MANAGEMENT role: OK
DEV Faculty: OK
DEV Department: OK
MAIN branch: OK
Sprint 4 smoke records: CLEAN

Sprint 4 clean-state verification PASSED.
```

---

## Sprint 4 Final Deliverable

```text
Reservation Creation
├── Student eligibility
├── Branch/item validation
├── Policy resolution
├── Reservation limits
├── Last-copy concurrency
├── ACTIVE reservation
└── Copy RESERVED

Reservation Lifecycle
├── Student cancellation
├── Librarian cancellation
├── Automatic copy release
├── Expiration
├── Terminal-state protection
└── Concurrency-safe lifecycle operations

Operations
├── Librarian queue
├── Management read-only access
├── Student lookup
├── Reservation detail
├── Operational copy location
└── Hold-state filters

Reliability
├── Idempotency-Key
├── Replay protection
├── Different-payload conflict
├── Database unique key
└── 24-hour technical retention
```

---

## Next Sprint

**Sprint 5 — Borrow / Return / Library Visits**

The reservation-to-borrowing handoff belongs in Sprint 5 because checkout, return, due dates, copy transitions, and physical visit logging are circulation operations.
