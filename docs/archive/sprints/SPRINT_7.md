# SAMS Library System — Sprint 7

## Sprint 7: Legacy Migration Pilot

**Status: COMPLETE ✅ after final closeout commands pass**

Sprint 7 validates a conservative and traceable migration pipeline for the currently recovered legacy data.

It intentionally separates:

```text
source recovery
staging
transformation
reconciliation
controlled DB import
full production migration
```

Only the first five are exercised here.

A full production migration remains blocked by missing source evidence and unresolved legacy semantics.

---

# Sprint 7A — Source Profiling + Raw Staging

Current recovered files:

```text
books-extracted-partial.csv
books-reconstructed-recovery.csv
projects-theses-extracted.csv
```

Total:

```text
6,042 source rows
```

Every source is hashed with SHA-256.

Every CSV row is staged 1:1 into JSONL with:

```text
source dataset
source role
source file
source file SHA-256
source record number
logical row
legacy source key
row SHA-256
all original source fields
```

No raw file is edited.

No PostgreSQL write occurs.

## Current source findings

### Books reconstructed

```text
2,130 rows
22 titled rows
2,108 title-missing rows
```

The 2,108 records cannot create `LibraryItem` rows because title is required.

Titles are not invented.

### Academic works

```text
3,890 rows
3,890 with title
```

But target type is unresolved:

```text
PROJECT
vs
THESIS
```

No type is guessed.

Other anomalies include:

```text
6 duplicate-title groups
135 comma-style CALL_NUM values
1 negative copy count
```

---

# Sprint 7B — Canonical Transform Dry Run

Only the 22 titled book candidates are transformed.

Mapped conservatively:

```text
TITLE
PUBLISHING_DATE when valid
CALL_NUM raw
ISBN
publisher
edition
```

Deliberately unresolved:

```text
language
Dewey
contributors
subject/category
real branch
legacy copy status
```

Current result:

```text
22 canonical BOOK candidates
21 parsed publication years
13 ISBN values
21 publisher values

34 current-copy preview rows
0 copy-count mismatches
1 deleted-copy evidence record
```

## Dedupe

```text
0 strong ISBN collision groups

1 title/year review group
2 records
0 auto-merges
```

A title collision is not treated as proof of identity.

## Corroboration

The 22 partial extracted records are compared against the reconstructed titled records.

Current result:

```text
22 / 22 selected-field matches
```

The partial dataset is therefore corroborating evidence, not an independent import source.

---

# Sprint 7C — Controlled Database Pilot

Sprint 7C tests the actual PostgreSQL model with a tiny reversible sample.

Sample:

```text
BOOK_CODE 12
BOOK_CODE 19
BOOK_CODE 1021
```

Expected target:

```text
3 LibraryItems
4 PhysicalCopies
```

## Temporary branch mapping

For test mechanics only:

```text
digi1.DB -> LEGACY_PILOT_DIGI1
sss.DB   -> LEGACY_PILOT_SSS
```

These branches are deleted after the pilot.

No real production branch mapping is implied.

## Status quarantine

The legacy sample uses status:

```text
A
```

Its real meaning is unresolved.

For the pilot only:

```text
A -> UNAVAILABLE
```

This is a safety/quarantine choice, not a semantic translation.

It prevents pilot copies from becoming lendable.

## Collision preflight

Before import:

```text
BOOK + title + publicationYear + callNumber
```

is checked against current SAMS data.

An exact collision aborts the pilot.

No overwrite or auto-merge occurs.

## Atomic import

The temporary branches, items, details, copies and trace logs are created within one Prisma transaction.

Any failure rolls back the import.

## Traceability

Each imported LibraryItem receives:

```text
AuditLog.action = LEGACY_PILOT_IMPORT
```

Metadata links it to:

```text
legacy BOOK_CODE
source database
source CSV + hash
source row + hash
canonical transform hash
legacy copy codes
pilot quarantine mapping
```

## Pilot verification

Validated:

```text
3 LibraryItems
4 UNAVAILABLE PhysicalCopies

two الإدارة الإلكترونية records remain distinct

digi1 pilot branch:
3 copies

sss pilot branch:
1 copy

0 reservations
0 borrowings
```

After verification:

```text
pilot rows deleted
temporary branches deleted
pilot AuditLogs deleted
```

---

# Sprint 7D — Evidence Closeout

Full Sprint 7 regression reruns:

```text
7A
7B
7C
```

The evidence manifest hashes all important generated migration outputs.

This creates a reproducible snapshot showing:

```text
which raw source version was used
what was staged
what was transformed
what was reconciled
what temporary DB sample was tested
```

Final clean-state verification checks:

```text
raw hashes unchanged
evidence hashes unchanged
0 temporary pilot branches
0 pilot AuditLogs
0 pilot item IDs
0 pilot copy IDs

persistent development seed still intact
```

---

# Migration blockers after Sprint 7

Sprint 7 intentionally leaves these unresolved:

```text
1. recover titles/master records for 2,108 book rows

2. distinguish PROJECT vs THESIS for 3,890 academic-work rows

3. map legacy PC/source DB to real SAMS Branch

4. define legacy copy-status code meanings

5. define LANG_CODE mapping

6. define contributor roles/parsing

7. confirm whether CALL_NUM is item-level or copy/branch-level
```

These are documented in:

```text
docs/migration/LEGACY_MIGRATION_DECISION_REGISTER_v1.md
docs/migration/NEXT_LIBRARY_VISIT_CHECKLIST.md
```

---

# What Sprint 7 proves

```text
Raw source
   ↓
Integrity manifest
   ↓
1:1 staging
   ↓
Field profiling
   ↓
Exception handling
   ↓
Canonical transform
   ↓
Dedupe/reconciliation
   ↓
Collision preflight
   ↓
Transactional pilot import
   ↓
Traceability verification
   ↓
Cleanup
```

The pipeline mechanics work.

---

# What Sprint 7 does NOT prove

Sprint 7 does not authorize:

```text
bulk import of 2,130 reconstructed books
bulk import of 3,890 academic works
production source-to-branch mapping
production legacy-status translation
```

The old PCs/source folders remain migration evidence sources only.

---

# Next Sprint

**Sprint 8 — Hardening / MVP Release Candidate**

Sprint 8 should focus on:

```text
security/config hardening
validation/error consistency
API regression coverage
database/runtime health
production-safe auth boundaries
logging/observability
deployment/readiness checks
MVP release-candidate documentation
```

The full legacy migration can resume when the next library visit provides the missing evidence.
