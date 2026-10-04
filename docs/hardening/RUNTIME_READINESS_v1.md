# SAMS Runtime Readiness v1

## Liveness

```text
GET /api/v1/health/live
```

Purpose:

```text
Is the Node.js process alive and serving HTTP?
```

This endpoint deliberately does **not** depend on PostgreSQL.

Expected success:

```text
200
status = ok
check = liveness
```

Use liveness for process/container restart decisions.

---

## Readiness

```text
GET /api/v1/health/ready
```

Purpose:

```text
Can this API instance currently serve database-backed application traffic?
```

Readiness executes a lightweight PostgreSQL query.

Healthy:

```text
200
status = ready
database = connected
```

Database unavailable:

```text
503
status = not_ready
database = disconnected
```

Use readiness to decide whether an instance should receive traffic.

---

## Backward-compatible health

Existing:

```text
GET /api/v1/health
```

remains supported for Sprint smoke scripts and operational compatibility.

It reports database connectivity and now returns `503` if the DB is unavailable.

---

# Graceful shutdown

The HTTP server runtime is separated into:

```text
src/runtime/http-server.js
```

Shutdown behavior:

```text
1. stop accepting new connections
2. close idle connections
3. allow in-flight requests to finish
4. force-close remaining connections after configured timeout
5. disconnect Prisma
```

Config:

```text
GRACEFUL_SHUTDOWN_TIMEOUT_MS
```

Default:

```text
10000
```

Allowed range:

```text
1000–60000 ms
```

`SIGINT` and `SIGTERM` are handled idempotently.

---

# Read-only regression

Sprint 8B verifies representative production routes without creating test data:

```text
health/live
health/ready
master-data/branches
discovery/items
reservations/me
borrowings/me
borrowings operations
visits operations
analytics overview
```

It also confirms:

```text
student analytics denial
anonymous protected-route denial
structured 404 behavior
request IDs on responses
```

---

# PostgreSQL contract verification

SAMS depends on custom PostgreSQL objects that Prisma schema alone does not describe completely.

Sprint 8B verifies their presence on every release candidate.

## Partial unique indexes

```text
uq_reservation_student_item_active
uq_reservation_allocated_copy_active
uq_borrowing_copy_active
uq_open_visit_per_student
```

## CHECK constraints

```text
chk_reservation_expiry_after_start
chk_borrowing_due_after_start
chk_visit_checkout_after_checkin
chk_academic_work_type
```

## Business validation triggers

```text
trg_student_department_faculty
trg_book_details_type
trg_academic_work_type
trg_reservation_copy
trg_borrowing_consistency
```

## updated_at triggers

```text
trg_users_updated_at
trg_students_updated_at
trg_branches_updated_at
trg_library_items_updated_at
trg_physical_copies_updated_at
trg_reservations_updated_at
trg_borrowings_updated_at
trg_library_visits_updated_at
```

## Operational views

```text
v_item_availability
v_current_borrowings
v_overdue_borrowings
v_active_reservations
v_monthly_library_visits
```

If one of these disappears from a deployment database, the release-candidate verification fails rather than silently running with weaker invariants.
