# Projects & Research source-set dry run

This command validates the approved workbooks and writes an aggregate privacy-safe report. It does not load Prisma, open a database connection, call a network service or emit source rows.

## Prerequisites

- Node.js 20 or later.
- The two source workbooks at the ignored paths recorded in `SPRINT_10D4A_SOURCE_MANIFEST.json`.
- The tracked legacy book crosswalk at `data/demo/legacy-book-code-map.json`.

## Run

Write the output outside the repository:

```powershell
node scripts/migration/projects-research-dry-run.mjs `
  --output "D:\Digi\SAMS_Library_System_Root\projects-research-dry-run.json"
```

The output file must not already exist. The script uses exclusive creation so a prior report cannot be overwritten accidentally.

## Safety behavior

The command stops without an output report when:

- a source path escapes the repository workspace;
- a workbook hash or byte length differs from the approved manifest;
- a required sheet or column is absent;
- a source contains formula cells;
- a `BOOK_CODE` is blank or duplicated;
- any aggregate control differs from the approved reconciliation contract;
- the requested report path is inside the repository;
- the output file already exists.

Successful source validation returns exit code 0 even while `canonicalImportGate.status` is `BLOCKED`. `BLOCKED` is the expected business result until work type, public title, privacy, copy/branch and exception policies are approved. It is not a failed dry run.

The report contains hashes, counts, status distributions and gate results only. It excludes titles, names, source rows and legacy codes.

## Current verified result

The committed `SPRINT_10D5_DRY_RUN_REPORT.json` was generated from the approved hashes on 2026-11-08.

- Source integrity: `PASS`
- Common unique identities: 3,983
- PostgreSQL connections/writes: 0/0
- Canonical import gate: `BLOCKED`
- Publication-year exceptions: 4
- Subject exceptions: 2
- Public-title source differences: 3,857

No staging or canonical schema was applied. The SQL file remains a design artifact until a reviewed migration authorizes it.
