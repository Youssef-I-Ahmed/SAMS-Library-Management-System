# SAMS MVP Deployment Checklist v1

## Release status

Sprint 8 closes:

```text
SAMS-MVP-RC1
```

This means the application is a release candidate.

It does **not** mean it has been deployed to university production.

---

# 1. Production configuration

Required:

```text
NODE_ENV=production
DEV_AUTH_ENABLED=false
WEB_ORIGIN=https://<real-student/admin-web-origin>
AUTH_TOKEN_SECRET=<unique-secret-at-least-48-characters>
DATABASE_URL=<production-postgresql-url>
API_JSON_LIMIT=2mb
REQUEST_LOGGING=true
GRACEFUL_SHUTDOWN_TIMEOUT_MS=10000
```

Never copy the development `.env` to production unchanged.

---

# 2. Authentication gate

The current dev-login path is for development/testing.

Before university production:

```text
DEV_AUTH_ENABLED=false
```

and the approved university authentication adapter/SSO must be configured.

Student ID must not become a permanent password.

---

# 3. PostgreSQL

Before opening production traffic:

```text
Prisma migration applied
database/sql/postgres-extensions.sql applied
Sprint 8B DB contract verification passes
```

Required custom objects include:

```text
partial unique indexes
CHECK constraints
validation triggers
updated_at triggers
operational views
validation functions
```

---

# 4. TLS / networking

Production must use:

```text
HTTPS
```

The reverse proxy/cloud environment should provide:

```text
TLS termination
restricted database networking
firewall/security-group rules
no public PostgreSQL exposure
```

---

# 5. Secrets

Store production secrets in:

```text
hosting secret manager
environment-secret configuration
or equivalent protected mechanism
```

Do not commit:

```text
.env
database passwords
auth token secrets
SSO client secrets
```

The MVP RC closeout verifies that root `.env` is not tracked by Git.

---

# 6. Health probes

Liveness:

```text
GET /api/v1/health/live
```

Readiness:

```text
GET /api/v1/health/ready
```

Use:

```text
liveness -> restart unhealthy process
readiness -> remove instance from traffic when DB is unavailable
```

---

# 7. Logging

Production logs include:

```text
requestId
method
path
status
durationMs
```

Do not add request bodies, authorization headers, passwords, tokens, or student-sensitive data to generic HTTP logs.

---

# 8. Backup

Before first production migration or real library data entry:

```text
take PostgreSQL backup
verify backup file exists
perform restore drill
record retention/location
```

See:

```text
docs/deployment/BACKUP_RESTORE_RUNBOOK_v1.md
```

Sprint 8C includes a temporary backup/restore smoke against the development Docker DB.

---

# 9. Legacy migration

Do not bulk-import the currently recovered legacy data into production.

Sprint 7 status:

```text
migration pipeline pilot = validated
full migration = blocked
```

Outstanding evidence includes:

```text
2,108 missing book master titles
PROJECT vs THESIS mapping
real source DB/PC -> branch mapping
legacy copy-status meanings
language mapping
CALL_NUM scope confirmation
```

---

# 10. Release verification

Before deployment candidate approval:

```powershell
npm test

powershell -ExecutionPolicy Bypass -File .\scripts\sprint8\sprint8c-mvp-rc-full-regression.ps1

powershell -ExecutionPolicy Bypass -File .\scripts\sprint8\sprint8c-mvp-rc-closeout.ps1
```

Required final line:

```text
SAMS MVP RC1 CLOSEOUT PASSED.
```

---

# 11. Git

After the RC passes:

```powershell
git status
git add .
git status
git commit -m "feat: complete SAMS MVP release candidate"
git pull --rebase origin dev
git push origin dev
```

Verify `.env` is not staged before committing.

Tagging can be done after the commit when the team is ready, for example:

```text
mvp-rc1
```

Do not tag a commit that has not passed the RC checks.
