# SAMS Library System — Sprint 8 Checklist

## Sprint 8 — Hardening / MVP Release Candidate

Status: implementation complete; RC closeout pending.

### 8A — Security + Runtime Hardening

- [x] Production DEV auth guard
- [x] Production HTTPS WEB_ORIGIN guard
- [x] Production auth-secret minimum
- [x] Strict CORS
- [x] X-Request-Id
- [x] Structured request logging
- [x] Safe 5xx responses
- [x] Invalid JSON normalization
- [x] JSON payload-size limit
- [x] TRACE rejection
- [x] Security baseline documentation
- [x] HTTP hardening smoke

### 8B — Runtime + DB Verification

- [x] Liveness endpoint
- [x] Readiness endpoint
- [x] Backward-compatible health endpoint
- [x] Graceful shutdown
- [x] Prisma disconnect
- [x] Permanent hardening tests
- [x] Read-only API regression
- [x] Partial-index verification
- [x] CHECK-constraint verification
- [x] Trigger verification
- [x] View verification
- [x] Function verification

### 8C — MVP RC Closeout

- [ ] Full Sprint 1–8 RC regression
- [ ] Clean smoke data after mutable suites
- [ ] Re-verify Sprint clean states
- [ ] PostgreSQL backup/restore drill
- [ ] Build source/hash release manifest
- [ ] Verify `.env` not Git-tracked
- [ ] Verify persistent dev seed
- [ ] Verify legacy pilot artifacts absent from DB
- [ ] Deployment checklist
- [ ] Backup/restore runbook
- [ ] Commit/push RC

## Definition of Done

```text
npm test                                      PASS
sprint8c-mvp-rc-full-regression.ps1           PASS
sprint8c-mvp-rc-closeout.ps1                  PASS
```

Final expected line:

```text
SAMS MVP RC1 CLOSEOUT PASSED.
```
