# SAMS Library System — Sprint 4 Checklist

## Sprint 4 — Reservations

Status: implementation complete; closeout verification pending.

### 4A — Reservation Core

- [x] Student creates own reservation
- [x] Active student eligibility
- [x] Active item / branch validation
- [x] Circulation-policy resolution
- [x] Duplicate reservation protection
- [x] Max active reservation enforcement
- [x] Last-copy row locking
- [x] Copy AVAILABLE → RESERVED
- [x] Reservation ACTIVE
- [x] Policy-based expiration timestamp
- [x] Student reservation history
- [x] Student privacy boundary
- [x] Real API-level last-copy race test

### 4B — Cancellation / Expiration

- [x] Student cancellation
- [x] Librarian cancellation
- [x] Management mutation protection
- [x] Copy RESERVED → AVAILABLE on cancellation
- [x] Repeated cancellation idempotency
- [x] Terminal-state protection
- [x] Due-reservation expiration workflow
- [x] Expiration worker RBAC
- [x] `FOR UPDATE SKIP LOCKED` expiration batch
- [x] Copy release on expiration
- [x] Expired history state

### 4C — Operations Queue / Idempotency

- [x] Librarian reservation queue
- [x] Management read-only queue
- [x] Reservation internal detail
- [x] Student lookup by ID/email/name
- [x] Item title / call-number search
- [x] Branch / item / status filters
- [x] Valid / overdue hold filter
- [x] Pagination metadata
- [x] Internal allocated-copy operational data
- [x] Student/internal privacy boundary
- [x] `Idempotency-Key`
- [x] Exact request replay
- [x] Different-payload reuse rejection
- [x] 24-hour technical idempotency retention

### 4D — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 4 smoke
- [ ] Clean Sprint 4 smoke data
- [ ] Verify clean state and persistent seed
- [ ] Commit/push Sprint 4

## Definition of Done

```text
npm test                                      PASS
sprint4-full-smoke.ps1                        PASS
cleanup-sprint4-smoke-data.js                 PASS
sprint4-verify-clean-state.js                 PASS
```

Then Sprint 5 — Borrow / Return / Visits can begin.
