# SAMS Library System — Sprint 7 Checklist

## Sprint 7 — Legacy Migration Pilot

Status: implementation complete; closeout verification pending.

### 7A — Source Profiling + Raw Staging

- [x] Preserve raw CSV inputs
- [x] SHA-256 source hashes
- [x] 1:1 JSONL staging
- [x] 6,042 rows staged
- [x] Field profile
- [x] Mapping readiness report
- [x] Exception report
- [x] 2,108 missing-title blockers identified
- [x] PROJECT/THESIS ambiguity preserved
- [x] Call-number anomalies preserved
- [x] Negative-copy anomaly identified
- [x] Zero application DB writes

### 7B — Canonical Transform Dry Run

- [x] 22 titled book candidates
- [x] Canonical LibraryItem preview
- [x] BookDetails preview
- [x] No language guessing
- [x] No Dewey guessing
- [x] No automatic contributor generation
- [x] 34 current copy preview rows
- [x] Copy-count reconciliation
- [x] Deleted-copy evidence preserved
- [x] Dedupe review
- [x] Zero auto-merges
- [x] 22/22 partial-source corroboration
- [x] Zero application DB writes

### 7C — Controlled DB Pilot

- [x] Collision preflight
- [x] 3 sample books
- [x] 4 sample copies
- [x] Single transaction import
- [x] Temporary source branches
- [x] Quarantine copies as UNAVAILABLE
- [x] No production status semantic claim
- [x] AuditLog traceability
- [x] Same-title records stay distinct
- [x] Zero circulation side effects
- [x] Pilot cleanup
- [x] DB clean-state verification

### 7D — Integration & Closeout

- [ ] Run `npm test`
- [ ] Run full Sprint 7 smoke
- [ ] Build migration evidence manifest
- [ ] Verify evidence hashes
- [ ] Verify pilot DB records are absent
- [ ] Verify persistent dev seed
- [ ] Commit/push Sprint 7

## Definition of Done

```text
npm test                                      PASS
sprint7-full-smoke.ps1                        PASS
sprint7d-closeout.ps1                         PASS
```

Sprint 7 completion means:

```text
migration mechanics validated
```

It does **not** mean:

```text
full legacy migration approved
```

Then Sprint 8 — Hardening / MVP Release Candidate can begin.
