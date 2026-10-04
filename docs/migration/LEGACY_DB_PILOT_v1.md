# SAMS Legacy Controlled DB Pilot v1

## Purpose

Sprint 7C proves that a canonical legacy candidate can be inserted into the real SAMS relational model and reconciled safely.

It does **not** approve a full migration.

---

# Pilot sample

Three book records are selected deliberately:

```text
BOOK_CODE 12
BOOK_CODE 19
BOOK_CODE 1021
```

Why these three:

```text
12 + 19
→ same Arabic title and same year
→ different bibliographic evidence
→ proves the importer does not auto-merge review-only duplicates

1021
→ comes from sss.DB
→ proves source databases can be mapped independently
```

Current copy evidence:

```text
12   -> 1 current copy
19   -> 2 current copies
1021 -> 1 current copy

total -> 4
```

---

# Synthetic branch mapping

The pilot creates temporary SAMS branches:

```text
digi1.DB
→ LEGACY_PILOT_DIGI1

sss.DB
→ LEGACY_PILOT_SSS
```

This is a **test harness mapping only**.

It must not be interpreted as a production branch decision.

Both temporary branches are deleted during cleanup.

---

# Legacy status quarantine

Current selected records contain:

```text
COPY_STATUSES = A
```

The meaning of `A` is not yet approved.

Sprint 7C therefore does not translate `A` semantically.

For the temporary pilot only:

```text
legacy A
→ SAMS UNAVAILABLE
```

This is a quarantine behavior.

It ensures migrated pilot copies cannot appear as lendable even if the legacy meaning is misunderstood.

Production mapping remains unresolved.

---

# Preflight collision rule

Before import, Sprint 7C checks the SAMS database for an existing exact combination:

```text
type
title
publicationYear
callNumber
```

If an exact existing LibraryItem is found:

```text
IMPORT ABORTS
```

The pilot does not overwrite or merge it.

This is intentionally conservative.

---

# Imported target model

Each pilot record creates:

```text
LibraryItem
├── type = BOOK
├── title
├── publicationYear when available
└── raw callNumber

BookDetails
├── ISBN when present
├── publisher when present
└── edition when present

PhysicalCopy
├── temporary pilot Branch
├── legacy copy code
├── status = UNAVAILABLE
├── barcode = null
├── shelfLocation = null
└── condition = null
```

Sprint 7C still does not guess:

```text
language
Dewey classification
barcode
shelf location
condition
contributors
```

---

# Traceability

For every pilot LibraryItem, an `AuditLog` row is created:

```text
action = LEGACY_PILOT_IMPORT
entityType = LibraryItem
```

Metadata preserves:

```text
pilotTag
mapping purpose
source dataset
source file
source file SHA-256
source record number
legacy BOOK_CODE
source row SHA-256
canonical transform SHA-256
source DB
legacy statuses
pilot quarantine status
legacy copy codes
deleted-copy evidence
productionMappingApproved = false
```

This proves an imported SAMS row can be traced back through:

```text
SAMS row
→ canonical transform
→ staged legacy row
→ original recovered source file
```

---

# Atomicity

The three pilot books, temporary branches, details, copies, and trace logs are created inside one Prisma transaction.

If any record fails:

```text
the import transaction rolls back
```

---

# Verification

The pilot smoke proves:

```text
3 LibraryItems imported
4 PhysicalCopies imported

all copies = UNAVAILABLE

2 records titled الإدارة الإلكترونية remain separate

digi1 pilot branch = 3 copies
sss pilot branch   = 1 copy

AuditLog traceability exists

0 reservations
0 borrowings
```

---

# Cleanup

The smoke test then removes:

```text
pilot AuditLogs
pilot PhysicalCopies
pilot BookDetails
pilot LibraryItems
temporary pilot Branches
```

Final verification requires:

```text
0 pilot AuditLogs
0 pilot Branches
```

So Sprint 7C leaves the application database clean.

---

# What Sprint 7C does NOT prove

It does not resolve:

```text
real PC/source DB -> university branch mapping
legacy status A meaning
language code mapping
contributor role mapping
the 2,108 missing-title book records
PROJECT vs THESIS for the 3,890 academic works
```

Those remain migration blockers/decisions.

---

# Next checkpoint

Sprint 7D should close the migration pilot with:

```text
full Sprint 7 regression
migration evidence bundle
clean-state verification
Sprint 7 documentation
decision register for next library visit
```

No full legacy import should run before the missing source/mapping evidence is collected.
