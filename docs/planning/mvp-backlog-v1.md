# SAMS Library Management System
## MVP Backlog v1.0

**Stack baseline:** React + Node.js/Express + PostgreSQL + Prisma  
**Architecture:** Responsive Web Application, centralized, multi-branch ready  
**Primary goal:** Deliver an end-to-end library workflow from student search/reservation through librarian borrowing/return, visits, and management analytics.

## 1. MVP Definition

The MVP is complete when:
1. Student authentication works through a development provider and can later switch to University SSO.
2. Student data can come from seed/import data and later from the University Student DB.
3. Students can search books, theses, and graduation projects.
4. Results show branch availability, Dewey code, call number, and shelf/location.
5. Students can reserve available items.
6. Reservations are protected against race conditions.
7. Librarians can register physical visits.
8. Librarians can borrow a specific physical copy to a student.
9. Librarians can process returns.
10. Copy state remains consistent with reservations and borrowings.
11. Librarians can manage catalog records and physical copies.
12. Basic management KPIs are available.
13. Important administrative operations are audit logged.
14. The system remains multi-branch ready.
15. Critical flows have automated integration/concurrency tests.
16. A small legacy-data sample can be imported successfully.

## 2. Priority Levels

- **P0** — Required for MVP.
- **P1** — Important / immediate post-MVP.
- **P2** — Phase 2 enhancement.

## 3. Epic Overview

| Epic | Name | Priority |
|---|---|---|
| E0 | Project Foundation | P0 |
| E1 | Authentication & RBAC | P0 |
| E2 | University Structure & Master Data | P0 |
| E3 | Catalog & Inventory | P0 |
| E4 | Student Catalog Experience | P0 |
| E5 | Reservations | P0 |
| E6 | Borrowing & Returns | P0 |
| E7 | Physical Library Visits | P0 |
| E8 | Dashboard & Analytics | P0/P1 |
| E9 | Administration & Audit | P1 |
| E10 | Legacy Data Migration | P0 |
| E11 | Quality, Security & Deployment | P0 |
| E12 | Future Enhancements | P2 |

## 4. Detailed Backlog

### E0 — Project Foundation
- **SAMS-001 / P0** Create repository structure.
- **SAMS-002 / P0** Configure React + Vite frontend.
- **SAMS-003 / P0** Configure Node.js + Express backend.
- **SAMS-004 / P0** Configure PostgreSQL + Prisma.

### E1 — Authentication & RBAC
- **SAMS-010 / P0** Build pluggable `AuthProvider`.
- **SAMS-011 / P0** User synchronization.
- **SAMS-012 / P0** Role-Based Access Control.
- **SAMS-013 / P1** University SSO integration when credentials/details are provided.

### E2 — University Structure & Master Data
- **SAMS-020 / P0** Faculties CRUD.
- **SAMS-021 / P0** Departments CRUD.
- **SAMS-022 / P0** Branches CRUD.
- **SAMS-023 / P0** Student seed/import/sync adapter.

### E3 — Catalog & Inventory
- **SAMS-030 / P0** Categories.
- **SAMS-031 / P0** Dewey classifications.
- **SAMS-032 / P0** Library Item CRUD.
- **SAMS-033 / P0** Book details.
- **SAMS-034 / P0** Academic work details.
- **SAMS-035 / P0** Contributors.
- **SAMS-036 / P0** Physical copies.
- **SAMS-037 / P0** Optimistic concurrency on editable records.

### E4 — Student Catalog Experience
- **SAMS-040 / P0** Student Home.
- **SAMS-041 / P0** Catalog search API.
- **SAMS-042 / P0** Filters.
- **SAMS-043 / P0** Search Results UI.
- **SAMS-044 / P0** Item Details UI with availability by branch.

### E5 — Reservations
- **SAMS-050 / P0** Reservation eligibility.
- **SAMS-051 / P0** Transaction-safe reservation allocation using PostgreSQL row locking.
- **SAMS-052 / P0** Reservation expiration/release.
- **SAMS-053 / P0** Reservation cancellation.
- **SAMS-054 / P0** My Reservations UI.

### E6 — Borrowing & Returns
- **SAMS-060 / P0** Borrowing eligibility.
- **SAMS-061 / P0** Atomic Borrow transaction.
- **SAMS-062 / P0** Borrow UI.
- **SAMS-063 / P0** Atomic Return transaction.
- **SAMS-064 / P0** Return UI.
- **SAMS-065 / P0** Overdue calculation.
- **SAMS-066 / P0** My Borrowings.

### E7 — Physical Library Visits
- **SAMS-070 / P0** Visit Check-in.
- **SAMS-071 / P0** Visit Check-out.
- **SAMS-072 / P0** Library Visits UI.

### E8 — Dashboard & Analytics
- **SAMS-080 / P0** KPI API.
- **SAMS-081 / P0** Basic Management Dashboard.
- **SAMS-082 / P0** Analytics database views.
- **SAMS-083 / P1** Python/Power BI/Data Analysis integration.

### E9 — Administration & Audit
- **SAMS-090 / P1** Circulation Policies API.
- **SAMS-091 / P1** Circulation Policies UI.
- **SAMS-092 / P0** Audit logging service.
- **SAMS-093 / P1** Audit Log UI.
- **SAMS-094 / P1** Users & Roles management.

### E10 — Legacy Data Migration
- **SAMS-100 / P0** Acquire authorized complete legacy folders from each relevant PC.
- **SAMS-101 / P0** Profile legacy source system.
- **SAMS-102 / P0** Raw staging import.
- **SAMS-103 / P0** Transform and clean.
- **SAMS-104 / P0** Validate representative sample with library staff.
- **SAMS-105 / P1** Full migration after approval.

### E11 — Quality, Security & Deployment
- **SAMS-110 / P0** Unit tests.
- **SAMS-111 / P0** Integration tests.
- **SAMS-112 / P0** Concurrency tests.
- **SAMS-113 / P0** API validation/security.
- **SAMS-114 / P0** Backup & restore procedure.
- **SAMS-115 / P0** Deployment.

## 5. Required Concurrency Tests

1. Two students reserve the final copy.
2. Two librarians attempt to borrow the same copy.
3. Borrow and reservation race on the same copy.
4. Duplicate return request.
5. Duplicate visit check-in.
6. Two admins update the same item version.
7. Repeated idempotency key.

## 6. Definition of Done

A task is Done only when:
- Acceptance criteria pass.
- Permission checks exist.
- DB constraints/business rules are respected.
- Loading/empty/error states are handled.
- Critical logic is tested.
- Audit logging exists where required.
- Documentation is updated.
- Build/lint/tests pass.
- No secrets are committed.

## 7. External Dependencies Strategy

| Dependency | Strategy |
|---|---|
| University SSO | Develop with `DevAuthProvider`, swap later |
| Student DB | Seed/import adapter first |
| Legacy database | Build migration pipeline using available samples, replace source later |
| Final circulation rules | Keep in `circulation_policies`, not hardcoded |
| Official brand colors | Keep current design tokens, swap later |

## 8. MVP Demo Scenario

```text
Student login
→ Search book
→ Check Main Branch availability
→ Reserve final available copy

Librarian registers physical visit
→ Finds reservation
→ Confirms borrowing
→ Copy becomes BORROWED

Student returns item
→ Librarian confirms return
→ Copy becomes AVAILABLE

Dashboard reflects
→ Visitor +1
→ Borrowing +1
→ Popularity/usage metrics updated
```
