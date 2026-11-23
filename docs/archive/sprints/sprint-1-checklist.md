# Sprint 1 — Identity & Master Data

## Status

**Complete when all items below pass.**

---

## 1A — Authentication + RBAC

- [x] Development auth adapter
- [x] JWT access token
- [x] `/api/v1/auth/dev-login`
- [x] `/api/v1/auth/me`
- [x] `authenticate` middleware
- [x] `authorize` middleware
- [x] STUDENT role
- [x] LIBRARIAN role
- [x] MANAGEMENT role
- [x] Dev auth disabled in production mode

## 1B — University Master Data

- [x] Faculties read/create/update
- [x] Departments read/create/update
- [x] Branches read/create/update
- [x] RBAC on mutation endpoints
- [x] Soft activation/deactivation
- [x] Branch optimistic locking

## 1C — Students Import / Sync

- [x] Student list/search
- [x] Student detail
- [x] Batch student import
- [x] Existing `studentId` updates instead of duplicating
- [x] STUDENT role assigned automatically
- [x] Faculty/department validation
- [x] Duplicate email conflict protection
- [x] CSV adapter
- [x] Ready for future University Student DB/API adapter

## 1D — Catalog Master Data

- [x] Categories read/create/update
- [x] Category soft activation/deactivation
- [x] Dewey classification read/create/update
- [x] Dewey hierarchy
- [x] Duplicate-code DB protection
- [x] Dewey self-parent protection
- [x] Dewey cycle protection
- [x] Dewey code stored as text

## 1E — Integration / Cleanup

- [ ] Existing automated API tests pass
- [ ] Auth smoke passes
- [ ] Master Data smoke passes
- [ ] Students Sync smoke passes
- [ ] Categories/Dewey smoke passes
- [ ] Full Sprint 1 smoke passes
- [ ] Smoke data cleaned
- [ ] Persistent development seed verified
- [ ] Git status reviewed
- [ ] Sprint 1 committed and pushed

---

## Final Sprint 1 Verification

With PostgreSQL/Docker and the API running:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1-full-smoke.ps1
node .\scripts\cleanup-sprint1-smoke-data.js
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1-verify-dev-data.ps1
```

Then:

```powershell
git status
git add .
git commit -m "feat: complete Sprint 1 identity and master data"
git push origin dev
```

---

## Sprint 1 Deliverable

At the end of Sprint 1 the backend has:

```text
Identity
├── Development authentication adapter
├── JWT authentication
└── Role-based authorization

University Master Data
├── Faculties
├── Departments
└── Branches

Students
├── Search
├── Detail
├── Batch import
└── Future sync-adapter boundary

Catalog Master Data
├── Categories
└── Dewey hierarchy
```

The system is then ready for:

**Sprint 2 — Catalog & Inventory**
