# Student Master Data Integration Decision

**Status:** Approved architecture direction
**Integration source:** TBD

## Ownership

Student master data is owned by the university, not by the library.

This includes student ID, university email, display name, faculty, department,
academic status and university account state.

SAMS consumes a synchronized copy so reservations, borrowing and physical-library
visits can reference a trusted student identity.

## Librarian access

Librarians may search and view student records and use an existing record in
circulation/visit workflows.

Librarians must not create or correct university-owned student master data.
Corrections must originate from the authoritative university source.

## Integration source

The transport mechanism is still TBD. Possible adapters include:

- CSV / Excel supplied by the university
- University API
- read-only university database / SIS integration
- scheduled synchronization from another authoritative system

```text
Authoritative University Student Source
             |
             v
     Integration / Sync Adapter
             |
             v
       SAMS students table
             |
       +-----+---------+
       |               |
       v               v
 Circulation       Student login
 / Visits          identity match
```

## Existing import endpoint

`POST /api/v1/students/import` now fails closed: unauthenticated requests receive
401 and authenticated requests receive 403 `STUDENT_IMPORT_NOT_CONFIGURED`, in
every environment. No current role (including Librarian or Management), request
header or payload can authorize import. Existing Directory reads are unchanged.
The previous Librarian-authorized import/CSV smoke workflows intentionally no
longer work. There is no trusted integration identity or explicit import grant in
the current authentication contract; none is invented by this hardening change.

The internal `importStudents` domain service remains available for future approved
integration code and isolated tests. It is not itself an authorization mechanism
and must not be exposed by a new transport without trusted server-side access
control. A future integration requires an approved university source, a verified
principal and explicit roster-import permission enforced server-side. Caller-
supplied role names, headers, email domains and shared development login do not
satisfy that requirement.

### Hardened domain semantics

- Existing accounts must have exactly the Student role and an existing matching
  Student relationship. Staff, multi-role, roleless and unrecognized-role accounts
  are rejected with 409 `PROTECTED_ACCOUNT`; orphan accounts are never auto-linked.
- An existing Student keeps its User identity and role memberships. Email owned by
  another account cannot be transferred. Case-ambiguous stored identities are
  rejected rather than merged. Student IDs keep their stored spelling.
- Omitted `isActive`, `academicStatus`, faculty and department values preserve
  existing values. Explicit Student-only activation/status updates remain supported
  by the internal service. New records retain the previous active defaults.
- Explicit null faculty/department values request clearing. Changing/clearing a
  faculty cannot silently clear an omitted department: incompatible placement is
  rejected, and the caller must explicitly resolve it.
- Trimmed Student IDs (including case variants) and normalized email addresses must
  be unique within the batch. Duplicate rows are rejected, not resolved by order.
- The service validates 1–500 records and preflights the whole batch before writes
  in a serializable Prisma transaction. The existing aggregate/row result shape is
  unchanged. Unique/serialization conflicts return 409 `STUDENT_IMPORT_CONFLICT`
  without automatic replay; callers must reconcile before retrying.

These guarantees cover one transaction, not durable idempotency after an unknown
commit outcome. A future importer still needs reconciliation/idempotency, audit
events and protected identity/permission management. Serializable behavior and
rollback are covered here using transactional mocks; a disposable PostgreSQL
integration test remains necessary before enabling an authorized production path.
