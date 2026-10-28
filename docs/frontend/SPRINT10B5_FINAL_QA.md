# SAMS — Sprint 10B.5 final QA and stabilization

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Date: 25 October 2026. Repository: `D:\Digi\SAMS_Library_System_Root\SAMS_Library_System`.
Branch remains `dev`; HEAD remains `ef3dbdc779c2513c377ba449636c52643d7d2064`.

**Outcome:** the completed Student experience is stabilized without another
redesign. The relevant final runs pass **93 distinct tests**, the production
build passes, and the final primary/state audit cases have no WCAG axe
violations or root horizontal overflow. This is a scoped result, not a claim
that every staff route or every assistive technology is certified.

## 1. Assessment and design authority

Reviewed `docs/design/handoff/sams-living-library-v2/DESIGN_HANDOFF.md`, its
`assets/01-landing-v3.png`, `02-book-discovery.png` and `03-book-details.png`,
the five `docs/frontend/SPRINT10B1_*` through `SPRINT10B4B_*` implementation
reports, and the actual routes, shared shells, controls, tokens and styles.
The independently prepared `docs/design/audits/sprint10b5a/` package was
preserved and used as leads only; no A/B/C redesign proposal was adopted.

The explicit `design-taste-frontend` skill was applied as an **app-screen
review** under the user's authoritative Concept D direction. No new draw,
seed, art direction, dependencies or assets. The existing navy/ivory/gold,
editorial English headings, Arabic hierarchy and generic book placeholders
remain. See [the written critique](qa/sprint10b5/CRITIQUE.md).

Routes remain `/student`, `/student/catalog`, `/student/items/:itemId`, existing
circulation/profile routes and existing Librarian/Management routes. No public
route, feature, RBAC change or backend contract was added. Home, Catalog,
Details, InventoryNotice and ReservationPanel implementations were preserved;
the shared AdminModal was reused for the existing Return dialog.

## 2. Prioritized findings and confirmed fixes

| Severity | Evidence / root cause | Correction and result |
| --- | --- | --- |
| P1 | Native Tab puts Home card actions, Catalog links and the Details reservation button behind fixed mobile navigation. All 24 initial mobile boundary probes overlapped. | Scoped scroll margins, safe-area-aware end padding and existing fixed navigation retained. Final 24/24 probes clear header and bottom bar, with visible focus. |
| P1 | Shared status foregrounds fail contrast: Return success 3.72:1 and danger 4.08:1 in light; student reservation badges and dark staff danger also fail. | Shared semantic foreground/surface tokens reused by student/staff/admin badges. Semantic pairs now range 5.98–11.81:1 in light and 7.22–8.15:1 in dark. State words and logic unchanged. |
| P1 | Broad `.staff-topbar span` overrides avatar text foreground. | Specific white avatar foreground; staff smoke scans show no colour-contrast failures. |
| P1 | Existing Return overlay leaves initial focus outside and ignores Escape. | Reuse AdminModal trap, initial focus, Escape, restoration and pending-operation dismissal gate; fields, payload and submission logic retained. |
| P1 | Analytics metric select lacks a name; trend/table overflow cannot receive keyboard focus. | Existing translated names added to the select and regions; regions focus and scroll using keys. |
| P1 | Expanded failure-state check finds low-contrast faded request identifiers in shared alerts. | Extend Details' existing full-opacity correction to the shared alert's small text. |
| P2 | Small secondary labels vary between 9 and 12px across pages. | Selected Home captions, Catalog labels/placeholder text, Details section labels and student role label use 11px; tabular figures stabilize counts. |
| P2 | Wrapped tablet header is taller than the filter sticky offset; anchor/focus positioning needs clearance. | Tablet offset and scoped focus/anchor scroll margins; 1024px English/Arabic tests pass. |
| P2 | Analytics source gives a zero a minimum 3% bar, and retains Loading after a failed overview. | Zero-width bars for zero; settled existing error render. Existing dates follow the active language. No endpoints or data rules changed. |
| P2 | Old browser harness uses an 8s cold-navigation budget and conflates slow-request loading with fast completion. | Navigation gets 30s; actions keep 8s. Stale-response rejection and quiet fast completion are asserted separately; no product timer changed. |

Initial findings: [audit ledger](qa/sprint10b5/AUDIT_FINDINGS.md).
The initial 58-case audit had nine axe rule instances across six shared-route
cases; the three main Student pages were already axe-clear. Their mobile
keyboard obstruction was a separate confirmed failure.

**Fixed-navigation diagnosis:** full-page screenshots composite fixed chrome
across long content, which can be misleading. The initial *viewport* tests also
proved a real problem: at 390px, the Catalog link occupied approximately
y=784–816 while the bar began at y=776; the reservation button occupied
y=784–830. After native Tab scrolling they clear the bar. The fix addresses
interaction, and deliberately keeps the navigation fixed. See the
[before/after comparison](screenshots/sprint10b5/review/keyboard-before-after.png).

## 3. Files changed in this batch

| Application/test file | Change |
| --- | --- |
| `apps/web/src/styles/themes.css` | Semantic status tokens for both themes. |
| `apps/web/src/styles/living-library-catalog.css` | Existing record colours reference shared semantic tokens. |
| `apps/web/src/styles.css` | Import scoped stabilization rules. |
| `apps/web/src/styles/frontend-stabilization.css` — new | Focus/safe-area/tablet clearance, label consistency, semantic badges, avatar and alert contrast. |
| `apps/web/src/pages/librarian/ReturnPage.jsx` | Reuse existing AdminModal. |
| `apps/web/src/pages/shared/AnalyticsDashboardPage.jsx` | Accessible names/overflow regions, truthful zero/error rendering, localized dates. |
| `apps/web/tests/accessibility.browser.test.mjs` | Navigation budget and separate race/quiet assertions. Existing fixtures and assertions retained. |
| `apps/web/tests/frontend-stabilization.browser.test.mjs` — new | Fourteen production-fixture stabilization tests. |

New supporting artifacts: this report, evidence ZIP,
`docs/frontend/qa/sprint10b5/` and `docs/frontend/screenshots/sprint10b5/`.
The QA directory contains its README, audit/critique, read-only host/fixtures,
matrix/focus/state/console/staff scripts, contact-sheet and preservation tools,
JSON diagnostics, logs and the sprint-only patch. It is not imported into the
application. No manifests, lockfiles, backend files or previous reports changed.

## 4. Functional regression and test results

| Suite | Distinct passing tests | Coverage |
| --- | ---: | --- |
| Localization | 6 | English/Arabic keys, interpolation, fallback and direction. |
| Existing accessibility, final run | 8 | Login, Add Book dialog/submission fixtures, Catalog announcements, races, errors and cleanup. |
| Stock transparency | 6 | Recorded availability qualification; reservation create/cancel payloads and rules; unavailable, empty and failed records. |
| Student Home | 17 | Layouts, search/links/account menu, language/theme, reduced motion, image failure, authentication and roles. |
| Catalog | 18 | Search contracts, all supported filters, sorting, pagination, grid/list, disclosure focus, states and Details navigation. |
| Details | 24 | Reservation errors/pending/success/recovery, existing holds, unavailable copies, long/incomplete records, loading/missing/failure states and guards. |
| New stabilization | 14 | Native keyboard clearance at 320/390px in both motion preferences, simulated safe area, shared contrast, Return focus/dismissal, Analytics zero/error and tablet anchors. |
| **Total across relevant final runs** | **93** | Fixture-only; original DB never used. |

**Run history is retained:** the original combined 79-test run passed 76 and
failed three timing assertions in the old accessibility suite. An unchanged,
isolated rerun passed seven of eight, failing first-navigation startup. Raising
navigation budget exposed one remaining conflated race/quiet assertion. After
the narrow harness corrections, that suite passed **8/8**. The other 71 tests
and new 14-test suite passed. This is not represented as a single 93-test run.
All intermediate and final logs are in [QA logs](qa/sprint10b5/logs/).

The earlier screenshot-writing suites ran as verified temporary copies with
only their output directories redirected into this batch. Their originals and
previous evidence were preserved; the temporary copies were checked and removed.

`npm run build` passes: Vite transforms 122 modules; the API workspace build is
its existing plain-ESM informational step. Scripts were reviewed before running;
no DB-capable root/backend test, seed, migration, import or RAG command ran.
No general ESLint script is configured. Targeted Git whitespace checks pass;
Vite parses/compiles the React source, and browser tests exercise the build.

## 5. Accessibility and responsive verification

- **58 final primary/shared cases:** Home/Catalog/Details at 1440×1000,
  768×1024, 390×844 and 320×740, both languages and themes, plus reservation,
  borrowing, Librarian, Return and Management spot checks. Zero axe violations;
  no root overflow in the 48 core cases; no page exceptions.
- **24 final Student state captures/scans:** Catalog and Details loading,
  empty/missing and error, both languages/themes on mobile. Zero axe violations,
  root overflow or page exceptions. See `student-states/results.json`.
- Axe uses WCAG 2 A/AA and 2.1 AA tags, with **no exclusions** in the new
  production audits. Older suites' historical contrast filtering is not used
  to justify this result.
- Agent-stepped Tab/Shift+Tab, Enter, Escape and PageDown checks verify focus
  order/visibility, disclosure/anchor behavior, modal trapping/restoration,
  pending dismissal, navigation and accessible feedback. RTL and LTR are
  exercised. Reduced-motion cases remain static and usable.
- A simulated 34px bottom safe-area verifies the spacing formula. This is not
  a physical iOS/Android device test; Safari/WebKit and virtual keyboards were
  not certified. Browser verification uses installed Edge via Playwright.
- Windows Narrator is installed, but this session has no reliable speech
  capture/listening channel. **No screen-reader listening session or universal
  WCAG certification is claimed.** Visual inspection and DOM/keyboard checks
  cannot replace an assistive-technology user test.

Broader staff checks cover nine additional routes in desktop English light and
mobile Arabic dark (**18 cases**). All render with no root overflow, runtime
exceptions or unmapped fixture APIs. They retain **ten axe rule instances in
nine cases**, detailed in `staff-smoke/results.json`:

| Deferred severity | Existing area | Finding |
| --- | --- | --- |
| P1 | Librarian Visits, Catalog administration, Students; Management Borrowings | Existing filter selects lack accessible names. |
| P1 | Management Borrowings and Visits, mobile | Existing table overflow containers cannot receive keyboard focus. |
| P2 | Shared technical diagnostics | `Request ID` prefix remains English in Arabic alerts; existing diagnostic copy was not rewritten. |

These untouched staff forms/tables are a separate prioritized accessibility
follow-up. No staff dashboard redesign was undertaken. The clean 58-case
result must not be generalized to all application routes.

## 6. Performance measurements and limits

Final production output (decimal kB, Vite report):

| Asset | Raw | Gzip |
| --- | ---: | ---: |
| Main JS | 247.82 | 79.84 |
| Shared CSS | 100.74 | 17.21 |
| Lazy Home chunk | 5.40 | 1.72 |
| Lazy Catalog chunk | 11.15 | 3.32 |
| Lazy Details chunk | 12.22 | 3.63 |

CSS increased from 98.28/16.70kB to 100.74/17.21kB: **+2.46kB raw,
+0.51kB gzip**. Main JS grew approximately 0.04kB raw. Route splitting remains;
no new library, font, decorative image or remote request was introduced.
Existing responsive Home WebPs are approximately 373kB desktop / 162kB mobile;
logo/image dimensions remain reserved. Generic covers use existing CSS/SVG.

Local, unthrottled production-fixture observations, 16 cases per page:

| Page | LCP min / median / max, ms | Maximum observed CLS |
| --- | --- | ---: |
| Home | 980 / 1340 / 2092 | 0 |
| Catalog | 592 / 968 / 2136 | 0.00993 |
| Details | 252 / 500 / 844 | 0 |

These are local PerformanceObserver samples, not field Core Web Vitals,
Lighthouse scores, backend/network benchmarks or INP measurements. Concurrency,
cache and fixture timing vary; before/after times are retained but no causal
speedup is claimed. Catalog's small existing data-arrival shift remains below
0.01 in these samples. Twelve final Student language/theme scenarios also
report no console errors, exceptions, failed requests or unmapped APIs in
`runtime-console.json`. Home's existing development-console test passes.

## 7. Visual evidence and skill limitations

Base evidence path:
`D:\Digi\SAMS_Library_System_Root\SAMS_Library_System\docs\frontend\screenshots\sprint10b5\`.

- `after/{home|catalog|details}-{1440|768|390|320}-{en|ar}-{light|dark}-viewport.png`
  and `-full.png`: actual final production captures, all combinations.
- Mobile `-bottom.png` and `-keyboard.png`: real viewport scrolling evidence.
- `before/`: matching original-build captures and measurements.
- `review/`: six language/theme desktop/tablet/mobile/narrow sheets, three
  full-layout sheets and the keyboard before/after comparison.
- `states/`: keyboard, Return dialog and Analytics zero/error evidence.
- `student-states/`: final loading, empty/missing and failure captures.
- `regression-home/`, `regression-catalog/`, `regression-details/`: previous
  suite state/long-title/reservation evidence rerun into new locations.
- `staff-smoke/`: broader staff screenshots and deferred findings.

Examples: [desktop English light Details](screenshots/sprint10b5/after/details-1440-en-light-viewport.png),
[desktop Arabic dark Catalog](screenshots/sprint10b5/after/catalog-1440-ar-dark-viewport.png),
[mobile English dark Home](screenshots/sprint10b5/after/home-390-en-dark-viewport.png),
[mobile Arabic light Details](screenshots/sprint10b5/after/details-390-ar-light-viewport.png).
The naming matrix above supplies the exact eight desktop/mobile
language/theme combinations for every primary page, plus tablet and 320px.

The skill's standalone inspector could not launch its browser: **“Chrome exited
early, code 0”**, including explicit Edge and a final retry. No successful CLI
inspection or zero-FAIL skill gate is claimed. Its installed, unmodified
App Screens probes/judges were run through working Playwright Edge on nine
page/width combinations before and after; raw findings remain in `results.json`.
Source lint retains six gradient FAILs and sixteen shadow WARNs, already
present in Concept D. Editorial title size, ivory, scrims/surfaces and subtle
depth are retained under the user's no-redesign instruction. The remaining
`tiny-text` findings measure the share below 13px after selected sub-11px
corrections; the Catalog tabular warnings are resolved. No skill ignore
comments, broad allow list or accessibility exclusions were added. The
[critique](qa/sprint10b5/CRITIQUE.md) explains each style allowance/deferment.

## 8. Fidelity gaps and unresolved product/data limits

The approved composition and supported architecture remain coherent across the
three pages. Mockup photography, authentic illustrated covers, unsupported
filters/counts, reviews/ratings, related-book recommendations, public marketing
routes and AI sections were not fabricated to imitate reference pixels.
Home's concept image stays visibly labelled; genuine campus imagery and cover
rights/provenance remain enrichment tasks. Mobile Catalog is still vertically
deep and unequal metadata leaves intentional card whitespace; those design
choices are documented rather than redesigned in stabilization.

No authoritative per-copy physical-inventory verification was discovered or
invented. Existing bilingual notices, recorded-availability wording and
reservation caveats remain. Reservations retain existing eligibility/payloads;
the UI does not make a reservation proof of real-world stock. Staff legacy
accessibility, the diagnostic translation gap, physical-device/AT testing and
field performance are the remaining follow-up risks.

## 9. Git diff and preservation

Pre-edit SHA-256 inventory covered **557 existing modified/untracked files**.
Final verification: **553 byte-identical**, four deliberately extended files
(`styles.css`, `themes.css`, existing untracked Catalog stylesheet and existing
accessibility test), **zero missing files**. Two previously clean tracked
files, Return and Analytics, have the scoped fixes described above. The RAG
package, design handoff, 10B5A audit/proposals/ZIP, old screenshots/reports and
other prior work remain byte-identical. No reset, clean, stash, branch change,
commit or push occurred.

This batch changes six application files and two test files: **221 additions
/ 21 deletions** against the pre-edit snapshot (minified Analytics lines make
line counts a limited measure of scope). The exact
sprint-only diff/counts are in [preservation.json](qa/sprint10b5/preservation.json)
and [sprint-only.diff](qa/sprint10b5/sprint-only.diff), calculated against saved
pre-edit copies rather than attributing previous sprints to this batch.
The complete tracked worktree against HEAD contains **27 modified files,
988 additions / 621 deletions**, including all earlier work; this total
excludes untracked files and is **not** the Sprint 10B.5 change size. Complete
status/diff snapshots and preservation logs accompany the evidence.

## 10. Closure recommendation and Sprint 10C readiness

Recommend closing **Sprint 10B's premium Student visual scope**, with the
explicit staff accessibility backlog and testing limitations recorded above.
This is not full-application accessibility sign-off or physical-inventory
verification. The implementation is ready for a separately approved Sprint
10C cover-enrichment assessment: establish authoritative image source/use
provenance, identity matching and graceful fallback before enrichment changes.
Campus photography and inventory verification remain separate tasks.

No Sprint 10C, 10D, AI Chat, Knowledge Spirit or backend work was started.
Evidence package: [SPRINT10B5_FINAL_QA_EVIDENCE.zip](SPRINT10B5_FINAL_QA_EVIDENCE.zip).

## 11. Pre-Sprint 10C checkpoint verification — 28 October 2026

This dated addendum supersedes the earlier closure recommendation for current
checkpoint readiness. Earlier dates, HEAD references, counts and 93-pass results
above describe their original runs; they are not the current working-tree or
browser-test result.

**Decision: partial checkpoint only. C1 is blocked and remains uncommitted.**
C2 preserves the approved Concept D handoff and historical Sprint 10B reports
with current limits explicitly recorded. It is an independent documentation
checkpoint, not a claim that Student source passed its current gate or that
Sprint 10C implementation can start. C3 search normalization passed its separate
unit and real-database read-only checks.

### Current inventory and boundaries

Fresh expanded Git status before checkpoint edits contained 1,113 changed paths:
29 modified tracked and 1,084 untracked, nothing staged, on branch `dev` at
`ef3dbdc779c2513c377ba449636c52643d7d2064`. This replaces the assessment's older
1,112-path snapshot. Reconciled allowlists contain C1: 50 files, C2: 21 files,
and C3: 5 files (the four API source/test files plus the Arabic-search report).
The remaining 1,037 paths are HOLD. No branch switch or push is authorized.

C1 includes required runtime assets, shared UI changes, tests and the two
fixture-host files. No files were omitted to manufacture a passing subset.
Because C1's browser gate failed, its complete 50-file set stays outside these
commits. C2 and C3 are reviewed and saved independently.

### Commands reviewed and actual results

| Check | Current result |
| --- | --- |
| `npm run build` | PASS; Vite 6.4.3, 122 modules, build 24.26 seconds; API build is the existing informational plain-ESM step. |
| `npm run test -w @sams/api -- tests/catalog-search.test.js` | PASS: 33/33; duration 4.15 seconds. Prisma is mocked in this test file. |
| `node --test apps/web/tests/i18n.test.mjs` | PASS: 6/6. |
| Six relevant browser files, run sequentially | FAIL: 81 passed / 87 tests, 6 failed; duration 322.43 seconds. |
| Targeted unchanged rerun of those six failed cases | FAIL: 2 passed / 6 tests, 4 failed; duration 49.17 seconds. These are retries, not six additional distinct tests. |
| Tracked whitespace check | PASS before staging; staged contents are checked separately per committed group. |

The full browser run used:

```powershell
node --test --test-concurrency=1 --test-reporter=tap `
  apps/web/tests/accessibility.browser.test.mjs `
  apps/web/tests/stock-transparency.browser.test.mjs `
  apps/web/tests/student-home.browser.test.mjs `
  apps/web/tests/catalog.browser.test.mjs `
  apps/web/tests/item-details.browser.test.mjs `
  apps/web/tests/frontend-stabilization.browser.test.mjs
```

| Browser suite | Passed / total | Current failure |
| --- | --- | --- |
| Accessibility | 6/8 | English and Arabic Catalog checkbox checks. |
| Catalog | 17/18 | Focus does not return to the disclosure button after desktop-to-mobile resizing. |
| Frontend stabilization | 13/14 | Arabic dark Analytics keyboard scrolling assertion. |
| Stock transparency | 4/6 | English and Arabic Catalog checkbox checks. |
| Student Home | 17/17 | None in this run. |
| Item Details | 24/24 | None in this run. |

The targeted rerun selected `catalog announcements`, `desktop filter focus`,
`ar dark: shared status/nav`, and `catalog qualifies available` cases from their
four test files. The English accessibility case and Arabic dark Analytics case
passed on retry. Arabic accessibility, resize focus, and both stock-transparency
Catalog cases still failed. This identifies persistent failures and some run
variability; it does not establish a root cause or certify the two flaky cases.
No application fix, assertion relaxation, timing adjustment, browser-tooling
repair or dependency installation was made to turn these results green.

### Execution isolation and clean-install limits

Tests were inspected before execution. API search tests mock Prisma; frontend
tests intercept APIs or use the local fixture host, with no real API/DB writes.
No broad backend, seed, migration, import or restore suite was run.

Browser suites ran on a byte-verified source snapshot and a hash-verified copy
of the current production build beside the repository. Existing `node_modules`
was reused through a Windows junction; the test files themselves were unchanged.
Screenshots and metrics were produced only under that isolated snapshot, so
historical HOLD evidence in the checkout was not overwritten.

Local tools were Node 24.22.0, Playwright 1.63.0 and axe-core 4.13.0. A clean
install from committed manifests/lockfile does not supply the undeclared
Playwright/axe packages or browser binaries. Most suites prefer an existing
Playwright Chromium and otherwise Edge; stabilization explicitly selects
`msedge`. The current local run is not clean-install/CI reproducibility proof.
Tool provisioning and portability need a separate follow-up; this checkpoint
does not change manifests, lockfiles or dependencies. There is no configured
frontend lint suite; build/localization/browser results are reported as such.

### Real database check and limits

The intended local project database was verified as `sams_library`, reached at
loopback port 5433 through the existing PostgreSQL container. Verification
connections enforced `default_transaction_read_only=on`. The actual Catalog and
Discovery GET routes, authentication middleware and search services were used
with existing data/accounts; no database fixtures were created. Both routes
returned the same 34 unique IDs for the three Arabic-name query variants and
preserved totals across five pages of size seven. See the separate
[Arabic-search report](../architecture/SAMS_ARABIC_SEARCH_NORMALIZATION_CHANGE_REPORT_2026-10-28.md)
for query/filter/permission details, database counts and timings.

Database record counts do not certify physical holdings. There are no Category
rows, categorized items or inactive library items in this database, so positive
category matching and real inactive-item exclusion cannot be demonstrated from
this dataset. Those cases remain bounded by the existing code and mocked tests.

### Evidence availability and next gate

All newly generated logs, source snapshot, manifests, query IDs, timings and
preservation results live locally beside the checkout at:

```text
D:/Digi/SAMS_Library_System_Root/SAMS_PreSprint10C_Assessment_2026-10-28/checkpoint-verification-2026-10-28/
```

Neither these files nor historical screenshots, ZIPs, JSON diagnostics,
supplementary QA scripts, datasets or RAG files were uploaded or included in
C2/C3. They are unavailable from a checkout alone. C2 includes only its explicit
21-file documentation/reference allowlist, including six canonical design PNGs;
it does not include the C1 application/test/fixture-host files. No durable remote
evidence location is claimed.

Before Sprint 10C implementation, resolve the failed C1 browser gate in a
separately scoped change, establish the intended test tooling/reproduction
policy, rerun the relevant checks, and checkpoint C1. Existing staff
accessibility, authentic imagery/cover rights and physical inventory limits
remain recorded backlog. This run did not start covers or AI integration.

C2 staged review also identified six existing, intentional Markdown hard line
breaks (exactly two trailing spaces) in the supplied design/planning documents.
They are retained as formatting rather than removed from the supplied text.
The default `git diff --cached --check` reports those line breaks; a bounded
review accepts only those Markdown two-space endings and checks for other
whitespace errors separately. This is not represented as an unconditional
clean default staged-whitespace check.
