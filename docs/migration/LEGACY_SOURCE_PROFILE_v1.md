# SAMS Legacy Source Profile v1

## Scope

Sprint 7A profiles the three currently available recovered CSV sources.

It does **not** claim that these files are the complete legacy system.

The current project already states that `data/raw` contains recovered legacy exports that must remain unchanged and that final validation requires the complete library program folders.

## Current sources

### 1. `books-extracted-partial.csv`

Observed current pilot:

```text
22 rows
49 columns
22 rows with TITLE
BOOK_TYPE = B on all 22 rows
LANG_CODE = 1 on all 22 rows
```

Source databases include:

```text
digi1.DB
sss.DB
```

Role in migration:

```text
REFERENCE_EVIDENCE_ONLY
```

This dataset overlaps the recovered titled book evidence and must not be imported as a second independent book source.

---

### 2. `books-reconstructed-recovery.csv`

Observed current pilot:

```text
2,130 rows
32 columns
2,130 unique BOOK_CODE values
22 rows with TITLE
2,108 rows missing TITLE
```

Recovery status:

```text
MASTER_RECORD_RECOVERED                    22
MASTER_TITLE_MISSING_RELATIONS_RECOVERED  2108
```

Meaning:

The available recovery reconstructed many legacy identifiers and relationship/copy traces, but only 22 bibliographic master records currently contain a recovered title.

Because `LibraryItem.title` is mandatory, the 2,108 title-missing records are migration blockers, not records to invent titles for.

Current next-transform candidates:

```text
22
```

These are candidates for Sprint 7B transformation/dry-run only, not automatic production import.

---

### 3. `projects-theses-extracted.csv`

Observed current pilot:

```text
3,890 rows
45 columns
3,890 rows with TITLE
3,884 unique non-empty titles
6 duplicate-title groups
```

`RECORD_CATEGORY` currently says:

```text
Project/Thesis/Research (legacy library DB)
```

The current source does not reliably separate:

```text
PROJECT
THESIS
```

Therefore:

```text
3,890 / 3,890 rows remain blocked from final ItemType mapping
```

Sprint 7A deliberately does **not** guess.

Observed call-number anomaly:

```text
135 rows contain comma-style values
```

Examples include:

```text
658,4
658,3
658,8
```

These values remain raw. No automatic comma-to-dot conversion is permitted before the classification convention is confirmed.

Observed copy-count anomaly:

```text
1 row has NUM_OF_COPIES = -1
```

This row cannot generate a `PhysicalCopy` count without reconciliation.

---

# Raw integrity

The Sprint 7A smoke test pins the SHA-256 hashes of the current three pilot files.

If a file changes after another library visit, the verifier intentionally fails.

That is not treated as corruption automatically; it means:

```text
new source version detected
→ profile deliberately
→ compare/reconcile
→ update approved source manifest
```

This prevents silently replacing migration evidence.

---

# Staging contract

Every raw CSV row is written 1:1 to JSONL staging.

Each staged row contains:

```json
{
  "_legacy": {
    "dataset": "...",
    "sourceRole": "...",
    "sourceFile": "...",
    "sourceFileSha256": "...",
    "sourceRecordNumber": 1,
    "logicalRowNumber": 2,
    "legacySourceKey": "...",
    "rowSha256": "..."
  },
  "fields": {
    "... original source columns ...": "..."
  }
}
```

No source field is discarded at staging time.

---

# Sprint 7A migration gate

```text
Application PostgreSQL writes: NO
Raw CSV modification:          NO
Raw rows staged:               YES
Field profiling:               YES
Exception report:              YES
Mapping readiness:             YES
```

Current key blockers:

```text
BOOKS_RECONSTRUCTED
→ 2,108 records missing TITLE

ACADEMIC_WORKS_RECOVERED
→ PROJECT vs THESIS unresolved for all 3,890 records

ACADEMIC_WORKS_RECOVERED
→ 135 comma-style call numbers require preservation/review

ACADEMIC_WORKS_RECOVERED
→ 1 negative copy count requires reconciliation
```

---

# What to collect on the next library visit

Copy each legacy PC/app source separately.

Do not merge folders from separate machines.

Priority evidence:

```text
full application folder
*.exe
*.dll
*.mdb
*.accdb
*.db
*.dbf
*.dat
*.ini
*.cfg
*.xml
*.bak
Windows shortcut Target
Windows shortcut Start In
```

Record which PC/branch each source came from.

The goal is to recover the missing master records and identify reliable semantics for the legacy type/language/copy fields before full migration.
