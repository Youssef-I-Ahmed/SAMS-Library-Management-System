# App-screen visual review — Concept D retained

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

Direction: **SAMS Living Library / Modern Editorial × Cinematic Minimalism**,
from the repository handoff and its Landing V3, Discovery and Details images.
No new style draw, seed, redesign proposal, image generation or replacement
design system. The existing shield, navy/ivory/gold roles, English editorial
headings and Arabic type hierarchy remain the product's face. Generic book
objects are truthful missing-cover placeholders. Home's imagery remains
explicitly labelled as a campus concept illustration.

## Round 1: before

Reviewed the reference images, original source, before viewport captures and
native-keyboard boundary screenshots. The strongest three stabilization
priorities were: unobscured mobile focus; shared status/navigation contrast;
and predictable dialog/overflow keyboard interaction. Axe alone missed the
fixed-navigation obstruction. The before production matrix found 24/24 mobile
focus probes overlapping fixed chrome; the full-page screenshot appearance was
therefore partly a real interaction issue. The screenshots also composite
fixed bars into long pages, which is a separate capture behavior.

## Round 2: corrected renders

Reviewed the six desktop/tablet and mobile/narrow language/theme contact sheets,
three full-layout sheets and the keyboard before/after sheet. Also inspected
individual mobile keyboard captures at native resolution. The 1440, 768, 390
and 320px compositions are retained. Long-title and state captures come from
the unchanged earlier suites, redirected into this batch's evidence directory.

Answers to the skill's seven app-screen critique questions:

1. **Question and hierarchy.** Home answers where to start exploring; Catalog
   answers how to find a resource; Details answers what this record describes
   and how to request a listed copy. Titles/search lead their first screens;
   stock quantities remain secondary and explicitly qualified. No vanity KPI.
2. **Edges and fullness.** Shared gutters and surfaces are coherent. Catalog
   aligns card actions across rows, leaving deliberate space in incomplete
   records; Home collection actions also align at the foot. The raw
   `panel-void` warnings remain documented. Removing these spaces would alter
   the approved card composition. Mobile Catalog is vertically long; this is
   deferred rather than addressed through another page redesign.
3. **Colour and face.** Navy, warm white and restrained gold match the handoff.
   Dark surfaces preserve the same hierarchy. Accessible semantic pairs now
   serve shared status primitives. The skill's achromatic/flat-style preference
   conflicts with the user's authoritative palette, editorial headings,
   generic-cover treatment and subtle surfaces; those are retained explicitly.
4. **Numbers and agreement.** Counts remain API-derived in the application;
   labelled fixtures recompute totals from their rows. Details shows one listed
   available copy of three, consistently in summary and branch fraction.
   Catalog's six fixtures match six results. Tabular numerals stabilize catalog
   figures and the Details inventory panel. No new estimates or growth deltas.
5. **Zero and missing data.** Existing missing-author/cover/metadata treatments
   remain honest. Analytics' former three-percent minimum bar was misleading:
   a zero is now zero width. Its failed overview read now settles with its
   existing alert instead of retaining a Loading placeholder.
6. **Legends and collisions.** Student pages introduce no new chart or legend.
   Existing Analytics series and endpoints remain intact. No measured root
   horizontal overflow. Keyboard captures demonstrate visible Catalog and
   reservation actions above the fixed bar after native Tab scrolling; tablet
   filters and Details anchors clear the wrapped sticky header.
7. **Phone navigation.** The desktop navigation folds into the existing four
   labelled bottom links. It stays fixed. Scroll margins and safe-area-aware
   shell padding preserve access to controls and the footer. Both RTL and LTR
   retain useful content at 320px; long titles naturally wrap. Simulated 34px
   safe-area clearance is tested; this is not physical-device certification.

## Raw skill findings and allowances

No ignore comments, skill modifications or broad `--allow` suppression were
added. The standalone inspector failed to launch its browser (default and
explicit Edge); final retry also failed. This is an **inspector limitation**,
not a zero-FAIL result. Working Playwright Edge ran the installed, unmodified
App Screens probes/judges, with their standard APP_SKIP semantics. Raw results
and source lint diagnostics are included alongside axe results.

The six source gradient findings and sixteen shadow warnings were already
present. Hero scrims, neutral book presentation, muted surfaces and restrained
shadows express the supplied handoff and are preserved under the user's
explicit no-redesign requirement. `palette-cream`, `app-title-size`,
`small-title`, `micro-label`, `icon-chips` and `heavy-shadow` likewise encode
style preferences that differ from Concept D. Remaining `tiny-text` findings
measure the share of text below 13px after the sub-11px label corrections; they
are density preferences, not measured contrast failures. `edge-text` flags 14px Catalog
toolbar gutters, which do not clip or obstruct controls. `panel-void` is
explained above. Small secondary text and figure stability were corrected
where measurable within the Student scope. None of these allowances is an
accessibility exemption; full-page WCAG axe scans use no exclusions.

No award score, universal skill pass, screen-reader certification or field
performance certification is claimed. Further compositional redesign is
outside Sprint 10B.5. Authorized imagery, genuine cover enrichment and physical
inventory verification remain separate work.
