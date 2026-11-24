# Sprint 10B.1 — UX & Accessibility Foundation

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Completed locally on 24 October 2026, branch `dev`, base HEAD
`ef3dbdc779c2513c377ba449636c52643d7d2064`. No commit or push was created.

## Scope and preservation

This batch fixes the three requested frontend issues. Concept D — SAMS Living
Library remains the approved direction. The existing
[design handoff](../design/handoff/sams-living-library-v2/DESIGN_HANDOFF.md) was
inspected for context and left untouched. No interface redesign was performed.

Before edits, Git showed existing changes to `README.md` and
`apps/web/src/styles/student-discovery.css`, plus untracked design, planning,
data, migration, RAG, and audit files. SHA-256 hashes were recorded for all 62
pre-existing modified/untracked files. All 62 were verified unchanged at
closeout. No reset, clean, stash, branch switch, commit, or push was performed.

No database connection, migration, seed, import, RAG execution, paid dependency,
or backend mutation was used. No package manifest or lockfile was modified.

## Root causes and fixes

| Issue | Root cause | Implemented fix |
| --- | --- | --- |
| Raw `auth.continue` | `en.js` and `ar.js` already contain the correct translations. Resource assembly spreads later modules at the top level; `en-9g3.js`/`ar-9g3.js` replace the complete `auth` object with `{ accountMenu }`. The default English fallback loses the same keys, so lookup returns the raw key. | Explicitly merge the base and Sprint 9G.3 `auth` namespaces in both resource objects. Preserve `Continue` / `دخول`, all other base auth copy, and the later account-menu translations. |
| Add Book modal focus | The modal focuses its close button inside an effect depending on `onClose`. Callers supply inline callbacks, so each form update restarts the effect and steals focus. There is no Tab containment or opener restoration. The title ID is fixed and the close label is English only. | Keep the lifecycle effect stable, update the current dismissal callback separately, capture/restore the opener, contain Tab/Shift+Tab and outside focus, skip disabled/hidden/inert controls, and fall back to the dialog when no controls are available. Use a unique title ID, existing dialog/modal semantics, and a localized close label. |
| Catalog loading/completion | The loading strings are visual text only; there is no persistent live status region or busy state for the results. | Add one persistent polite, atomic status region outside the busy results container. Announce loading after 300 ms, then localized completion with count/page information or the empty-state message. Clear the previous status between requests so equal counts can be announced again. Keep typing/facet-only updates silent and let existing error alerts announce failures. |

The modal accepts optional `canClose={false}` to block its built-in Escape,
close-button, and backdrop dismissal. Existing callers retain their current
default dismissal policy and form/save behavior. Escape consumed by a child
widget is respected. Body overflow and document listeners are restored/removed
on unmount, including React Strict Mode cleanup. Backdrop mousedown prevents
its default focus action so it cannot override restored opener focus.

Catalog search success/error updates now also check the request's abort signal,
preventing a superseded response from changing current results or announcements.
The existing search/filter/sort/pagination request contract is unchanged.

## Files changed

Seven existing source files were modified:

- `apps/web/src/i18n/index.js`
- `apps/web/src/i18n/locales/en.js`
- `apps/web/src/i18n/locales/ar.js`
- `apps/web/src/i18n/locales/en-discovery.js`
- `apps/web/src/i18n/locales/ar-discovery.js`
- `apps/web/src/components/admin/AdminModal.jsx`
- `apps/web/src/pages/student/CatalogPage.jsx`

Six new test/documentation files were added:

- `apps/web/tests/i18n.test.mjs`
- `apps/web/tests/accessibility.browser.test.mjs`
- `apps/web/tests/fixtures/modal.html`
- `apps/web/tests/fixtures/ModalHarness.jsx`
- `apps/web/tests/README.md`
- `docs/frontend/SPRINT10B1_UX_ACCESSIBILITY.md`

## Verification and results

Scripts were reviewed before execution. The root build runs Vite's production
build and an API script that only prints that plain Node ESM needs no build.
The root API test suite was not used because it is outside this frontend batch
and may involve database-backed setup. Targeted tests do not use that setup.

| Check | Result |
| --- | --- |
| `node --test apps/web/tests/i18n.test.mjs` | **6 passed, 0 failed.** All 496 leaves per language survive locale assembly; matching key sets, auth additions, fallback behavior, and RTL/LTR were checked. |
| `node --test --test-reporter=tap apps/web/tests/accessibility.browser.test.mjs` | **8 passed, 0 failed.** Headless installed Microsoft Edge, actual application routes and a focused modal fixture. |
| `npm run build` | **Passed.** 120 frontend modules transformed; API no-build script completed. |
| `git diff --check` | **Passed.** Git emits the repository's LF/CRLF conversion warnings; no whitespace errors. |
| Existing-work SHA-256 comparison | **62 checked, 0 changed or missing.** |

Browser checks cover English and Arabic login strings; initial modal focus;
forward/reverse wrapping; containment of attempted background focus; uninterrupted
typing during parent renders; dynamic material-type fields; native required-field
validation; form-associated Save; the existing create-item then book-details
request sequence; Escape, close-button, and backdrop closure; focus/overflow
restoration; disabled/hidden controls; zero/single tab stops; dismissal restrictions;
child-consumed Escape; latest callbacks; and a removed opener.

Catalog checks cover loading/busy/completion transitions; a stable status node;
one completion per successful search, including equal result counts; quiet draft
typing; fast-request loading suppression; material-type/availability filters;
sort and page changes; clear-filter query preservation; empty results; search
errors and request IDs; recovery; facet-error alerts; rapid superseding requests;
and language switching without refetching.

All browser API requests were fulfilled from synthetic fixtures or blocked if
unexpected. Add Book POST/PUT payloads were captured locally without reaching
Express or a database. The suite starts and closes its own loopback Vite server
and browser contexts. Only existing ignored build/cache paths are generated.

## Remaining limitations and accessibility findings

Axe 4.13.0 scanned the dialog and catalog regions for WCAG 2 A/AA and 2.1 AA
rules. No violations other than existing **color-contrast** findings were
reported in those scoped scans:

| Region | English affected nodes | Arabic affected nodes |
| --- | --- | --- |
| Add Book dialog | 12 form labels | 1 ISBN label |
| Catalog | 13 filter/helper/metadata/status nodes | 2 footer/pagination nodes |

An observed example uses foreground `#75879a` on `#ffffff`, contrast **3.69:1**,
where axe expects **4.5:1** for the rendered text. The existing `--text-muted`
token and label/metadata styles were not changed by this batch. Counts describe
this fixture/browser/light-theme run and are not an exhaustive site audit.
The behavioral suite prints these findings and explicitly allows the existing
`color-contrast` rule; every other reported rule fails it. Passing tests do not
mean the interface is fully WCAG compliant.

Actual screen-reader speech (for example NVDA), other browser engines, mobile
assistive technology, dark-theme contrast, and real database persistence were
not verified. Native keyboard/focus and DOM announcement transitions were
verified in Edge. Optional Playwright/axe packages were already present locally
but are not declared by the application's manifests; a clean `npm ci` does not
by itself provision this browser test environment. See the
[test instructions](../../apps/web/tests/README.md).

## Git diff summary

Sprint-owned source changes: **7 modified files, 126 insertions, 16 deletions**.
Six new test/documentation files are untracked pending user review. Existing
README, CSS, and untracked user work remain separate and unchanged. No staging
or Git history changes were made.

## Recommendation for Sprint 10B.2

Use the existing Concept D handoff to define a small foundation-polish batch:
address muted-text contrast, typography, visible focus, and responsive behavior
in the existing screens. Validate English/Arabic and light/dark at desktop and
mobile sizes, and add a manual screen-reader pass to the regression checks.
Agree on repeatable browser-test provisioning before adding a CI gate. Preserve
the existing API contracts and the keyboard/live-status behavior established
here. Sprint 10B.2 has not been started.
