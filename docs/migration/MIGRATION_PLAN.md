# Legacy migration plan — preparation only

Reviewed 2026-10-07 against `dev` commit `bc52c18`. This plan and [field mapping](LEGACY_TO_SAMS_MAPPING.md) prepare future work. They do not authorize execution of legacy migration scripts, cleaning, data analysis or database writes.

## Required future sequence

```text
Legacy Raw Extract
    ↓
Data Analysis findings / agreed data-quality decisions
    ↓
Migration rules
    ↓
Staging migration
    ↓
Validation
    ↓
Final SAMS PostgreSQL migration
```

| Stage | Owner / output | Gate to proceed |
| --- | --- | --- |
| Legacy Raw Extract | Completed handoff; preserve original ZIP, XLSX, report, packaged manifest/provenance | Record chosen source/version and hashes; never combine backup totals or older pilot datasets |
| Findings / decisions | Data Analysis provides approved record dispositions, relationship decisions and lookup/classification interpretations; librarians confirm semantics | Resolve relevant D01–D17 entries from mapping; record decision owner, date, evidence and version |
| Migration rules | Software team turns accepted decisions into versioned rules, field conversions, external UUID crosswalk and exception contract | Review target enum/type limits, null vs empty transport, cardinality/loss decisions and scope; no guessed defaults |
| Staging migration | Future isolated staging PostgreSQL database plus immutable raw evidence and migration ledger | Separate credentials/database from frontend development and production; explicit approval to run; schema and custom SQL installed |
| Validation | Software verifies technical invariants; Data Analysis reconciles agreed totals; librarians review representative records | All blocking exceptions resolved or explicitly excluded/deferred; reconcile records and relationships; retain audit trail |
| Final SAMS PostgreSQL migration | Approved operational cutover and verification | Separate final authorization, frozen source/rules, backup/restore readiness, dry-run sign-off and rollback procedure |

## Data boundaries

| Data class | Purpose | Boundary |
| --- | --- | --- |
| Development seed | Invented identities, small catalog, workflow and dashboard examples | Disposable development DB only; not evidence, not production initialization, never the 2,843 legacy catalog records |
| Legacy migration data | Raw evidence and later approved staging outputs/crosswalks | Keep separate from seeds and normal API runtime; row exceptions are retained and traced, not silently fixed |
| Production data | Approved migrated catalog plus real identities and operational transactions | No development fixtures or pilot branches; explicit controlled deployment/cutover |

Existing `scripts/sprint7` profiling, transform and controlled pilot scripts refer to historical inputs and rules. They were not run or modified. Neither those scripts nor historical Sprint 7 completion is approval to migrate this raw handoff. In particular, earlier trimming, selected samples and quarantine-status behavior are not current approved migration decisions. Do not run full Sprint 7/8 regression wrappers for this preparation: they can invoke legacy pilot writes.

## Future implementation contract (not implemented now)

1. Freeze source package identity and agreed scope. Prefer documented CSV transport for programmatic staging; XLSX is a structural review aid. Preserve `\N` versus empty text, code strings, Arabic text and raw date bytes.
2. Keep source table/key/row locator, source and row hashes, rule version, outcome, reason and target UUID in an external staging ledger/crosswalk. `BOOK_CODE` and `GENERAL_CODE` must never become UUIDs by casting. No new Prisma model is required for this preparation.
3. After decisions, resolve approved branches and catalog master data, then items and the matching detail subtype, contributors and their links, publisher text, and copies. Use source relationship tables rather than splitting aggregated historical CSV strings. Category/Dewey require separate rules. Do not create copies from BOOK.NUM_OF_COPIES.
4. Hold unresolved rows/links in staging with decision IDs. Required item/type/branch gaps must not be filled using invented production defaults. Unsupported fields remain in raw/staging evidence; operational loss requires sign-off.
5. Migrate borrower identity or history only under a separate agreed scope. The handoff README reports BORROWING, BORROWING_HISTORY and RESERVATION empty. Never create transactions from STATISTICS aggregates or copy-status guesses. SAMS roles, SSO and policies are provisioned independently.
6. Make future execution transactional, resumable and idempotent using the approved crosswalk. Rerunning a source batch must not duplicate records or overwrite later operational changes. Specify rollback by migration batch before writing the importer.

## Future validation gates

- Reconcile source-reported control totals (2,843 BOOK, 4,832 COPIES_VOLUMES) against approved scope: accepted, held and explicitly excluded source records. Merges/splits, if ever approved, require separate source-to-target cardinality reconciliation; target counts need not equal raw counts. Do not recalculate quality findings in this preparation.
- Check source-key/UUID traceability, required title/type/item/branch links, resolved contributor links and barcode uniqueness. ISBN is nullable/nonunique in SAMS; it is not an automatic deduplication key.
- Check BookDetails only for BOOK and AcademicWorkDetails only for matching THESIS/PROJECT. No unsupported contributor/type/status enum coercion.
- Validate lossless raw call-number retention and approved Dewey code text, including leading zeros. Subject mapping must not create false Dewey classifications or discard extra subjects without a recorded disposition.
- Apply Prisma migrations and the reviewed `database/sql/postgres-extensions.sql` contract in the future staging environment. Check partial unique indexes, subtype/copy/branch triggers, timestamps and reporting views. Do not execute the full reference SQL snapshot over Prisma tables.
- For any separately authorized operational data, verify active copy allocations, one active loan per copy, student/item/branch consistency, expiry/due dates and actor identity. Overdue remains derived.
- Validate discovery, detail, inventory, reservation/checkout/return and reporting through existing APIs; catalog routes trim text and accept `abstract` while Prisma stores `abstractDescription`. A future importer must account for API limits without silently changing evidence.
- Librarian sample review must include multilingual titles, multiple copies, ambiguous publisher/contributor relationships and classification exceptions selected from approved findings. Capture sign-off rather than interpreting uncertainty in code.
- Production cutover requires a verified restore point, maintenance/write coordination, approved reconciliation, monitoring and a rollback decision window. None is performed here.

## Implementation review and frontend readiness

The current backend is implemented. The original chat worktree was at Sprint 0; this task branched from the actual `dev` backend v1 (`bc52c18`) without changing the primary Y: checkout.

| Area inspected | Current implementation / implication |
| --- | --- |
| Catalog and details | `modules/catalog`: LibraryItem plus BookDetails/AcademicWorkDetails, contributor links, version conflict handling and archive flag |
| Inventory | `modules/inventory`: required item/branch; RESERVED and BORROWED are circulation-owned and rejected by manual status edits |
| Categories/Dewey | `modules/catalog-master`: independent category and textual Dewey hierarchy; no Subject or Publisher entity |
| Discovery | `modules/discovery`: search across title, call number, Dewey, description, category, book details and contributor name; facets, paging, detail and branch availability |
| Reservations | `modules/reservations`: eligibility, policies, allocation locks, idempotency, own reservations, staff queue, cancellation and expiry |
| Borrowing/visits | `modules/borrowings`, `modules/visits`: checkout/return, derived overdue, staff actors, visit check-in/out and concurrency safeguards |
| Reporting | `modules/analytics`: overview, UTC bucket trends, branch comparison and top items from operational facts; [KPI contract](../analytics/KPI_CONTRACT_v1.md) uses `[from, to)` periods |
| RBAC | Auth middleware and route authorization use STUDENT, LIBRARIAN, MANAGEMENT. No ADMIN enum/role is seeded; librarian performs admin catalog/circulation actions. Analytics permits LIBRARIAN/MANAGEMENT, not STUDENT |
| Frontend | `apps/web/src/App.jsx` is still the health-check starter; this is readiness to develop UI, not a claim that the requested screens already exist |
| Architecture/planning | Prisma implementation notes, database rules, Sprint 1–8 and existing migration contracts preserve current architecture; no proven blocking schema change required |

The architecture and clean ERD images were also reviewed. They are conceptual references with drift: the ERD shows a Languages table, Category parent, User role_id, supervisor_id and an OVERDUE borrowing status that are not current Prisma fields/models. Current roles use UserRole, supervisors use ItemContributor, and overdue is derived. The architecture image mentions public catalog search, but current discovery routes require authentication. These differences are documentation drift, not reasons to redesign the implemented backend.

### Seed assessment

The existing `prisma/seed.js` seeds three roles, active student/librarian/management users, DEV faculty/department and MAIN branch. It does **not** seed catalog, copies, category/Dewey, policies, reservations, loans or visits. Sprint smoke scripts create transient fixtures and clean them up; they are not a durable frontend seed. No live database was inspected, so this assessment describes reproducible seed contents, not any manually populated local DB.

Minimal additions are opt-in: `prisma/seed-frontend.js`, called by `npm run db:seed:frontend`. Ordinary `db:seed` retains its baseline behavior. The added fixtures contain only invented data: 5 items, 7 copies, 2 additional student users (a second active student and a suspended student), 2 branches, 1 category, textual Dewey 000/004, 1 contributor, 2 branch policies, 2 reservations, 2 borrowings and 2 visits. Existing Dewey codes are reused without modification. The additional users have the existing STUDENT role, not new RBAC roles.

| Frontend scenario | Baseline | Opt-in fixture / exercise |
| --- | --- | --- |
| Browse/search/details | Missing | English and Arabic books, THESIS/PROJECT, contributor/publisher/ISBN and null optional metadata; search `DEV`, `Computing`, `مقدمة`, `004` or `DEV Example Press` |
| Multiple copies/branches | Missing | Computing book has AVAILABLE/RESERVED/BORROWED copies across two branches |
| Unavailable and empty inventory | Missing | Arabic book has UNAVAILABLE/DAMAGED copies; project has none; inactive book and ARCHIVED copy support staff views |
| Category/Dewey | Missing | DEV Computing category and 004 classification; 000 parent created if absent; existing codes never reparented |
| Reservations | Missing | Active allocated hold and fulfilled history; student2 can create a reservation on an available copy; cancel/expire via existing APIs |
| Circulation | Missing | Active overdue borrowing plus returned reservation-linked borrowing; staff can return or fulfill hold and exercise direct checkout using development branch policies |
| Eligibility/ownership | Limited | Baseline student plus student2 and suspended student; no role changes needed to test denial or cross-student ownership |
| Librarian/management RBAC | Roles/users present | Existing librarian can mutate catalog/circulation, management can report, student cannot perform staff mutations; unauthenticated calls exercise 401 |
| Dashboard/reporting | Empty | Active/overdue/returned events, open/closed visits, branch differences, top items and nonzero trend points; use a window from 30 days before fixture creation through 1 day after creation |

Additional terminal statuses, paging volume and rare error cases can be exercised through the UI/API and existing smoke suites in disposable development environments; a large seed is unnecessary. PENDING reservations are not invented just to populate an enum when the current creation flow allocates ACTIVE holds.

### Loading the optional development fixtures later

No seed or PostgreSQL write was run during this task. After pointing `.env` at an explicitly disposable **development** database with the existing schema/custom SQL and generated Prisma client, use PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:SAMS_FRONTEND_SEED = 'true'
npm run db:seed:frontend
Remove-Item Env:SAMS_FRONTEND_SEED
```

The frontend opt-in checks both flags before the baseline seed starts. Environment flags do not verify database identity: check DATABASE_URL yourself. Dev login also requires `DEV_AUTH_ENABLED=true`; use the existing `POST /api/v1/auth/dev-login` with `universityEmail` and the resulting bearer token. Accounts are `student@sams.dev`, `student2@sams.dev`, `suspended@sams.dev`, `librarian@sams.dev`, `management@sams.dev`; no password/SSO identity is created.

The frontend fixture is created atomically and its stable item UUID serves as the completion sentinel. A rerun leaves that fixture's edits and timestamps untouched (baseline user upserts still behave as before). It is not a reset/repair tool. If fixture data is partially removed manually, use a fresh disposable development database; no automatic cleanup is provided. Active hold expiry is two days after initial creation, so time naturally changes the display. Re-running does not extend it. Use API expiry handling or a fresh disposable database for a fresh demo.

### Verification and remaining limits

On 2026-10-07, all three `node --test prisma/seed-frontend.test.js` tests passed: opt-in guard, in-memory fixture relations/status/date consistency and preservation on rerun. JavaScript syntax checks and `git diff --check` also passed. A read-only header coverage check confirmed that every field in the core catalog/copy/link tables and the reviewed lookup/borrower tables is mentioned in its mapping rows; documentation links resolved. This does not certify actual PostgreSQL triggers or API integration; loading and exercising the fixtures in a disposable development DB remains a separate runtime check. No live legacy data or production data is needed for that check.

Frontend development can continue now against backend v1 and these synthetic scenarios without waiting for Data Analysis. Keep legacy quality decisions, final type/branch/status/classification maps, unsupported-field retention decisions, final importer implementation, staging runs, reconciliation and production migration postponed until the relevant approvals and findings exist.
