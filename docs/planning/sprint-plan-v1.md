# SAMS Library Management System
## Sprint Plan v1.0

Suggested sprint length: **1–2 weeks** depending on team availability.  
This is dependency-based, not a rigid deadline.

## Sprint 0 — Foundation
**Goal:** Web → API → PostgreSQL works locally.

Work:
- Repository structure.
- React/Vite.
- Express.
- PostgreSQL/Prisma.
- Design tokens.
- Environment setup.
- Logging/error format.
- Test framework.
- Seed roles.
- Health endpoint.

**Exit:** frontend, API, migrations, DB connection, and tests all run.

## Sprint 1 — Identity & Master Data
**Goal:** Development login + core university structure.

Work:
- AuthProvider abstraction.
- Dev login.
- RBAC.
- Faculties.
- Departments.
- Branches.
- Student import/seed.
- Categories.
- Dewey.

**Exit:** Student/Admin/Management routes are protected and master data works.

## Sprint 2 — Catalog & Inventory
**Goal:** Librarian can build the catalog.

Work:
- Library Items.
- Book Details.
- Academic Work Details.
- Contributors.
- Physical Copies.
- Optimistic locking.
- Catalog audit events.

**Exit:** Book/Thesis/Project + copies can be created and edited safely.

## Sprint 3 — Student Search
**Goal:** Students can discover library resources.

Work:
- Search API.
- Filters.
- Availability.
- Student Home.
- Search Results.
- Item Details.

**Exit:** Login → Search → Filter → Item → Branch/Shelf/Availability.

## Sprint 4 — Reservations
**Goal:** Safe reservation flow.

Work:
- Policy lookup.
- Reservation eligibility.
- Transaction-safe allocation.
- `FOR UPDATE SKIP LOCKED`.
- Cancellation.
- Expiration.
- My Reservations.
- Concurrency tests.

**Critical acceptance test:**
```text
2 students + 1 available copy
→ exactly 1 reservation succeeds
```

## Sprint 5 — Borrow / Return / Visits
**Goal:** Complete physical circulation workflow.

Work:
- Borrow eligibility.
- Borrow transaction.
- Return transaction.
- Overdue calculation.
- My Borrowings.
- Visit Check-in/out.
- Idempotency.
- Audit events.
- Admin circulation screens.

**Exit:** Reserve → Visit → Borrow → Return works end-to-end.

## Sprint 6 — Dashboard & Analytics
**Goal:** Convert operational data into management information.

Work:
- KPI API.
- Analytics SQL views.
- Dashboard.
- Branch filter.
- Visitor trends.
- Borrowing trends.
- Popular items.
- Overdue metrics.

**Data Analysis Team:** validate KPI definitions, formulas, and visuals.

## Sprint 7 — Legacy Migration Pilot
**Goal:** Prove old data can be migrated safely.

Work:
- Inspect complete legacy folders.
- Identify DB engine/tables/encoding.
- Raw staging.
- Mapping.
- Cleaning.
- Sample import.
- Reconciliation.

**Exit:** library staff verify representative migrated records.

## Sprint 8 — Hardening / MVP Release Candidate
**Goal:** Pilot-ready system.

Work:
- Full integration/concurrency tests.
- Security review.
- Permissions review.
- Responsive QA.
- Backup/restore test.
- Demo dataset.
- Deployment.
- User/admin quick guide.

**Exit:** all P0 requirements pass.

## Post-MVP
- Production University SSO.
- Live Student DB integration.
- Policies UI.
- Audit Log UI.
- User/role management.
- Full legacy migration.
- Advanced analytics.
- Barcode/QR.
- Notifications.
- Renewals/waitlists.
- Semantic search / AI / RAG.
- Mobile app.

## Critical Path

```text
Foundation
↓
Identity & Master Data
↓
Catalog & Copies
↓
Student Search
↓
Reservations
↓
Borrow / Return / Visits
↓
Analytics
↓
Migration Validation
↓
Release Candidate
```

## Recommended First Coding Session

1. Create Git repository.
2. Create `apps/web`.
3. Create `apps/api`.
4. Configure PostgreSQL.
5. Add Prisma schema.
6. Run first migration.
7. Seed roles.
8. Add `/api/v1/health`.
9. Call health endpoint from React.
10. Commit: `chore: initialize SAMS library project`
