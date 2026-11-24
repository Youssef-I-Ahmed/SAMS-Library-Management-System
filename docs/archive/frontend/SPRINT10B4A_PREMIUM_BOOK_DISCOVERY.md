# Sprint 10B.4A — Premium Book Discovery

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Completed locally on 24 October 2026 on `dev`, HEAD
`ef3dbdc779c2513c377ba449636c52643d7d2064`. No commit, push, dependency
installation, backend change, database access/write, import or RAG execution.
Book Details redesign and Sprint 10B.4B were not started.

## 1. Assessment and design mapping

Read the [Design Handoff](../design/handoff/sams-living-library-v2/DESIGN_HANDOFF.md)
and directly inspected [02-book-discovery.png](../design/handoff/sams-living-library-v2/assets/02-book-discovery.png).
Reviewed the completed Home, StudentShell, shared primitives, navy/ivory/gold
tokens, light/dark themes, English/Arabic resources, discovery API/query helpers,
Prisma models and the 10B.1–10B.3 reports before editing. The concise assessment
was supplied before implementation.

| Reference area | Implementation in the existing application |
| --- | --- |
| Editorial collection banner | Existing Catalog header, navy surface, serif English / Arabic UI typography, restrained gold rule and decorative CSS lines. |
| Search and resource chips | Existing query form plus shortcuts derived only from returned material-type facets. |
| Filter sidebar | Existing six native selects and recorded-availability checkbox; a compact disclosure on tablet/mobile. |
| Results / sort / layout | Existing result count and five supported sorts; local grid/list presentation of the same results. |
| Book tiles | Existing DiscoveryItemCard, improved hierarchy and category, generic branded CSS/SVG cover, qualified stock badge and actual Details link. |
| Pagination | Existing server pagination, previous/next flags, page count and URL pageSize contract. |
| Header navigation | Existing authenticated StudentShell and role guards, unchanged. |

The route stays `/student/catalog`; Details stays `/student/items/:id`.
No new route or public marketing navigation was added. Existing shared tokens
and primitives were extended through Catalog-scoped styling rather than replaced.

**Metadata / image evidence:** Discovery exposes title, type, contributors,
category, language, publication year, Dewey/call number, book ISBN/publisher/
edition, academic metadata and aggregated availability. Neither LibraryItem /
BookDetails nor the discovery response has a cover-image field. Public assets
contain brand marks and generated/unverified campus imagery, not authorized,
edition-matched book covers or an established genuine library-interior photo.
Mockup artwork is a visual reference, not a deployable asset. Every current card
therefore uses a visibly labelled generic placeholder. No ISBN image lookup,
guessed URL, fabricated artwork, cover provenance flag or API field was introduced.

## 2. Files changed

Modified:

- `apps/web/src/pages/student/CatalogPage.jsx`
- `apps/web/src/components/discovery/DiscoveryFilters.jsx`
- `apps/web/src/components/discovery/DiscoveryItemCard.jsx`
- `apps/web/src/i18n/locales/en-discovery.js`
- `apps/web/src/i18n/locales/ar-discovery.js`
- `apps/web/src/styles.css`

Added:

- `apps/web/src/styles/living-library-catalog.css`
- `apps/web/tests/catalog.browser.test.mjs`
- This report, plus screenshots, metrics and test logs under
  `docs/frontend/screenshots/sprint10b4a/`.

## 3. UI and accessibility changes

The Catalog now follows the Home foundation with an editorial navy banner,
ivory canvas, subtle surfaces/shadows, generous spacing, outlined controls and
gold accents. Cards prioritize title, contributor, material type and category,
retain existing metadata and show a localized missing-contributor fallback.
Long titles remain fully readable and wrap without clipping. Optional metadata
is omitted when absent. Links have distinct accessible names including the title.

The responsive grid uses three, two or one columns as space permits. List view
uses the same card DOM and data. Tablet/mobile filters expand inline through a
labelled button with aria-expanded/aria-controls; hidden fields leave the tab
sequence. Resizing from desktop to collapsed mobile filters restores focus to
the disclosure when necessary. Keyboard order follows source order.

Search retains a visible focus ring. New controls use native buttons/selects,
pressed states and 44px primary control heights. The existing loading live region
stays mounted, retains its 300ms threshold and single completion behavior, and
does not duplicate errors. A bilingual retry action repeats the current query
and returns focus to the persistent search field. Reduced motion disables the
spinner and card/link transitions. Pagination arrows follow RTL/LTR reading
direction and are hidden from accessible button names. No ongoing decorative
animation was added.

Catalog badge contrast against its actual surface is 6.59:1 available / 5.98:1
unavailable in light mode and 7.99:1 / 8.15:1 in dark mode. These overrides are
scoped to Catalog; they do not restyle Book Details.

## 4. Preserved behavior and inventory transparency

Preserved query trimming, URL parameters, request cancellation/race protection,
search submission, type/category/Dewey/language/year/branch filters,
availableOnly, all five sorts, page/pageSize, pagination flags, facet errors,
request IDs, empty/no-results and API errors. Changing filters/sort still resets
the page; clearing filters still preserves the submitted query.

The 10B.2 note remains visible across states: system records may include demo
copies and do not confirm physical stock. Badges still say availability is
recorded; branch counts remain qualified. No verification claim or permanent
assumption that all inventory is synthetic was added. Neither schema nor public
responses establish per-copy provenance, so this limitation remains explicit.
Authentication, RBAC, Home, Details navigation, reservation policies, payloads,
idempotency and create/cancel behavior remain intact.

## 5. Verification results

Reviewed build/test entry points first. Root `npm run build` runs Vite and an API
build that only prints its plain-ESM status. Browser tests intercept API calls,
including fixture reservation/modal mutations, and block unexpected API/external
traffic; no API server or database is started. The root API test command loads
environment/database-capable tests and was not used for this frontend batch.
There is no configured frontend lint command. `git diff --check` passes.

| Check | Result |
| --- | --- |
| Production build | Passed; 121 modules; Catalog chunk 11.63 kB / 3.46 kB gzip. |
| Existing i18n tests | 6 passed; English/Arabic key parity and resource merge retained. |
| Existing accessibility browser tests | 8 passed; login, Add Book, live announcements, controls, errors and races. |
| Existing stock/reservation browser tests | 6 passed; qualification, Details, create/cancel and policy behavior. |
| Existing Home browser tests | 17 passed; responsive matrix, keyboard, themes, languages, auth/RBAC and reduced motion. |
| New Catalog browser tests | 18 passed; production preview in installed Edge. |
| Combined run | 55 passed, 0 failed. |
| Final Catalog recheck | All 18 passed again after retry-focus and RTL-arrow adjustments and the final build. |

Commands: `npm run build`; `node --test --test-concurrency=1` with the i18n,
accessibility, stock-transparency, Catalog and Home browser test files; final
`node --test apps/web/tests/catalog.browser.test.mjs`.

The unchanged Home suite was copied temporarily with only its screenshot output
directory redirected to this sprint's `home-regression/` folder. The temporary
script was verified against the original and removed after completion; original
test files and previous evidence were preserved.

New tests cover desktop 1440px, tablet 820px and mobile 390px in EN/AR × light/dark;
320px dark/reduced-motion states; grid/list; expanded filters; every supported
query field; five sorts; pagination with pageSize=2; language switching without
refetch; Details links; all three recorded stock states; long titles and absent
metadata; held loading; no-results; empty catalog; facet/search failures; retry
and recovery; focus restoration on resize. Filter-contract tests assert outgoing
queries; actual database filtering is not re-proven by these fixtures.

Initial concurrent development-server startup caused two navigation timeouts;
the serial rerun passed. An initial disclosure test incorrectly retained its old
button-name locator after expansion; the test was corrected. The new arrow
direction assertion caught a mobile-only CSS scope; the RTL rule was moved
outside the breakpoint and the full Catalog suite passed. Final runs pass.

## 6. Browser evidence

All paths below are relative to this repository. The directory is
`docs/frontend/screenshots/sprint10b4a/`.

| Device / language | Light | Dark |
| --- | --- | --- |
| Desktop English | [desktop-en-light.png](screenshots/sprint10b4a/desktop-en-light.png) | [desktop-en-dark.png](screenshots/sprint10b4a/desktop-en-dark.png) |
| Desktop Arabic | [desktop-ar-light.png](screenshots/sprint10b4a/desktop-ar-light.png) | [desktop-ar-dark.png](screenshots/sprint10b4a/desktop-ar-dark.png) |
| Mobile English | [mobile-en-light.png](screenshots/sprint10b4a/mobile-en-light.png) | [mobile-en-dark.png](screenshots/sprint10b4a/mobile-en-dark.png) |
| Mobile Arabic | [mobile-ar-light.png](screenshots/sprint10b4a/mobile-ar-light.png) | [mobile-ar-dark.png](screenshots/sprint10b4a/mobile-ar-dark.png) |

Also captured four tablet variants, four mobile viewport crops and English/
Arabic dark loading, empty, error and recovered states. There are 24 Catalog
PNGs. `home-regression/` contains 16 additional Home screenshots.
[Catalog metrics](screenshots/sprint10b4a/verification-metrics.json),
[combined results](screenshots/sprint10b4a/regression-results.txt) and
[final Catalog results](screenshots/sprint10b4a/catalog-results.txt) and
[production build log](screenshots/sprint10b4a/build-results.txt) are saved.
Desktop EN light, desktop AR dark, tablet EN light and mobile EN/AR views were
inspected directly against the reference.

## 7. Accessibility and performance findings

Whole-page axe WCAG A/AA scans, including text contrast with no exclusions,
return zero violations for all 12 Catalog language/theme/device combinations,
expanded mobile/tablet filters and list presentation. Loading, no-results,
search-error, recovery and facet-error/empty states also pass. Keyboard checks
cover search, disclosure, selects, clear, cards, layout controls and retry.
No horizontal page/card overflow or browser runtime exception was found.

Final local fixture measurements: LCP 368–1664ms; maximum CLS
0.0099253, below 0.1. These are local, unthrottled browser observations, not field
performance guarantees. Covers add no image requests, remote service or raster
payload. Existing route splitting remains. Global CSS is 88.22 kB / 15.42 kB gzip.

## 8. Fidelity gaps and remaining limitations

- The reference's photographic library banner awaits an authorized image.
  Decorative CSS is used without implying genuine photography.
- Authentic-cover rendering/testing is **not available** under the current
  schema/API and asset provenance. Even an ISBN does not authorize an image.
  The safe placeholder path is implemented and tested; future approved cover
  support needs a separately established source, edition match and usage rights.
- Card density is adapted for readable live metadata and long titles, rather
  than the mockup's five compact columns. Real records/counts are supplied by
  the existing API in normal use; screenshot records/counts are test fixtures.
- Unsupported reference controls (journals, author/subject browsing, bookmarks,
  advanced search, publisher/author filters, year ranges, AI/social links) and
  its marketing footer are not invented. Existing sort options are retained.
- Per-copy physical verification remains unresolved upstream. No live database
  claims are made by this batch.
- Existing Book Details contrast findings remain visible in the older suite's
  log and are outside Catalog's zero-violation claim. Address them in the
  separately approved Details batch / broader accessibility closeout.
- Chromium/Edge automation and manual screenshot/keyboard review were used;
  Firefox, WebKit, real touch devices and a screen-reader listening session were
  not performed. Server behavior was inspected, not live-database tested.

## 9. Preservation and Git diff summary

Before editing, recorded actual Git status and SHA-256 hashes for all 119
pre-existing modified/untracked files, and saved pre-edit copies of all six
source files to be extended. Final comparison: 115 of those 119 files remain
byte-identical; only CatalogPage, the two discovery locales and styles.css were
intentionally extended. None are missing. The two previously clean card/filter
components are additional scoped edits. RAG, design handoff, prior reports,
Home/screenshots and the existing Home ZIP remain byte-identical.

Sprint-only frontend/test increment: **8 files, +654 / -125 lines** (six existing
files extended; new Catalog stylesheet and browser suite). This excludes this
report and evidence. The whole working tree also contains the earlier sprints'
changes; the tracked HEAD diff is 25 files, +722 / -426 lines, excluding untracked
files, and must not be attributed to 10B.4A alone. Work remains on
`dev`, uncommitted and unpushed. No reset, clean, stash or branch switch occurred.

## 10. Next-batch recommendation

After separate approval, Sprint 10B.4B can adapt Book Details to the same visual
foundation, fix its remaining badge/branch contrast findings, and preserve
reservation qualification and policies. Establish an authorized cover source
and inventory-provenance ownership before adding any authentic-cover or verified
stock capability. Stop here; 10B.4B has not been started.
