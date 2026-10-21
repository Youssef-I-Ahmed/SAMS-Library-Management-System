# SAMS Student Circulation Frontend v1

**Sprint:** 9D

## Student contracts

```text
POST /api/v1/reservations
GET  /api/v1/reservations/me
POST /api/v1/reservations/:id/cancel
GET  /api/v1/borrowings/me
GET  /api/v1/auth/me
```

## Reservation flow

1. Student opens an item detail page.
2. Existing PENDING/ACTIVE reservation is detected.
3. If no active reservation exists and the item is reservation-ready,
   candidate pickup branches are shown.
4. Student confirms the pickup branch.
5. Frontend sends `Idempotency-Key`.
6. Successful reservation is shown immediately and item availability is refreshed.

## My Reservations

Supports:
- all statuses
- PENDING
- ACTIVE
- FULFILLED
- CANCELLED
- EXPIRED
- pagination
- cancellation for PENDING/ACTIVE reservations

Student responses never display allocated copy, barcode, copy code or shelf location.

## My Borrowings

Supports:
- ACTIVE / RETURNED / LOST
- overdue state
- overdue days
- borrowed / due / returned timestamps
- branch and item summary
- pagination

The student endpoint does not expose raw physical-copy data.

## Student Profile

Uses the authenticated `/auth/me` identity already restored by AuthProvider:
- name
- university email
- student ID
- academic status
- faculty
- department
