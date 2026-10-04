# SAMS Analytics KPI Contract v1

## Purpose

This document is the shared source of truth for Sprint 6 analytics formulas.

The backend, analytics team, and frontend should use the same definitions.

Analytics must not redefine transactional states.

---

## Time Window

Period metrics use:

```text
[from, to)
```

Meaning:

```text
from is inclusive
to is exclusive
```

If the API caller omits the period, the overview defaults to the latest rolling 30 days.

All timestamps remain PostgreSQL `timestamptz` values.

UI/report timezone formatting should be handled explicitly; Sprint 6A does not silently convert database events to another calendar timezone.

---

## Branch Scope

When `branchId` is omitted:

```text
scope = all active branches
```

When `branchId` is provided:

```text
scope = that active branch only
```

An inactive or unknown branch is rejected.

---

# Catalog KPIs

## Active Items

Without branch filter:

```text
COUNT LibraryItem
WHERE isActive = true
```

With branch filter:

```text
COUNT active LibraryItem
WHERE at least one non-ARCHIVED PhysicalCopy
exists at the selected active Branch
```

This is a title/intellectual-record count, not a copy count.

## Physical Copies

```text
COUNT PhysicalCopy
WHERE status != ARCHIVED
AND Branch.isActive = true
```

plus branch filter when supplied.

## Available Copies

```text
COUNT PhysicalCopy
WHERE status = AVAILABLE
AND Branch.isActive = true
```

## Unavailable Copies

```text
physicalCopies - availableCopies
```

This includes currently:

```text
RESERVED
BORROWED
UNAVAILABLE
DAMAGED
LOST
```

but excludes `ARCHIVED`.

## Availability Rate

```text
availableCopies / physicalCopies * 100
```

If physicalCopies = 0:

```text
availabilityRate = 0
```

---

# Reservation KPIs

## Active Holds

```text
Reservation.status = ACTIVE
AND expiresAt > now
```

This represents currently valid holds.

## Overdue Holds Pending Expiration

```text
Reservation.status = ACTIVE
AND expiresAt <= now
```

These records have passed their hold time but have not yet been processed by the expiration workflow.

They are deliberately separated from valid active holds.

## Reservations Created in Period

```text
reservedAt >= from
AND reservedAt < to
```

All final/current statuses are included because this KPI measures reservation creation activity.

---

# Circulation KPIs

## Active Loans

```text
Borrowing.status = ACTIVE
```

## Overdue Loans

```text
Borrowing.status = ACTIVE
AND dueAt < now
```

Overdue remains derived, not stored.

## Overdue Loan Rate

```text
overdueLoans / activeLoans * 100
```

If activeLoans = 0:

```text
0
```

## Borrowings Started in Period

```text
borrowedAt >= from
AND borrowedAt < to
```

All final/current statuses are included because this measures checkout activity.

## Returns in Period

```text
Borrowing.status = RETURNED
AND returnedAt >= from
AND returnedAt < to
```

`LOST` is not counted as a physical return.

---

# Visit KPIs

## Visits in Period

```text
checkedInAt >= from
AND checkedInAt < to
```

Each `LibraryVisit` is one visit event.

## Unique Visitors in Period

```text
COUNT DISTINCT studentId
```

over visits whose `checkedInAt` falls inside the period.

## Open Visits

```text
checkedOutAt IS NULL
```

This is a current snapshot, not period-bound.

## Average Closed Visit Minutes

For visits whose check-in is in the period and whose visit is closed:

```text
AVG(
  checkedOutAt - checkedInAt
)
```

expressed in minutes.

Open visits are excluded from this average.

---

# Privacy

Sprint 6 overview returns aggregate values only.

It does not return:

```text
student names
student IDs
emails
barcodes
copy codes
shelf locations
individual reservation records
individual borrowing records
individual visit records
```

---

# API

```text
GET /api/v1/analytics/overview
```

Roles:

```text
LIBRARIAN
MANAGEMENT
```

Students are not authorized.

Optional query:

```text
branchId
from
to
```

Example:

```text
/api/v1/analytics/overview
  ?branchId=<uuid>
  &from=2026-10-01T00:00:00Z
  &to=2026-11-01T00:00:00Z
```

---

# Versioning Rule

If a KPI formula changes later, update this contract and the API implementation together.

Do not silently change an existing KPI meaning.

---

# Sprint 6B — Chart Dataset Contracts

## Time-Series Endpoint

```text
GET /api/v1/analytics/trends
```

Supported buckets:

```text
DAY
WEEK
MONTH
```

Buckets are aligned in:

```text
UTC
```

The selected event window still uses:

```text
[from, to)
```

Zero-activity buckets are returned with zero values rather than omitted.

Each bucket contains:

```text
reservationsCreated
borrowingsStarted
returns
visits
uniqueVisitors
```

### Event timestamps

```text
reservationsCreated -> Reservation.reservedAt
borrowingsStarted   -> Borrowing.borrowedAt
returns             -> Borrowing.returnedAt where status = RETURNED
visits              -> LibraryVisit.checkedInAt
uniqueVisitors      -> DISTINCT LibraryVisit.studentId per bucket
```

This endpoint is an event trend. It does not attempt to reconstruct historical snapshot counts such as "active loans at midnight".

### Range safeguards

```text
DAY   <= 366 days
WEEK  <= 1830 days
MONTH <= 3660 days
```

This prevents accidentally returning an excessive number of chart points.

---

# Branch Comparison Endpoint

```text
GET /api/v1/analytics/branches
```

Only active branches are returned.

Each branch contains:

```text
catalog
├── physicalCopies
├── availableCopies
└── availabilityRatePercent

reservations
└── createdInPeriod

circulation
├── activeLoans
├── overdueLoans
├── overdueLoanRatePercent
├── borrowingsStartedInPeriod
└── returnsInPeriod

visits
├── visitsInPeriod
└── uniqueVisitorsInPeriod
```

Snapshot metrics:

```text
physicalCopies
availableCopies
activeLoans
overdueLoans
```

are evaluated at request time.

Period metrics use:

```text
[from, to)
```

---

# Top Items Endpoint

```text
GET /api/v1/analytics/top-items
```

Metrics:

```text
BORROWINGS
RESERVATIONS
```

The count is event-based in the selected period.

## BORROWINGS

```text
COUNT Borrowing
GROUP BY LibraryItem
using Borrowing.borrowedAt
```

## RESERVATIONS

```text
COUNT Reservation
GROUP BY LibraryItem
using Reservation.reservedAt
```

Optional:

```text
branchId
limit
```

Ranking:

```text
count DESC
title ASC
item id ASC
```

The deterministic tie-break makes dashboard output stable.

---

# Active-Branch Global Scope

Global transactional analytics include activity belonging to active branches only.

Sprint 6B explicitly aligns the Sprint 6A implementation with this rule for:

```text
reservations
borrowings
visits
```

An explicitly supplied `branchId` must also identify an active branch.

