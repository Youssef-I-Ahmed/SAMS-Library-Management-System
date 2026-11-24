# Software-team handover

## Boundaries (what is real)
* **FastAPI service** (`api/`, OpenAPI in `docs/openapi.json`) is the integration surface: `/ask`, `/search`, `/records/{id}`, `/supervisors`, `/students`, `/facets/years|subjects`, `/admin/*` (CRUD, index ops, sync, audit), service-JWT auth with RBAC claims issued by *your* backend (issuer `sadat-express`, audience `sadat-rag`).
* **Streamlit** (`app.py`) is a pilot/demo UI, not the production front end.
* **Express reference gateway** (`integration/express`) exists only to contract-test the service (JWT + RBAC + Prisma + PostgreSQL). It is **not** your backend.

## `/ask` behaviour you can rely on (all deterministic, no LLM)
Exact project number (Arabic/English, any digit set) → primary-key read; counts/years/ranges/groupings → SQL; unsupported
content (abstract, findings, methodology) → truthful abstention; nonexistent ID → no match, no substitute; empty
question → `empty_question`; internal failure → `status="error"` (+ `error_kind`), never a stack trace. `AskResponse` has
`status`, `abstain_reason`, `sources`, `resolved_id`, `total_matching`. The LLM is optional and only used for open topical questions.


## Planned architecture (preserved) and what is verified
| Layer | Planned | State in this package |
|---|---|---|
| Frontend | React.js + Vite (JavaScript) | **not provided and not tested here**; Streamlit is only the demo UI. The browser never calls FastAPI directly (no CORS needed) |
| Backend | Node.js + Express.js, REST/HTTP JSON | reference gateway `integration/express` (Express 5, JWT, RBAC checks, Prisma writes). **Executed this session: 11/11 node tests pass** against a disposable PostgreSQL and the Python service (`python scripts/run_node_integration.py`). It is a reference, not the team's backend |
| Database | PostgreSQL + Prisma | integrated mode reads a read-only SQL view (`rag_projects_v`, see `docs/INTEGRATION.md`); **PostgreSQL tests executed this session: 4/4 pass** on a disposable PostgreSQL (embedded `pixeltable-pgserver`), with a Prisma-*like* table, **not the team's schema** |
| Auth / RBAC | service JWT (HS256, iss `sadat-express`, aud `sadat-rag`, scope `rag:read`/`rag:admin`, role ∈ `ADMIN_ROLES`) issued by Express | verified with the reference gateway (401/403, forged and wrong-secret tokens). The team's role model is theirs to wire |
| CORS | `CORS_ORIGINS` empty by default (server-to-server); set a comma-separated list only for browser-direct dev | implemented, covered by API tests |
| Env vars | `.env.example` (all names); Streamlit Secrets use the same names | unchanged |
| Contracts | `docs/openapi.json` + `docs/INTEGRATION.md` (request/response examples from real runs) | unchanged by this work: `/ask` gained fields `resolved_id`, `error_kind`, `warnings` (additive) and new statuses `error`; empty question → `empty_question` |

`/ask` additions to note: Arabic/English project-number questions, SQL counts and **topic+year counts** are deterministic and return `answered_from_catalog` with `sources` marked `support="listed"`; Gemini is only used for open topical questions (`docs/GEMINI.md`).

## Tested vs not tested
Tested here: Python service, SQLite, structured logic, API tests, Streamlit UI (AppTest + browser), the 4 PostgreSQL tests and the reference Express/Prisma gateway (11/11) on disposable local servers.
**Not tested:** the team's own React/Express/RBAC/Prisma code and schema, production PostgreSQL, Docker, any hosted URL. Do not treat the team's integration as proven.

## Remaining work for the team
1. Run the Express+PostgreSQL contract test in an environment with PostgreSQL.
2. Wire your RBAC roles to the service claims; decide student-name visibility per role (`HIDE_STUDENT_NAMES`, `EXPOSE_STUDENTS`).
3. Put the service behind your gateway; keep `AUTH_DISABLED=false` in production.
4. Decide the semantic-search model (the neural model could not be downloaded here; see below).
5. Optional: a `/stats` endpoint (the UI computes statistics in-process via `src/stats.py`; the API does not expose it yet).

## Privacy
The dataset contains real student and supervisor names; the academy has approved publication (project owner's statement, 2026-10-30;
the approval document is not in the repository). The code shows the names as in the approved file and does not anonymise silently;
`HIDE_STUDENT_NAMES=true` is an optional explicit switch. Decide per role (Express) who may receive student names.
