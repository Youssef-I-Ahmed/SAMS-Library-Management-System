# SAMS Library Management System
## Database & Business Rules v1.0

This document contains the operational rules that the application and PostgreSQL database must enforce. It complements `database-design-v1.md`.

---

## 1. Identity & Access

- Students access the system only if their university identity is valid and active.
- University passwords must not be stored by the library system.
- `STUDENT`, `LIBRARIAN`, and `MANAGEMENT` are separate roles.
- Only authorized staff may perform catalog changes, borrowing, returns, and manual visit registration.
- Deactivating a user must not remove historical borrowing/reservation/audit records.

---

## 2. Multi-Branch Rules

- Every physical copy belongs to exactly one branch.
- Reservations target an item and a requested branch.
- Borrowings reference the branch from which the physical copy was checked out.
- Physical visits always reference a branch.
- The pilot may run at one branch, but no database rule should assume only one branch exists.

---

## 3. Catalog Rules

- Every `library_item` has exactly one type: `BOOK`, `THESIS`, or `PROJECT`.
- `BOOK` items should have one `book_details` record.
- `THESIS` and `PROJECT` items should have one `academic_work_details` record.
- A bibliographic item may have zero or many physical copies.
- A physical copy cannot exist without an item and branch.
- Items with transaction history should normally be archived rather than hard-deleted.

---

## 4. Dewey / Call Number Rules

- Dewey values are stored as text because leading zeros matter (`004` ≠ numeric `4` for display/cataloging purposes).
- The full legacy call number is preserved separately (e.g. `658.3 / ا.م`).
- Migration must preserve raw source values before normalization.
- Automatic cleanup/normalization of legacy call numbers must not occur until local library conventions are confirmed.

---

## 5. Physical Copy Status Rules

Supported values:

- `AVAILABLE`
- `RESERVED`
- `BORROWED`
- `UNAVAILABLE`
- `DAMAGED`
- `LOST`
- `ARCHIVED`

Typical allowed flow:

```text
AVAILABLE → RESERVED → BORROWED → AVAILABLE
```

Additional administrative flows:

```text
AVAILABLE → DAMAGED
AVAILABLE → LOST
AVAILABLE → ARCHIVED
```

The backend must reject invalid transitions such as direct `BORROWED → RESERVED`.

---

## 6. Reservation Rules

- A reservation belongs to one student, one library item, and one requested branch.
- A reservation may temporarily have no allocated copy (`PENDING`).
- An `ACTIVE` reservation normally has an allocated copy.
- A student may not have more than one active/pending reservation for the same item.
- Reservation expiration is policy-driven.
- An expired reservation cannot be fulfilled.
- Cancelling/expiring an allocated reservation must release the copy when appropriate.
- Allocated copy must match the reservation item and branch.

### Reservation concurrency

When allocating an available copy:

1. Start transaction.
2. Select candidate copy using `FOR UPDATE SKIP LOCKED`.
3. Re-check status inside the transaction.
4. Insert/update reservation.
5. Update copy to `RESERVED`.
6. Commit.

If no copy is available, do not create an incorrectly allocated active reservation.

---

## 7. Borrowing Rules

- Borrowing is performed by authorized library staff.
- One physical copy may have only one active borrowing.
- Student eligibility is checked before checkout.
- Copy status and borrowing row must be changed atomically in one transaction.
- A reserved copy can only be borrowed by the appropriate student unless an authorized override policy is explicitly defined.
- If a reservation results in borrowing, mark the reservation `FULFILLED` in the same transaction.
- `due_at >= borrowed_at`.
- Maximum loans and loan duration are policy-driven.

### Database guarantee

Use a partial unique index to enforce one active borrowing per copy.

---

## 8. Return Rules

- A return updates the original borrowing record.
- Returning an already returned borrowing must be rejected/idempotent.
- Return operation is atomic:
  1. Lock borrowing.
  2. Lock copy.
  3. Validate borrowing is active.
  4. Set `returned_at` and `returned_by`.
  5. Set borrowing status to `RETURNED`.
  6. Set copy to `AVAILABLE` (or future inspection state).
  7. Commit.
- `returned_at >= borrowed_at`.

---

## 9. Overdue Rules

Do not store `OVERDUE` as a permanent borrowing status in v1.

A borrowing is overdue when:

```sql
returned_at IS NULL
AND due_at < NOW()
```

This avoids stale state when time passes without a background job updating records.

---

## 10. Library Visit Rules

- Website login is not a physical library visit.
- A physical visit records student, branch, check-in time, and registering staff member.
- A student may have only one open visit at a time in MVP.
- `checked_out_at` may be null while the student is still inside.
- `checked_out_at >= checked_in_at` when present.
- Visit source starts as `MANUAL`; barcode/QR may be added later.

---

## 11. Circulation Policy Rules

Do not hardcode values such as:

- Loan days.
- Reservation hold hours.
- Maximum active loans.
- Maximum active reservations.
- Renewal limits.

Read them from `circulation_policies`.

Policy precedence can be defined later, but recommended order is:

1. Branch + item type specific.
2. Branch default.
3. Global item type specific.
4. Global default.

---

## 12. Race Conditions & Concurrency

Race conditions are explicitly in scope.

### 12.1 Last-copy reservation

Use transaction + row-level locking (`FOR UPDATE SKIP LOCKED`).

### 12.2 Borrow same copy twice

Use transaction + row lock + partial unique index.

### 12.3 Return submitted twice

Lock borrowing; second request must observe already-returned state and not create another result.

### 12.4 Two admins edit same record

Use optimistic locking with a `version` column.

### 12.5 Duplicate network request / double-click

Use idempotency keys for sensitive commands such as reserve, borrow, and return.

---

## 13. Transaction Boundaries

The following must be atomic:

### Reservation allocation

- Lock candidate copy.
- Create/update reservation.
- Update copy status.

### Borrowing

- Validate student.
- Lock copy.
- Create borrowing.
- Update copy status.
- Fulfill reservation (if applicable).

### Return

- Lock borrowing.
- Lock copy.
- Update borrowing.
- Update copy.

A failure at any step must roll back the whole operation.

---

## 14. Optimistic Locking

Use `version` on records where concurrent administrative editing is realistic:

- `library_items`
- `physical_copies`
- `branches`

Update only when the submitted version equals the current version. If no row is updated, return a concurrency conflict response and require refresh.

---

## 15. Idempotency

Sensitive command endpoints should accept an idempotency key.

Recommended operations:

- Reservation creation.
- Borrowing creation.
- Return confirmation.

The same user + operation + idempotency key must not execute twice.

---

## 16. Audit Rules

Audit at minimum:

- Catalog create/update/archive.
- Copy status changes.
- Reservation create/cancel/fulfill.
- Borrowing.
- Return.
- Manual administrative overrides.

Audit logs are append-only from the application perspective.

Never write the following to audit JSON:

- Passwords.
- Access tokens.
- Refresh tokens.
- OTPs.
- Authentication secrets.

---

## 17. Data Deletion Rules

- Prefer soft-delete/archive for catalog and organizational records referenced historically.
- Do not cascade-delete historical borrowings, reservations, visits, or audit events when a user/item becomes inactive.
- Hard deletion is reserved for clearly erroneous test/import records before production reconciliation, under authorized administration.

---

## 18. Analytics Rules

- Analytics should read consistent, documented fields/views.
- Physical visitor metrics use `library_visits`, not web logins.
- Most-borrowed metrics use borrowing transactions, not current copy status.
- Overdue metrics are derived from `due_at` and `returned_at`.
- Branch analytics must use stored branch relationships, not infer branch from text.
- Historical facts must remain valid even when catalog records are archived.

---

## 19. Migration Rules

- Keep source files read-only during extraction.
- Preserve raw source values.
- Do not merge ambiguous records automatically.
- Record migration mappings/errors separately during implementation.
- Validate sample records with library staff before full import.
- Reconcile record counts and key totals after import.

---

## 20. Current TBC Rules

The following must be confirmed before final business-rule freeze:

- Reservation duration.
- Max simultaneous reservations.
- Max simultaneous loans.
- Loan duration by item type.
- Renewals.
- Whether borrowed items can be queued/reserved.
- Whether theses/projects may leave the library.
- Lost/damaged item process.
- Fine/penalty rules if any.
- Visitor check-out requirement.
- Exact call-number construction used by the library.

---

**End of Database & Business Rules v1.0**
