# SAMS Legacy Migration Decision Register v1

## Status legend

```text
CONFIRMED
PILOT_ONLY
BLOCKED
OPEN
```

---

## D-001 — Raw legacy sources are immutable migration evidence

Status:

```text
CONFIRMED
```

Decision:

```text
data/raw must never be manually corrected in place.
```

Corrections belong in transform/mapping rules or a newly collected source version.

---

## D-002 — Legacy BOOK_CODE is not the SAMS primary key

Status:

```text
CONFIRMED
```

Decision:

SAMS continues to use UUID primary keys.

Legacy identifiers are preserved for traceability/reconciliation only.

---

## D-003 — Call numbers remain strings

Status:

```text
CONFIRMED
```

Decision:

Do not coerce `CALL_NUM` to floating point.

Preserve examples such as:

```text
336.014 / ف.ت
352.14 / م.ج
004
658,4
```

Comma-style values are not automatically changed to dot-style values.

---

## D-004 — `CALL_NUM` currently maps to LibraryItem.callNumber

Status:

```text
OPEN
```

Current implementation/design uses `LibraryItem.callNumber`.

Before full migration, confirm whether call number is:

```text
bibliographic/item-level
```

or can vary by:

```text
physical copy
branch
```

If the complete legacy system proves copy/branch-specific call numbers, the model/mapping must be revisited.

---

## D-005 — Reconstructed missing-title book rows

Status:

```text
BLOCKED
```

Current count:

```text
2,108
```

Decision:

Do not invent titles.

Required next evidence:

```text
complete legacy app/data folders
master bibliographic table/source
additional backup/database files
```

---

## D-006 — Titled book candidates

Status:

```text
CONFIRMED FOR PILOT TRANSFORM
```

Current count:

```text
22
```

These can be transformed conservatively as book candidates.

They are not a replacement for recovering the missing 2,108 master records.

---

## D-007 — Academic works target type

Status:

```text
BLOCKED
```

Current source rows:

```text
3,890
```

Unresolved target:

```text
PROJECT
vs
THESIS
```

Decision:

Do not default all rows to one ItemType.

Required resolution:

```text
legacy lookup/type semantics
reliable source table/database separation
or librarian validation rule
```

---

## D-008 — Legacy source DB / PC to real SAMS Branch

Status:

```text
BLOCKED
```

Current observed source names include:

```text
digi1.DB
sss.DB
```

Sprint 7C used:

```text
LEGACY_PILOT_DIGI1
LEGACY_PILOT_SSS
```

only as temporary test branches.

No production branch mapping has been approved.

---

## D-009 — Legacy COPY_STATUS semantics

Status:

```text
BLOCKED
```

Current pilot rows include:

```text
A
```

Sprint 7C maps `A` to `UNAVAILABLE` only as a quarantine behavior.

This does **not** mean:

```text
A = UNAVAILABLE
```

or:

```text
A = AVAILABLE
```

Production mapping needs legacy semantics or librarian confirmation.

---

## D-010 — LANG_CODE

Status:

```text
BLOCKED
```

Decision:

Do not infer language from title text.

Create an explicit code mapping after source semantics are confirmed.

---

## D-011 — AUTHORS_EDITORS

Status:

```text
OPEN
```

Raw names can be preserved.

Contributor creation requires controlled parsing and role mapping before bulk migration.

---

## D-012 — Duplicate handling

Status:

```text
CONFIRMED
```

Decision:

No automatic merge from title alone.

Current 22-book pilot contains:

```text
1 TITLE+YEAR review group
2 records
```

Both remain distinct because bibliographic evidence differs.

ISBN collision can be used as a strong review signal, not as an unconditional auto-merge command.

---

## D-013 — Deleted-copy evidence

Status:

```text
CONFIRMED
```

Historical deleted-copy evidence is preserved for reconciliation.

It is not recreated as an active/current `PhysicalCopy` automatically.

---

## D-014 — Full migration authorization

Status:

```text
BLOCKED
```

Sprint 7 proves migration mechanics only.

A full import requires the unresolved decisions above and the next library source collection.

No full legacy migration is approved by Sprint 7.
