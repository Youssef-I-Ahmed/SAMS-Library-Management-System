# Sprint 10B.3 — Living Library Visual Foundation & Student Home

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
RAG execution, backend-contract change, dependency installation, or public route
was introduced.

## 1. Design references and assessment

Inspected the actual package at
`docs/design/handoff/sams-living-library-v2/`, corresponding to the supplied
SAMS Visual Design Handoff v2:

- [DESIGN_HANDOFF.md](../design/handoff/sams-living-library-v2/DESIGN_HANDOFF.md),
  including Concept D, the visual system, Landing requirements, asset provenance,
  exclusions, and implementation sequence.
- [Landing V3](../design/handoff/sams-living-library-v2/assets/01-landing-v3.png),
  the primary visual reference, viewed directly.
- Existing campus entrance, courtyard, and main-building PNGs; supplied navy
  shield; brand-asset resolver and surface/theme logo behavior.
- Shared CSS/JSON design tokens, themes, base/layout/student CSS, actual Home,
  shells, controls, router/guards, and the 10B.1/10B.2 closeout reports.

The initial Home was a gradient hero, large shield, search field, and three
collection buttons. Landing V3 calls for an editorial serif headline, cinematic
image treatment, ivory surfaces, restrained gold, collection hierarchy, a
library-experience row, and a navy footer. That comparison and the route/asset
differences were reported before implementation.

**Image provenance:** The user confirmed the campus PNGs are **generated or
unverified imagery**. No original authorized campus photograph was established.
The Home therefore visibly labels its visual **“Campus concept illustration”**
(Arabic equivalent provided). It is a decorative illustration with empty alt
text and a visible figcaption, not a claim of authentic campus photography.
The supplied original files remain untouched. An authorized photograph is still
needed to close that Landing V3 fidelity gap.

## 2. Routes and reused components

| Area | Finding / decision |
| --- | --- |
| `/` | Existing authentication/role redirect; no public marketing landing. |
| `/student` | Existing authenticated Student Home; selected for the V3 adaptation. |
| Catalog / details | Existing child routes retained. Their page code and stock/transparency behavior remain unchanged in this batch. |
| Librarian / Management | Router and role guards unchanged. Existing role navigation remains protected. |
| Reused primitives | `BrandLogo`, `ShellControls`, `LanguageSwitcher`, `ThemeToggle`, `UserMenu`, and the 10B.2 `InventoryNotice`. |
| Data | Home needs no additional content API. Search and collection links use existing catalog query contracts; reservation/borrowing actions use existing routes. |

No AI route, avatar, unsupported journal/service route, fabricated statistic,
unverified featured-book list, or mock book cover was added.

## 3. Implemented visual improvements

- Extended the existing design tokens with ivory, muted gold, display/UI font
  stacks, and larger spacing steps. Retained SAMS navy as the primary identity.
- Warm light surfaces and coordinated dark surfaces; stronger text, borders,
  and solid focus colors. English headings use system Georgia; Arabic uses a
  separate sans-serif display stack with appropriate line height and no forced
  Latin letter spacing. No external font requests or font dependency was added.
- Real React hero with the V3 headline, gold emphasis, a labelled illustration,
  responsive image sources/crop, search, catalog entry, and collection chips.
  A navy background keeps the hero readable and functional if the image fails.
- Editorial collection cards, functional Discover/Reserve/Keep Learning actions,
  existing stock-confirmation notice, and a restrained institutional navy footer.
- Polished student header, readable responsive navigation, mobile navigation,
  localized brand link, and a visible-on-focus skip link to main content.
- Account-menu keyboard support: initial item focus, Arrow keys, Home/End,
  Escape restoration, and normal Tab exit. Fixed the sign-out button's contrast
  in the student shell in both themes.
- Only a short opacity/transform entrance in `prefers-reduced-motion:
  no-preference`; reduced-motion mode has no hero animation or smooth scrolling.

## 4. Files changed

Existing source files modified:

- `packages/ui/src/design-tokens.css`
- `packages/ui/design-tokens.json`
- `apps/web/src/styles/themes.css`
- `apps/web/src/styles/base.css`
- `apps/web/src/styles.css`
- `apps/web/src/components/brand/brand-assets.js`
- `apps/web/src/components/layout/UserMenu.jsx`
- `apps/web/src/layouts/StudentShell.jsx`
- `apps/web/src/pages/student/StudentHomePage.jsx`
- `apps/web/src/i18n/locales/en.js` and `ar.js`
- `apps/web/src/i18n/locales/en-discovery.js` and `ar-discovery.js`

New files/artifacts:

- `apps/web/src/styles/living-library.css`: scoped Home/student-shell styling
  imported into the existing stylesheet chain.
- `apps/web/public/brand/sams-logo-{navy,white}.webp` and
  `sams-full-logo-{navy,white}.webp`: four optimized derivatives of supplied PNGs.
- `apps/web/public/images/campus/living-library-concept-{960,1600}.webp`:
  two optimized illustration derivatives, without altering the originals.
- `apps/web/tests/student-home.browser.test.mjs`: production-preview matrix,
  functional/accessibility checks, and a React 18 development-console check.
- `docs/frontend/screenshots/sprint10b3/`: 16 screenshots and a metrics JSON.
- `docs/frontend/SPRINT10B3_LIVING_LIBRARY_HOME.md`: this report.

## 5. Tests and build

All API traffic in browser tests was intercepted with synthetic fixtures or
blocked if unexpected. Screenshot identities are fixtures, not real student
records. Existing browser suites use loopback Vite servers; the new matrix uses
the production build through Vite preview. The last check also verifies native
`fetchpriority` on React 18 in development without console errors.

```powershell
node --test --test-reporter=tap --test-concurrency=1 apps/web/tests/i18n.test.mjs apps/web/tests/accessibility.browser.test.mjs apps/web/tests/stock-transparency.browser.test.mjs
npm run build
node --test --test-reporter=tap apps/web/tests/student-home.browser.test.mjs
git diff --check
```

| Check | Result |
| --- | --- |
| Existing localization | **6 passed**; 518 translation leaves per locale, matching key sets, preserved auth merges and fallback behavior. |
| Existing 10B.1 browser regression | **8 passed**; login, modal focus/form behavior, catalog loading/control/error/race behavior. |
| Existing 10B.2 browser regression | **6 passed**; stock transparency, reservation create/cancel/error handling, and detail/list states. |
| New Home suite | **17 passed**; 12 viewport/language/theme combinations plus keyboard/actions, reduced motion/image failure at 320px, session loading/error, role guards, and development console. |
| Accessibility | Every full Home matrix scan passed WCAG 2 A/AA and 2.1 AA rules **without exclusions**, including contrast. Open account menus passed in English/light and Arabic/dark. |
| Build | **Passed**, 121 modules transformed; API script only prints that plain Node ESM needs no build. |
| Equivalent checks | Design-token JSON parsed successfully; JSX/CSS compiled; whitespace check passed. No separate lint script is configured. |

**Total: 37 tests passed.** Checks used installed headless Microsoft Edge and
the existing local Playwright/axe tools; no packages or browsers were installed.
These optional browser tools still require provisioning beyond a clean `npm ci`.

## 6. Screenshots and visual comparison

Exact local screenshot directory:

```text
D:\Digi\SAMS_Library_System_Root\SAMS_Library_System\docs\frontend\screenshots\sprint10b3\
```

| View | Light | Dark |
| --- | --- | --- |
| Desktop English, 1440×1000 | [desktop-en-light.png](screenshots/sprint10b3/desktop-en-light.png) | [desktop-en-dark.png](screenshots/sprint10b3/desktop-en-dark.png) |
| Desktop Arabic, 1440×1000 | [desktop-ar-light.png](screenshots/sprint10b3/desktop-ar-light.png) | [desktop-ar-dark.png](screenshots/sprint10b3/desktop-ar-dark.png) |
| Tablet English, 820×1180 | [tablet-en-light.png](screenshots/sprint10b3/tablet-en-light.png) | [tablet-en-dark.png](screenshots/sprint10b3/tablet-en-dark.png) |
| Tablet Arabic, 820×1180 | [tablet-ar-light.png](screenshots/sprint10b3/tablet-ar-light.png) | [tablet-ar-dark.png](screenshots/sprint10b3/tablet-ar-dark.png) |
| Mobile English, 390×844 | [mobile-en-light.png](screenshots/sprint10b3/mobile-en-light.png) | [mobile-en-dark.png](screenshots/sprint10b3/mobile-en-dark.png) |
| Mobile Arabic, 390×844 | [mobile-ar-light.png](screenshots/sprint10b3/mobile-ar-light.png) | [mobile-ar-dark.png](screenshots/sprint10b3/mobile-ar-dark.png) |

Mobile viewport captures show the actual fixed navigation position. Complete
page captures also exist as `mobile-{en,ar}-{light,dark}-full.png`. Desktop and
tablet captures are full-page images. Images were visually inspected, including
desktop EN/light, desktop AR/dark, mobile EN/AR, and tablet EN/dark.

| Landing V3 feature | Final adaptation / remaining gap |
| --- | --- |
| White institutional navigation, editorial/gold hero and search | Implemented with the supplied shield and authenticated student controls. |
| Real academy photography | Not established; user-confirmed generated/unverified visual is explicitly labelled. Authorized source photo/crop remains a gap. |
| Featured books | Replaced with supported material-type discovery cards; no curated/featured API or verified cover source was invented. |
| Library-experience row | Adapted to actual discovery, reservations and borrowing routes. |
| AI teaser and marketing links | Deferred; no AI destination, new public route, social/contact facts, or unsupported services were fabricated. |
| Type and exact composition | The reference's hierarchy, ivory/navy/gold and restraint are implemented; system fonts, authenticated content, and responsive structure are adaptations rather than pixel-perfect reproduction. |

## 7. Accessibility and performance findings

- Shared muted text improved from the earlier 3.69:1 example to **5.47:1** on
  white and **5.19:1** on the subtle light surface. Dark muted text is **8.68:1**
  on the dark surface; strong interactive borders are **3.84:1** against the
  light header surface. Decorative gold is separated from readable gold text.
- Prior Add Book label findings were cleared by the shared token change. The
  English catalog regression retains a **4.4:1** availability-badge finding;
  Item Details retains existing contrast findings. Those pages were not fully
  redesigned or given blanket scan exceptions in the new Home suite.
- Native keyboard focus, menu behavior, skip navigation, accessible names,
  English/Arabic direction, reduced motion, image failure, empty catalog
  navigation, loading and session failure were exercised. Actual screen-reader
  speech and other browser engines were not tested.
- Main illustration: **3,368,944-byte original → 373,398-byte 1600px WebP** or
  **161,530-byte 960px WebP**. Supplied mark PNGs of roughly 0.8 MB each now have
  70,188/81,390-byte WebP derivatives; originals are preserved.
- Hero has intrinsic dimensions, responsive sources, high fetch priority, and
  a solid readable fallback. No remote fonts, continuous animation, new runtime
  library, content API call, or fabricated data-loading sequence was added.
- [Local metrics](screenshots/sprint10b3/verification-metrics.json): LCP
  **0.58–1.80 seconds**, CLS **0** in all 12 matrix views. These are local,
  unthrottled preview observations, not field Web Vitals or a network budget
  guarantee. Production Home chunk: **5.40 kB / 1.72 kB gzip**; shared CSS:
  **76.34 kB / 13.61 kB gzip**; main JS: **246.29 kB / 79.36 kB gzip**.

## 8. Preservation and Git diff summary

Captured SHA-256 hashes for all **83 pre-existing modified/untracked files**.
**79 remain byte-identical**; four locale files (`en.js`, `ar.js`,
`en-discovery.js`, `ar-discovery.js`) were deliberately extended, retaining prior
auth/accessibility/stock copy. Their start-of-batch copies were retained for
incremental comparisons. Existing tests, reports, README, user CSS changes,
Catalog/Details/Reservation implementations, RAG, data/import files, and the
Visual Design Handoff were preserved.

Batch source diff relative to its starting worktree: **14 source files,
+431 / -96 lines** (13 existing files modified and one new stylesheet). Also
added six asset derivatives, one test file, this report, 16 PNG screenshots, and
one metrics JSON: **39 files total**. Ordinary Git diff includes earlier work
and is not this batch's isolated diff. Branch `dev` and history remain unchanged;
no reset, clean, stash, staging, commit, or push was performed.

## 9. Items for Sprint 10B.5 / unresolved limits

- Complete a broader semantic-status/badge contrast audit, including catalog,
  details, staff states, both themes, and real content.
- Verify actual screen-reader speech, other engines, mobile assistive technology,
  zoom/long-content edge cases, and throttled/field performance.
- Replace concept imagery with an authorized original photograph when supplied;
  the existing login page also uses an older campus visual and needs its own
  provenance/content review outside this Home batch.
- Establish repeatable browser-tool provisioning before relying on this suite
  in clean CI environments.

## 10. Recommendation for Sprint 10B.4

Apply the approved Book Discovery and Book Details references to the existing
Catalog and Item Details components using this foundation. Preserve 10B.1 live
announcements/focus and 10B.2 record-based stock qualification and reservation
contracts. Improve filters/cards/metadata and matching/fallback cover treatment
without inventing stock provenance or book imagery. Sprint 10B.4 has not been
started; the Knowledge Spirit/RAG chat remains deferred to Sprint 10D.
