# SAMS Library Management System
## Database Design v1.0

**Status:** Draft baseline / implementation-ready design  
**Primary database:** PostgreSQL  
**Target ORM:** Prisma  
**Architecture:** Centralized, web-based, multi-branch library system

---

## 1. Purpose

This document is the source-of-truth for the initial database design of the SAMS Library Management System. It defines the core entities, relationships, fields, constraints, indexing strategy, multi-branch behavior, Dewey/call-number handling, analytics readiness, and data-integrity rules required before implementing the PostgreSQL schema and Prisma models.

The design supports:

- Students and university identity integration.
- Multiple library branches.
- Books, theses, and graduation projects.
- Dewey Decimal Classification and legacy call numbers.
- Physical-copy inventory.
- Reservations.
- Borrowing and returns.
- Physical library visits.
- Audit logging.
- Data migration from the legacy Windows XP / Visual Basic system.
- Python/SQL/BI analytics.
- Future AI/search enhancements without changing the core relational model.

---

## 2. High-Level Design Decisions

1. **PostgreSQL is the primary database.**  
   The domain is strongly relational and requires foreign keys, transactions, constraints, joins, reporting, and reliable concurrency control.

2. **The system is multi-branch from day one.**  
   Even if the pilot begins in one branch, every physical copy and physical visit can be associated with a branch.

3. **A library item is different from a physical copy.**  
   One bibliographic item can have many physical copies across different branches.

4. **Books, theses, and graduation projects share a common base entity.**  
   Common fields live in `library_items`; type-specific fields live in extension tables.

5. **Dewey classification and call number are preserved separately.**  
   The legacy system appears to contain call numbers such as `658.3 / ا.م`; therefore the original value must be retained during migration.

6. **University passwords are not stored by the library system.**  
   University SSO / identity-provider integration is preferred. Local authentication may be added only if required.

7. **Overdue is derived from time, not stored as a permanent borrowing status.**  
   A borrowing is overdue when `returned_at IS NULL AND due_at < NOW()`.

8. **Returns are represented on the borrowing record in v1.**  
   A separate `returns` table is not required unless future workflows need inspection events, fines, disputes, or multiple return-related events.

9. **Important operations are protected at both application and database level.**  
   Business logic in Node.js is supplemented by database transactions, row-level locking, unique/partial indexes, and constraints.

---

## 3. Naming & Type Conventions

- Table names: `snake_case`, plural.
- Column names: `snake_case`.
- Primary keys: `id` using UUID unless otherwise noted.
- Timestamps: `TIMESTAMPTZ` recommended.
- Boolean activation flags: `is_active`.
- Soft removal/archive is preferred to destructive deletion for records with historical usage.
- Codes that may contain leading zeros (e.g. Dewey `004`) are stored as text, not numeric types.

---

## 4. Enums

### 4.1 `item_type`

- `BOOK`
- `THESIS`
- `PROJECT`

### 4.2 `academic_status`

- `ACTIVE`
- `GRADUATED`
- `SUSPENDED`
- `INACTIVE`

### 4.3 `contributor_role`

- `AUTHOR`
- `RESEARCHER`
- `SUPERVISOR`
- `PROJECT_MEMBER`

### 4.4 `copy_status`

- `AVAILABLE`
- `RESERVED`
- `BORROWED`
- `UNAVAILABLE`
- `DAMAGED`
- `LOST`
- `ARCHIVED`

### 4.5 `copy_condition`

- `GOOD`
- `FAIR`
- `DAMAGED`

### 4.6 `reservation_status`

- `PENDING`
- `ACTIVE`
- `FULFILLED`
- `CANCELLED`
- `EXPIRED`

### 4.7 `borrowing_status`

- `ACTIVE`
- `RETURNED`
- `LOST`

### 4.8 `visit_source`

- `MANUAL`
- `BARCODE`
- `QR`

Only `MANUAL` is required for MVP; the others are future-ready values.

---

# 5. Identity & Authorization

## 5.1 `users`

Base identity for any authenticated person using the system.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `university_email` | VARCHAR | No | UNIQUE |
| `external_auth_id` | VARCHAR | Yes | UNIQUE; SSO/IdP identifier |
| `display_name` | VARCHAR | No | |
| `is_active` | BOOLEAN | No | Default `true` |
| `created_at` | TIMESTAMPTZ | No | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | No | |

**Rules**

- Do not store the university password.
- `external_auth_id` is preferred for SSO integration when available.
- Deactivated users remain in history for audit and reporting.

---

## 5.2 `roles`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | SMALLSERIAL / SMALLINT | No | PK |
| `name` | VARCHAR | No | UNIQUE |

Initial values:

- `STUDENT`
- `LIBRARIAN`
- `MANAGEMENT`

---

## 5.3 `user_roles`

Many-to-many assignment between users and roles.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `user_id` | UUID | No | FK → `users.id` |
| `role_id` | SMALLINT | No | FK → `roles.id` |

**Primary key:** (`user_id`, `role_id`)

---

## 5.4 `students`

Student-specific profile extending `users`.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `user_id` | UUID | No | PK + FK → `users.id` |
| `student_id` | VARCHAR | No | UNIQUE |
| `faculty_id` | UUID | Yes | FK → `faculties.id` |
| `department_id` | UUID | Yes | FK → `departments.id` |
| `academic_status` | `academic_status` | No | Default `ACTIVE` |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Notes**

- Student records may be synchronized from an official university student database or imported from an approved source.
- Eligibility to borrow can depend on `academic_status` and circulation rules.

---

# 6. University & Branch Structure

## 6.1 `faculties`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `name` | VARCHAR | No | UNIQUE |
| `is_active` | BOOLEAN | No | Default `true` |

---

## 6.2 `departments`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `faculty_id` | UUID | No | FK → `faculties.id` |
| `name` | VARCHAR | No | |
| `is_active` | BOOLEAN | No | Default `true` |

**Unique:** (`faculty_id`, `name`)

---

## 6.3 `branches`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `code` | VARCHAR | No | UNIQUE |
| `name` | VARCHAR | No | |
| `location` | VARCHAR | Yes | |
| `is_active` | BOOLEAN | No | Default `true` |
| `version` | INTEGER | No | Default `1`; optimistic locking |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

The schema supports all branches even if Phase 1 deploys to one branch.

---

# 7. Catalog & Classification

## 7.1 `categories`

User-friendly categories independent from Dewey.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `name` | VARCHAR | No | UNIQUE |
| `description` | TEXT | Yes | |
| `is_active` | BOOLEAN | No | Default `true` |

Examples: Computer Science, Business, Accounting, Law.

---

## 7.2 `dewey_classifications`

Optional normalized hierarchy for Dewey classification.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `code` | VARCHAR | No | UNIQUE; text to preserve leading zeros |
| `name` | VARCHAR | Yes | |
| `parent_id` | UUID | Yes | Self FK → `dewey_classifications.id` |

Examples: `004`, `658`, `658.3`.

**Migration note:** Normalization to this table should occur only after validating the legacy classification values.

---

## 7.3 `library_items`

Base bibliographic/academic record.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `type` | `item_type` | No | |
| `title` | VARCHAR | No | |
| `category_id` | UUID | Yes | FK → `categories.id` |
| `dewey_classification_id` | UUID | Yes | FK → `dewey_classifications.id` |
| `dewey_code_raw` | VARCHAR | Yes | Preserves source/legacy value |
| `call_number` | VARCHAR | Yes | Preserves values such as `658.3 / ا.م` |
| `language` | VARCHAR | Yes | May later become normalized |
| `publication_year` | SMALLINT | Yes | |
| `abstract_description` | TEXT | Yes | Useful for theses/projects and future semantic search |
| `is_active` | BOOLEAN | No | Default `true` |
| `version` | INTEGER | No | Default `1`; optimistic locking |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Rules**

- `type = BOOK` should have a `book_details` record.
- `type IN (THESIS, PROJECT)` should have an `academic_work_details` record.
- These rules are primarily enforced in service-layer transactions in v1; a later DB trigger may be considered if needed.

---

## 7.4 `book_details`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `item_id` | UUID | No | PK + FK → `library_items.id` |
| `isbn` | VARCHAR | Yes | Not forced UNIQUE during legacy migration |
| `publisher` | VARCHAR | Yes | |
| `edition` | VARCHAR | Yes | |

ISBN uniqueness can be reconsidered after data cleaning.

---

## 7.5 `academic_work_details`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `item_id` | UUID | No | PK + FK → `library_items.id` |
| `faculty_id` | UUID | Yes | FK → `faculties.id` |
| `department_id` | UUID | Yes | FK → `departments.id` |
| `academic_year` | VARCHAR | Yes | |
| `work_type` | `item_type` | No | Must be `THESIS` or `PROJECT` |

---

## 7.6 `contributors`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `full_name` | VARCHAR | No | |

A contributor can be an author, researcher, supervisor, or project member.

---

## 7.7 `item_contributors`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `item_id` | UUID | No | FK → `library_items.id` |
| `contributor_id` | UUID | No | FK → `contributors.id` |
| `role` | `contributor_role` | No | |

**Primary key:** (`item_id`, `contributor_id`, `role`)

---

# 8. Inventory

## 8.1 `physical_copies`

Represents each physical copy in a specific branch.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `item_id` | UUID | No | FK → `library_items.id` |
| `branch_id` | UUID | No | FK → `branches.id` |
| `copy_code` | VARCHAR | Yes | Library-defined copy identifier |
| `barcode` | VARCHAR | Yes | UNIQUE when present; future barcode support |
| `shelf_location` | VARCHAR | Yes | Physical shelf/location |
| `status` | `copy_status` | No | Default `AVAILABLE` |
| `condition` | `copy_condition` | Yes | |
| `version` | INTEGER | No | Default `1`; optimistic locking |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Rules**

- A copy must always belong to one item and one branch.
- Operational transitions are controlled by the backend.
- Example valid cycle: `AVAILABLE → RESERVED → BORROWED → AVAILABLE`.
- Invalid direct transitions (e.g. `BORROWED → RESERVED`) are rejected by service logic.

---

# 9. Reservations

## 9.1 `reservations`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `student_id` | UUID | No | FK → `students.user_id` |
| `item_id` | UUID | No | FK → `library_items.id` |
| `branch_id` | UUID | No | FK → `branches.id` |
| `allocated_copy_id` | UUID | Yes | FK → `physical_copies.id` |
| `status` | `reservation_status` | No | |
| `reserved_at` | TIMESTAMPTZ | No | |
| `expires_at` | TIMESTAMPTZ | No | |
| `fulfilled_at` | TIMESTAMPTZ | Yes | |
| `cancelled_at` | TIMESTAMPTZ | Yes | |
| `cancelled_by_user_id` | UUID | Yes | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Core rules**

- A student may have at most one `PENDING`/`ACTIVE` reservation for the same item.
- An allocated copy must belong to the requested item and branch.
- Expired reservations cannot be fulfilled.
- Reservation duration comes from policy, not hardcoded application constants.
- Copy allocation must be performed inside a transaction using row-level locking.

**Recommended partial unique index**

```sql
CREATE UNIQUE INDEX uq_reservation_student_item_active
ON reservations(student_id, item_id)
WHERE status IN ('PENDING', 'ACTIVE');
```

---

# 10. Borrowing & Returns

## 10.1 `borrowings`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `student_id` | UUID | No | FK → `students.user_id` |
| `copy_id` | UUID | No | FK → `physical_copies.id` |
| `branch_id` | UUID | No | FK → `branches.id` |
| `reservation_id` | UUID | Yes | FK → `reservations.id` |
| `borrowed_at` | TIMESTAMPTZ | No | |
| `due_at` | TIMESTAMPTZ | No | |
| `returned_at` | TIMESTAMPTZ | Yes | |
| `checked_out_by` | UUID | No | FK → `users.id` |
| `returned_by` | UUID | Yes | FK → `users.id` |
| `status` | `borrowing_status` | No | Default `ACTIVE` |
| `return_condition` | VARCHAR | Yes | |
| `notes` | TEXT | Yes | |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Core rules**

- One copy may have at most one active borrowing.
- Borrowing and the corresponding copy-status update happen in one transaction.
- If the borrowing fulfills a reservation, reservation fulfillment and copy transition happen in the same transaction.
- Return updates `returned_at`, `returned_by`, and the copy status in one transaction.
- `due_at >= borrowed_at`.
- `returned_at IS NULL OR returned_at >= borrowed_at`.

**Recommended partial unique index**

```sql
CREATE UNIQUE INDEX uq_one_active_borrowing_per_copy
ON borrowings(copy_id)
WHERE status = 'ACTIVE';
```

**Overdue calculation**

```sql
returned_at IS NULL AND due_at < NOW()
```

---

# 11. Physical Library Visits

## 11.1 `library_visits`

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `student_id` | UUID | No | FK → `students.user_id` |
| `branch_id` | UUID | No | FK → `branches.id` |
| `checked_in_at` | TIMESTAMPTZ | No | |
| `checked_out_at` | TIMESTAMPTZ | Yes | |
| `registered_by` | UUID | No | FK → `users.id` |
| `checkout_by` | UUID | Yes | FK → `users.id` |
| `source` | `visit_source` | No | Default `MANUAL` |
| `created_at` | TIMESTAMPTZ | No | |
| `updated_at` | TIMESTAMPTZ | No | |

**Rules**

- A student may have at most one open visit at a time in the MVP.
- `checked_out_at IS NULL OR checked_out_at >= checked_in_at`.

**Recommended partial unique index**

```sql
CREATE UNIQUE INDEX uq_one_open_visit_per_student
ON library_visits(student_id)
WHERE checked_out_at IS NULL;
```

If the university later requires simultaneous open visits across different branch contexts (unlikely), the unique key can be changed to `(student_id, branch_id)`.

---

# 12. Circulation Policies

## 12.1 `circulation_policies`

Prevents hardcoding reservation/loan rules in Node.js.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `branch_id` | UUID | Yes | FK → `branches.id`; NULL = default/global |
| `item_type` | `item_type` | Yes | NULL = any type |
| `loan_days` | INTEGER | No | `>= 0` |
| `reservation_hold_hours` | INTEGER | No | `>= 0` |
| `max_active_loans` | INTEGER | No | `>= 0` |
| `max_active_reservations` | INTEGER | No | `>= 0` |
| `renewal_limit` | INTEGER | No | Default `0` |
| `effective_from` | DATE | No | |
| `effective_to` | DATE | Yes | |
| `is_active` | BOOLEAN | No | Default `true` |

This supports future policies such as “Thesis = view only” by setting `loan_days = 0` or using an explicit borrowability rule in a future revision.

---

# 13. Audit Logging

## 13.1 `audit_logs`

Append-only administrative/event history.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `id` | UUID | No | PK |
| `actor_user_id` | UUID | Yes | FK → `users.id`; NULL allowed for system jobs |
| `action` | VARCHAR | No | e.g. `BORROW_COPY` |
| `entity_type` | VARCHAR | No | e.g. `library_item`, `borrowing` |
| `entity_id` | VARCHAR | Yes | String to support multiple ID forms |
| `branch_id` | UUID | Yes | FK → `branches.id` |
| `old_values` | JSONB | Yes | |
| `new_values` | JSONB | Yes | |
| `metadata` | JSONB | Yes | |
| `request_id` | UUID | Yes | Correlation/tracing identifier |
| `created_at` | TIMESTAMPTZ | No | Default `NOW()` |

**Security rule:** Never log passwords, access tokens, refresh tokens, OTP codes, or authentication secrets.

---

# 14. Idempotency

## 14.1 `idempotency_records` (recommended)

Protects sensitive commands from duplicate execution due to double-clicks, retries, or unreliable networks.

| Column | Type | Nullable | Constraints / Notes |
|---|---|---:|---|
| `key` | VARCHAR | No | PK or UNIQUE |
| `user_id` | UUID | No | FK → `users.id` |
| `operation` | VARCHAR | No | e.g. `RESERVE`, `BORROW`, `RETURN` |
| `result_reference` | VARCHAR | Yes | Created reservation/borrowing/etc. |
| `created_at` | TIMESTAMPTZ | No | |
| `expires_at` | TIMESTAMPTZ | No | |

A repeated request with the same key returns the previous result instead of executing the operation again.

---

# 15. Concurrency & Data Integrity

The system must explicitly handle race conditions. Relational databases do not remove race conditions automatically; PostgreSQL provides the tools to control them correctly.

## 15.1 Reservation allocation

Recommended pattern:

```sql
BEGIN;

SELECT id
FROM physical_copies
WHERE item_id = $1
  AND branch_id = $2
  AND status = 'AVAILABLE'
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- validate + create reservation + update copy status

COMMIT;
```

If no available row is returned, the reservation cannot allocate a copy at that time.

## 15.2 Borrowing

Within one transaction:

1. Validate student eligibility.
2. Lock the selected copy.
3. Validate copy status / reservation ownership.
4. Insert borrowing.
5. Update copy to `BORROWED`.
6. Mark linked reservation `FULFILLED` when applicable.
7. Commit.

## 15.3 Return

Within one transaction:

1. Lock borrowing record.
2. Lock physical copy.
3. Verify borrowing is active.
4. Set return information.
5. Set borrowing `RETURNED`.
6. Set copy `AVAILABLE` (or another inspected state if future rules require).
7. Commit.

## 15.4 Optimistic locking

Administrative records such as `library_items`, `physical_copies`, and `branches` include `version`.

Update pattern:

```sql
UPDATE library_items
SET title = $1,
    version = version + 1,
    updated_at = NOW()
WHERE id = $2
  AND version = $3;
```

If zero rows are updated, the record changed after the editor loaded it; the client must refresh instead of overwriting another user’s changes.

## 15.5 Isolation level

PostgreSQL `READ COMMITTED` is the default baseline. Most operations should be safe with:

- Transactions
- Explicit row locks
- Constraints
- Partial unique indexes

Higher isolation (e.g. `SERIALIZABLE`) should be used only where a demonstrated business rule requires it.

---

# 16. Recommended Indexes

At minimum:

```text
users(university_email) UNIQUE
students(student_id) UNIQUE
library_items(title)
library_items(type)
library_items(category_id)
library_items(dewey_classification_id)
physical_copies(item_id)
physical_copies(branch_id)
physical_copies(status)
reservations(student_id)
reservations(item_id)
reservations(branch_id)
reservations(status)
borrowings(student_id)
borrowings(copy_id)
borrowings(branch_id)
borrowings(status)
library_visits(student_id)
library_visits(branch_id)
library_visits(checked_in_at)
audit_logs(actor_user_id)
audit_logs(created_at)
```

PostgreSQL Full-Text Search can be added later for title/description/contributor search.

---

# 17. Analytics Views (Planned)

Recommended database views/materialized views for BI/Python consumers:

- `v_item_availability`
- `v_current_borrowings`
- `v_overdue_borrowings`
- `v_active_reservations`
- `v_monthly_library_visits`
- `v_borrowings_by_item`
- `v_borrowings_by_category`
- `v_branch_activity`

The analytics team should consume curated views or read-only reporting access rather than depending on application-specific joins whenever practical.

---

# 18. Legacy Data Migration

The old Windows XP / Visual Basic application is treated as a source system.

Migration pipeline:

```text
Legacy Files / Database
        ↓
Extract
        ↓
Stage Raw Data
        ↓
Profile & Clean
        ↓
Transform
        ↓
Validate with Library Staff
        ↓
Import
        ↓
Reconcile Counts / Samples
```

## 18.1 Preserve raw source values

Fields such as legacy call numbers should be preserved before normalization.

Example:

```text
legacy CALL_NUM = "658.3 / ا.م"

dewey_code_raw = "658.3"
call_number    = "658.3 / ا.م"
```

Do not silently normalize or merge Dewey/call-number values until their local cataloging rules are confirmed.

## 18.2 Expected legacy files to inspect

- `.exe`
- `.dll`
- `.mdb`
- `.accdb`
- `.db`
- `.dbf`
- `.dat`
- `.ini`
- `.cfg`
- `.xml`
- `.bak`

If two old PCs contain different datasets, they must be copied and analyzed separately.

---

# 19. TBC / Questions Before Final Schema Freeze

1. Is Phase 1 one branch or multiple branches?
2. Exact university SSO / identity provider.
3. Student database integration method and accessible fields.
4. Reservation hold duration.
5. Maximum active loans per student.
6. Maximum active reservations per student.
7. Loan duration by item type.
8. Whether theses/projects are borrowable or in-library-only.
9. Whether an already-borrowed item may be queued/reserved for later.
10. Whether visitor check-out is mandatory.
11. Exact legacy call-number convention.
12. Mandatory fields when cataloging a new book/thesis/project.
13. Whether fines, renewals, lost-item replacement, or penalties are in MVP scope.

---

# 20. Implementation Sequence

1. Freeze Database Design v1 after remaining TBC answers.
2. Generate `schema.prisma`.
3. Generate PostgreSQL migration(s).
4. Seed roles and baseline policies.
5. Implement repository/service layer.
6. Implement transaction-safe reservation/borrow/return services.
7. Add integration tests for concurrency.
8. Add reporting views.
9. Import a small legacy-data sample.
10. Validate with library staff before full migration.

---

## 21. v1 Table Inventory

### Identity
- `users`
- `roles`
- `user_roles`
- `students`

### University / Organization
- `faculties`
- `departments`
- `branches`

### Catalog
- `categories`
- `dewey_classifications`
- `library_items`
- `book_details`
- `academic_work_details`
- `contributors`
- `item_contributors`

### Inventory
- `physical_copies`

### Operations
- `reservations`
- `borrowings`
- `library_visits`
- `circulation_policies`

### System Integrity / Audit
- `audit_logs`
- `idempotency_records` (recommended)

---

**End of Database Design v1.0**
