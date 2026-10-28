# Sprint 10B.1 regression checks

Run from the repository root:

```powershell
node --test apps/web/tests/i18n.test.mjs
node --test --test-reporter=tap apps/web/tests/accessibility.browser.test.mjs
npm run build
```

The localization tests use Node's built-in test runner. The browser tests use
the existing local `@playwright/test` (1.63.0) and `axe-core` (4.13.0) packages,
plus the application's Vite installation. These optional browser tools are not
declared in the application's package manifests; a clean `npm ci` alone does
not provision them. No packages or lockfiles were changed for this batch.
The tests prefer an available Playwright Chromium and otherwise use installed
Microsoft Edge. They do not download browsers.

The browser suite starts a loopback Vite server on a dynamically assigned port
and closes its browser contexts and server when finished. It intercepts API
requests with synthetic fixtures, including the Add Book POST/PUT sequence.
It does not start Express, connect to a database, log in to real accounts, or
create catalog records. Unexpected external/API requests are blocked and fail
the tests. Build output and Vite's dependency cache use existing ignored paths.

The modal fixture exercises Strict Mode, callback updates, disabled and hidden
controls, zero/single tab stops, dismissal restrictions, Escape consumption by
an inner widget, a removed opener, and listener cleanup. The actual application
routes cover login, the Add Book form, and catalog state changes in both locales.

Axe scans report all WCAG 2 A/AA and 2.1 AA findings in the selected dialog and
catalog regions. Existing `color-contrast` findings are printed but are not
behavioral test failures in this batch; every other reported rule fails the
suite. This is not a claim of a clean full accessibility audit. See
[the sprint report](../../../docs/frontend/SPRINT10B1_UX_ACCESSIBILITY.md)
for findings and verification limits.

## Checkpoint reproducibility — 28 October 2026

The checkpoint includes six browser suites (accessibility, stock transparency,
Student Home, Catalog, Details and frontend stabilization), six localization
tests, the modal fixtures, and `docs/frontend/qa/sprint10b5/{serve.mjs,fixtures.js}`.
The production-fixture suites require a current `npm run build` first.

A clean install from the committed manifests/lockfile does **not** provision
`@playwright/test`, `axe-core`, or a browser. These remain undeclared local test
tools; no dependencies were installed or added for this checkpoint. Most suites
choose existing Playwright Chromium or fall back to installed Microsoft Edge;
`frontend-stabilization.browser.test.mjs` explicitly requires the `msedge`
channel. Provisioning test dependencies, CI and browser portability is a separate
follow-up. The checked-in application build does not depend on these test tools.

Several suites write screenshots and metrics into historical evidence paths.
To preserve local HOLD evidence during this checkpoint, the unchanged source
files and current production build were copied and hash-verified in an isolated
verification directory beside the repository. That directory reused the already
installed `node_modules` through a Windows junction. Tests ran there without
editing their code or output paths; generated evidence stayed outside the working
checkout. No copy of the original HOLD evidence was overwritten. This method
checks the current source/build with local tools; it is not proof of browser-test
reproducibility after a clean install.

These tests intercept APIs or use the isolated fixture host; they do not verify
live database behavior. Real database search checks are documented separately in
the Arabic search report.
