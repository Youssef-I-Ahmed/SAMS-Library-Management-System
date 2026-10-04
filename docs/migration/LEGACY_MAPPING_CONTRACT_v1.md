# SAMS Legacy Mapping Contract v1

## Principle

Migration must preserve uncertainty.

If the legacy source cannot prove a target value, the pipeline must:

```text
stage raw value
flag exception
require mapping/validation
```

It must not guess.

---

# Book recovery mapping

## Direct / high-confidence candidates

```text
TITLE
→ LibraryItem.title

CALL_NUM
→ LibraryItem.callNumber
→ preserve raw string

PUBLISHING_DATE
→ LibraryItem.publicationYear
→ only when it is a valid 4-digit year

ISBN
→ BookDetails.isbn
→ trim only during first transform
```

## Requires controlled interpretation

```text
BOOK_TYPE
→ candidate BOOK
→ confirm legacy semantics before full migration

LANG_CODE
→ LibraryItem.language
→ requires explicit legacy code map

AUTHORS_EDITORS
→ Contributor / ItemContributor
→ requires safe name splitting + role mapping

PUBLISHERS
→ BookDetails.publisher
→ review combined/multi-value evidence

RECOVERED_COPY_COUNT
COPY_GENERAL_CODES
COPY_STATUSES
→ PhysicalCopy
→ requires copy reconciliation
```

## Never do automatically

```text
missing TITLE
→ do not invent a title

CALL_NUM
→ do not force numeric conversion
→ do not strip Arabic suffixes

legacy BOOK_CODE
→ do not reuse as SAMS UUID
```

---

# Project / Thesis mapping

## Direct candidates

```text
TITLE
→ LibraryItem.title

CALL_NUM
→ LibraryItem.callNumber
→ preserve raw

PUBLISHING_DATE
→ LibraryItem.publicationYear
→ valid four-digit year only
```

## Blocked mapping

Current legacy export does not prove:

```text
LibraryItem.type = PROJECT
or
LibraryItem.type = THESIS
```

The field combination:

```text
BOOK_TYPE
RECORD_CATEGORY
```

is not sufficient in the current recovered export.

Required resolution sources can include:

```text
complete legacy DB/table semantics
library staff validation
reliable legacy lookup/code table
separate original source database/table
```

Until then:

```text
target ItemType = UNRESOLVED
```

No database row should be created by silently defaulting all academic works to PROJECT or THESIS.

---

# Dewey / Call Number

`CALL_NUM` remains a string.

Examples already recovered include:

```text
336.014 / ف.ت
352.14 / م.ج
004
658,4
```

Rules:

```text
preserve original raw call number
do not parse it into a floating-point number
do not automatically replace comma with dot
do not infer that CALL_NUM belongs to LibraryItem vs PhysicalCopy until physical-location semantics are confirmed
```

The current SAMS design keeps call number on `LibraryItem`, but migration must remain capable of revisiting that decision if the full legacy source proves copy/branch-specific call numbers.

---

# Source traceability

Every transformed/imported pilot record in later Sprint 7 checkpoints must remain traceable to:

```text
source dataset
source file
source file SHA-256
source record number
legacy BOOK_CODE
source row SHA-256
```

This is mandatory for reconciliation and librarian review.
