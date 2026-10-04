# SAMS PostgreSQL Backup & Restore Runbook v1

## Development Docker environment

Current development defaults:

```text
container: sams-postgres
database:  sams_library
user:      postgres
host port: 5433
```

Production values will differ.

---

# Recommended backup format

Use PostgreSQL custom format:

```text
pg_dump -Fc
```

Benefits:

```text
pg_restore support
selective restore
portable logical backup
schema + data + indexes + triggers + functions + views
```

---

# Example development backup

Inside the Docker container:

```powershell
docker exec sams-postgres pg_dump `
  -U postgres `
  -d sams_library `
  -Fc `
  -f /tmp/sams_library.dump
```

To persist the dump outside the container:

```powershell
docker cp sams-postgres:/tmp/sams_library.dump .\backups\sams_library.dump
```

Do not commit database backups to Git.

---

# Restore drill

Never test restoration by overwriting the active database.

Create a temporary database:

```powershell
docker exec sams-postgres createdb `
  -U postgres `
  sams_library_restore_test
```

Restore:

```powershell
docker exec sams-postgres pg_restore `
  -U postgres `
  -d sams_library_restore_test `
  --exit-on-error `
  /tmp/sams_library.dump
```

Validate at minimum:

```text
core table row counts
views
triggers
constraints/indexes
persistent seed or expected production records
```

Then drop the temporary restore DB.

---

# Sprint 8C automated drill

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint8\sprint8c-backup-restore-smoke.ps1
```

It:

```text
1. checks pg_dump / pg_restore
2. captures source reconciliation counters
3. creates a temporary custom-format dump
4. restores into sams_library_rc_restore
5. compares core row counts
6. compares views/triggers
7. drops the temporary restore DB
8. removes the temporary dump
```

It does not replace the active `sams_library` database.

---

# Production policy decisions still required

The university/operations owner must define:

```text
backup frequency
retention period
off-host/off-site storage
encryption at rest
access controls
RPO
RTO
restore owner
restore test cadence
incident escalation
```

A backup is not operationally trusted until a restore has been tested.
