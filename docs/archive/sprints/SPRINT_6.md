# SAMS Library System — Sprint 6

## Sprint 6: Analytics

**Status: COMPLETE ✅ after final closeout commands pass**

Sprint 6 builds read-only analytics contracts over the stable transactional data created in Sprints 1–5.

The core principle is:

```text
define KPI meaning first
then expose API datasets
then let dashboards visualize them
```

The frontend and data-analysis work should not redefine KPI formulas independently.

---

# Sprint 6A — KPI Contract + Overview

## KPI source of truth

```text
docs/analytics/KPI_CONTRACT_v1.md
```

Period metrics use:

```text
[from, to)
```

meaning:

```text
from inclusive
to exclusive
```

Default when dates are omitted:

```text
rolling 30 days
```

## Overview endpoint

```text
GET /api/v1/analytics/overview
```

Roles:

```text
LIBRARIAN
MANAGEMENT
```

Students receive:

```text
403
```

Optional filters:

```text
branchId
from
to
```

## Catalog KPIs

```text
activeItems
physicalCopies
availableCopies
unavailableCopies
availabilityRatePercent
```

### Active items

Global:

```text
LibraryItem.isActive = true
```

Branch-scoped:

```text
active item
with at least one non-ARCHIVED copy
at selected active branch
```

### Physical copies

```text
PhysicalCopy.status != ARCHIVED
at active branch
```

### Available copies

```text
PhysicalCopy.status = AVAILABLE
at active branch
```

### Availability rate

```text
availableCopies / physicalCopies * 100
```

Zero denominator returns:

```text
0
```

---

# Reservation KPIs

```text
activeHolds
overdueHoldsPendingExpiration
createdInPeriod
```

## Active holds

```text
status = ACTIVE
expiresAt > now
```

## Overdue holds pending expiration

```text
status = ACTIVE
expiresAt <= now
```

This is intentionally separate from a valid current hold.

## Reservations created in period

```text
reservedAt >= from
reservedAt < to
```

All resulting statuses are included because the metric measures creation activity.

---

# Circulation KPIs

```text
activeLoans
overdueLoans
overdueLoanRatePercent
borrowingsStartedInPeriod
returnsInPeriod
```

## Active loans

```text
Borrowing.status = ACTIVE
```

## Overdue loans

```text
Borrowing.status = ACTIVE
dueAt < now
```

Overdue remains derived, not persisted.

## Borrowings started

```text
borrowedAt >= from
borrowedAt < to
```

## Returns

```text
status = RETURNED
returnedAt >= from
returnedAt < to
```

`LOST` is not counted as a physical return.

---

# Visit KPIs

```text
visitsInPeriod
uniqueVisitorsInPeriod
openVisits
averageClosedVisitMinutes
```

## Visits

```text
checkedInAt >= from
checkedInAt < to
```

## Unique visitors

```text
COUNT DISTINCT studentId
```

over visits checked in inside the period.

## Open visits

```text
checkedOutAt IS NULL
```

This is a current snapshot.

## Average closed visit duration

Closed visits whose check-in is inside the selected period:

```text
AVG(
  checkedOutAt - checkedInAt
)
```

expressed in minutes.

---

# Sprint 6B — Trends

## Endpoint

```text
GET /api/v1/analytics/trends
```

Query:

```text
branchId
from
to
bucket=DAY|WEEK|MONTH
```

Every point contains:

```text
bucketStart
reservationsCreated
borrowingsStarted
returns
visits
uniqueVisitors
```

Buckets are:

```text
UTC aligned
zero-filled
chronologically ordered
```

## Event timestamps

```text
reservations -> reservedAt
borrowings   -> borrowedAt
returns      -> returnedAt
visits       -> checkedInAt
```

Trend data represents events.

It does **not** attempt to reconstruct historical point-in-time snapshots such as:

```text
active loans at midnight on a past date
available copies at end of last month
```

Those would require event/snapshot modeling beyond the current MVP transactional schema.

## Range safeguards

```text
DAY   <= 366 days
WEEK  <= 1830 days
MONTH <= 3660 days
```

---

# Branch Comparison

## Endpoint

```text
GET /api/v1/analytics/branches
```

Returns every active branch with:

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

Current snapshot metrics and period activity metrics are deliberately identified separately.

---

# Top Items

## Endpoint

```text
GET /api/v1/analytics/top-items
```

Metrics:

```text
BORROWINGS
RESERVATIONS
```

### BORROWINGS

```text
COUNT Borrowing events
GROUP BY LibraryItem
using borrowedAt
```

### RESERVATIONS

```text
COUNT Reservation events
GROUP BY LibraryItem
using reservedAt
```

Optional:

```text
branchId
from
to
limit
```

Ranking order:

```text
count DESC
title ASC
item id ASC
```

This makes ties deterministic.

---

# Analytics Privacy

The analytics endpoints return aggregated data or item-level ranking totals.

They do not expose student-level behavioral datasets.

Overview/trends/branch comparison do not return:

```text
student name
student number
student email
copy barcode
copy code
shelf location
individual borrowing rows
individual visit rows
```

---

# Active Branch Rule

Global analytics include transactional activity from active branches only.

This applies to:

```text
reservations
borrowings
visits
```

Explicit branch filters must also reference an active branch.

---

# Sprint 6C — Closeout

## Full regression

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint6\sprint6-full-smoke.ps1
```

Expected:

```text
Sprint 6 FULL integration smoke PASSED.
```

## Cleanup

```powershell
node .\scripts\sprint6\cleanup-sprint6-smoke-data.js
```

Known Sprint 6 smoke data removed:

```text
Sprint6A / Sprint6B LibraryItems
their PhysicalCopies
their Reservations
their Borrowings
Sprint6A/B temporary students
their LibraryVisits
temporary Sprint 6 CirculationPolicy fixture
```

Persistent development seed is preserved.

## Clean-state verification

```powershell
node .\scripts\sprint6\sprint6-verify-clean-state.js
```

Expected:

```text
STUDENT role: OK
LIBRARIAN role: OK
MANAGEMENT role: OK
DEV Faculty: OK
DEV Department: OK
MAIN branch: OK
Sprint 6 smoke records: CLEAN

Sprint 6 clean-state verification PASSED.
```

---

# Sprint 6 Final Deliverable

```text
KPI Governance
├── KPI_CONTRACT_v1
├── stable formula definitions
├── explicit period semantics
└── active-branch rules

Overview Analytics
├── catalog
├── reservations
├── circulation
└── visits

Dashboard Datasets
├── DAY / WEEK / MONTH trends
├── zero-filled chart series
├── branch comparison
├── top borrowed items
└── top reserved items

Governance / Safety
├── aggregate analytics
├── no student analytics access
├── deterministic ranking
└── bounded trend ranges
```

---

# Next Sprint

**Sprint 7 — Legacy Migration Pilot**

Sprint 7 should not assume the legacy source format.

The next library discovery/export should preserve raw legacy data first, then the migration pipeline can:

```text
profile source fields
stage raw rows
map legacy codes
validate catalog types
normalize Dewey/call-number data carefully
deduplicate intellectual records
create PhysicalCopy records
produce migration exceptions
run dry-run/reconciliation reports
```

Legacy PCs remain migration sources only; they are not part of the new production architecture.
