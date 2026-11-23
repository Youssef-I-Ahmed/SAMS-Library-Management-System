# Sprint 10D — SAMS AI integration plan

Date: 2026-10-31. **Planning only; implementation has not started.**
Baseline: `dev` at `017f2f7`. Governing specification: [SAMS AI Integration Contract v1](../architecture/SAMS_AI_INTEGRATION_CONTRACT_v1.md); rationale/open issues: [decision register](../architecture/SAMS_AI_INTEGRATION_DECISION_REGISTER.md).

## Objective and fixed scope

Connect Student AI chat and Knowledge Spirit through `Browser → SAMS Express → current Zahraa FastAPI 1.1.0`. The browser consumes only `/api/v1/ai`, never a service key or internal origin. Use existing JWT/current-user RBAC and catalog/circulation operations. Implement the contract's proposed layer; preserve upstream done/pending, polling, fallback/refusal/help/cache states.

First integration reads the existing Excel snapshot in RAG. PostgreSQL ingestion, Subjects relations and missing bibliographic fields are later work. No change to Zahraa's retrieval, prompts, model selection/evaluation settings or algorithms; no migrations or database writes for AI ownership/crosswalk. No Staff AI UI, covers, Streamlit iframe integration, voice pipeline, paid service/subscription or production hosting decision. Production URLs are not hardcoded; local origin is configurable. The current task delivers documentation only and does not authorize beginning these implementation steps.

## Evidence baseline

- Selected package and 33-file byte equivalence to `Downloads/zahra/sams_rag_project.zip` are recorded with hashes in contract §1. Older 1.0.0 lacks required authentication/quota additions.
- Source-grounded endpoint/field/status references are contract F1–F8; existing Express/Prisma foundations S1–S6. `/api/v1/ai` is not mounted today.
- Local crosswalk contains 2,842 codes → 2,821 UUIDs, workbook hashes agree and payload membership agrees. Current DB existence/active BOOK/BookDetails validation has **not** run. Import artifacts are local/untracked and must not be uploaded.
- No local Python environment/model/cache artifacts are ready. Existing pytest imports engine via TestClient lifespan, which can download/write. No service/tests/provider calls ran for 10C.2.

## Entry gates and prerequisites

| Gate | Required evidence before dependent work | Responsibility |
| --- | --- | --- |
| G1 — provenance | Compare current package to pinned fingerprints; review any drift against source/tests before changing adapter assumptions. Preserve working changes and `dev`; no unrequested commit/push. | SAMS implementer |
| G2 — runtime | Confirm already prepared compatible environment/offline model and index artifacts; do not silently install/download/build to satisfy a smoke test. If missing, separate authorized preparation is needed; fake-upstream implementation tests can proceed first. | Zahraa/runtime owner |
| G3 — secrets/config | Matching nonempty server keys supplied privately through process environment; no secret in docs, fixtures, frontend, logs or repository. API settings loaded before imports; explicit service epoch. | Local operator + SAMS implementer |
| G4 — crosswalk | Configure read-only map path, map/source fingerprints, reject duplicate keys; batch read active BOOK/BookDetails targets in current SAMS DB. Publish counts/ambiguities only, no Excel/data upload. Do not run importer/migration. | SAMS/data owner |
| G5 — no-cost generation | Confirm existing authorized free quota/provider access or run an explicitly labelled extractive-only demo; never enable billing, subscribe or replace/tune models to bypass limits. | User/runtime owner |
| G6 — safety invariants | Implement contract ownership/capacity/uncertain-dispatch behavior in the fake-upstream phase before exposing Student UI. Single-process local topology and coordinated restarts are documented limitations. | SAMS implementer |

G2–G5 gate actual-service smoke, not source review or controlled fake-upstream tests. Production hosting, Subjects and persistent state are not entry gates for local development.

## Work sequence for a separately authorized implementation

### D1. Server configuration and adapter transport

Add explicit config validation, the five `/api/v1/ai` routes and typed/validated known JSON shapes in the existing Express conventions. Reuse authenticate/authorize/requestContext/AppError; regenerate only internal header allowlists. Implement body/response byte budgets, finite poll waits, total HTTP deadlines, protocol/error mapping and GET-only retry policy from contract §§3–4. No generic transparent forwarding. Health exposes only sanitized readiness. All added env names remain server-only.

Acceptance: five route mappings match; client cannot override service/user/role headers or upstream URL; JWT role claims do not override DB roles; invalid inputs never dispatch; FastAPI 401 is a configuration 503, body-error 200 becomes 502, valid pending remains 200. Tests exercise non-JSON upstream 500, oversized streaming response and new/unexpected fields without leaking them.

### D2. Ownership, job/session lifecycle and admission

Implement private public→internal handle registries with user binding, TTL/service epoch, session lock and global/user admission ledger. Register before dispatch, validate returned session IDs, persist pending IDs before responding. Enforce owned polling/reset; rotate idle session on reset. Preserve ongoing/uncertain accounting after browser abort/TTL; no implicit cancellation, job replay, public ID passthrough or transcript persistence. Keep current FastAPI unchanged.

Acceptance: cross-user guesses receive indistinguishable 404; reset while active gets 409; browser abort never starts a second ask; malformed response or lost POST response does not release unknown work capacity or replay generation. Known pending survives client navigation when handles are retained. Controlled service restart retires old epoch; Express restart loses handles safely. Fake upstream can hold/release jobs deterministically to test these conditions.

### D3. Book identity enrichment

Load pinned local crosswalk read-only and validate provenance, uniqueness and UUID targets. Batch enrich preview/books, result/sources, result/all_books/items and card responses with exactly the contract identity object. Resolve all codes in a near-duplicate card, not just URL code. Keep 22 source card keys and snapshot semantics. Existing SAMS detail/availability and reservation endpoints remain authoritative.

Acceptance: unique exact mapping links correctly; no/partial map is unmapped; multiple UUIDs is ambiguous; stale/inactive/wrong-type/no-BookDetails target is unavailable. Test real `1687; 1896` distinct UUID case and leading-zero preservation. No title/ISBN fallback, new IDs or DB writes. Snapshot copy counts and AI wording never become stock badges. No AI cover fields. Crosswalk invalidity disables AI readiness; DB outage fails enrichment explicitly.

### D4. Student AI and Knowledge Spirit

Build the Student conversation controller against Express `{data:...}`/`{error:...}` only. States: idle, submitting/searching, pending (preview optional), done, refusal/help/fallback, throttled, failed, still-working after patience window, and stopped local polling. Knowledge Spirit reflects these states without its own network calls, without inventing live progress events; upstream only exposes pending/done/error, not streamed retrieval/writing phases.

Replace preview with final result and clear it on refusal. Preserve follow-up session handle and allow idle reset. Offer detail links only for mapped items; show explicit unmapped/ambiguous/unavailable states. Render answer text/Markdown safely without arbitrary HTML or model-supplied operational links. Do not present provider/model/latency as Student-facing choices. Preserve Arabic RTL/English, responsive layouts, keyboard/focus and reduced motion. Reuse the accepted [AI/avatar handoff](../design/handoff/sams-living-library-v2/AVATAR_IMPLEMENTATION_PLAN.md.md); character stays on AI page.

Acceptance: UI never calls Python or stores its key/origin; null preview is valid loading; polling has one outstanding request and stops locally on navigation; expired job never auto-resubmits ask; reset creates a fresh public session only when safe. Covers and Staff pages receive no AI changes.

### D5. Verification and handoff

Run focused deterministic adapter tests with a local fake FastAPI transport first, no Gemini/models/network. Once prerequisites pass, run the prepared real service locally with authorized no-cost provider mode, without rebuilding indexes or altering RAG. Distinguish actual responses, mocked states and unexercised scenarios. Validate existing Student catalog/details/reservation and staff circulation via appropriate existing regression checks; do not mutate real records just to generate evidence.

Record commands, results, package fingerprints, configured variable **names only**, mapping counts, limits, restart behavior and remaining limitations. Inspect logs/browser bundle/network for credentials. Repeat relevant checks after fixes; no needless full evaluation run because the algorithm is unchanged.

## Acceptance matrix

| Area | Required cases | Evidence |
| --- | --- | --- |
| Trust/auth | Missing/expired JWT, inactive user, changed DB role, student vs staff-only, forged identity headers, foreign session/job/reset | Fake-upstream request assertions and RBAC integration checks |
| Shapes/states | Direct done, cached done, pending null/populated preview, pending→done, help, refusal, extractive notice, body error, book/reset/health | Fixtures traced to contract F1/F3/F4/F6; later real-service samples where available |
| Limits/errors | 400/401/403/404/409/413/415/429/502/503/504 mappings, Unicode lengths, filter bounds, malformed JSON/wait, response overflow, read deadline | Deterministic adapter tests; no real provider needed |
| Lifecycle | Concurrent ask/reset, many sessions per user, quota/cache-hit accounting, global capacity, idle/job expiry, disconnect, uncertain dispatch, safe GET retry, no POST retry, restart epoch | Fake clock + controlled jobs; verify ledger stays bounded/fails closed |
| Identity | Unique/no/partial/ambiguous/stale/wrong-type/missing BookDetails; real 1687+1896 group; provenance mismatch; DB outage | Read-only map checks + fixture/live DB reads clearly distinguished |
| UX | Arabic/English, keyboard/mobile/reduced motion, no stale preview after refusal, mapped-only detail navigation, no fabricated availability/covers | Browser checks against Express |
| Preservation | Existing catalog/circulation contracts; no RAG/Excel/config algorithm changes, migrations, unexpected uploads or paid requests | Scoped diff, hashes and relevant regressions |

## Resolved vs deferred

Resolved for 10D: Excel-first; selected 1.1.0 service; server-only headers; existing RBAC; Student-only ask/poll/cards/reset; all-role sanitized health; owner-bound handles; local memory with coordinated restart; strict budgets; no automatic POST retry; conservative ambiguous mapping; existing SAMS availability/reservations; Express-only Student/Spirit clients; no paid dependency or covers.

Still required before actual-service smoke: prepared offline runtime, privately configured matching key, chosen local origin/epoch, local crosswalk custody and current DB target evidence, free quota or labelled extractive demonstration. Ambiguity need not be manually merged before starting: safe ambiguous display is the defined behavior.

Deferred production decisions: hosting/topology/TLS/internal network; distributed ownership/quotas/queue/storage; service-instance identity and cancellation/reconciliation support; privacy/retention/redaction for existing raw Python query logs; durable crosswalk/Subjects/full-field schema/approved ingestion-sync; load/performance budgets based on measurements; operational monitoring/backup/key rotation. No production-readiness claim follows from finishing local 10D.
