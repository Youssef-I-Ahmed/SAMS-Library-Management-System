# SAMS Library System — Sprint 8

## Sprint 8: Hardening / MVP Release Candidate

**Status: COMPLETE ✅ after Sprint 8C closeout passes**

Sprint 8 converts the functional MVP backend into a release-candidate baseline.

---

# 8A — Security + Runtime Hardening

Production startup is guarded against unsafe configuration.

Required production behavior includes:

```text
DEV_AUTH_ENABLED=false
HTTPS WEB_ORIGIN
strong AUTH_TOKEN_SECRET
```

HTTP hardening includes:

```text
strict CORS
Helmet security headers
request correlation IDs
structured request logs
safe 5xx responses
invalid JSON handling
payload-size protection
TRACE rejection
```

---

# 8B — Runtime Readiness

Health responsibilities are separated:

```text
/api/v1/health/live
→ process liveness, DB-independent

/api/v1/health/ready
→ readiness, PostgreSQL-dependent

/api/v1/health
→ backward-compatible combined health
```

Graceful shutdown:

```text
stop accepting requests
close idle connections
allow in-flight requests
force-close after timeout
disconnect Prisma
```

The release candidate also verifies the custom PostgreSQL contract:

```text
partial unique indexes
CHECK constraints
validation triggers
updated_at triggers
operational views
validation functions
```

---

# 8C — Release Candidate Regression

The RC regression reruns the completed backend milestones:

```text
Sprint 1 — Auth & Master Data
Sprint 2 — Catalog & Inventory
Sprint 3 — Student Discovery
Sprint 4 — Reservations
Sprint 5 — Borrow / Return / Visits
Sprint 6 — Analytics
Sprint 7 — Legacy Migration Pilot
Sprint 8A — Security
Sprint 8B — Runtime/DB
```

Mutable smoke suites are followed by their cleanup and clean-state checks.

---

# Database backup / restore

Sprint 8C performs a real logical backup/restore drill against the development PostgreSQL Docker environment.

Flow:

```text
sams_library
   ↓ pg_dump -Fc
temporary dump
   ↓
sams_library_rc_restore
   ↓
row/object reconciliation
   ↓
temporary DB + dump deleted
```

The active development database is never overwritten.

---

# Release manifest

Sprint 8C creates:

```text
docs/release/mvp-rc1-manifest.json
```

It records:

```text
release label
project version
Node version
verified capability list
critical source-file SHA-256 hashes
overall source-content fingerprint
Sprint 7 evidence hash
deployment requirements
legacy-migration approval = false
```

This is a source snapshot, not a claim that production deployment has occurred.

---

# MVP RC capability boundary

Included:

```text
role-based backend access
master data
student adapter/import
catalog and physical inventory
student discovery
reservations
circulation
overdue derivation
physical library visits
management analytics
migration pilot tooling
runtime/security baseline
health/readiness
graceful shutdown
DB invariants
backup/restore readiness
```

Still environment/institution dependent:

```text
university SSO/live student DB
real production infrastructure
notifications
final legacy source recovery
full legacy migration
barcode rollout
production monitoring stack
```

---

# Release status after closeout

```text
Backend MVP Release Candidate: READY

Production deployed: NO
Full legacy migration approved: NO
University SSO integrated: NO
```

Those distinctions must remain explicit.

---

# Next phase

After RC closeout, the next work should be chosen from the deployment/UI/integration track rather than silently expanding the backend scope.

Likely next major tracks:

```text
Frontend implementation against stable APIs
University auth/SSO integration
Deployment/staging environment
Next library visit + full legacy migration evidence
```
