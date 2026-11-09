# Sprint 10D Release Readiness

Audit completed on 9 November 2026. The demo is scheduled for Tuesday, 10 November 2026.

## 1. Executive Summary

Sprint 10D passed the final audit for the local SAMS demo. The approved academic collection is in PostgreSQL, catalog discovery and circulation work on the imported records, and the shared Library Assistant returned written, source-backed replies in all three scopes for all three authenticated roles. The integrated demo restarted through its documented local launcher and passed fresh-browser checks.

The audited build is ready for Tuesday's local demo. A timed presenter rehearsal remains open. The release candidate is awaiting review on `dev`, with staging, commit, and push still pending.

Production readiness remains open. The demo relies on loopback services, development sign-in, and host-local credentials and models. A university deployment still requires a production environment, institutional sign-in, deployment and recovery evidence, and university acceptance.

## 2. Approved Product Decisions

- The university approved **3,983 official academic works**. The collection display name is **Graduation Projects & Theses** in English and **مشروعات تخرج ورسائل علمية** in Arabic. Imported projects and theses share the `ACADEMIC_WORK` type.
- Authenticated users may see approved catalog metadata, including student or researcher names, supervisors, titles, years, subjects, and historical catalog codes. Anonymous users cannot access this collection. Technical UUIDs support internal identity and routing.
- Hardcopies follow the library's normal reservation and borrowing workflow. The collection includes no PDFs, document bodies, or full-text research content.
- PostgreSQL is the source of truth after import. Librarians manage catalog corrections and approve controlled bulk imports. Excel remains a bulk intake format.
- The Library Assistant is available to `STUDENT`, `LIBRARIAN`, and `MANAGEMENT`. All three roles see the same approved assistant metadata. The assistant reads and presents catalog information. Catalog edits, reservations, and loans remain in their separate authenticated workflows.

The [controlled import contract](SPRINT_10D6_IMPORT_CONTRACT.json) records the source authority and canonical decisions. The [source reconciliation report](SPRINT_10D4A_SOURCE_RECONCILIATION.md) describes the earlier source review. The final audit supplies the import and runtime results below.

## 3. Completed and Verified Work

| Area | Implementation status | Evidence or test | Remaining limitation |
| --- | --- | --- | --- |
| Source reconciliation | Verified for the approved sources | The plan reconciled 3,983 catalog identities and 3,988 copy rows. The approved rules resolved four year conflicts and retained two subject exceptions. | Ten works have no publication year. Librarians own subsequent corrections. |
| Controlled import | Applied and verified locally | Plan reported zero database connections and writes. All four transformation tests passed. The local writer uses one serializable, insert-only transaction. An apply rerun inserted zero rows and Verify matched all approved totals. | The apply command is restricted to the local demo database. The workbooks remain private. |
| PostgreSQL schema | Verified on three database states | The existing database was current. Four Prisma migrations applied to an empty database, with the custom circulation indexes and academic guard also verified. Three pending migrations applied to a restored pre-import database. | Production migration and import procedures still require approval and a staging run. |
| Academic works and copies | Verified against PostgreSQL | 3,983 works and 3,988 copies remained after the smoke test. Of the copies, 3,987 were available and one was archived. | Counts describe the audited local database. |
| Subjects and contributor relationships | Verified after import | PostgreSQL confirmed 11 subjects, 3,951 subject links, and 15,225 academic contributor links. The live catalog returned the approved participant and subject metadata. | Staff maintenance of contributor relationships still needs an end-to-end acceptance check. |
| Catalog search and filters | Verified on the live API | Search matched title, researcher, supervisor, subject, and legacy code. Type, year, language, `MAIN` branch, and availability filters and record details passed. | Search performance under production traffic remains unmeasured. |
| Reservation, loan, and return | Verified on a live academic hardcopy | The student reserved an available copy. Student checkout was rejected. Librarian checkout and return left the hold `FULFILLED`, the loan `RETURNED`, and the copy `AVAILABLE`. | Broader staff acceptance, including copy maintenance and exception handling, remains open. |
| Research RAG | Verified against PostgreSQL | The dedicated reader indexed 3,983 rows from `sams_research.catalog`. A live exact legacy-code query passed. The scope displayed a written match summary and five source cards for the audited question. | Retrieval and written summaries use approved metadata only. |
| Book RAG | Verified with the local provider | The local extractive provider returned a useful written answer with five cited cards for the audited demo question. Offline inference, restart, and source checks passed. | Local CPU model warm-up is required. The reader still has read grants on six shared catalog tables. |
| Dynamic database refresh | Verified without service restart | A synthetic Research record became searchable after creation in 5.5 seconds and after editing in 5.5 seconds. It disappeared 3.9 seconds after removal. The Book harness separately verified refresh against an isolated database. | These are local observations. Bulk changes and higher traffic still need performance testing. |
| Three chatbot scopes | Verified in fresh browser sessions | Books showed a written reply and five cited book cards. Graduation Projects & Theses showed a written reply and five academic source cards. All showed both replies and both sets of cards. Legacy codes were visible where applicable. | The selected local providers produce extractive or metadata-based text. |
| Multi-role assistant access | Verified in fresh browser sessions | All nine combinations of three roles and three scopes passed. All three anonymous page requests redirected to login and seven anonymous AI API requests returned `401`. API tests also covered session ownership. | The local launcher uses development sign-in. Institutional sign-in remains open. |
| Knowledge Spirit states | Verified in browser regression tests | Browser checks distinguished `greeting`, `idle`, `searching`, `thinking`, `success`, `no-results`, and `error`. The symbols and status text remained distinguishable with reduced motion. | State coverage used controlled browser fixtures. Live success was verified separately. |
| Arabic, English, RTL, mobile, and reduced motion | Verified in web regression tests | Browser checks covered Arabic and English, RTL, light and dark themes, desktop and mobile viewports, and reduced motion. Fresh live role checks included desktop and mobile sessions. | Formal university accessibility acceptance remains open. |
| Tests and production builds | Passed locally | API, web, migration, seed fixture, and Book RAG suites passed. Normal and assistant-enabled web builds and the Book RAG Docker image build passed. | Build artifacts were exercised locally. Production deployment tests remain open. |

See the [controlled import runbook](../migration/PROJECTS_RESEARCH_CONTROLLED_IMPORT.md), [database implementation notes](../database/prisma-implementation-notes.md), [Book RAG runtime guide](../../services/book-rag/README.md), and [web regression guide](../../apps/web/tests/README.md) for implementation and test procedures.

## 4. Current Integration Architecture

1. **React UI.** The shared assistant presents Books, Graduation Projects & Theses, and All. It sends questions and Book job requests to Express. In All, the page shows the two providers' replies and sources separately. Normal SAMS pages handle circulation.
2. **Express API.** Express enforces authentication, role checks, request validation, and Book session and job ownership. It returns approved catalog fields. The browser has no direct Book RAG or PostgreSQL connection.
3. **Book RAG.** Express calls a local FastAPI service that reads active book metadata from PostgreSQL through a dedicated read-only account. It uses local retrieval models and writes an extractive answer with citations. The audited account has six shared catalog table grants and cannot read account or audit tables. The Book vector cache lives outside the Docker image.
4. **Research RAG.** An independent provider within Express queries `sams_research.catalog` using a dedicated account with view-only access and read-only transactions. The view projects the approved metadata and current availability. The provider ranks an in-memory index, and the UI uses those results to produce a written match summary and cards.
5. **Refresh and database access.** Both providers poll PostgreSQL on a five-second interval and refresh published snapshots when their approved source data changes. Research indexes additions, edits, and removals from its view. Book RAG fingerprints joined catalog content and reuses unchanged vectors. Database access stays in server code using fixed queries. Models receive no credentials and cannot execute SQL or use an unrestricted database connection.

The [Book RAG runtime report](SPRINT_10D3_REAL_RUNTIME.md) records the earlier service design and local runtime evidence. The current audit verified the integrated configuration described here.

## 5. Tuesday Demo Readiness Checklist

- [x] Complete the final local release-candidate audit and verify the current database counts.
- [x] Verify useful written replies, source cards, and legacy codes in Books, Graduation Projects & Theses, and All.
- [x] Check the normal application for screenshot-only delays, capture hooks, and temporary debug behavior. The live checks used no browser request interception or artificial delay. The avatar greeting does not delay submission.
- [x] Stop the prior application services, start the demo from the documented launcher, and wait for both providers to report readiness against the existing local PostgreSQL database.
- [x] Verify `STUDENT`, `LIBRARIAN`, and `MANAGEMENT` in fresh browser sessions and confirm anonymous rejection.
- [x] Confirm the local backup is available. The audit verified a 2,572,472-byte backup with `pg_restore --list` before database operations.
- [ ] Rehearse the complete presenter sequence on the demo machine and allow time for Book RAG startup.
- [ ] Review the candidate scope and obtain explicit approval for the final commit and push.

## 6. Production Readiness Gaps

- **Hosting and transport.** Select the production hosting model, approve the domain and HTTPS/TLS configuration, and restrict database and provider traffic to the required network paths.
- **Identity.** Integrate institutional authentication and verify role provisioning, suspension, and revocation. Disable development sign-in and remove or disable development accounts in the production environment.
- **Secrets and database privileges.** Provision secrets through the production secret manager and verify least-privilege application and provider accounts. Narrow the existing Book RAG table grants to an approved book-only projection or equivalent policy. Reverify Research view permissions in the target environment.
- **Migrations and import.** Approve the production data migration and import procedure, validate it against a staging copy, and capture reconciliation and rollback evidence. The local import command deliberately refuses production mode.
- **Recovery and operations.** Define backup schedules and retention, run a production-like restore drill, and configure monitoring, provider readiness, alerting, and incident response.
- **Traffic and performance.** Verify rate limits, production network and egress policies, concurrent user load, provider latency, and refresh performance under realistic catalog changes.
- **University acceptance.** Obtain university user acceptance and librarian approval for workflows and source corrections. Publish staff operational documentation covering routine changes, imports, failures, and escalation.

The [deployment checklist](../deployment/DEPLOYMENT_CHECKLIST_v1.md) and [runtime readiness guide](../hardening/RUNTIME_READINESS_v1.md) provide the repository's baseline production gates.

## 7. Staff Operations Still Requiring Verification

| Staff operation | Evidence from the final audit | Acceptance work still open |
| --- | --- | --- |
| Add an academic work | An authenticated librarian created a synthetic `ACADEMIC_WORK` through the live catalog API. | Verify the complete staff form workflow, including validation, optional metadata, and the saved catalog record. |
| Edit works and contributors | A librarian updated the synthetic title through the live API. Imported contributor relationships were verified in discovery. | Verify staff edits to work details, subjects, and contributor names and roles, including validation and conflict handling. |
| Manage copies | The audited imported copy completed the hold, checkout, and return workflow. | Verify adding copies and managing identifiers, branches, conditions, and status transitions from the staff workflow. |
| Bulk Excel import | The approved academic source set passed the controlled local command-line plan, apply, and verify workflow. | Verify the university's ongoing librarian bulk-import process, including who may approve and execute a batch. |
| Preview and error reporting | The command-line plan and verification reported aggregate totals and conflicts. | Validate a staff-facing preview, actionable row and field errors, rejection of invalid batches, and safe retry behavior. |
| Research refresh after staff changes | A synthetic create and title edit appeared in search without restart. The synthetic row disappeared after removal. | Verify the same outcome after staff UI edits to subjects and contributors, changes to copy availability, and approved bulk imports. |

## 8. Known Limitations

- The demo runs locally with development sign-in and host-local prerequisites. The final audit did not exercise a production environment.
- Research retrieval and replies are based on approved catalog metadata. The assistant cannot access PDFs or full text.
- Written demo replies are available in all scopes. Books uses a local extractive response, and Research presents a summary grounded in the matching records. General-purpose generative writing is outside the verified demo scope.
- Book RAG warmed up in about 44 seconds on the final launcher restart. Startup took longer during the full audit harness. The five-second refresh interval is a polling setting rather than a latency commitment.

## 9. Release Gates

### Demo Ready

- [x] Start the local stack through the documented launcher and confirm both providers are ready.
- [x] Confirm approved import counts, unchanged book records, and one complete academic circulation round trip.
- [x] Verify written responses, cards, and codes in all scopes for all roles and confirm anonymous rejection.
- [x] Confirm backup availability and the absence of capture behavior in the normal runtime.
- [ ] Complete the timed presenter rehearsal on the demo machine.

### Commit Ready

- [x] Complete the local functional, migration, security, and Git checks for the reviewed candidate.
- [x] Include this report in the recommended scope and keep private inputs, credentials, backups, and generated evidence out of Git.
- [ ] Obtain approval of the exact change set and authorization to stage and commit. Obtain explicit authorization before pushing.

### Production Ready

- [ ] Approve hosting, domain, TLS, institutional authentication, and production role provisioning.
- [ ] Enforce secret management, least-privilege database access, and production network and rate-limit policies.
- [ ] Pass staging migration, import reconciliation, restore drills, monitoring, and load tests.
- [ ] Complete staff workflow acceptance, operational documentation, and university and librarian sign-off.

## 10. Recommended Next Steps

### Before Tuesday's demo

- Run the timed rehearsal in fresh role sessions. Start Book RAG early and confirm readiness before opening the Books or All scope.
- Review the candidate scope. Stage, commit, or push only after explicit authorization.

### Immediately after the demo

- Record university feedback on catalog discovery and assistant replies.
- Complete librarian acceptance for academic work edits, contributors, inventory changes, and recurring bulk import.

### Before public deployment

- Close the production gates on a staging environment with production-like authentication, networking, privileges, and recovery procedures.
- Reconcile the staging import and obtain the university's approval before opening access.

### Optional future enhancements

- Improve relevance ranking and search evaluation using approved metadata queries.
- Add a librarian-facing bulk-import preview and reconciliation view if the university approves that workflow.

## 11. Repository State

The current branch is `dev` at `221398f` (`feat(migration): add projects research source dry run`). `git status -sb` shows `## dev...origin/dev`. The tracked diff is **44 files changed, 665 insertions, and 226 deletions**. This report is untracked and therefore outside that tracked diff. `git diff --check` passed. Windows Git may emit LF-to-CRLF advisories. No files were staged, committed, or pushed during the audit or the preparation of this report.

| Verification | Result |
| --- | --- |
| API suite | 190 passed |
| Web suite | 219 passed, plus 2 optional production-build flag checks |
| Import and frontend seed fixture tests | 4 transformation tests and 3 in-memory seed fixture tests passed |
| Book RAG | 13 Python tests, offline CPU inference for both pinned models, and 23 live harness checks passed |
| Import commands | Plan passed with zero database connections and writes. Verify matched approved totals. Apply rerun inserted zero rows. |
| Build and schema | Prisma validate and generate, normal and assistant-enabled web builds, and the Book RAG image build passed. |

| PostgreSQL measure | Before final live smoke | After final live smoke |
| --- | ---: | ---: |
| Academic works / copies | 3,983 / 3,988 | 3,983 / 3,988 |
| Available / archived academic copies | 3,987 / 1 | 3,987 / 1 |
| Books / book copies | 2,824 / 2,827 | 2,824 / 2,827 |
| Total physical copies | 6,816 | 6,816 |
| Subjects / subject links | 11 / 3,951 | 11 / 3,951 |
| Academic contributor links | 15,225 | 15,225 |
| Students | 3 | 3 |
| Reservations / loans | 5 / 4 | 6 / 5 |

Book item, detail, copy, contributor, and relationship fingerprints matched the verified pre-import backup and stayed unchanged after the smoke test. The final circulation check accounts for the one additional reservation and loan.

### Recommended Commit Scope

Keep the 44 reviewed tracked changes and the following 16 new source and documentation files together. The candidate covers the academic schema, import, catalog and circulation support, shared assistant, both providers, and their tests. Keep private workbooks and exports, local credentials, backups, generated evidence, and unrelated untracked files outside the commit.

- `apps/api/src/modules/ai/research-rag.js`
- `apps/api/tests/research-rag.test.js`
- `apps/web/src/components/ai/AiResearchRecords.jsx`
- `apps/web/src/pages/shared/LibraryAssistantPage.jsx`
- `docs/migration/PROJECTS_RESEARCH_CONTROLLED_IMPORT.md`
- `docs/planning/SPRINT_10D6_IMPORT_CONTRACT.json`
- `docs/planning/SPRINT_10D_RELEASE_READINESS.md`
- `prisma/migrations/20261109010000_academic_work_import/migration.sql`
- `prisma/migrations/20261109011000_academic_work_database_guards/migration.sql`
- `prisma/migrations/20261109012000_research_rag_catalog/migration.sql`
- `scripts/migration/apply-academic-works-demo.mjs`
- `scripts/migration/backup-sams-before-academic-works.ps1`
- `scripts/migration/enable-main-academic-work-circulation.sql`
- `scripts/migration/import-projects-research.mjs`
- `scripts/migration/projects-research-transform.mjs`
- `scripts/migration/projects-research-transform.test.mjs`

Recommended commit message `feat: add academic works and shared library assistant`
