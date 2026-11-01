# Sprint 10D.2 — Student AI UI and Knowledge Spirit

Date: 2026-11-01 (Africa/Cairo), work started 2026-10-31. Baseline: `dev` at `8ceaae2`.
Scope: D4 only, against the existing [integration contract](../architecture/SAMS_AI_INTEGRATION_CONTRACT_v1.md), [decision register](../architecture/SAMS_AI_INTEGRATION_DECISION_REGISTER.md), [10D plan](SPRINT_10D_AI_INTEGRATION_PLAN.md) and [backend handoff](SPRINT_10D1_AI_BACKEND_GATEWAY.md).

## Result and boundaries

The Student shell previously had no conversation client. This change adds `/student/ai` inside the existing authenticated STUDENT route guard. A single Book assistant / مساعد الكتب destination appears in the existing navigation only in explicitly enabled builds. The mobile navigation uses short visible labels when enabled, while preserving the full accessible names; desktop labels and disabled navigation retain their original text. Existing account controls and circulation destinations remain in place.

`VITE_AI_ASSISTANT_ENABLED` is a public build-time boolean, default false; only the exact string `true` enables it. With the flag absent/false, direct navigation redirects to Student Home, the page is not mounted and no AI requests occur. The client independently rejects dispatch while disabled. Explicit-false production output also removes the AI page chunk; absent-flag output may contain an unreachable chunk, with no runtime AI requests. Existing `VITE_API_URL` continues to designate the SAMS Express API. No Python origin, key, map path, fingerprint or internal identifier is added to browser configuration.

Changing the frontend flag requires a Vite restart/rebuild. It does not enable the backend gateway; the existing server gate and private configuration remain independent.

All five client methods use fixed Express `/api/v1/ai` paths, existing bearer authentication and `{data:…}` / `{error:…}` envelopes. The page uses health, ask, poll and reset. The validated book-card method is covered by a client test but is not fetched speculatively: supplied source metadata and authoritative SAMS Details links suffice for this page. No filters, provider/model/latency controls, external assets, covers, reservation buttons or Staff AI interface were added.

## Controller and recovery

The controller represents checking readiness, idle, submitting, pending with null/populated preview, done/cached done, help, refusal, extractive fallback/notice, throttled, failed/unavailable, still-working, locally stopped, expired/unknown, uncertain dispatch and resetting. Preview is replaced by final content and cleared on errors, help/refusal and reset. Each bounded conversation keeps at most four displayed turns, matching the current context window; questions are never automatically replayed.

- One GET poll can be outstanding. Polls request `wait=10`, with at least 500ms between completed automatic polls. After 240 seconds automatic checking pauses; a manual GET can check again. There are no percentages, simulated streaming or retrieval/writing stages.
- Stop and navigation abort local GET waits/timers. They do not claim upstream cancellation. An already dispatched ask/reset finishes its bounded response read in tab memory after navigation, preserving delivered public handles rather than losing them by aborting. Logout destroys that memory and aborts local requests.
- Operation and poll-generation guards discard stale completions. Sessions and jobs retain only validated public handles. Mismatched replies fail closed. Unknown/expired jobs never resubmit the question; unknown work remains blocked locally.
- Ask/reset have no automatic retry. Uncertain POST outcomes disable sending/reset rather than guessing that upstream work ended. Known jobs can be recovered by manual polling; when a POST response never delivered a public job handle, this UI cannot reconcile its outcome. The server's existing ownership/admission protection remains authoritative.
- Reset is available only for a valid idle session with no active/uncertain job and no active throttle. Successful reset requires a fresh public handle, clears displayed content and restores composer focus.
- Browser deadlines are health 5s, ask 20s, poll 35s and book/reset 10s. These are response-read limits, not promises of computation cancellation.

The narrowest persistence mechanism is **volatile module memory in the current tab**, bound to both authenticated user ID and authentication token. Content and public handles survive route navigation only. They are never written to localStorage/sessionStorage, never logged, and are cleared on logout, identity/session change, successful reset or page reload. Reload loses recovery handles; it does not terminate server work. Existing authentication storage is unchanged.

429 responses honor readable integer/date `Retry-After` values and never schedule an ask retry. The current backend exposes only `X-Request-Id` through CORS, so a cross-origin browser may be unable to read `Retry-After`. In that case the client waits conservatively for the gateway's 60-second rolling window and displays a generic wait message, without inventing a countdown. Exposing the header for exact cross-origin countdowns is a separate backend follow-up; no gateway/CORS change was made here.

## Safe records and presentation

All answer, hint, notice and bibliographic text renders as React text. HTML and model-supplied operational links are not interpreted. Citation tags are plain text labels. Sources, optional preview records and `all_books.items` use the same renderer; long lists reveal 20 records at a time locally, without more requests. Only `identity.status === "mapped"` with a validated UUID receives `/student/items/:itemId`. Unmapped, ambiguous and unavailable records have explicit translated labels and no Details link. Snapshot copies/cards are not displayed as live availability. Details/availability/reservation flows retain authority.

The accepted [avatar plan](../design/handoff/sams-living-library-v2/AVATAR_IMPLEMENTATION_PLAN.md.md) supplies flattened Concept C artwork rather than a production animation rig. Knowledge Spirit therefore uses an original code-native inline SVG: navy academic cap/cloak, ivory hair/book, blue eyes and restrained gold trim. It does not invent an academy emblem or fetch assets. Its expression/motion follows controller state only: idle, working/pending, thinking/still-working, success, no-results/refusal or error. It is decorative to assistive technology; the single live status region supplies the actual state. Nonessential motion is disabled under reduced motion. The character is instantiated only on the AI page.

Existing tokens, Student shell and theme/language controls are retained. The desktop workspace is a conversation sheet plus a 260px companion column; narrow screens place a compact, noninteractive companion above normal-flow content. The composer is not fixed. Keyboard labels, Ctrl/Command+Enter, visible focus, entry/reset focus restoration and a single polite state announcement avoid repeated pending focus changes. Readiness or generation changes do not move focus.

## Exact file inventory

Paths below are relative to repository root. Only these 20 files belong to D4.

| File | Purpose |
| --- | --- |
| [`apps/web/.env.example`](../../apps/web/.env.example) | Non-secret disabled frontend flag. |
| [`apps/web/src/app/router/AppRouter.jsx`](../../apps/web/src/app/router/AppRouter.jsx) | Conditional lazy Student route and disabled redirect. |
| [`apps/web/src/auth/AuthProvider.jsx`](../../apps/web/src/auth/AuthProvider.jsx) | Clear volatile AI memory in the existing logout/session-clear path. |
| [`apps/web/src/layouts/StudentShell.jsx`](../../apps/web/src/layouts/StudentShell.jsx) | Conditional navigation destination and enabled-mobile short labels with full accessible names. |
| [`apps/web/src/styles/frontend-stabilization.css`](../../apps/web/src/styles/frontend-stabilization.css) | Five mobile destinations and compact, single-line labels only when enabled. |
| [`apps/web/src/features/ai/ai-config.js`](../../apps/web/src/features/ai/ai-config.js) | Feature switch and patience constant. |
| [`apps/web/src/features/ai/ai-client.js`](../../apps/web/src/features/ai/ai-client.js) | JSDoc types, runtime response validation/projection, fixed Express methods and deadlines. |
| [`apps/web/src/features/ai/ai-controller.js`](../../apps/web/src/features/ai/ai-controller.js) | Conversation state, polling, races and safe lifecycle. |
| [`apps/web/src/features/ai/ai-session.js`](../../apps/web/src/features/ai/ai-session.js) | Per-user/auth-session tab-memory ownership. |
| [`apps/web/src/components/ai/KnowledgeSpirit.jsx`](../../apps/web/src/components/ai/KnowledgeSpirit.jsx) | Network-free Concept C SVG presentation. |
| [`apps/web/src/components/ai/AiBookRecords.jsx`](../../apps/web/src/components/ai/AiBookRecords.jsx) | Safe metadata, citation labels, identity and mapped-only Details links. |
| [`apps/web/src/pages/student/StudentAiPage.jsx`](../../apps/web/src/pages/student/StudentAiPage.jsx) | Student conversation, composer, status and controls. |
| [`apps/web/src/styles/student-ai.css`](../../apps/web/src/styles/student-ai.css) | Scoped responsive/theme/RTL-compatible styling and reduced motion. |
| [`apps/web/src/i18n/locales/en-ai.js`](../../apps/web/src/i18n/locales/en-ai.js) | English copy. |
| [`apps/web/src/i18n/locales/ar-ai.js`](../../apps/web/src/i18n/locales/ar-ai.js) | Arabic copy. |
| [`apps/web/src/i18n/index.js`](../../apps/web/src/i18n/index.js) | Assemble matching locale namespaces. |
| [`apps/web/tests/ai-controller.test.mjs`](../../apps/web/tests/ai-controller.test.mjs) | Deterministic client/controller/fake-clock checks. |
| [`apps/web/tests/ai.browser.test.mjs`](../../apps/web/tests/ai.browser.test.mjs) | Mocked Express browser, production gate, accessibility and regression checks. |
| [`apps/web/tests/student-home.browser.test.mjs`](../../apps/web/tests/student-home.browser.test.mjs) | Optional evidence-directory override; no assertion changed. |
| [`docs/planning/SPRINT_10D2_STUDENT_AI.md`](SPRINT_10D2_STUDENT_AI.md) | This handoff and verification record. |

## Verification

Verification uses already-installed Node/Vite, Playwright with installed Edge, and axe-core. No dependency, lockfile or browser/model download occurred. Existing browser tools remain local undeclared test dependencies as documented in the [test README](../../apps/web/tests/README.md); clean-install CI reproducibility is not claimed.

Commands are run from repository root. Set `SAMS_TEST_EVIDENCE_DIR` to an absolute directory **outside this repository** before browser regressions, preserving all historical HOLD evidence. The AI suite also accepts `SAMS_AI_ENABLED_BUILD_DIR` and optional `SAMS_AI_ABSENT_BUILD_DIR` for separately built production profiles.

```powershell
$aiEvidenceRoot='D:/Digi/SAMS_Library_System_Root/sprint10d2-mobile-nav-review-20261101'
$env:SAMS_TEST_EVIDENCE_DIR=$aiEvidenceRoot
$env:SAMS_AI_ENABLED_BUILD_DIR=Join-Path $aiEvidenceRoot 'build-enabled'
$env:SAMS_AI_ABSENT_BUILD_DIR=Join-Path $aiEvidenceRoot 'build-absent'
node --test --test-reporter=tap apps/web/tests/ai-controller.test.mjs apps/web/tests/i18n.test.mjs

# Separate child-process configurations; never edit a real .env file:
$env:VITE_AI_ASSISTANT_ENABLED='false'; npm run build -w @sams/web
$env:VITE_AI_ASSISTANT_ENABLED='true'; npm run build -w @sams/web -- --outDir $env:SAMS_AI_ENABLED_BUILD_DIR
Remove-Item Env:VITE_AI_ASSISTANT_ENABLED -ErrorAction SilentlyContinue
npm run build -w @sams/web -- --outDir $env:SAMS_AI_ABSENT_BUILD_DIR
node --test --test-reporter=tap apps/web/tests/ai.browser.test.mjs
$env:VITE_AI_ASSISTANT_ENABLED='false'
node --test --test-concurrency=1 --test-reporter=tap apps/web/tests/student-home.browser.test.mjs apps/web/tests/catalog.browser.test.mjs apps/web/tests/item-details.browser.test.mjs apps/web/tests/stock-transparency.browser.test.mjs apps/web/tests/accessibility.browser.test.mjs
```

Original D4 verification (superseded by the mobile-navigation follow-up below):

| Check | Result |
| --- | --- |
| Client/controller and existing i18n | **50/50 passed** (44 client/controller, 6 existing i18n), including public-session follow-ups, bounded volatile history and full-list identity/stock projection. |
| AI browser suite | **46/46 passed**, including dev absent/false/true and production absent/false/true. |
| Existing browser regressions | **76/76 passed**: accessibility 8, Catalog 21, Details 24, stock transparency 6, Student Home 17. |
| Production web builds | **3 passed**: flag absent, explicitly false, explicitly true. The default `apps/web/dist` is the false build; other profiles are outside the repository. |
| Disabled network proof | Eight AR/EN browser cases across absent/false dev and production: hidden navigation, direct route redirect, zero AI requests. Ordinary Student/Staff routes in enabled builds also make zero AI calls. |
| Accessibility/responsiveness | 12 combinations: AR/EN × light/dark × 1440/768/320px; no horizontal document overflow, composer clear of bottom navigation, reduced-motion disabled animation, keyboard send/focus and **zero axe WCAG 2/2.1 AA findings in the AI region**. |
| Design review | Source lint: **0 failures / 0 warnings**. Rendered app probes at 1440/1024/768/320: **0 failures**. Reviewed desktop/tablet/mobile screenshots. |
| Static scope/links/secrets | All 20 listed paths exist; report links resolve; no credential-pattern or internal service-configuration findings in the added frontend. |

The original document-overflow checks, AI-region axe scans and general design probes did not measure bottom-navigation text intersections. Their passing results were insufficient to rule out the externally confirmed 320px label collision. The follow-up adds explicit text-range geometry and full accessible-name assertions. The existing ivory palette, Student-shell margins and desktop design are retained. Full-page screenshots place fixed navigation at a viewport boundary; companion viewport screenshots document the actual scrolled composer geometry.

The first new-browser runs caught a test waiting for a URL before the lazy destination committed, and a preview-title assertion that omitted the subsequently added citation label. Both were corrected in the **new** suite with explicit rendered-state waits / a title-content locator. Final 46/46 is from a stable rerun. No existing assertion was changed.

**172/172 tests passed in total**, plus the three successful builds. Browser tests use intercepted Express fixtures and block unexpected API/external traffic. No real API/RAG/provider/database evidence is claimed. The web package has no existing separate lint/type-check test script; Vite production compilation and the listed runtime/locale/browser checks were run. The optional design-source lint is separate from an application lint pipeline.

Evidence for this run is outside the repository at `D:/Digi/SAMS_Library_System_Root/sprint10d2-evidence-20261031`: `client-controller-i18n.tap`, `ai-browser-final.tap`, `student-regressions.tap`, 24 AI state/viewport screenshots, four idle layout screenshots, existing regression screenshots in separate subdirectories, `design-probe.json` and `scope-audit.json`. No historical screenshot/evidence output was overwritten.

## Final scope and Git inspection

Branch/HEAD remain `dev` / `8ceaae2`. There are **6 modified tracked files and 14 new D4 files**, exactly as listed above. The original untracked RAG/data/HOLD/evidence paths remain untracked and were treated read-only. The new scope audit records current SHA-256 values for the 20 deliverable files; it is a deliverable manifest, not a before/after hash claim for all historical untracked assets.

`git diff --stat` (tracked files only; the 14 new files are untracked) reports:

```text
 apps/web/src/app/router/AppRouter.jsx          |  6 +++++-
 apps/web/src/auth/AuthProvider.jsx             |  2 ++
 apps/web/src/i18n/index.js                     |  4 ++++
 apps/web/src/layouts/StudentShell.jsx          | 23 +++++++++++++++--------
 apps/web/src/styles/frontend-stabilization.css |  6 ++++++
 apps/web/tests/student-home.browser.test.mjs   |  4 +++-
 6 files changed, 35 insertions(+), 10 deletions(-)
```

No backend gateway, contract, RAG, Excel, database schema/migration/imported data, dependency, lockfile, cover or Staff source changes were made. No database writes, real-service startup, Python environment, provider calls, paid service or asset downloads occurred. `git diff --check` is clean; Git's existing LF→CRLF notices are informational. The index is unchanged and the staged diff is empty. Nothing was staged, committed, pushed or switched to another branch. All D4 behaviors are implemented within the mocked integration boundary; the limitations below remain explicit follow-up work.

## Mobile-navigation review follow-up — 2026-11-01

External review confirmed that five long mobile labels overlapped at 320px even though document width remained bounded. The new regression check reproduced two actual English text-range collisions before the fix: My Reservations / My Borrowings, and My Borrowings / Book assistant. That expected pre-fix failure is retained separately as `navigation-before.tap` with a screenshot/geometry record; it is not a failure of the final implementation.

Enabled mobile labels are now **Home / Catalog / Holds / Loans / Assistant** and **الرئيسية / الفهرس / حجوزات / إعارات / المساعد**. Full existing translated names remain on the links through `aria-label`; decorative visible spans are hidden from assistive technology. Desktop navigation still renders its original direct text with no new label wrapper/ARIA attributes. With AI absent/false the mobile branch also renders the original direct text and four destinations. Compact padding and no-wrap styling are scoped to enabled mobile navigation only. Existing 48px-high targets are preserved.

Only these six existing D4 files changed during this review fix:

1. `apps/web/src/layouts/StudentShell.jsx`
2. `apps/web/src/styles/frontend-stabilization.css`
3. `apps/web/src/i18n/locales/en-ai.js`
4. `apps/web/src/i18n/locales/ar-ai.js`
5. `apps/web/tests/ai.browser.test.mjs`
6. `docs/planning/SPRINT_10D2_STUDENT_AI.md`

Eight new browser cases cover dev/production enabled builds × AR/EN × light/dark at 320px. They measure each rendered text node with DOM Range rectangles, reject intersections across different links, require every text rectangle to stay inside its own target, require no document/navigation horizontal overflow and require every link target to be at least 44px high. They also verify short visible labels and unchanged full accessible names. Existing disabled cases now assert original mobile text/markup after resizing to 320px; enabled desktop cases assert original full text and markup.

Latest rerun results:

| Check | Result |
| --- | --- |
| Client/controller/i18n | **50/50 passed**. |
| Full AI browser suite | **54/54 passed**, including the eight new enabled mobile-navigation geometry/name cases and strengthened desktop/disabled checks. |
| Existing Student regressions | **76/76 passed**: accessibility 8, Catalog 21, Details 24, stock transparency 6, Student Home 17. Existing regression assertions remain unchanged. |
| Production web builds | **3/3 passed**, flag absent/false/true; false remains the default `apps/web/dist`. |
| 320px navigation measurements | All eight dev/production × AR/EN × light/dark cases: **0 text intersections, document width 320px, no navigation overflow, every target 48px high**. Text stays inside its own link target; full accessible names match the existing translations. |

**180/180 tests passed**, excluding the deliberately failing pre-fix demonstration and the separate four-case focused rerun. All requests used deterministic Express fixtures; no real API/RAG/provider/database service was started. The 320px full-page and composer viewport images were regenerated for both languages/themes, alongside eight dedicated navigation screenshots and eight raw geometry JSON records. English and Arabic screenshots were visually inspected after the fix.

New evidence directory: `D:/Digi/SAMS_Library_System_Root/sprint10d2-mobile-nav-review-20261101`.
Review archive: `D:/Digi/SAMS_Library_System_Root/sprint10d2-mobile-nav-review-20261101/SAMS_Sprint_10D2_Mobile_Navigation_Review_20261101.zip`.
The extracted review directory is `review-package` under that evidence directory.

The archive includes the actual complete rerun logs at `logs/client-controller-i18n.tap`, `logs/ai-browser-final.tap` and **`logs/student-regressions.tap`**, all three build logs, screenshots/metrics, the 20-file D4 source snapshot, reference documents, current tracked diff/Git status and `scope-audit.json`. The previous review bundle's omission of the Student log is corrected here. Every artifact path/hash in the new audit is checked against ZIP contents; the Student log is additionally byte-compared with the actual rerun file. `archive-verification.json` beside the ZIP records its SHA-256 and verification result. Production build directories and the full baseline hash inventory remain outside the ZIP and are not claimed as archive contents.

The start-of-review SHA-256 inventory covers 1,746 Git-visible tracked/untracked files. Final comparison permits only the six files listed above: the other 1,740 files remain byte-identical, with no added or missing repository files. This includes the existing AI logic/flag/memory and all Git-visible backend/RAG/data/HOLD/evidence files. Historical evidence was not overwritten. The index remains unchanged, with no staging, commit, push or branch switch.

## Remaining limits

This is mocked frontend integration, not an actual-service or production-readiness claim. No Express/RAG runtime, provider, database or real identity mapping was exercised in D4. Auth fixtures verify existing frontend guards; backend role/ownership enforcement remains the D1–D3 responsibility. Actual runtime readiness, offline assets/private configuration, crosswalk custody/current target evidence and production topology/log privacy remain the prior handoff's deferred work.

Automated browser coverage does not replace a human screen-reader or physical mobile-keyboard/device audit. Public handles intentionally do not survive reload, cross-tab use or logout; a lost POST response cannot be recovered automatically without additional server reconciliation support. The character is a code-native interpretation of approved artwork, not a final exported animation rig. No D4 contract behavior is intentionally weakened to hide these limits.
