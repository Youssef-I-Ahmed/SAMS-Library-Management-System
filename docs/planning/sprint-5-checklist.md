# SAMS Library System — Sprint 5 Checklist

## Sprint 5 — Borrow / Return / Library Visits

Status: implementation complete; closeout verification pending.

### 5A — Checkout + Borrowing Core

- [x] Reservation → checkout
- [x] Direct walk-in checkout
- [x] ACTIVE Borrowing creation
- [x] Copy RESERVED → BORROWED
- [x] Copy AVAILABLE → BORROWED
- [x] Reservation ACTIVE → FULFILLED
- [x] Policy-based due date
- [x] maxActiveLoans
- [x] Student-row locking
- [x] PhysicalCopy-row locking
- [x] Same-copy concurrency protection
- [x] Student borrowing history
- [x] Librarian/Management operations queue
- [x] Student raw-copy privacy boundary

### 5B — Return + Overdue

- [x] GOOD return
- [x] FAIR return
- [x] DAMAGED return
- [x] LOST outcome
- [x] Borrowing row locking
- [x] PhysicalCopy row locking
- [x] Double-return protection
- [x] returnedAt / returnedBy
- [x] returnCondition
- [x] Derived active overdue state
- [x] Derived overdue days
- [x] Derived returned-overdue metrics
- [x] overdueOnly queue filter
- [x] Return RBAC
- [x] DAMAGED / LOST inventory lifecycle

### 5C — Physical Library Visits

- [x] Librarian check-in
- [x] Librarian check-out
- [x] MANUAL source
- [x] BARCODE source
- [x] QR source
- [x] Active student validation
- [x] Active branch validation
- [x] One-open-visit protection
- [x] Concurrent check-in protection
- [x] Re-entry after checkout
- [x] Double check-out protection
- [x] Librarian operations queue
- [x] Management read-only access
- [x] Source / branch / date filters
- [x] Derived visit duration

### 5D — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 5 smoke
- [ ] Clean Sprint 5 smoke data
- [ ] Verify clean state + persistent seed
- [ ] Commit/push Sprint 5

## Definition of Done

```text
npm test                                      PASS
sprint5-full-smoke.ps1                        PASS
cleanup-sprint5-smoke-data.js                 PASS
sprint5-verify-clean-state.js                 PASS
```

Then Sprint 6 — Analytics can begin.
