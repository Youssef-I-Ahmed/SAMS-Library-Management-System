# SAMS — Project Recovery and Rebaseline
**Date:** 2026-10-24  
**State:** Proposed, based on project conversation, earlier repository snapshots, and AI-team specification; verify against the current local worktree before implementation.

## 1. Known baseline (historical, not a claim about current disk)
- Sprints 0–8 produced a backend MVP release candidate; Sprint 9 progressed beyond foundation through student discovery, circulation, librarian operations, management/analytics and UI polish/closeout (9A–9G). Tests, implementation and commits MUST be checked locally to establish exact completion and current head.
- Stack recorded in repository assessment: npm workspaces; React 18, Vite 6, React Router 7, JavaScript/JSX/CSS; Express 5 (ESM), Zod, Prisma 6, PostgreSQL 16; base API `/api/v1`.
- Actual backend roles: `STUDENT`, `LIBRARIAN`, `MANAGEMENT`. “Admin” in UI is not a fourth role.
- Known backend areas: auth/development login, master data, catalog, contributors, discovery, availability, physical copies, students/import, reservations, borrowing/returns, physical visits, analytics and health. Never assume one of these is missing merely because the UI demo failed.
- Principal entities: `LibraryItem` (`BOOK`, `THESIS`, `PROJECT`) and distinct `PhysicalCopy`, students, users, visits, reservations, borrowings, branches and policies.
- Important workflow invariant: online Student search -> reservation; physical checkout/return by Librarian. Online login is not physical visit attendance.
- Latest conversations indicated a real-data catalog on the order of 2,821 books and a supplied book AI/RAG package; **record counts, mapping, tests and deployments remain subject to local verification**. AI source counts and production catalog/copy counts may differ and must not be silently equated.
- Previous Git paths and SHAs are historical and **not current live evidence**. Protect the working tree. A documented Sprint 9 commit was `c7ddc26`; an earlier frontend closeout had staged files and a separate facets bug fix. Do not assume commits/pushes made after snapshots.

## 2. Source-of-truth precedence
1. Current checkout: `AGENTS.md`, current git status/log, actual source, Prisma schema, migration history and tests.
2. Current repo docs: frontend release note, Sprint 9 planning, frontend status, API contracts, AI integration notes, migration docs.
3. AI-team handoff package and spec: implementation and tests verified separately.
4. Meeting notes: confirmed requirements vs predictions or proposed UX.
5. Earlier conversation or screenshots: historical supporting context only.

## 3. Existing vs change vs uncertain (do not prematurely implement)
| Capability | Prior evidence | New delta | Required verification |
|---|---|---|---|
| Student discovery / item details | Sprint 9 screens and discovery API | premium look, covers, excellent responsive experience | real data, filters, item details, performance, missing/incorrect covers |
| Librarian add book | catalog mutation and prior operations UI exist | reliably usable end-to-end in demo | create/update flow, permissions, validation, copy handling |
| Visits | visit check-in/out API and staff UI exist | capture **physical** attendance via mobile scan / manual lookup | walk-in vs authenticated session, duplicate/day policy, visit purposes |
| Students/import | student import API exists | no open registration, institutional identity, SIS discovery | payload fields, import safety, lifecycle, activation/revocation rules |
| Catalog/copies | physical copies and shelf fields exist | verified-on-shelf audit process, cover enrichment | status semantics, stock, source provenance, audit and archival workflow |
| AI/search | AI team provided Python RAG/FastAPI; not proven integrated into web | React chat UI, animated assistant, direct source sync instead of stale Excel | deployment, API schemas, crosswalk, current availability and safe backend adapter |
| Projects/theses | data model supports academic work | separate projects AI module due later | sources, schema fields, appropriate UX, delivery date |
| Visual front end | Sprint 9 role pages and UI polish exist | showcase-grade branding, motion and visual storytelling | bundle size, accessibility, media licensing, page performance |

## 4. Confirmed requirements from meeting (functional / stakeholder)
- Demonstrable, polished, visually memorable SAMS experience; strong motion and media **without sacrificing usability**.
- Student discovery/physical catalog search and item-details experience.
- AI book assistant embedded in SAMS rather than using Streamlit as the customer-facing UI.
- Librarian must reliably add books and use actual circulation features.
- Staff record the student's **in-person** visit; photography/scanning of university card is a requested workflow.
- Existing student identities, no student self-registration as the default library path; institutional source unconfirmed.
- Plan future academic-project assistant/module.
- Reconcile system's listed copies and actual books/shelves progressively.

## 5. Explicitly unverified / assumptions
- SIS exists as a public student portal, but **availability of institutional API, SSO, administrative export, credentials and permission to integrate is unverified**. Never automate SIS password entry/scraping or assume a shared password algorithm. Do not store student SIS credentials.
- Excel as the student master source is a hypothesis, not a commitment.
- Whether ID cards carry machine-readable barcode or QR is unverified; OCR is a fallback, not a secure authentication method.
- AI package runs under a specific environment and uses a snapshot/Excel-based index unless local inspection proves changed; a production direct-DB indexing pipeline is **not** already proven.
- Cover API match rate, image rights/attribution and caching permissions need a controlled pilot.
- Live inventory completeness and copy mapping are unverified; don't mark unverified items “available on shelf”.
- Scope and timing of future project/thesis AI delivery remain external dependencies.

## 6. Recovery gates
- G0: Worktree safe: correct root, actual HEAD, `dev` tracking, clean/dirty inventory. **No reset, no checkout, no auto-fix, no pull/push**.
- G1: API and UI capability inventory with source paths and documented route tests; list gaps only after evidence.
- G2: Demo walkthrough with **existing real catalog**, Student discovery->reservation->Librarian checkout->return; capture failures, including policy seed/configuration.
- G3: AI handoff contract validated independently: job lifecycle, book-code mapping, missing results, timeouts and fallback.
- G4: Approve revised Sprint 10 scope and changes to repo docs before writing product code.

## 7. Invariants / risk register
- Preserve auth/RBAC and role segregation. SIS approval and privacy safeguards are blockers for any production integration of student identities.
- Keep `LibraryItem` and `PhysicalCopy` distinct. Copy verification should not imply global item availability.
- Require LibraryItem.id <-> legacy BOOK_CODE crosswalk or an approved stable identifier. Do not guess joins on title/ISBN.
- Operational stock/availability comes from SAMS PostgreSQL; RAG retrieval and answer text are not authoritative for copy state.
- No migration cleaning/deduplication outside approved migration scope. Data Analysis Raw Extract is separate from SAMS migration decisions.
- Preserve project files and unrelated local changes. Small, testable changes, at most 2–3 long-lived Git branches; normally continue on `dev`.

## 8. Outputs required from first local audit
`current_branch`, `HEAD SHA`, upstream tracking, divergence, modified/staged/untracked paths; current app modules/routes; implemented screen status; live data verification route, tests and results; AI-service current whereabouts; outstanding blockers; precise Sprint 10 deltas. The audit is evidence-gathering only.
