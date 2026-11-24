# Sprint 10 — SAMS Showcase & AI Book Search Integration
**Status:** PROPOSED — final scope after read-only audit. **Prerequisite:** Sprint 9 current completion verified locally.

## Sprint objective
Deliver a presentation-ready, accessible, responsive SAMS student experience **on top of existing Sprint 9 pages**, and connect the supplied book RAG/FastAPI behind the established Node/Express backend with correct identity, book mapping and availability semantics. Do not reimplement Student Discovery, existing admin/visits/catalog endpoints or circulation.

## Sprint boundaries
### In scope
- Confirm current worktree and E2E baseline, especially catalog/detail/circulation and librarian Add Book (functional recovery).
- Design-system/branding/motion audit. Polish existing Home, Catalog, ItemDetails and AI chat entry point. Arabic RTL, English, responsive, light/dark and keyboard/reduced-motion preserved.
- Pilot book covers using ISBN + edition/title validation on a **sample**; missing cover fallback; no scraping or mass import before terms review.
- AI book search contract and integration: use supplied `POST /api/ask`, `GET /api/jobs/{job_id}`, `GET /api/books/{book_code}`, `POST /api/session/reset`, `GET /api/health` when verified locally. Handle immediate `done` and delayed `pending` with retries/polling, timeout and cancellation. Keep all API keys server-side.
- Crosswalk between RAG book IDs (`BOOK_CODE`) and SAMS LibraryItem identifiers; availability obtained from the SAMS backend; explicit unmapped/book-unavailable handling.
- End-to-end tests and short recorded/demo walkthrough; actionable handoff docs.

### Out of scope this sprint
- Complete SIS / SSO integration and bulk institution data migration.
- Full mobile OCR card scanner; physical-inventory audit at scale.
- Rebuilding circulation or discovery modules, all-new account/password framework, media-heavy site-wide reimplementation.
- Finished 3D voice avatar, complex speech pipeline, projects/theses AI module without handoff.
- Shipping AI-to-Postgres index synchronization without clear ingestion contract and source/DB permission.

## Work packages (sequence and acceptance)

### S10-0 — Read-only recovery and release baseline (BLOCKING)
- Check AGENTS, git branch/log/status/upstream and divergence, build/test manifests, frontend route list, API routes, schema and seeds; classify gaps Evidence / Not confirmed.
- Verify a real-data happy path: student login -> catalog/discovery -> item details -> reservation -> librarian checkout -> return; and Add Book existing screen -> service -> DB, if test environment has safe seeded policies.
- **Done when:** no unreviewed changes; exact SHA/status captured; existing functionality matrix and bug list delivered; go/no-go on Sprint 10 implementation.

### S10-1 — Premium visual direction without rewrite
- Define 2–3 cohesive page-specific motion patterns (hero reveal, catalog transition, card hover microinteraction) and real branded imagery/assets, loading skeletons, empty/error states.
- Keep animations opt-out with `prefers-reduced-motion`, use sensible LCP and JS budgets, preserve semantics and contrast.
- **Done when:** student Home/Catalog/Details readable on mobile/desktop, Arabic RTL/English, keyboard accessible, motion does not block navigation, no functionality regressions.

### S10-2 — Book cover enrichment pilot
- Inspect live catalog ISBN/edition fields and current cover storage/support; test matching against a representative small sample, log exact/ambiguous/not found outcomes.
- Confirm license/terms and image-link attribution; offer SAMS cover placeholder and librarian manual override only if data model allows or is approved.
- **Done when:** no mismatched cover shown as authoritative; cover source and confidence are recorded; no wholesale unsolicited modification of production catalog.

### S10-3 — AI adapter contract and catalog identity
- Read delivered AI team code/spec. Confirm schemas, health, job pending/done, session state isolation, errors, safe timeouts and deployment constraints.
- Add thin server-side adapter in existing Express architecture (implementation only after approval), no browser-to-internal-FastAPI direct call, enforce auth, request logging privacy, throttling, cancellation and safe fallbacks.
- Design approved code crosswalk `BOOK_CODE -> LibraryItem.id` or stable source mapping. Do not infer by title or nonunique ISBN. Separate retrieval results from live availability.
- **Done when:** contract/integration tests cover mapped, unmapped, stale, empty, pending, error and timeout scenarios; mock and actual service test states clearly distinguished.

### S10-4 — Integrated AI conversation UX
- Embed existing AI response in the React UI: prompt field, answer, cited source cards, book details, loading/progress and full matching books; Arabic and English text direction.
- Show assistant avatar concept as lightweight progressive-enhancement UI, not a feature that blocks functioning search. No Streamlit iframe as production UX.
- **Done when:** user submits question through SAMS backend, sees answer and mapped book cards or clear errors, can navigate to verified book details; accessibility and mobile flows pass.

### S10-5 — QA, demo and closeout
- Run repository-defined lint/build/smoke/integration tests safely; test both Student and Librarian workflows; verify unauthorized access remains forbidden.
- Measure core web vitals under typical network, no blank page on AI outage, real source demo vs mock clearly labeled.
- **Done when:** tests and demo documented, known blockers separated from shipped features, changes reviewable, and docs updated without erasing Sprint 9 history.

## Proposed next Sprint backlog (revised, not promised dates)
- **Sprint 11**: Librarian walk-in/check-in usability, student import lifecycle, SIS discovery and optional mobile scan proof-of-concept (subject to card/IT access).
- **Sprint 12**: physical inventory / shelf verification, copy barcodes and discrepancy dashboard; catalog-to-AI index data governance/sync pilot.
- **Sprint 13**: projects/theses discovery and AI module after actual handoff; student accessibility and specialist views.
- **Sprint 14**: deployment hardening, full migration approvals, UAT, operations, production monitoring and showcase polish.

## External blockers, NOT reasons to stop all work
- SIS access/export/SSO, privacy approval.
- Verified barcode/QR availability and printed-card sample (redacted).
- Librarian-confirmed circulation and on-shelf validation process.
- AI package and runtime availability, matching ID crosswalk and index sync ownership.
- Production domain, hosting, operational policies, migration/UAT approvals.

## Protect completed architecture
- Only `STUDENT`, `LIBRARIAN`, `MANAGEMENT` backend roles.
- No student self-registration without institutional decision; don't use predictable Student ID passwords.
- Distinguish `LibraryItem` from `PhysicalCopy` and visits from reservations/loans.
- Maintain existing `/api/v1` contracts, migrations and tests; use `dev`, no per-sprint feature branches.
