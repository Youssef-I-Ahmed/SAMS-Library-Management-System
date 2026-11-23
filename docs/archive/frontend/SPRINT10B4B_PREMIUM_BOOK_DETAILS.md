# Sprint 10B.4B — Premium Book Details

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Completed locally on 24 October 2026 on `dev`, base HEAD
`ef3dbdc779c2513c377ba449636c52643d7d2064`. No commit, push, database operation,
backend-contract change, dependency installation, cover enrichment or RAG/AI
execution. Sprint 10B.5 was not started.

## 1. Assessment and component mapping

Before editing, inspected actual Git status, read the
[Design Handoff](../design/handoff/sams-living-library-v2/DESIGN_HANDOFF.md),
viewed [03-book-details.png](../design/handoff/sams-living-library-v2/assets/03-book-details.png),
reviewed the 10B.2 and 10B.4A reports, existing Home/Catalog tokens and styling,
ItemDetailsPage, ReservationPanel, route guards, Prisma/availability findings and
the discovery detail response. A concise assessment was supplied before coding.

| Approved reference | Existing component / implementation |
| --- | --- |
| Cover beside title and contributor | Existing hero moved into the main column; shared Catalog placeholder, editorial H1, contributor names/roles and real category. |
| Overview and details | Existing description and bibliographic sections; native section links instead of unsupported tabs. |
| Availability / reservation sidebar | Existing AvailabilityBadge, InventoryNotice, branch summaries and ReservationPanel, styled consistently with Catalog. |
| Back navigation | Existing `/student/catalog` destination, visible focus and mirrored RTL arrow. |
| Responsive surfaces | Existing StudentShell and tokens, two-column desktop / stacked tablet and mobile layout. |

The existing protected route remains `/student/items/:itemId`. No routes,
endpoints, guards or business permissions changed. The page was extended rather
than replaced by an independent implementation.

**Contract evidence:** The detail API exposes LibraryItem identity/type/title,
contributors, category, language, year, Dewey/call number, description, book
ISBN/publisher/edition or academic fields, aggregated availability and reservation
candidate branches. PhysicalCopy circulation counts are separate from the
bibliographic record. No individual copy identifiers, cover URL, page count,
subtitle, authoritative inventory verification, reviews or related-book source is
exposed by this response. No such fields or capabilities were invented.

Initial issues included low-contrast green/amber stock text, small metadata,
unstructured loading/error presentation, a blank render for a null record,
stale state across item-parameter changes, lost keyboard focus as reservation
controls changed, and reservation-check errors disappearing in some states.

## 2. Files changed

Extended existing files:

- `apps/web/src/pages/student/ItemDetailsPage.jsx`
- `apps/web/src/components/circulation/ReservationPanel.jsx`
- `apps/web/src/components/discovery/DiscoveryItemCard.jsx`
- `apps/web/src/i18n/locales/en-discovery.js`
- `apps/web/src/i18n/locales/ar-discovery.js`
- `apps/web/src/i18n/locales/en-circulation.js`
- `apps/web/src/i18n/locales/ar-circulation.js`
- `apps/web/src/styles.css`
- `apps/web/src/styles/living-library-catalog.css`
- `apps/web/tests/catalog.browser.test.mjs`
- `apps/web/tests/stock-transparency.browser.test.mjs`

Added:

- `apps/web/src/components/discovery/BookCoverPlaceholder.jsx`
- `apps/web/src/styles/living-library-details.css`
- `apps/web/tests/item-details.browser.test.mjs`
- This report, browser evidence/logs and the evidence ZIP.

## 3. Visual implementation

Reused SAMS navy, ivory, muted gold, display/UI font tokens, border/focus tokens,
subtle surfaces and shadows. English headings use the established editorial
serif; Arabic follows the existing Arabic font treatment. No competing theme or
component library was added.

The existing generic cover markup is now one reusable component shared by
Catalog and Details, with the same visible cover-not-supplied caption. Details
uses a larger version. It is a decorative CSS/SVG book shape, not fabricated
edition artwork. Catalog's accessible badge palette now supplies shared
component variables for both pages, also used by Details branch counts.

Descriptions retain API text/newlines and wrap long unbroken strings. Optional
fields are omitted; absent contributors have a localized fallback. Dewey values
join only supplied code/name values. Metadata values keep automatic text
direction while aligning with their English or Arabic labels.

The description, metadata and branch sections have keyboard-accessible anchor
links and focusable headings with scroll margins for the existing navigation.
Native links provide useful long-page navigation without pretending to offer
reviews or a table of contents. All content remains readable without animation.

## 4. Preserved functionality and targeted state fixes

- Preserved the detail GET contract and actual fields, branch counts/locations,
  availability states, reservation readiness/candidate branches, active-hold
  lookup, selected branch, POST payload, idempotency-key generation, disabled
  pending controls and server policy errors.
- Preserved Catalog ↔ Details navigation, StudentShell, authentication, role
  guards and reservation-list/create/cancel flows. Existing hold lookup still
  requests page 1 / pageSize 100; server enforcement remains authoritative.
- InventoryNotice remains visible beside the counts and described by reservation
  controls. Wording says records may include demo copies and do not establish
  physical stock, including after reservation success. No verified-stock badge,
  per-copy provenance guess or assumption that all future stock is synthetic.
- Loading/completion use a persistent polite status region; errors use alerts.
  HTTP 404 and null data have bilingual missing-record states. Read failures have
  retry; item changes clear old content and confirmation state. Abort/identity
  guards prevent stale reads, including refreshes, updating a different item.
- Confirmation focuses the branch select; declining returns focus to Reserve;
  successful creation focuses the reservations link. Pending and recorded success
  have status feedback. Check failures remain visible without silently changing
  eligibility or hiding the existing server-authorized action.
- A failed availability read after a successful POST has a separate refresh
  warning/retry. Recorded reservation success remains visible; retry sends only a
  GET, not a second reservation POST. Request IDs remain available.

## 5. Tests and production build

Reviewed entry points before execution. `npm run build` runs Vite plus an API
build that only prints its plain-ESM status. Browser tests fulfill API calls
locally, including fixture POST/cancel requests, and block unexpected API or
external requests. No API server/database, migration, seed, import or RAG process
was started. Database-capable root API tests were not used for this frontend batch.
No frontend lint command is configured; production compilation and
`git diff --check` pass.

| Suite | Passing checks |
| --- | --- |
| Existing i18n unit tests | 6 |
| Existing UX/accessibility browser suite | 8 |
| Existing stock/reservation browser suite | 6 |
| Existing Home browser suite | 17 |
| Existing Catalog browser suite | 18 |
| New Details browser suite | 24 |
| Combined final regression run | **79/79**, zero failures |

After the final RTL metadata-alignment adjustment, the production build and all
24 Details checks passed again. Final Vite build: 122 modules; Details chunk
12.22 kB / 3.64 kB gzip; global CSS 98.28 kB / 16.70 kB gzip. Final local Details
matrix: LCP 348–1612ms, CLS 0, zero automated accessibility violations.

Tests cover desktop 1440px / tablet 820px / mobile 390px in English/Arabic ×
light/dark, 320px reduced-motion long text, missing cover/contributors/optional
metadata, academic records, unavailable/no-copy inventory, existing holds,
loading, HTTP 404, null data, API failure/retry, failed hold lookup, protected
routes, item-parameter transitions, Catalog navigation, local section navigation,
keyboard confirmation, policy errors, disabled pending controls, idempotency
headers and successful reservation with failed/recovered availability refresh.
Fixtures are explicitly test records, not evidence of actual library holdings.

The first combined run exposed a Catalog test race (asserting the old request
before the submitted query started) and an older eight-second dev navigation
timeout. Catalog query actions now register/await the search response; the older
stock test permits 15 seconds for startup. Assertions and application behavior
were retained. The corrected combined run passed all 79 checks.

Original Home/Catalog screenshot destinations were protected by temporary suite
copies with only evidence paths redirected into this sprint. Copies were checked
against their sources and removed after the run. Previous evidence was not
rewritten.

## 6. Accessibility findings

Whole-page axe WCAG A/AA scans, including text contrast with no exclusions,
return zero violations across all 12 Details language/theme/device combinations.
Scans also cover checking/pending/success/error reservation states, refresh
failure, long/missing metadata, academic/unavailable records, loading, missing
records and read failures. The older stock suite now also reports zero Details
contrast findings.

Shared badge text contrast is 6.59:1 available / 5.98:1 unavailable in light mode,
7.99:1 / 8.15:1 in dark mode. Branch counts use the same readable foregrounds.
Select borders and keyboard focus are visible. Heading structure, definition
lists, labelled aside/navigation, status/alert semantics and record-qualified
count descriptions are retained or improved. No horizontal page/surface overflow
or browser runtime exception was observed. Reduced motion disables the spinner.

This combines automated Chromium/Edge checks, keyboard assertions and direct
screenshot review; it is not a claim of a completed screen-reader listening
session or cross-browser/device certification.

## 7. Screenshots and evidence ZIP

Evidence folder: `docs/frontend/screenshots/sprint10b4b/`.

| Device / language | Light | Dark |
| --- | --- | --- |
| Desktop English | [desktop-en-light.png](screenshots/sprint10b4b/desktop-en-light.png) | [desktop-en-dark.png](screenshots/sprint10b4b/desktop-en-dark.png) |
| Desktop Arabic | [desktop-ar-light.png](screenshots/sprint10b4b/desktop-ar-light.png) | [desktop-ar-dark.png](screenshots/sprint10b4b/desktop-ar-dark.png) |
| Mobile English | [mobile-en-light.png](screenshots/sprint10b4b/mobile-en-light.png) | [mobile-en-dark.png](screenshots/sprint10b4b/mobile-en-dark.png) |
| Mobile Arabic | [mobile-ar-light.png](screenshots/sprint10b4b/mobile-ar-light.png) | [mobile-ar-dark.png](screenshots/sprint10b4b/mobile-ar-dark.png) |

Also captured four tablet variants, four mobile viewport crops, English/Arabic
long/minimal/academic/unavailable/no-copy cases, reservation error/pending/success
and refresh-failure cases, and loading/error/404/null states in both themes.
There are 50 Details PNGs; all displayed stock remains explicitly qualified.
Nested `home-regression/` and `catalog-regression/` preserve this run's additional
regression captures. Each suite has a metrics JSON.

Logs: `regression-results.txt`, `details-results.txt`, `build-results.txt`.
ZIP: [SPRINT10B4B_PREMIUM_BOOK_DETAILS_EVIDENCE.zip](SPRINT10B4B_PREMIUM_BOOK_DETAILS_EVIDENCE.zip),
containing this report and the visual evidence directory. The final ZIP is
validated by opening its entry list and comparing its file count with the inputs.

## 8. Differences from the mockup

The reference's genuine book artwork awaits Sprint 10C enrichment; this sprint
uses the shared generic placeholder and no external cover service. No authorized
library-background photograph was established, so its photographic strip is not
deployed. The supplied shield/navigation and current authenticated routes remain.

Unsupported subtitle, page count, on-loan breakdown, bookmarks, reviews, table of
contents, related-book carousel, social links and marketing footer are omitted.
Description/metadata/recorded-availability anchors adapt the reference's section
navigation to supported content. Real schema fields replace mockup copy/counts;
fixture screenshots are clearly test records. Layout density is adapted for long
titles, accessible text and variable metadata rather than fixed mockup dimensions.

## 9. Remaining risks and performance limits

Authoritative per-copy inventory provenance remains unavailable through the
existing contracts. No stock is claimed physically verified. Cover enrichment,
copyright/source validation and edition matching remain separate Sprint 10C work.

An availability-refresh failure leaves the previous counts visible with an
explicit warning until retry; successful reservation state remains intact.
Existing server-side eligibility, limits and duplicate enforcement remain final.
Tests verify frontend contracts/flows using fixtures, not a live database.
Server-supplied free-text error messages retain the language returned by the API;
known reservation policy errors and new UI notices are localized.

No new raster image, cover request, remote dependency, web font or decorative
animation was added. Existing route splitting remains. Local performance values
are unthrottled fixture observations and do not establish field performance.
Firefox/WebKit, real touch devices and assistive-technology listening remain
outside this local verification.

## 10. Preservation and Git diff summary

Recorded Git status, SHA-256 hashes for all 169 pre-existing modified/untracked
files, and pre-edit copies of every extended source/test file. Final hash
comparison found 158 byte-identical files and the 11 explicitly listed extensions,
with none missing. RAG, handoff/assets, Home, prior reports, prior screenshots and
the pre-existing Home ZIP are preserved. Only this sprint's verified temporary
test copies were removed.

Sprint-only frontend/test increment: **14 files, +704 / -205 lines**, excluding
this report, evidence and ZIP. The tracked HEAD diff also includes all earlier
work (25 tracked files, +958 / -603 lines, excluding untracked files) and must
not be attributed to this batch alone. Final branch remains `dev`;
there was no reset, clean, stash, branch switch, commit or push.

Stop after 10B.4B. Sprint 10B.5, cover enrichment and AI Chat are not started.
