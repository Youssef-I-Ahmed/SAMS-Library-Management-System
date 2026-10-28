# Initial audit — 25 October 2026

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Concept D and the supplied handoff remain authoritative. The existing 10B5A
proposal package is reference evidence only; no proposal is selected or adopted.
This is stabilization of existing application screens, not a new direction draw.

Fresh production fixtures and native keyboard inputs confirm:

| Priority | Finding | Evidence / affected area | Planned minimal correction |
| --- | --- | --- | --- |
| P1 | Fixed navigation obscures focused controls, not merely full-page capture chrome | `before/*-keyboard.png`, `focus-probe-combined.json`: Home card action/ring crosses y=776; Catalog Details link and reservation button occupy y≈784–830 behind the bar. | Keep fixed navigation; add scoped scroll clearance and safe-area-aware end spacing. |
| P1 | Shared semantic status text fails AA | `targeted-before.json` and `before/results.json`: student reservation badges; staff success 3.72:1, danger 4.08:1 on light, dark danger also fails. | Reuse accessible semantic foreground/surface pairs, retain state words and business logic. |
| P1 | Staff avatar foreground is overridden | `before/results.json`: `.staff-topbar span` overrides the white avatar text. | Specific shared-navigation foreground correction. |
| P1 | Return dialog focus remains outside; Escape does not dismiss | Fresh `targeted-before.json`: both booleans false. | Reuse AdminModal's existing focus trap, restoration and dismissal gate; retain Return fields/actions/payload. |
| P1 | Analytics metric select is unnamed; overflow regions lack keyboard access | Fresh management desktop/mobile axe targets `.admin-section-heading > select`, `.trend-list`, `.admin-table-wrap`. | Name the existing select and make the existing regions keyboard accessible. |
| P1 | Shared error request identifier loses AA contrast through opacity | Expanded Analytics error-state test: axe `color-contrast` targets `.inline-alert > small` in English light. Details already had a local opacity correction. | Extend that existing full-opacity treatment to the shared error primitive. |
| P2 | Student secondary text has inconsistent 9–10px treatment | Existing Home image/eyebrow and Catalog metadata/caption rules versus Details' 11–12px labels; skill measurements retained in before results. | A limited 11px floor for secondary captions/metadata, without changing headings or content. |
| P2 | Analytics zero rows render a nonzero minimum bar; failure may retain a Loading placeholder | Confirmed source `Math.max(3,…)` and `loading || !overview` branches; verify zero/error fixtures. | Use actual zero width and a settled failure render, no data/API changes. |
| P3 | Mobile discovery is vertically deep; generic imagery limits visual fidelity | Existing approved composition and truthful placeholders; no new product or photographic assets. | Document for later design/enrichment decisions; no layout redesign. |
| P2 | Existing browser suite conflates startup and announcement timing | Cold Vite login exceeds the 8s action budget. The combined race/quiet test also attributes a legitimate slow-request loading announcement to its fast successor. | Set a 30s navigation budget, retain 8s actions; check quiet fast completion separately from stale-response rejection. Product timers and behavior remain unchanged. |

Broader staff smoke checks additionally confirm legacy unnamed selects on Visits,
Catalog administration, Students and Management Borrowings, plus unfocusable
mobile table overflow on Management Borrowings/Visits. These are outside the
Student/shared-primitive corrections; see `staff-smoke/results.json` and the
consolidated report for the deferred P1 backlog. No staff redesign was performed.

Core Home/Catalog/Details axe scans have no exclusions and show no contrast or
horizontal-overflow failures. Keyboard visibility was a separate interaction
failure that axe did not detect. The skill's standalone inspector failed to
launch both the default browser and explicit Edge; its unmodified probes/judges
are run through the working Playwright Edge transport and labelled accordingly.
Style-only skill findings are not treated as WCAG failures or authority to
replace Concept D. Windows Narrator exists, but no reliable speech capture/
listening path is available to this agent; no listening session is claimed.
