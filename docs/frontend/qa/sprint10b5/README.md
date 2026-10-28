# Sprint 10B.5 QA harness

> Checkpoint evidence availability — 28 October 2026: screenshots, ZIP archives,
> logs, JSON diagnostics, supplementary audit scripts and proposal packages cited
> below are retained locally outside the C1/C2/C3 commits. They have not been
> uploaded or published by this checkpoint and are not available to a reviewer
> from a checkout alone. C2 includes the selected QA documents and six canonical
> Concept D reference PNGs. C1 application/tests/fixture-host files remain
> uncommitted because the current browser checks failed. Historical results below
> are superseded for checkpoint readiness by the dated addendum in
> `docs/frontend/SPRINT10B5_FINAL_QA.md` (repository-relative path).

This is test instrumentation, outside the shipped application. All books,
people, counts and locations are synthetic and labelled as audit fixtures.
The fixture dataset and read-only host originated in the pre-existing
`docs/design/audits/sprint10b5a/` package; that package remains unchanged.
None of its redesign proposals was selected.

## Reproduce safely

From the repository root, using the already installed Node, Edge, Playwright
and axe packages:

```powershell
npm run build
node --test --test-reporter=tap apps/web/tests/frontend-stabilization.browser.test.mjs
node docs/frontend/qa/sprint10b5/serve.mjs
# In another terminal, after the host prints its loopback address:
node docs/frontend/qa/sprint10b5/run-qa.mjs after
```

`serve.mjs` reads `apps/web/dist`. It rejects all non-GET requests and all real
`/api/` requests, has no Express/DB connection, and injects local fixture
responses before the application executes. The production browser suite starts
and closes its own ephemeral host. The separate screenshot host writes its
current address to `runtime.json`; this historical file is not a running-service
guarantee. Stop only the host you start. No original database is used.

`__lang=en|ar`, `__theme=light|dark`, and
`__state=normal|loading|empty|error` select fixture scenarios. The Return pending
test supplies a held, local fake POST response; it never reaches a server.
Reservation create/cancel contracts are tested by the existing mock-request
suites, not by relaxing this host's mutation rejection.

The skill probes in `run-qa.mjs` reference the installed Windows skill path.
Adjust that import if reproducing on another workstation. This transport is
explicitly **not** a successful standalone `inspect.mjs` run. Original probes
and judges are unmodified; raw style findings are retained.

## Evidence and review

- `AUDIT_FINDINGS.md`: prioritized confirmed issues, recorded before production
  changes, with one later error-state finding appended.
- `CRITIQUE.md`: app-screen review against Concept D and the actual renders.
- `../../screenshots/sprint10b5/`: before/after production captures,
  JSON measurements, keyboard states, regression captures and review sheets.
- `contact-sheets.py`: creates labelled review copies using local Pillow;
  original browser screenshots are never edited.
- `logs/`: build, tests and skill diagnostics from this batch.
- Consolidated outcome: `../../SPRINT10B5_FINAL_QA.md`.

Earlier Home/Catalog/Details suites normally write to previous sprint evidence
directories. This batch runs temporary copies whose **only** change is the
output path, then verifies and removes its own copies. Those three test suites
and previous evidence remain byte-identical. The separate accessibility suite
has the explicitly documented navigation/race harness corrections. The final
report records the exact run.

## Data and jobs assessed

1. Home directs an authenticated student to discovery and their circulation.
2. Catalog shows existing material types, contributors, classification and
   optional bibliographic fields; no new filter or endpoint is introduced.
3. Details separates a bibliographic item from listed branch/copy records.
4. Six labelled catalog fixtures include long titles, missing contributors,
   missing metadata and generic covers; they are not library holdings.
5. The main Details fixture has three listed copies, one available in records.
   The visible summary and branch fraction agree; neither verifies real stock.
6. Reservation, borrowing and analytics fixtures derive totals from their rows.
7. Loading, empty and failure modes are deterministic local responses.
8. Reservation eligibility, mutations, RBAC and language switching retain the
   existing contracts and are checked with the earlier fixture suites.
9. Authoritative stock provenance, authentic covers and campus photography are
   unresolved enrichment work; this batch does not supply or certify them.

## Checkpoint availability and current gate — 28 October 2026

The reproduction commands above describe the historical local harness. Only
this README, `AUDIT_FINDINGS.md` and `CRITIQUE.md` are selected for C2.
Supplementary `run-qa.mjs`, screenshot tools, runtime JSON and logs are local-only
HOLD files; those commands cannot be reproduced from the C2 checkout alone.
The fixture-host sources and frontend suites belong to C1, which is withheld
from commit because the current browser run failed. Installing dependencies or
repairing the browser tooling is outside this checkpoint request. Current
results and failure details are recorded in the closure report's checkpoint
addendum; the historical 93-pass statement is not the current result.
