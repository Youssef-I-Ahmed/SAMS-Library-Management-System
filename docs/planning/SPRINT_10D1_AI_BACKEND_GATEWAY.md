# Sprint 10D.1 — SAMS AI Backend Gateway

Date: 2026-10-31 (Africa/Cairo). Baseline: `dev` at `7c56d85`.
Scope: D1–D3 of the [10D plan](SPRINT_10D_AI_INTEGRATION_PLAN.md), implementing [contract v1](../architecture/SAMS_AI_INTEGRATION_CONTRACT_v1.md) and its [decision register](../architecture/SAMS_AI_INTEGRATION_DECISION_REGISTER.md). No Student UI or Knowledge Spirit implementation.

## Outcome and design

The existing Express application previously had no AI gateway, trusted session/job ownership, or exact RAG-code enrichment. Raw forwarding would have exposed caller-addressed Python state and mistaken near-duplicate groups for a single SAMS item. This change adds the controlled server boundary rather than changing Zahraa's service.

AI is **disabled by default**. Unset/false `AI_ENABLED` ignores unused AI configuration, does not read the crosswalk and does not make upstream calls. Ordinary SAMS routes retain their existing parser/startup behavior. AI routes still require authentication and the specified roles; an authorized call while disabled receives a sanitized 503. Enabling requires valid server configuration and a valid pinned map; an invalid artifact makes all AI routes unavailable, never silently unmapped.

Implemented routes:

| Express route | Required role | Upstream |
| --- | --- | --- |
| `POST /api/v1/ai/ask` | STUDENT | `POST /api/ask` |
| `GET /api/v1/ai/jobs/:jobId` | STUDENT + owner | `GET /api/jobs/{internalJobId}` |
| `GET /api/v1/ai/books/:bookCode` | STUDENT | `GET /api/books/{atomicCode}` |
| `POST /api/v1/ai/session/reset` | STUDENT + owner, idle only | `POST /api/session/reset` |
| `GET /api/v1/ai/health` | STUDENT / LIBRARIAN / MANAGEMENT | `GET /api/health`, sanitized |

All identity comes from existing `authenticate`/`authorize`: verified JWT subject, active DB user and current DB roles. Browser identity headers, Authorization/cookies and arbitrary headers are never forwarded. Each internal request builds fresh service/user/role/request-ID headers. The origin is configured server-side, with no credentials/path/query/fragment; redirects are never followed.

Known upstream response fields are validated and projected; unknown fields at every object level are discarded. Valid done/cached/pending/null-preview/help/refusal/extractive states retain their meaning in `{data:...}`. Upstream body errors, HTTP errors, invalid JSON/state/IDs/types and excessive responses produce the contract's sanitized SAMS error envelope. Health exposes only `{data:{status:"ok"}}`, and validates that the supplied engine/settings shape is usable and initial wait does not exceed ten seconds. AI responses use no-store and request IDs, including early CORS rejections. AI logs contain fixed codes/operations, request IDs, statuses and optional hashed public handles, without payloads, raw upstream exceptions, configuration or internal IDs.

Private memory registries issue random public handles independently from internal IDs, enforce ownership, session locks, one active/uncertain ask per user and four globally, TTL/service epochs, idle-only rotating reset and one concurrent poll per job. Pending polling has a 500ms minimum repeat gap and per-user quotas. Terminal poll results are retained but identity is freshly revalidated on later reads. Ask/reset are never automatically retried. Only GET transport failures or upstream 502/503/504 can receive one bounded retry with 500–1500ms jitter inside the original deadline.

Browser disconnect does not abort an already dispatched ask/reset or pretend to cancel Python computation. Ask continues its bounded internal response read to record pending/terminal state. GET waits can be aborted. Unknown POST outcomes retain the session and compute admission as uncertain; public TTL expiry does not free that capacity. An expired upstream job also does not prove its worker stopped. No browser endpoint can reset a service epoch or clear uncertain capacity.

The pinned JSON crosswalk is read once without modifying it. Raw-byte SHA-256, source fingerprint, exact shape, UUID/code validity and duplicate keys (including escaped duplicates) are checked. Enrichment resolves every code in the group, including full source cards, and runs one batched read-only Prisma query for all distinct targets in a response. Targets must be active BOOKs with BookDetails. The exact added object is `{status,library_item_id}`; mapped/unmapped/partial/ambiguous/unavailable and DB failures are explicit. The tested `1687; 1896` group is ambiguous because its two codes refer to different UUIDs. Leading zeroes remain intact. No title/ISBN/description fallback, generated UUIDs, RAG-stock inference, reservation action or cover data was added.

## Files changed (exact inventory)

Paths are relative to repository root `D:/Digi/SAMS_Library_System_Root/SAMS_Library_System`. Only these 15 files belong to this change; all historical specification files and existing test assertions remain unchanged.

| File | Change |
| --- | --- |
| [`.env.example`](../../.env.example) | Disabled default and server-only AI variable names/defaults; no actual key or local deployment values. |
| [`apps/api/src/app.js`](../../apps/api/src/app.js) | AI boundary before general parsing/CORS error logging; mount new router before ordinary JSON parser. |
| [`apps/api/src/config/env.js`](../../apps/api/src/config/env.js) | Merge conditional AI configuration with existing environment validation. |
| [`apps/api/src/middleware/request-logger.js`](../../apps/api/src/middleware/request-logger.js) | Fixed AI namespace instead of logging public handles/raw path input; ordinary paths unchanged. |
| [`apps/api/src/config/ai.js`](../../apps/api/src/config/ai.js) | Conditional configuration and limits, errors containing names only. |
| [`apps/api/src/modules/ai/ai-errors.js`](../../apps/api/src/modules/ai/ai-errors.js) | Fixed safe errors and bounded read deadline helper. |
| [`apps/api/src/modules/ai/ai-json.js`](../../apps/api/src/modules/ai/ai-json.js) | Duplicate-aware JSON parser with nesting bound; no added dependency. |
| [`apps/api/src/modules/ai/ai-schemas.js`](../../apps/api/src/modules/ai/ai-schemas.js) | Strict input validation, Python-compatible trimming/code-point counting, upstream schema/projection. |
| [`apps/api/src/modules/ai/ai-state.js`](../../apps/api/src/modules/ai/ai-state.js) | Ownership, quotas, TTLs, locks, capacity, public handles and service epoch. |
| [`apps/api/src/modules/ai/ai-transport.js`](../../apps/api/src/modules/ai/ai-transport.js) | Node HTTP(S), header allowlist, streaming decoded-size/deadline enforcement and GET retry. |
| [`apps/api/src/modules/ai/ai-identity.js`](../../apps/api/src/modules/ai/ai-identity.js) | Read-only pinned-map loading and batched catalog enrichment. |
| [`apps/api/src/modules/ai/ai-gateway.js`](../../apps/api/src/modules/ai/ai-gateway.js) | Service orchestration, private→public projection, lifecycle and response guards. |
| [`apps/api/src/modules/ai/ai.routes.js`](../../apps/api/src/modules/ai/ai.routes.js) | RBAC, decoded-body parser, input validation, cancellation boundary and sanitized errors. |
| [`apps/api/tests/ai-gateway.test.js`](../../apps/api/tests/ai-gateway.test.js) | 139 deterministic tests with loopback fake FastAPI and mocked Prisma. |
| [`docs/planning/SPRINT_10D1_AI_BACKEND_GATEWAY.md`](SPRINT_10D1_AI_BACKEND_GATEWAY.md) | This implementation/verification handoff. |

## Configuration and bounded local profile

The names/defaults are in `.env.example`; values for a real local origin, service key, artifact path/fingerprints and epoch were **not** written to `.env` or any browser configuration. Use an explicit absolute crosswalk path to avoid npm workspace cwd ambiguity. Match `RAG_SERVICE_KEY` privately to Python `API_SERVICE_KEY`. The gateway additionally requires a 32–512 character printable ASCII service key with no whitespace. This tightens the source service's nonempty-key condition without changing Python.

| Resource | Implemented bound |
| --- | --- |
| Browser JSON body | 8 KiB decoded; compressed input is limited after inflation; duplicate JSON keys rejected. |
| Upstream/final browser JSON | 2 MiB decoded/serialized, respectively; no silent truncation. |
| Ask / card / reset / health upstream deadline | Defaults 15s / 5s / 5s / 2s; enabled configuration can tighten within validated bounds, never exceed contract caps. |
| Poll upstream deadline | Requested finite wait 0–25s plus configured margin, default 5s, total at most 30s. |
| Connection phase | At most 2s inside the same total HTTP budget. |
| Catalog enrichment | 3s; at most four outstanding Prisma reads. A timed-out read keeps its slot until the actual read settles; there is no query-cancel claim. |
| Ask / poll / cards / reset / health quotas | 20 / 60 / 60 / 10 / 30 per user per rolling minute. Mixed STUDENT/LIBRARIAN users do not bypass gateway limits. |
| Active or uncertain generation | One per user, four globally; private capacity survives public-handle expiry. |
| Session / job public TTL | Two hours idle since last ask / one hour since original dispatch; polling does not renew either. |
| Additional memory/artifact ceilings | 1,024 public sessions, 128 retained jobs plus admission headroom accounting, 4,096 rate buckets, crosswalk at most 4 MiB/50,000 codes. At capacity reject rather than silently evict valid handles. |

`AI_POLL_WINDOW_MS` is validated as the contract's 240s **future client patience policy**; it is not enforced as a backend cancellation/job deadline. No UI was implemented to consume it. Authentication retains existing SAMS middleware; the new transport deadlines start when dispatching upstream, and the enrichment read is separately bounded. Database failures during current-user authentication fail closed without exposing the underlying exception.

## Verification performed

No dependency installation, Python environment, real RAG startup, Gemini/provider call, model/index download/build, schema/migration, seed/import or data write was performed. Test fixture files were created only in a generated OS-temp directory and removed with a checked path. Existing assertions were not modified.

### Deterministic verification (mocked data and fake upstream)

The new suite uses a real Node HTTP server on `127.0.0.1` with an ephemeral port to emulate FastAPI; no Python engine is imported. Prisma is mocked. Timers can be shortened only through test factory injection, without weakening production environment validation. Coverage includes:

- Disabled startup/routes and ordinary API behavior; current DB-backed roles, expired/invalid JWTs, inactive/missing users and forged browser identity headers.
- Direct/cached done, both pending previews, pending→done, retained terminal polls, help/refusal/extractive notice and body error.
- Unknown/duplicate JSON keys, media/charset/encoding, malformed/empty JSON, excessive decoded gzip body, Unicode code-point limits and Python whitespace, filters/years/topics/language, wait/query/path validation and leading zeroes.
- Allowlisted headers/known response fields, no redirects, non-JSON/5xx/unknown-state/mismatched-ID/missing-field responses, header/body stalls, total HTTP deadlines, compressed response and final serialization limits, bounded GET retries and no POST retry.
- Foreign/unknown/expired sessions/jobs/reset, active/concurrent asks/reset/polls, quotas/capacity, service epoch, disconnect during ask and poll, uncertain dispatch and no premature capacity release.
- Mapped/unmapped/partial/ambiguous/unavailable/stale/wrong-type/no-BookDetails targets; source-card extra codes; 1687/1896 ambiguity; batch reads; DB failure/deadline; fresh identity on retained results; invalid map hashes/provenance/UUIDs/duplicate and escaped-duplicate keys; sanitized health/errors/logs.
- Existing ordinary development login/current-user, discovery detail, availability and parser/auth preservation through the existing application, with mocked read-only Prisma methods.

| Command | Result |
| --- | --- |
| `npm run test -w @sams/api -- tests/ai-gateway.test.js` | Focused suite passed before broadening: initially 115, then 135/137 as coverage was expanded; final suite contains 139 cases and passed in the final full run. |
| `npm run test -w @sams/api -- tests/app.test.js tests/hardening.test.js tests/error-handler.test.js tests/catalog-search.test.js` | All **39 existing tests passed**. |
| `npm run test -w @sams/api` | Final run: **178 passed, five files** (139 new + 39 existing). |
| `npm run build -w @sams/api` | Passed; existing script states that plain Node ESM has no build/transpile step. |
| `node scripts/sprint8/sprint8a-production-env-guard-smoke.js` | Passed: three unsafe configurations blocked and safe configuration accepted. |
| `node --check` over changed/new API JS and the new test | 13 files passed. No API lint or type-check script exists; neither is claimed. |

### Actual SAMS database, explicitly read-only (no real RAG)

Two ephemeral verification harnesses used the existing local database only after checking the loopback host, expected local port/database and confirming `SHOW transaction_read_only` returned `on` following `SET TRANSACTION READ ONLY`. These are transaction/session settings, not record writes. Prisma clients were disconnected and ephemeral Express listeners closed afterward.

1. Pinned local map fingerprint checked; all **2,842 codes**, **2,821 unique targets**, **2,821 existing targets** and **2,821 active BOOKs with BookDetails** confirmed via one batched read.
2. Existing `scripts/sprint9/sprint9b-live-auth-smoke.js`: passed (four OK check lines), using the actual Express authentication routes and real local users inside the read-only transaction.
3. Existing `scripts/sprint9/sprint9c-live-discovery-smoke.js`: passed (six OK check lines), using actual catalog/discovery/facet/detail code and local records.
4. Existing availability endpoint checked for the two distinct items referenced by codes 1687 and 1896; both matched direct read-only copy-status aggregation. No copies/statuses were changed, and no RAG count was used.

The first live-discovery harness attempt failed because Prisma's transaction client deliberately omits `$transaction`, used by the existing facet service. The harness was corrected to provide an array/callback facade that keeps every operation inside the same already-read-only transaction. Both existing scripts then passed unchanged. No application source or old assertion was changed to suppress this harness failure. This is **read-only SAMS regression evidence**, not proof of real FastAPI interoperability, real Gemini generation or unrestricted production operation.

## Remaining limits and contract coverage

No D1–D3 contract point is intentionally omitted. The additional key/memory/artifact bounds above are explicit fail-closed safeguards. D4 Student UI/Knowledge Spirit and its 240s polling UX remain outside this task.

Real FastAPI interoperability is unexecuted by instruction. AI remains disabled in the existing local environment; a privately configured matching key, local origin/epoch and prepared offline Python/model/index runtime are still required before a separately authorized real-service smoke. No key values are included in this report.

Ownership, quotas and retained results are local memory. Multiple Express/Python processes, durable state and automatic detection of an unannounced Python restart are unsupported. Coordinate Express/FastAPI restarts and epoch changes. An uncertain dispatched POST or an unobserved expired job can occupy a capacity slot until operator reconciliation/coordinated service restart; browser Stop, TTL expiry and reset cannot claim computation cancellation. A first response lost before a public handle is delivered has no browser recovery endpoint. A pending job registered after client disconnect is privately retained, but cannot be guessed/recovered without a previously delivered public handle. These are the contract's conservative local limitations, not hidden retries.

Current Python raw-query logging/privacy, provider readiness/free quota, whole-question time budgets, hosting/TLS/production distribution, Subjects/full-field schema and database ingestion remain deferred. RAG remains Excel-based and unchanged. The gateway supplies no live availability or cover fields; ordinary SAMS availability/reservations remain authoritative.

## Preservation and Git

The starting inventory included 1,483 tracked/untracked Git-visible files. Final SHA-256 review found exactly four authorized existing backend/config files changed, 1,479 original files unchanged and no deleted original files. The eleven new Sprint files are listed above. All original HOLD/evidence/RAG/data files and all three authoritative specifications retain their bytes. Dependency manifests/lockfiles, frontend, Prisma schema/migrations and Excel files are outside the change. No staging, commit, push, branch switch, reset, clean or stash was used.

Two additional untracked directory listings, root `dir.txt` and `RAG/dir.txt`, appeared during the session and were absent from the initial inventory. No command recorded for this task creates them. They were left untouched and are excluded from the Sprint's 15-file inventory; they must not be removed or staged as part of this work. Consequently the final Git-visible inventory contains 1,496 files (1,483 initial + eleven Sprint additions + two unattributed listing additions). This distinguishes task-owned changes from concurrent/unattributed workspace activity rather than claiming no new paths exist anywhere in RAG.

`git diff --check` passed using the repository's normal line-ending settings. The tracked diff is **four files, 30 insertions and three deletions**, and the index has no staged diff; branch/HEAD remain `dev`/`7c56d85`. A temporary check with `core.autocrlf=false` interpreted CRLF in `.env.example` as whitespace; the normal repository-configured diff correctly shows only the 18 appended lines. Existing content/line-ending conventions were not rewritten to satisfy that artificial override.

Tracked `git diff --stat` omits new untracked files; the final task report distinguishes the tracked diff from the complete 15-file inventory. This report does not imply that the pre-existing untracked HOLD resources should be staged or published.
