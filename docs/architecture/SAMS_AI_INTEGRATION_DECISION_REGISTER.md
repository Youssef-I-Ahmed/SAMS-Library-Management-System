# SAMS AI integration decision register

Date: 2026-10-31. Sprint 10C.2. Documentation decisions only; no implementation is represented as complete.
Authority: [contract v1](SAMS_AI_INTEGRATION_CONTRACT_v1.md), with source/test references F1–F8, S1–S6, P1; implementation sequence: [10D plan](../planning/SPRINT_10D_AI_INTEGRATION_PLAN.md).

## Resolved contract decisions

| ID | Decision | Evidence / implication |
| --- | --- | --- |
| AI-01 | Use local `RAG/sams-library-search` FastAPI **1.1.0**, not older 1.0.0 or notebook HTTP assumptions. | 33 delivered code/support files equal `sams_rag_project.zip`; API version and 19 API tests agree. Hashes/manifest in contract §1. Notebook v12 denotes algorithm lineage, not API version. |
| AI-02 | Browser → Express → FastAPI only; nonempty service key for integration, private loopback/configurable local URL. | F1 service-key dependency; README/message/PDF align on trust boundary. Empty-key mode exists but is unsuitable for this boundary; disabling CORS alone does not authenticate. |
| AI-03 | Express constructs all identity headers from current SAMS authenticated user/roles; never trusts browser copies or JWT roles alone. | S2 verifies JWT, reloads active user, sets `req.auth`; PDF `req.user` is illustrative and does not match SAMS middleware. X-User-* are upstream quota/log inputs, not owner enforcement. |
| AI-04 | Ask/poll/cards/reset require STUDENT; health allows any existing role. Staff UI excluded. | Existing roles STUDENT/LIBRARIAN/MANAGEMENT from S4. Proposed policy narrows Python capability; multi-role users still receive public gateway caps, regardless of Python LIBRARIAN bypass. |
| AI-05 | Preserve upstream 200 done/pending; expose success in `{data:...}` and errors in existing SAMS error envelope. | F1/F4 state union, S3/S5 conventions. Body `status:error` with HTTP 200 must become proposed 502 `AI_UPSTREAM_ERROR`; no false success. No 202 assumption. |
| AI-06 | Opaque owned public session/job handles; private internal IDs; single-process memory for initial local integration, no new DB schema. | Python has caller-addressed sessions/jobs without ownership (F1); current Prisma has no AI ownership entities. PDF persistence in PostgreSQL is a proposal, not existing behavior. Durable production storage deferred. |
| AI-07 | Idle-only locked reset rotates conversation; Stop/navigation stops client polling, not computation. | Python reset has no busy lock/cancellation; worker can append afterward (F1/F7). Known/uncertain work remains accounted; no reset success or generation cancellation is inferred from disconnect. |
| AI-08 | No automatic ask/reset retry; bounded GET retry only. | No upstream AI idempotency or cancellation endpoint. Known job can be polled; lost dispatch response is uncertain. Existing Idempotency-Key CORS allowance does not provide AI dedup. |
| AI-09 | Explicit gateway validation, byte limits, quotas and capacity precede provider use. | F1 lacks general body/response/queue caps; S1 parser is global 2mb. Proposed 8 KiB request/2 MiB response, 20 asks/user/min and four globally active/uncertain jobs; detailed bounds and deadlines in contract §§3–4. These are policy choices, not observed defaults everywhere. |
| AI-10 | Keep exact Excel-based RAG ingestion for initial integration. | F5 reads Excel; chosen workbook hash agrees with demo source. No Subjects/full metadata ingestion from PostgreSQL now; no algorithm, prompts or evaluated setting changes. |
| AI-11 | Load audited read-only exact code→UUID crosswalk; verify current active BOOK/BookDetails targets; no title-only/ISBN join or DB edits. | S4 schema has no native source-code key; S6 local map has 2,842 codes/2,821 UUIDs and agrees with payload. Artifact presence is not live DB verification. |
| AI-12 | Resolve the entire returned RAG code group; no single link for multiple targets, unknown members or stale targets. | F6 near-duplicate grouping can exceed import groups. Actual 1687/1896 card maps to two distinct UUIDs. Proposed identity status+nullable ID represents mapped/unmapped/ambiguous/unavailable. |
| AI-13 | RAG result/copy/shelf metadata never supplies live availability or reservation state. | F4/F5 serialize snapshot counts; S5 owns operational stock. SAMS synthetic/demo provenance remains explicit. No covers in any AI schema. |
| AI-14 | Student AI UI/Knowledge Spirit consume only Express state; no fake stage telemetry. | Upstream exposes pending/done/error, not streamed searching/writing events. Knowledge Spirit stays on chat page and does not call providers itself (P1). |
| AI-15 | No paid subscription/service/quota upgrade; retain extractive fallback when a free authorized provider is unavailable. | F7 supports extractive path; user boundary overrides PDF's open paid-quota question. Generated-answer availability is not guaranteed by health. |
| AI-16 | Load API settings before Python import; pin runtime origin/service epoch; coordinated local restarts. | app.settings reads env before lifespan's config dotenv load. Multiple processes split stores; health has no instance ID. Proposed runbook uses preloaded process env/explicit Uvicorn env file; not run in 10C.2. |
| AI-17 | Treat RAG query logs as raw potentially sensitive data; sanitized Express logs and no secrets in reports. | F1 logs raw question/search/filter text, hashed identifiers and provider errors. Hashing is not encryption/anonymity; reset clears history only. Production privacy/logging remediation is not falsely claimed as delivered. |

## Contradictions and corrected assumptions

| ID | Earlier text / apparent assumption | Source-grounded resolution |
| --- | --- | --- |
| C-01 | All packages represent the same API. | Older ZIP/extracted copy is 1.0.0 without key/user/role additions; chosen local package matches newer ZIP 1.1.0 byte-for-byte. Timestamps alone are insufficient. |
| C-02 | README/PDF: Gemini never runs beyond 90 seconds for one question. | Deadline resets per call; follow-up rewrite and final generation each call Gemini, plus unbounded queue/retrieval/list/log overhead. 90s is not a whole-job SLA. F7. |
| C-03 | Pending always contains ready book preview. | Worker may not have completed begin/rewrite/search when wait expires: preview null is valid. F1:191,211–212. |
| C-04 | Per-researcher sessions automatically enforce user isolation. | Header user ID governs quota/logging only. Session/poll/reset accept IDs without owner checking. Express must enforce ownership itself. F1:78–97,261–331. |
| C-05 | PDF sample can pass JSON/HTTP status through unchanged and uses `req.user`. | SAMS uses `req.auth`; pass-through omits ownership, validation, deadlines, error inspection, sanitization and canonical `/api/v1/ai` paths. It is illustrative, not implementation. S1–S3. |
| C-06 | New conversation reset cancels an active job/forgets everything. | Python reset only clears existing history; no cancellation/cache/job/log purge; worker may append history afterward. Gateway idle lock and rotated IDs prevent reuse races. F1/F7. |
| C-07 | Output list never exceeds 30 books. | Narrow filters include all matching groups; 30 is the broad query config limit. No response byte cap exists upstream. F6:160–201. |
| C-08 | `book_codes[0]` is sufficient to link a RAG group to one SAMS book. | 1687 and 1896 form one tested RAG card but two UUIDs in the local map. Show ambiguous, no first-hit link. F3/S6. |
| C-09 | Service `.env.example` lists every supported name and README startup loads API settings. | API_CACHE_MAX_ITEMS and GOOGLE_API_KEY alias absent from template. API settings are constructed before engine config loads dotenv; preloading process env is required. F2/F8/F7. |
| C-10 | PDF says key mandatory and no personal data in query logs; session ID is described as encrypted in README. | Missing generation key can use extractive fallback; raw question/filter text may contain personal data. Identifiers use truncated SHA-256, not encryption. No full log anonymization/retention exists. F1/F7. |
| C-11 | PDF contains both 58 total tests and 12 API tests as current assertions. | Current source has 19 API test functions; totals/pass/evaluation claims are supplier history. None were run here; startup would load models and may write caches. |
| C-12 | A matching source/map proves current stock/catalog deployment. | Local files agree, but no DB query ran. Active targets and demo inventory provenance require separate read-only 10D verification. S4–S6. |

## Required before the actual-service portion of 10D

| ID | Item to settle / evidence | Safe interim behavior |
| --- | --- | --- |
| R-01 | Runtime owner supplies or confirms compatible prepared Python environment and offline artifacts; current checkout lacks environment/models/store. | Static/fake-upstream work only; no installs, model downloads or index builds under 10C.2. |
| R-02 | Privately provision matching service keys, local configurable origin and service epoch; never record values here. | Disabled/not-ready AI rather than open Python or browser secret. |
| R-03 | Data owner/implementer chooses custody of existing read-only crosswalk and validates active UUID/BookDetails targets in current local DB. | Pinned artifact is candidate map; no invented links, imports or migrations. Ambiguous groups need not be merged to proceed. |
| R-04 | Verify authorized free-provider mode/quota or explicitly choose extractive demonstration; no paid activation. | Return truthful fallback/notice; do not claim written Gemini response from service health. |
| R-05 | Measure fixture response sizes and local timings against proposed limits; explicitly record null-preview/uncertain-dispatch UX. | Enforce caps/fail closed; adjust adapter policy only through a reviewed contract revision, never by tuning retrieval/evaluation. |

## Deferred production decisions (not blockers for controlled local work)

| ID | Deferred decision | Why it remains separate |
| --- | --- | --- |
| P-01 | Production host, process topology, domains/TLS/internal network and free-resource feasibility | No deployment/provider purchase is selected or authorized. CPU/RAM estimates in supplier PDF are not measured capacity here. |
| P-02 | Distributed session/job ownership, shared quotas/cache, durable state and bounded worker queue | Current service process memory cannot support arbitrary replicas or reliable recovery. Redis is a README suggestion, not an installed requirement or selected paid dependency. |
| P-03 | Service instance identity, true whole-job deadline, cancellation and recovery of unknown dispatch | These require explicit upstream capabilities/operations; client AbortController cannot stop the worker. Local conservative uncertain accounting is not production orchestration. |
| P-04 | Query-log access, retention, deletion, rotation and redaction; correlation propagated by Python | Existing raw logs need policy/possibly approved upstream work. Current Express request ID is ignored by Python. No claim of erasure or encrypted transcript storage. |
| P-05 | Subjects/full-field schema and provenance, durable crosswalk, PostgreSQL ingestion/sync, catalog refresh | Preserve all 22 source fields and evaluated behavior; requires separately approved schema/ingestion work and ownership, not a 10D shortcut. |
| P-06 | Load targets, outage playbooks, monitoring/backup and secret rotation | Need measured runtime and deployment choice. Does not justify adding paid services now. |

## Audit record

10C.2 used read-only source/test/schema/archive/PDF/JSON inspection and SHA-256 checks. No service, test suite, Gemini, build_index, model download, evaluation, DB query/mutation or migration ran. Only the three requested Markdown documents were authored. Pre-existing tracked and untracked work is preserved, no branch change, staging, commit or push. Final Git/file-integrity results are reported separately with the task closeout; supplier historical pass claims remain explicitly unverified here.
