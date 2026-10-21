# SAMS Admin + Analytics Frontend v1

Sprint 9F connects Librarian catalog/inventory/student administration and read-only Management analytics/operations.

## Librarian
- Catalog items: create, edit, archive/restore
- BOOK details: ISBN, publisher, edition
- THESIS/PROJECT details: faculty, department, academic year
- Physical copies: create/edit/search/filter
- Students: list/search and protected import/upsert
- Analytics: overview, trends, branch comparison, top items

## Management
- Analytics dashboard
- Borrowings read-only
- Visits read-only
- No mutation controls; backend 403 is verified by smoke

Optimistic locking is preserved by sending the current `version` when editing catalog items and copies.
