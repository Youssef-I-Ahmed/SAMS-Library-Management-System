# Sprint 10B.2 — Demo Stock Transparency

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Completed locally on 24 October 2026 on `dev`. Assessment used repository
source and documentation; no live database was queried or modified. No commit
or push was created. Concept D — SAMS Living Library remains the design direction;
this batch uses existing styling and does not begin the visual redesign.

## 1. Inventory provenance findings

| Evidence | Finding |
| --- | --- |
| [`LibraryItem` and `PhysicalCopy`](../../prisma/schema.prisma) | Neither model has a physical-inventory verification or formal provenance indicator. Copy status is a circulation state, not evidence of a shelf audit. Bibliographic identity and physical inventory are distinct. |
| [Demo import documentation](../migration/SAMS_BOOKS_LOCAL_DEMO_IMPORT.md) and [import script](../../scripts/migration/import-approved-books-demo.mjs) | The source contains 2,821 merged book records and 4,791 **reported**, unverified copies. Optional demo generation creates one synthetic `AVAILABLE` copy per imported book, not the reported number of real holdings. This describes the importer, not a newly verified count in the current database. |
| Demo copy fields | The importer writes deterministic copy IDs, `copyCode: DEMO-BOOK-<code>`, and `shelfLocation: DEMO ONLY - location not verified`. These are positive documentary clues for that importer's rows. They are not protected provenance fields or a universal classification scheme. |
| [Physical-copy administration](../../apps/api/src/modules/inventory/physical-copies.service.js) | Copy codes and shelf locations can be edited. Absence of a demo marker cannot establish that a copy is physically verified. |
| [Frontend fixture seed source](../../prisma/seed-frontend.js) | Another synthetic-copy path uses `DEV-FE-*` identifiers. Matching only `DEMO-BOOK-*` would miss these fixtures and cannot safely classify all inventory. The seed was inspected, not executed. |
| [Discovery search service](../../apps/api/src/modules/discovery/discovery.service.js) | Aggregates non-archived copies at active branches into total/available counts and branch summaries. `available` derives from the `AVAILABLE` status count. It does not carry copy-code, shelf, source, or verification evidence. |
| [Availability service](../../apps/api/src/modules/availability/availability.service.js) | Uses the same circulation-count semantics. It does not establish real-world physical holdings. |
| [Discovery detail service](../../apps/api/src/modules/discovery/discovery-detail.service.js) | Builds `reservationReadiness.hasAvailableCopy` and candidate branches from those counts. Reservation readiness does not add inventory-verification evidence. |

The reviewed student response contracts are unchanged:

- `GET /api/v1/discovery/items`: paginated items with `availability` summaries.
- `GET /api/v1/discovery/items/:id`: item details, `availability`, and `reservationReadiness`.
- `GET /api/v1/catalog/items/:itemId/availability`: `{ data }` containing item,
  total/available counts, availability boolean, and branches.

**Conclusion:** Some importer-specific demo clues are stored in ordinary DB
fields; the import manifests/documentation explain their meaning. The student
APIs omit those clues and provide no trustworthy distinction between verified,
unverified, and synthetic copies. They may represent mixed or future legitimate
inventory. No per-copy classification can safely be inferred in the frontend.

### UI implications before this batch

The available badge, “Available now” filter, “available physical copy” hint,
“Live availability” heading, copy counts, branch fractions, and reservation
instructions could suggest physically confirmed stock. The old reservation
instructions promised that the library would hold an available copy; a successful
reservation could be read as physical pickup confirmation.

The [reservation service](../../apps/api/src/modules/reservations/reservations.service.js)
validates student eligibility, branch/item state, policies, duplicate holds, and
limits, then locks an `AVAILABLE` row and changes it to `RESERVED`. That can
include a synthetic row under existing rules. This batch does not change those
permissions, policies, allocation rules, or transaction behavior.

## 2. Implementation

- Added one reusable bilingual `InventoryNotice`, displayed once on Catalog,
  Item Details, and My Reservations, including direct visits to reservation
  history. It says system availability may include demo copies, does not confirm
  physical stock, and should be checked with the library before visiting, even
  with a reservation. It does not declare every copy synthetic.
- Qualified the existing catalog badge/filter/branch labels, detail headings and
  available counts as **system records**. Search, filters, sorting, pagination,
  and actual count values retain their existing behavior.
- Qualified reservation copy and candidate counts; success now says the
  reservation was recorded in the system. Existing holds, no-stock messages,
  confirmation/cancel behavior, pending controls, errors, payloads, and
  idempotency headers remain intact.
- The notice uses existing `admin-source-notice` styles, `role="note"`, and a
  unique accessible label. It is static, avoiding repeated live announcements.
  Reserve and Confirm buttons describe the full notice body using
  `aria-describedby`. Branch fractions retain their visible display and gain
  qualified screen-reader text using the existing `sr-only` utility.
- No schema, backend, API contract, provenance property, verification status,
  environment switch, copy-code heuristic, package manifest, or stylesheet was
  added or changed.

## 3. Files changed

| File | Change |
| --- | --- |
| `apps/web/src/components/discovery/InventoryNotice.jsx` | New shared contextual notice. |
| `apps/web/src/pages/student/CatalogPage.jsx` | Render notice; preserve Sprint 10B.1 loading/accessibility work. |
| `apps/web/src/pages/student/ItemDetailsPage.jsx` | Render notice, describe reservation buttons, qualify spoken branch counts. |
| `apps/web/src/pages/student/MyReservationsPage.jsx` | Retain stock qualification when viewing existing holds directly. |
| `apps/web/src/components/circulation/ReservationPanel.jsx` | Optional accessible-description reference on Reserve/Confirm. |
| `apps/web/src/i18n/locales/en-discovery.js` and `ar-discovery.js` | Bilingual notice and recorded-availability labels. |
| `apps/web/src/i18n/locales/en-circulation.js` and `ar-circulation.js` | Qualified reservation instructions, success, and no-copy wording. |
| `apps/web/tests/stock-transparency.browser.test.mjs` | New fixture-only browser coverage. |
| `docs/frontend/SPRINT10B2_DEMO_STOCK_TRANSPARENCY.md` | This assessment and closeout report. |

## 4. Verification results

Scripts were reviewed before execution. The production build runs Vite and an
API script that only prints that plain Node ESM needs no build. Browser suites
start their own loopback Vite servers and intercept API calls with synthetic
fixtures. Unexpected API/external requests are blocked. No Express server,
database, import, seed, migration, or RAG process was started.

```powershell
node --test --test-reporter=tap --test-concurrency=1 apps/web/tests/i18n.test.mjs apps/web/tests/accessibility.browser.test.mjs apps/web/tests/stock-transparency.browser.test.mjs
npm run build
git diff --check
```

| Check | Result |
| --- | --- |
| Existing localization regression | **6 passed.** All 498 leaves in each locale, matching key sets, auth merges, fallback behavior, and direction handling. |
| Existing Sprint 10B.1 browser regression | **8 passed.** Login, modal keyboard behavior/form flow, catalog controls/loading/error announcements and request races. |
| New stock-transparency browser tests | **6 passed**, covering English and Arabic, LTR/RTL, all availability states, catalog loading/empty/error/recovery, direct detail visits, existing holds, detail errors, and reservation-list loading/empty/errors. |
| Reservation flow with fixtures | Create/cancel, branch selection, cancellation before submission, pending disabled controls, `NO_AVAILABLE_COPY` and `NO_CIRCULATION_POLICY` handling, request IDs, unchanged item/branch payloads, unique idempotency keys, and refreshed counts passed in both languages. No actual records were created. |
| New notice accessibility | Scoped axe checks **passed with no violations, including contrast**. Single visible, named note, no live-region chatter; button accessible descriptions contain the bilingual explanation. |
| Broader accessibility | Existing catalog/modal scans and added Item Details scans report `color-contrast` findings. Other tested WCAG 2 A/AA and 2.1 AA rules passed. Broader scans explicitly report/allow that pre-existing contrast rule; the new-notice scan has no exception. |
| Production build | **Passed**, 121 frontend modules transformed and API no-build script completed. |
| Whitespace | `git diff --check` **passed**; Git's existing LF/CRLF conversion warnings remain. |

The combined run passed **20/20 tests**. After the final branch-count screen-reader
markup review, the affected six browser tests and production build were rerun
and passed. No unrelated test suite with database-backed setup was run.
Browser checks used installed headless Microsoft Edge with existing local
Playwright 1.63.0 and axe-core 4.13.0. No dependencies or browsers were installed.
These optional browser tools are not provisioned by a clean `npm ci` alone; see
the existing [test setup notes](../../apps/web/tests/README.md).

## 5. Remaining gaps and risks

- Per-copy verified/demo/mixed provenance remains unavailable to students.
  Qualified record-based messaging is the safe fallback, including for future
  legitimate catalog entries, until an authoritative verification contract exists.
- Notices do not reconcile real holdings or prevent synthetic copies from being
  reserved, allocated, or processed by existing workflows. Those policies remain
  unchanged as requested. A reservation is not evidence of physical verification.
- No current database contents or physical stock were certified. Server-side
  policy enforcement and persistence were assessed in source, not exercised
  against a database. Client handling was verified with API-shaped fixtures.
- Actual screen-reader speech, other browser engines, mobile assistive technology,
  and a full dark-theme/contrast audit were not performed. Existing contrast
  findings remain separate from this transparency batch.

## 6. Preservation and Git diff summary

Before edits, hashes were captured for all **75 pre-existing modified/untracked
files**. **72 remain byte-for-byte unchanged**. Only three previously modified
files were deliberately extended: `CatalogPage.jsx`, `en-discovery.js`, and
`ar-discovery.js`. Their start-of-batch copies were compared with the final files;
the prior auth/loading fixes remain intact. The existing tests and Sprint 10B.1
report remain unchanged, as do README, CSS, RAG, import/data files, and the Visual
Design Handoff.

This batch changes **9 source files: +83 / -37 lines relative to its starting
worktree** (8 existing files modified, 1 new component), plus one new browser test
and this report: **11 files total**. Ordinary `git diff` also includes preserved
pre-existing work; it must not be treated as this sprint's isolated diff. The
three new files remain untracked for review. Branch `dev` and Git history were
preserved; no reset, clean, stash, staging, commit, or push was performed.

## 7. Recommendation for Sprint 10B.3

Define a library-approved provenance and verification contract and reconciliation
workflow before introducing per-copy verified/demo indicators. The contract must
support mixed inventories and distinguish circulation state from physical
verification. Keep the existing contrast findings in the Concept D foundation
backlog. Sprint 10B.3 has not been started.
