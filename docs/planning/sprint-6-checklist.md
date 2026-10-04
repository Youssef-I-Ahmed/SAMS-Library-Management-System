# SAMS Library System — Sprint 6 Checklist

## Sprint 6 — Analytics

Status: implementation complete; closeout verification pending.

### 6A — KPI Contract + Overview

- [x] Shared KPI contract
- [x] Explicit `[from, to)` period semantics
- [x] Active branch scope
- [x] Branch filter
- [x] Catalog KPI group
- [x] Reservation KPI group
- [x] Circulation KPI group
- [x] Visit KPI group
- [x] Availability rate
- [x] Overdue-loan rate
- [x] Active/expired-hold distinction
- [x] Aggregate-only privacy boundary
- [x] Librarian analytics access
- [x] Management analytics access
- [x] Student analytics protection
- [x] Formula smoke validation

### 6B — Dashboard Chart Datasets

- [x] DAY trend buckets
- [x] WEEK trend buckets
- [x] MONTH trend buckets
- [x] UTC bucket alignment
- [x] Zero-filled chart buckets
- [x] Reservations trend
- [x] Borrowings trend
- [x] Returns trend
- [x] Visits trend
- [x] Unique visitors trend
- [x] Active-branch global scope alignment
- [x] Branch comparison dataset
- [x] Top borrowed items
- [x] Top reserved items
- [x] Deterministic ranking
- [x] Trend-range safeguards

### 6C — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 6 smoke
- [ ] Clean Sprint 6 smoke data
- [ ] Verify clean state + persistent seed
- [ ] Commit/push Sprint 6

## Definition of Done

```text
npm test                                      PASS
sprint6-full-smoke.ps1                        PASS
cleanup-sprint6-smoke-data.js                 PASS
sprint6-verify-clean-state.js                 PASS
```

Then Sprint 7 — Legacy Migration Pilot can begin.
