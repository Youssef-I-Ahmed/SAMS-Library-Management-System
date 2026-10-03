# SAMS Library System — Sprint 3 Checklist

## Sprint 3 — Student Search & Discovery

Status: implementation complete; closeout verification pending.

### 3A — Discovery Search

- [x] Student-facing discovery endpoint
- [x] Search by title
- [x] Search by contributor
- [x] Search by ISBN
- [x] Search by call number
- [x] Search by Dewey
- [x] Search by category
- [x] Search by academic year
- [x] Type/category/Dewey/language/year filters
- [x] Branch filter
- [x] `availableOnly`
- [x] Sorting
- [x] Pagination
- [x] Aggregate availability in results
- [x] Raw inventory privacy boundary
- [x] Archived items hidden

### 3B — Student Item Detail

- [x] Student-facing item detail
- [x] Core metadata
- [x] Book details
- [x] Academic-work details
- [x] Contributors
- [x] Full aggregate availability
- [x] Per-branch availability
- [x] Reservation candidate branches
- [x] No false final `canReserve` claim
- [x] Raw inventory privacy boundary
- [x] Archived detail returns 404

### 3C — Discovery Facets & UX Metadata

- [x] Item-type facets
- [x] Category facets
- [x] Dewey facets
- [x] Language facets
- [x] Publication-year facets
- [x] Branch facets
- [x] Availability facet
- [x] Sort options
- [x] Defaults
- [x] `hasPreviousPage`
- [x] `hasNextPage`
- [x] Applied-filter metadata
- [x] Facet privacy boundary

### 3D — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 3 smoke
- [ ] Clean Sprint 3 smoke records
- [ ] Verify clean state and persistent seed
- [ ] Commit/push Sprint 3

## Definition of Done

```text
npm test                                      PASS
sprint3-full-smoke.ps1                        PASS
cleanup-sprint3-smoke-data.js                 PASS
sprint3-verify-clean-state.js                 PASS
```

Then Sprint 4 — Reservations can begin.
