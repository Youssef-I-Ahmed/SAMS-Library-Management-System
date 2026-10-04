# SAMS Legacy Transform Dry Run v1

## Scope

Sprint 7B transforms only the currently recoverable titled book subset:

```text
BOOKS_RECONSTRUCTED
2,130 source rows
        ↓
22 rows with TITLE
        ↓
22 canonical BOOK candidates
```

The 2,108 title-missing rows remain staged and blocked.

No PostgreSQL write occurs.

---

# Canonical book transform

For each of the 22 candidates:

```text
dataset = BOOKS_RECONSTRUCTED
→ target type = BOOK
```

This type comes from the recovered book dataset context, not from guessing the academic-work source.

Mapped:

```text
TITLE
→ LibraryItem.title

PUBLISHING_DATE
→ LibraryItem.publicationYear
  only when valid four-digit year

CALL_NUM
→ LibraryItem.callNumber
  preserve raw

ISBN
→ BookDetails.isbn

PUBLISHERS
→ BookDetails.publisher

EDITION_STATEMENT
→ BookDetails.edition
```

Deliberately unresolved:

```text
LibraryItem.language
DeweyClassification
Dewey raw code inferred from CALL_NUM
Contributor roles
Subjects/categories
```

Legacy evidence for those fields remains attached to each canonical row.

---

# Current transform result

Expected current pilot:

```text
Canonical books:             22
Publication years parsed:    21
ISBN present:                13
Publisher present:           21
Language values guessed:      0
Contributor rows auto-made:   0
Dewey codes auto-parsed:      0
```

This is intentional.

Nullable SAMS fields are left null instead of receiving invented values.

---

# Cross-source corroboration

The 22 records in:

```text
books-extracted-partial.csv
```

have corresponding titled reconstructed rows.

Sprint 7B compares the following evidence:

```text
PUBLISHING_DATE
TITLE
CALL_NUM
BOOK_TYPE
LANG_CODE
ISBN
EDITION
AUTHORS_EDITORS
PUBLISHERS
COPY_GENERAL_CODES
COPY_STATUSES
COPY_COUNT
```

Expected current result:

```text
22 / 22 exact matches
0 reconciliation-review rows
```

The partial extraction is therefore useful corroborating evidence, but it is not imported separately.

---

# Dedupe policy

## Strong collision

A non-empty normalized ISBN shared by multiple candidate records is considered a strong collision requiring review.

Current result:

```text
0 strong ISBN collision groups
```

Sprint 7B never auto-merges even strong collisions.

## Review collision

A normalized:

```text
TITLE + publication year
```

collision is review-only.

Current result:

```text
1 review group
2 rows
```

The two records are:

```text
الإدارة الإلكترونية
2007
```

They have different author evidence and different call numbers.

Therefore:

```text
DO NOT AUTO-MERGE
```

A duplicated title is not proof of a duplicated bibliographic record.

---

# Physical-copy reconciliation preview

Current titled book evidence reports:

```text
34 recovered current copies
34 explicit COPY_GENERAL_CODES
0 copy-count mismatch items
1 deleted-copy evidence record
```

Sprint 7B creates 34 copy preview rows.

It does **not** create the one deleted historical copy as an active `PhysicalCopy`.

Blocked copy fields:

```text
target branch
target CopyStatus
```

The current evidence commonly contains:

```text
COPY_STATUSES = A
```

but Sprint 7B does not assume that `A` means SAMS `AVAILABLE` until the legacy status semantics are deliberately mapped.

Likewise, a source database name such as:

```text
digi1.DB
```

is not automatically converted into `MAIN` branch without an explicit source/branch mapping.

---

# Traceability

Each canonical candidate keeps:

```text
legacy dataset
source file
source file SHA-256
source record number
logical CSV row
legacy BOOK_CODE
source row SHA-256
master source DB
source evidence
recovery status
canonical transform SHA-256
```

This allows later import/reconciliation to prove exactly which recovered source row produced a SAMS candidate.

---

# Import gate after Sprint 7B

Bibliographic dry-run candidates:

```text
22
```

Physical copies safe for automatic import now:

```text
NO
```

Remaining explicit mapping decisions:

```text
1. source DB / legacy PC → SAMS Branch
2. legacy COPY_STATUS values → SAMS CopyStatus
3. LANG_CODE → language
4. AUTHORS_EDITORS semantics → contributor roles
```

The first two are required before controlled physical-copy import.

Language/contributor mappings are valuable but nullable and can be handled separately without inventing data.

---

# Recommended Sprint 7C

Controlled migration pilot should use explicit command-line/config mappings, for example conceptually:

```text
source digi1.DB -> branch MAIN
legacy status A -> AVAILABLE
```

Those values must be passed/approved deliberately; they should not be silently hard-coded from assumptions.

Sprint 7C can then:

```text
dry-run DB plan
→ check existing SAMS collisions
→ import small pilot transaction
→ reconcile inserted counts
→ rollback/cleanup test import
```

before any full legacy migration.
