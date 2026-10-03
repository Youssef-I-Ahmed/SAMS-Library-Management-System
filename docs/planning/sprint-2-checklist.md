# SAMS Library System — Sprint 2 Checklist

## Sprint 2 — Catalog & Inventory

Status: implementation complete; closeout verification pending.

### 2A — LibraryItem CRUD

- [x] Create `BOOK`, `THESIS`, `PROJECT`
- [x] List/search/filter/paginate
- [x] Detail endpoint
- [x] Soft archive with `isActive`
- [x] Optimistic locking with `version`
- [x] Category validation
- [x] Dewey validation
- [x] Preserve raw Dewey/call number as text
- [x] Student reads active items only
- [x] Librarian create/update/archive
- [x] Management read-only

### 2B — Item Type Details

- [x] `BookDetails`
- [x] `AcademicWorkDetails`
- [x] `BOOK` type protection
- [x] `THESIS` / `PROJECT` type protection
- [x] Faculty/Department validation
- [x] Department/Faculty consistency
- [x] `workType` derived from parent item
- [x] Shared optimistic-lock boundary

### 2C — Contributors

- [x] Contributor CRUD/search
- [x] `ItemContributor`
- [x] Contributor roles
- [x] Transactional replace-set
- [x] Duplicate contributor/role protection
- [x] Contributor-name catalog search
- [x] Contributor details in item detail

### 2D — Physical Inventory

- [x] Physical copy create/list/detail/update
- [x] Branch validation
- [x] Active-item validation
- [x] Barcode uniqueness
- [x] Search/filter/pagination
- [x] Physical-copy optimistic locking
- [x] Student blocked from raw inventory
- [x] Management read-only
- [x] Manual `RESERVED` / `BORROWED` blocked

### 2E — Availability + Concurrency

- [x] Student-facing aggregate availability
- [x] Per-branch availability
- [x] Hide raw physical-copy identifiers from student availability
- [x] `AVAILABLE` counting rule
- [x] Ignore archived holdings
- [x] Last-copy row lock
- [x] `FOR UPDATE SKIP LOCKED`
- [x] Real concurrency smoke test

### 2F — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 2 smoke
- [ ] Clean Sprint 2 smoke records
- [ ] Verify clean state and Sprint 1 persistent seed
- [ ] Final Sprint 2 commit/push

## Definition of Done

Sprint 2 is complete when:

```text
npm test                                      PASS
sprint2-full-smoke.ps1                        PASS
cleanup-sprint2-smoke-data.js                 PASS
sprint2-verify-clean-state.js                 PASS
```

Then Sprint 3 can begin.
