# SAMS Sprint 10 — Recovery & Rebaseline Pack

> Local checkpoint — 28 October 2026: the recovery-pack text below is historical
> planning context, not the current implementation status or an installation
> guide. Current verification is recorded in
> [Sprint 10B closure](docs/frontend/SPRINT10B5_FINAL_QA.md) and
> [Arabic search verification](docs/architecture/SAMS_ARABIC_SEARCH_NORMALIZATION_CHANGE_REPORT_2026-10-28.md).
> Referenced local screenshots, logs, evidence ZIPs and the root audit-prompt file
> remain outside these commits; they were not uploaded and cannot be obtained
> from this checkout alone. Concept D's six canonical reference PNGs are included.
> C1 frontend changes remain local and uncommitted because the current browser
> checks failed; C2 records documentation, not a passing Student release. Covers
> and AI integration remain future work, not part of this checkpoint.

Date: 2026-10-24 | Status: **PROPOSED / AWAITING LOCAL REPOSITORY AUDIT**

## Purpose
A documentation-only handoff to resume SAMS Library System after Sprint 9 while accommodating the latest library meeting. **No production source code, database, git branch or remote repository has been changed** by this pack.

## Files
1. `docs/planning/SAMS_REBASELINE_2026-10-24.md` — assessed project baseline, assumptions and recovery gates.
2. `docs/requirements/MEETING_DELTA_2026-10-24.md` — decisions vs assumptions and new requirements.
3. `docs/planning/SPRINT_10_REVISED.md` — Sprint 10 work breakdown, dependencies and acceptance criteria.
4. `CODEX_READ_ONLY_AUDIT_PROMPT.md` — ready-to-paste first Codex prompt, **no edits**.

## How to use
- Open **the actual working checkout** of SAMS in Codex first. The source in this pack is project history and earlier snapshots, not a live local Git inspection.
- Paste `CODEX_READ_ONLY_AUDIT_PROMPT.md` into Codex and obtain its baseline report.
- Compare Codex results with these planning documents; resolve differences in favor of the observed checked-out files and verified tests.
- Only after reviewing the report, copy approved portions of the two `docs/` planning files to the working repository; avoid overwriting existing documents.
- Continue using `dev`; do not reset, clean, merge, pull, push or create branches as part of recovery.

## Three crucial distinctions
- `LibraryItem` bibliographic record != `PhysicalCopy` inventory record.
- Student website authentication != physical visit/check-in.
- AI recommendations/snapshot results != live stock/availability; the authoritative operational data remain in SAMS PostgreSQL.
