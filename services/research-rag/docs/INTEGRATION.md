# Integration contract & API reference — React/Vite · Express · PostgreSQL/Prisma · RAG service

```
React (Vite) ──HTTPS──> Express ──service JWT (private network)──> FastAPI RAG service
                           │                                            │ read-only
                           └── Prisma ──> PostgreSQL (AUTHORITATIVE) <──┘ view rag_projects_v
```
* **PostgreSQL stays the only source of truth.** The RAG service keeps a derived search copy + embeddings and never writes to the source. In `RAG_MODE=integrated`, admin record CRUD on the RAG service returns `409 records_managed_externally`.
* The browser never calls FastAPI (no CORS needed; `CORS_ORIGINS` empty). Express authenticates the user, enforces RBAC, then calls FastAPI with a short-lived service token.
* Run FastAPI on a private network behind TLS. Interactive docs: `GET /docs`; machine-readable: `GET /openapi.json` (snapshot in `docs/openapi.json`).
* Tested here: every route below against the real dataset via a live server (examples are real outputs, trimmed), **and the whole chain with a REFERENCE Express gateway** (`integration/express`, 11 node tests: login/RBAC, Prisma writes into PostgreSQL, service JWT, sync, complete author lists vs the Excel oracle). **Not tested:** the software team's own Express/Prisma code and schema, a React/Vite client, and a production PostgreSQL (a throw-away PostgreSQL 18 was used, see TEST_REPORT.md).

## 1. Read-only view (agree column mapping with the Prisma schema owner)
```sql
CREATE OR REPLACE VIEW rag_projects_v AS
SELECT book_code::text AS record_id, title, students, supervisors,
       publishing_date::text AS year, call_num AS call_number,
       extent, dimension, subjects_all AS subjects
FROM   projects;   -- ← REPLACE table/column names with the real Prisma ones
CREATE ROLE rag_reader LOGIN PASSWORD '…';  GRANT SELECT ON rag_projects_v TO rag_reader;
```
`students`, `supervisors`, `subjects` may be `text[]` (Prisma `String[]`) **or** one `|`-separated string; both are tested on PostgreSQL. Set `SOURCE_DATABASE_URL=postgresql+psycopg://rag_reader:…@host/db`, `SOURCE_TABLE=rag_projects_v`, `RAG_MODE=integrated`.

## 2. Authentication & authorization
Express mints a service JWT per call (HS256, ≤ 600 s, claims `iss`, `aud`, `sub`, `role`, `scope`, `iat`, `exp`):
```js
import jwt from "jsonwebtoken";
export const ragToken = (user) => jwt.sign(
  { sub: String(user.id), role: user.role, scope: ["ADMIN","LIBRARIAN"].includes(user.role) ? "rag:read rag:admin" : "rag:read" },
  process.env.SERVICE_JWT_SECRET,
  { algorithm: "HS256", issuer: "sadat-express", audience: "sadat-rag", expiresIn: 300 });
```
FastAPI verifies signature/iss/aud/exp (rejects `alg=none`), requires scope `rag:read` for reads and `rag:admin` **and** `role ∈ ADMIN_ROLES` for `/admin/*`. For local tests: `python scripts/make_token.py [--admin]`.

| Status | `error.code` | Meaning |
|---|---|---|
| 401 | `unauthorized` | missing/invalid/expired token |
| 403 | `forbidden` | missing scope or role |
| 404 | `record_not_found`, `supervisor_not_found`, `student_not_found` | unknown id/key |
| 413 | `payload_too_large` | import file above `MAX_UPLOAD_MB` |
| 409 | `records_managed_externally`, `conflict`, `not_integrated_mode` | mode/ID conflicts |
| 422 | `validation_error` | bad parameters/body (`details[].field`, `message`) |
| 503 | (readiness body) | `/ready` while the index is not loaded |
All errors: `{"error":{"code","message","details":[],"request_id"}}`; `X-Request-ID` header is returned on every response.

## 3. Endpoints
All examples assume `T=$(python scripts/make_token.py)` and `A=$(python scripts/make_token.py --admin)`, base `http://localhost:8000`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness `{"status":"ok","version":…}` |
| `GET /ready` | none | readiness (503 until index loaded): checks `database, index_loaded, embeddings_complete, llm_configured, auth_configured` |
| `GET /search` | read | search (see below) |
| `GET /supervisors` | read | distinct supervisors + counts; `q` partial name; `page`, `page_size≤100` |
| `GET /supervisors/records` | read | **complete** paginated records of one supervisor: exactly one of `name` / `key`; `include_partial`; `sort`; `page`; `page_size≤100`; 404 for unknown `key` |
| `GET /students` | read | distinct students + counts (names never merged); `q` partial name |
| `GET /students/records` | read | **complete** paginated records of one student: exactly one of `name` / `key`; same options; 404 `student_not_found` for unknown `key` |
| `GET /records/{record_id}` | read | record detail incl. `students`, `supervisors`, `data_quality_flags`, `possible_duplicates` |
| `GET /facets/subjects`, `GET /facets/years` | read | filter values with counts |
| `POST /ask` | read | grounded answer or explicit abstention (body `{"question": "…"}`) |
| `POST /admin/records` | admin | create (standalone mode); `record_id` optional; `?reject_duplicates=true` |
| `PUT /admin/records/{record_id}` | admin | replace |
| `PATCH /admin/records/{record_id}` | admin | partial update |
| `DELETE /admin/records/{record_id}` | admin | delete (the UI must ask for confirmation first) |
| `POST /admin/import` | admin | validated Excel import (standalone mode): raw `.xlsx` bytes as the request body (`Content-Type: application/octet-stream`); `?apply=false` (default) = dry run report; `?apply=true` applies; `filename` must end in `.xlsx`; limits `MAX_UPLOAD_MB` (413) and `MAX_IMPORT_ROWS` (422); never deletes records absent from the file; report has counts/ids only |
| `GET /admin/index/status` | admin | counts, models, last rebuild/sync, errors |
| `POST /admin/index/verify` | admin | consistency check (DB ↔ indexes ↔ embeddings) |
| `POST /admin/index/reindex?scope=pending\|full` | admin | repair: embed missing / rebuild everything from the store (or the source in integrated mode) |
| `POST /admin/sync` | admin | integrated mode: reconcile the whole view |
| `POST /admin/sync/records/{record_id}` | admin | integrated mode: re-read one record after a Prisma commit |
| `GET /admin/audit?limit=` | admin | admin audit trail |

### `GET /search`
`q` (≤500), `mode` = `auto|all|title|supervisor|student|subject|keyword|semantic|hybrid` (default `auto`), filters `year`, `year_from`, `year_to`, `subject`, `supervisor`, `supervisor_key`, `student`, `student_key`, `call_number_prefix`, `language=ar|en|mixed`; `sort=relevance|year_desc|year_asc|title|record_id`; `page≥1`; `page_size` (capped by `MAX_PAGE_SIZE`); `fuzzy` (title mode, labelled approximate); `supervisor_match=auto|exact|partial`.
* `title|supervisor|student|subject` are **structured and exhaustive**: `exhaustive:true`, `total` = all matches, paging yields all of them once.
* `keyword|semantic|hybrid` (and the ranked tail of `auto`) are **not exhaustive** (`exhaustive:false`, ≤ `CANDIDATE_POOL`) — never present them as a complete list.
* Filters are applied before ranking. Empty `q` + filters = browse.
* `hits[].match_type`: `exact|partial|approximate|lexical|semantic|hybrid`.

Real example — all records of a supervisor (63 records; `page_size=1` shown):
```bash
curl -G -H "Authorization: Bearer $T" http://localhost:8000/supervisors/records \
     --data-urlencode "name=عمرو عبد المجيد غنايم" --data-urlencode page_size=1
```
```json
{"query":"عمرو عبد المجيد غنايم","mode_requested":"supervisor","strategy":["structured_supervisor"],
 "exhaustive":true,"total":63,"page":1,"page_size":1,"total_pages":63,"sort":"year_desc","notes":[],
 "supervisor_resolution":{"status":"exact","query_key":"…","matched":[{"key":"…","name":"…","record_count":63}],
                          "similar_not_merged":[],"note":null},
 "student_resolution":null,
 "hits":[{"record_id":"2728","title":"…","year":2016,"supervisors":["…"],"subjects":["موارد بشرية"],"call_number":"658.3",
          "language":"ar","match_type":"exact","matched_field":"supervisor","matched_supervisor":"…","matched_student":null,
          "students":["…"],"score":1.0,"scores":{}}]}
```
`supervisor_resolution.status` / `student_resolution.status`: `exact`, `partial`, `ambiguous_partial` (several people match a partial name: each is listed with its own `record_count`; choose one and re-query with `key`), `none`. `similar_not_merged` lists spelling-similar *different* names — they are never merged automatically.

Students (names redacted):
```bash
curl -G -H "Authorization: Bearer $T" http://localhost:8000/students --data-urlencode "q=…" --data-urlencode page_size=2
# {"total":1,"page":1,"page_size":2,"total_pages":1,"items":[{"key":"<normalised name>","name":"…","record_count":1}]}
curl -G -H "Authorization: Bearer $T" http://localhost:8000/students/records --data-urlencode "key=<key>"   # all records of that student
```

### `POST /search` (JSON body, same engine and results as `GET /search`)
Fields mirror the query parameters of `GET /search` (`q`, `mode`, `year`, `year_from`, `year_to`, `subject`, `supervisor`, `student`, `call_number_prefix`, `language`, `sort`, `page`, `page_size`, `fuzzy`, …). See `docs/BACKEND_HANDOFF.md`.

### `POST /ask`
```bash
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" http://localhost:8000/ask \
     -d '{"question":"ما نتائج دراسة «Internet Security»؟"}'
```
```json
{"question":"…","language":"ar","status":"abstained","abstain_reason":"content_not_available",
 "answer":"لا تحتوي السجلات المتاحة على معلومات كافية للإجابة بشكل موثوق: نتائج البحث غير متوفرة …",
 "generated_by":"policy","sources":[],"retrieved":[{"ref":"R1","record_id":"809","title":"Internet Security","year":2005,"support":"listed"}],
 "citations_valid":true, "…":"see /openapi.json AskResponse"}
```
`status`: `ok`, `answered_from_catalog`, `abstained` (`abstain_reason`: `no_results|insufficient_evidence|content_not_available|record_not_found`), `llm_unavailable`, `llm_error`, `answer_withheld`. `generated_by`: `llm` | `policy` (deterministic, from fields). Always show `sources`/`retrieved` and distinguish `generated_by=llm` from direct search results in the UI. Policy details: EVIDENCE_POLICY.md.

### Errors (real outputs)
```
GET /records/NOPE                  → 404 {"error":{"code":"record_not_found","message":"record 'NOPE' not found","details":[],"request_id":"…"}}
GET /search?year=abc               → 422 {"error":{"code":"validation_error","message":"Request validation failed","details":[{"field":"query.year","message":"Input should be a valid integer, unable to parse string as an integer"}],…}}
DELETE /admin/records/1 (read token) → 403 {"error":{"code":"forbidden","message":"Missing scope rag:admin",…}}
POST /admin/sync (standalone mode) → 409 {"error":{"code":"not_integrated_mode","message":"RAG_MODE is not 'integrated'",…}}
```

### Admin
```bash
# validate an Excel file first (dry run), then apply
curl -X POST -H "Authorization: Bearer $A" -H "Content-Type: application/octet-stream" --data-binary @new_records.xlsx "http://localhost:8000/admin/import"
curl -X POST -H "Authorization: Bearer $A" -H "Content-Type: application/octet-stream" --data-binary @new_records.xlsx "http://localhost:8000/admin/import?apply=true&filename=new_records.xlsx"
# {"applied":false,"rows_in_file":2,"valid_records":2,"new":2,"changed":0,"unchanged":0,"rejected":[],"rejected_count":0,"note":"Records not present in the file are never deleted by an import.",…}
```
```bash
curl -X POST -H "Authorization: Bearer $A" -H "Content-Type: application/json" http://localhost:8000/admin/records \
     -d '{"title":"…","supervisors":["…"],"students":["…"],"year":2024,"subjects":["بنوك"]}'
# 201 {"record_id":"4164","operation":"created","embedding":"indexed","possible_duplicates":[],"record":{…}}
curl -X DELETE -H "Authorization: Bearer $A" http://localhost:8000/admin/records/4164     # {"record_id":"4164","deleted":true}
curl -X POST   -H "Authorization: Bearer $A" "http://localhost:8000/admin/index/reindex?scope=pending"   # {"scope":"pending","embedded":0}
```
Possible duplicates are reported, never deleted. If embedding fails, the record is still saved and searchable by keyword/structured search (`"embedding":"pending"`); `reindex?scope=pending` retries.

## 4. Keeping the index in sync (integrated mode)
After Prisma commits a create/update/delete, Express calls `POST /admin/sync/records/{id}`; a periodic `POST /admin/sync` (e.g. nightly) reconciles everything, including missed events. **Open decision:** per-record call vs. `LISTEN/NOTIFY` vs. a queue.

## 5. Responsibility split
| Concern | Owner |
|---|---|
| Users, login, RBAC, rate limiting, audit of user actions | Express/Prisma |
| Record authoring (authoritative) | PostgreSQL via Prisma |
| Search, retrieval, embeddings, evidence policy, RAG | FastAPI |
| UI (final) | React — the Streamlit app is a pilot only |

Student names are returned by the API (record detail and `students`). Express must decide per role whether to forward them to the browser.

## 6. Open questions for the software team
1. Real Prisma table/column names → finalize the view (and confirm `String[]` vs delimited text).
2. `record_id` = `BOOK_CODE` (3 ids non-numeric, e.g. `ب908`): confirm stable and unique.
3. Update-notification mechanism (§4).
4. Roles that may see student names; role names for `ADMIN_ROLES`.
5. LLM provider/key owner and whether any record metadata may leave the network.
6. Confirm the 12 similar supervisor-name pairs and 4 suspect years with librarians.


## Modes and JSON contracts: retrieval-only vs LLM, lexical vs semantic

`GET /ready` always says which modes are really active (real output, retrieval-only + hashing build):
```json
{"status":"ready","checks":{"database":true,"index_loaded":true,"embeddings_complete":true,"llm_configured":false,"auth_configured":true},
 "retrieval_only":true,"llm_provider":"none",
 "embedding":{"requested_backend":"hashing","active_backend":"hashing","model_id":"hashing-v1-d1024","semantic":false,"cross_lingual":false,
              "fallback_reason":null,"model_source":null,"note":"Offline lexical-fuzzy mode … NOT semantic and NOT cross-lingual …"},
 "records":3983,"pending_embeddings":0}
```
With a neural model: `"semantic":true,"cross_lingual":true,"active_backend":"sentence-transformers","model_source":"local_path|hub"`.
If the neural model cannot be loaded the service still starts in hashing mode and `fallback_reason` explains why.

| `/search` `mode` | Technique | Complete list? |
|---|---|---|
| `supervisor`, `student`, `title` (exact/partial), `subject` | structured/lexical, filters before ranking | **yes** (`exhaustive:true`, lossless pages) |
| `keyword` | BM25 | no (top candidates, `exhaustive:false`) |
| `semantic` | dense cosine over embeddings (cross-lingual **only** when `/ready.embedding.semantic` is true) | no |
| `hybrid`, `auto` (topic queries) | BM25 + dense fused with RRF | no; exact title/name tiers are placed first and kept complete |

`POST /ask` response (real output in retrieval-only mode, excerpted):
```json
{"question":"ما هي المشروعات المتعلقة بالتسويق الإلكتروني؟","language":"ar","status":"llm_unavailable","abstain_reason":null,
 "answer":"عثرت على 4+ سجل(ات) تتضمن عناوينها أو تخصصاتها مصطلحات سؤالك. هذه قائمة بالسجلات فقط؛ محتوى هذه الأبحاث غير متوفر في مجموعة البيانات.",
 "generated_by":"catalog",
 "sources":[{"ref":"R1","record_id":"1731","title":"استخدامات التسويق الالكترونى لزيادة الكفاءة التسويقية للمشروعات","year":2011,
             "supervisors":["…"],"subjects":["تسويق وتجارة إلكترونية"],"call_number":"658.8","support":"explicit",
             "support_reason":"3/3 distinctive question terms occur in the record's title/subject","cited":false}],
 "retrieved":["same shape as sources"],"warnings":["The language model is not configured, so the system is running in retrieval-only mode. … Showing the verified catalogue listing instead."],
 "evidence":{"explicit_in_records":["1731","…"],"uncertain":[],"unavailable_from_dataset":[],"verification_problems":[]}}
```
* `generated_by:"catalog"|"policy"` = built deterministically from record fields (no LLM). `generated_by:"llm"` appears **only** when a configured model produced the text and every citation `[R#]` was verified against `sources` (`cited:true`, `citations_valid:true`); on any failure the response falls back to the catalogue list with a warning and `status` = `llm_error` / `llm_unavailable` / `answer_withheld`. The LLM only sees records whose support is `explicit` and is told to use nothing else.
* Configure the model with `LLM_PROVIDER` (`gemini|openai|anthropic`), `LLM_MODEL`, `LLM_API_KEY` (+ optional `LLM_BASE_URL`, `LLM_TIMEOUT_S`) from the environment/secret store only. A live call has **not** been tested (no key available); run `python scripts/llm_smoke.py` once a key is set.
