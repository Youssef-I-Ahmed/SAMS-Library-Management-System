# SAMS — Approved Books Dataset → Local Development Demo (NOT Production)

**Goal:** Make the current SAMS student catalog, librarian operations, and management views useful for a live demo *before* Sprint 10A. This is an additive, idempotent local-development import—not the final library inventory migration.

## Verified source

- DA-approved source: `data/demo/SAMS_Books_Merged_Book_Names_Corrected.xlsx` (unchanged).
- SHA-256: `399618e7cafe2af0ae8bd3a5ca2adbde9d0a085158cc328807bc421c1e6e44e8`.
- 2,842 original Excel rows (22 original columns).
- 2,821 merged `BOOK` catalog records. Merge key matches the delivered RAG `sams_rag/catalog.py`: title + ordered authors + validated publication year + edition. Exactly 21 groups have two source rows each.
- 4,791 **reported** source copies — NOT 4,791 verified holdings.
- Data QA: 70 copy-count vs. `COPY_GENERAL_CODE` mismatches and 3 invalid publication years. See `data/demo/books-import-qa.json`.
- For each original `BOOK_CODE`, see `data/demo/legacy-book-code-map.json` for its corresponding stable SAMS `LibraryItem.id`. Useful later for Sprint 10A.

## What is imported

| SAMS entity | Source / rule |
| --- | --- |
| `LibraryItem` | 2,821 `BOOK` rows: title, language (RAG-compatible main-title rule), validated year, full call number, Dewey code prefix, source-backed description and subjects |
| `BookDetails` | ISBN, publisher, edition; source values preserved |
| `Contributor`, `ItemContributor` | `EDITORS` split on `|`; contributors deliberately scoped to each book to avoid conflating different people with identical names |
| `DeweyClassification` | Broad 000–900 root groups derived from actual 3-digit Dewey prefix; original number always remains as text |
| `PhysicalCopy` | **Optional synthetic DEMO copies only**, one per imported book, marked `DEMO-BOOK-<code>` and `DEMO ONLY - location not verified`; no verified physical inventory statuses were supplied |

NOT imported: thesis/project records; faculty/student master data; past borrowing history; verified copy barcodes; verified per-copy shelf or availability. The original 22-column workbook remains untouched for future production migration.

## Prerequisites

From the SAMS repo root on the Windows laptop:

```powershell
cd D:\Digi\SAMS_Library_System_Root\SAMS_Library_System

docker desktop status
docker compose ps
Invoke-RestMethod http://localhost:4000/api/v1/health/ready
```

The script is intentionally locked to `DATABASE_URL` pointing to **localhost/127.0.0.1, port 5433, database sams_library** and refuses `NODE_ENV=production`.

### 1. Back up your existing DB — mandatory

**Easiest:** run `powershell -ExecutionPolicy Bypass -File .\scripts\migration\backup-sams-before-books-demo.ps1`, and confirm you see `BACKUP VERIFIED`. This creates a timestamped dump under `D:\SAMS_Backups`.

**Manual alternative:** these commands back up inside the PostgreSQL container and use `docker cp` to preserve the binary dump safely on the Windows host. **Do not use Windows PowerShell `>` to write a binary pg_dump output.**

```powershell
$backupFolder = 'D:\SAMS_Backups'
New-Item -ItemType Directory -Force $backupFolder | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$remote = "/tmp/sams_before_books_demo_$stamp.dump"
$backup = Join-Path $backupFolder "sams_before_books_demo_$stamp.dump"

docker exec sams-postgres pg_dump -U postgres -d sams_library -Fc -f $remote
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed: STOP' }

docker cp "sams-postgres:$remote" $backup
if ($LASTEXITCODE -ne 0) { throw 'docker cp failed: STOP' }

if (-not (Test-Path $backup)) { throw 'Backup not found: STOP' }
Get-Item $backup | Select-Object FullName, Length

docker exec sams-postgres pg_restore --list $remote | Select-Object -First 8
if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not list the archive: STOP' }
```

Keep the dump outside the project directory; never commit it to GitHub. **Do not run `docker compose down -v`, `prisma migrate reset`, or `git clean -fd`.**

### 2. Dry run (read-only)

Extract the ZIP over your existing project root, preserving `scripts/migration`, `docs/migration`, and `data/demo`. Then run:

```powershell
node .\scripts\migration\import-approved-books-demo.mjs --dry-run
```

Expected: source checksum valid, local DB guards accepted, active `MAIN` branch, no conflicting deterministic IDs, `Dry-run passed.` This step makes zero database changes.

### 3. Apply books AND explicitly synthetic borrowable demo copies

Only for your local test/demo environment:

```powershell
node .\scripts\migration\import-approved-books-demo.mjs --apply --demo-copies=all
```

This creates one **synthetic AVAILABLE** physical copy per imported book to make reservation → borrowing → return demos possible. It does **not** import 4,791 real physical copies. Demo copies can be identified by `copyCode` prefix `DEMO-BOOK-`, and their shelf location warns that it is not verified. **Do not tell the library these are truly in stock.**

If you want only bibliographic records without borrowable test copies:

```powershell
node .\scripts\migration\import-approved-books-demo.mjs --apply --demo-copies=none
```

The script uses deterministic IDs and `createMany(..., skipDuplicates: true)`, so it is safe to rerun after partial interruption or for verification; it does not update or delete existing rows. Changes made to demo items by staff are not overwritten.

### 4. Verify and exercise the UI

```powershell
node .\scripts\migration\import-approved-books-demo.mjs --verify
Invoke-RestMethod http://localhost:4000/api/v1/health/ready
```

Then refresh the pages:

- **Student**: `http://localhost:5173/student/catalog?type=BOOK`; use Search, browse a book, check availability, reserve one.
- **Librarian**: process reservation, borrow/checkout the reserved item to `DEV-STUDENT-001` (or the authenticated Dev Student), return it, and test check-in/out for that student.
- **Management**: open read-only analytics/borrowing/visit views; test that mutation controls remain inaccessible.

Use the existing `student@sams.dev`, `librarian@sams.dev` and `management@sams.dev` accounts. If missing, follow your existing `npm run db:seed` and Sprint 1 seed verification procedure (development only). With 2,821 records, use pagination and filters, not an unrestricted client-side full load.

## Before real migration / Sprint 10A

1. Replace synthetic copies with **verified** physical inventory data after library reconciliation. Do not silently mark the 4,791 *reported* copies as AVAILABLE.
2. Resolve the 70 count mismatches with DA/library; decide whether source copy identifiers reliably map to real units.
3. Preserve `BOOK_CODE → LibraryItem.id` mapping for RAG result links. The `book_code` field is not natively present on `LibraryItem` in the reviewed Prisma schema.
4. Academic works (theses and graduation projects) are **pending DA delivery** and intentionally not fabricated.
5. Never publish this demo data, especially synthetic statuses, as an authoritative production catalog without a separate approved migration.
6. No automated deletion of demo copies is provided: some may be linked to reservations/borrowing history, so safe retirement will need an explicit reviewed plan.
