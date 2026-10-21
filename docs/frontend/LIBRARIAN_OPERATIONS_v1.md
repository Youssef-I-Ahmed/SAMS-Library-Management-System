# SAMS Librarian Operations Frontend v1

**Sprint:** 9E

## Borrow

Supports two safe server-side workflows:

```text
POST /api/v1/borrowings/checkout
```

Modes:

1. Active reservation checkout using `reservationId`.
2. Direct checkout using `studentNumber + copyId`.

The frontend searches only `AVAILABLE` copies for direct checkout.

## Return

```text
GET  /api/v1/borrowings
POST /api/v1/borrowings/:id/return
```

Return outcomes:

```text
GOOD
FAIR
DAMAGED
LOST
```

The server remains authoritative for copy status and borrowing reconciliation.

## Reservation Operations

```text
GET  /api/v1/reservations
POST /api/v1/reservations/:id/cancel
POST /api/v1/borrowings/checkout
```

The queue supports status, valid/overdue hold state and search.

## Visits

```text
GET  /api/v1/visits
POST /api/v1/visits/check-in
POST /api/v1/visits/:id/check-out
```

Visit entry remains librarian-only, matching the product requirement that physical library attendance is registered at the library.

## Supporting lookups

```text
GET /api/v1/inventory/copies
GET /api/v1/master-data/branches
```

No backend or schema changes are required for Sprint 9E.
