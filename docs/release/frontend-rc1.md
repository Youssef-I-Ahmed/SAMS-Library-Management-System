# SAMS Frontend RC1

## Status

Sprint 9 frontend implementation has completed its functional and browser-review
phases. Final Git review is complete.

## Delivered

### Student
- development authentication and protected Student workspace
- catalog discovery and filtering
- item details and availability
- reservation creation/cancellation
- borrowing history and overdue state
- student profile
- responsive mobile navigation

### Librarian
- checkout from reservation
- direct checkout
- returns
- reservation queue and cancellation
- physical visit check-in/check-out
- catalog item administration
- physical-copy administration
- read-only University Student Directory
- analytics

### Management
- read-only analytics
- read-only borrowing activity
- read-only visit activity
- backend mutation denial verified by regression

## Architecture decisions

### Student Master Data

The University is the authoritative owner of student identity and academic data.

SAMS consumes a synchronized copy. Librarians can search/view students but do
not create or edit student master records in the frontend.

The final integration source is still TBD and may be CSV/Excel, University API,
SIS/database access or another authoritative integration.

### Physical-copy circulation ownership

`RESERVED` and `BORROWED` copy states are circulation-managed states.

The catalog UI does not attempt to manually rewrite those states or move their
branch while an active circulation relationship owns them. Non-circulation
metadata can still be edited.

## Frontend quality gates passed

- Sprint 9G2 final functional regression
- Student privacy/RBAC regression
- Librarian operational regression
- Management read-only/RBAC regression
- route-level lazy loading
- production Vite build
- responsive browser review
- English / Arabic
- LTR / RTL
- Light / Dark
- accessibility-oriented UI contract checks

The initial application JS bundle was reduced from approximately 697 kB to
approximately 449 kB through route-level code splitting, removing the previous
Vite `>500 kB` warning.

## Deferred / integration-dependent work

These are not hidden inside the RC:

- production University authentication / SSO
- authoritative Student Data integration source
- moving student synchronization authorization from temporary librarian access
  to the final integration/service identity once that source is selected
- automated or scheduled expiration handling for overdue reservation holds
- dependency/security hardening work tracked separately from Sprint 9
- production data migration from the legacy library system

## Git note

The discovery-facets backend fix was made after the backend `mvp-rc1` tag and
must not be represented as part of that historical tag.

Prefer reviewing/committing that backend fix separately from the final Sprint 9
frontend commit.
