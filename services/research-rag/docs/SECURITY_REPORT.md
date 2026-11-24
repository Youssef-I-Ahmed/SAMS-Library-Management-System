# Security report

## Implemented and tested (see tests/api/test_api.py, tests/integration/test_admin_indexing.py)
| Control | Evidence |
|---|---|
| Server-side authentication on all data endpoints (service JWT: signature, `iss`, `aud`, `exp`; `alg=none` rejected) | `test_missing_or_bad_token_is_401`, `test_wrong_secret_audience_issuer_and_expiry_rejected`, `test_alg_none_token_rejected` |
| Authorization: reads need `rag:read`; every `/admin/*` route needs `rag:admin` **and** a role in `ADMIN_ROLES`; ordinary users get 403 | `test_scope_required_for_read`, `test_admin_endpoints_reject_anonymous_read_scope_and_wrong_role` (all admin routes, parametrized) |
| Admin can never be opened by `AUTH_DISABLED` or a placeholder secret | `test_admin_locked_when_secret_not_configured_even_with_auth_disabled`, `test_placeholder_secret_never_enables_admin` |
| Input validation (Pydantic): types, ranges, lengths, page size cap, exact-one-of parameters | `test_search_validation_errors`, `test_ask_validation`, student/supervisor 422 tests |
| SQL injection resistance: SQLAlchemy bound parameters; source view name validated as a plain identifier | `test_source_sync_from_external_table` (rejects `x; DROP TABLE y`) |
| Consistent error format, no stack traces to clients | `test_not_found_shapes`, `test_admin_error_responses` |
| Secrets only via environment / secrets store; `.env`, `secrets.toml`, data and DB files git-ignored and excluded from the ZIP | `.gitignore`, `.dockerignore`, ZIP scan |
| Logs contain no tokens or query text | `test_logs_do_not_contain_tokens_or_query_text` |
| CORS disabled by default | `test_no_cors_by_default` |
| Admin audit trail (actor, role, action, record, details) | `test_admin_crud_roundtrip_with_audit_and_search_visibility`; PostgreSQL test |
| LLM privacy: student names are not sent to the LLM unless `RAG_INCLUDE_STUDENTS=true` | `test_context_sent_to_llm_contains_only_retrieved_records_and_no_students` (narrow: one synthetic case; the opt-in `true` path is not tested) |
| Streamlit pilot admin: password from secrets, constant-time compare, disabled when no password is set, delete needs an explicit confirmation; friendly validation messages | `test_admin_tab_requires_password_and_can_add_record`, `test_admin_disabled_without_password`, `test_delete_requires_explicit_confirmation_in_admin_ui`, `test_student_mode_and_invalid_year_validation` |
| Read-only DB role for integrated mode; the RAG service never writes to the authoritative DB | PostgreSQL test (write attempt as the reader role fails) |
| Container runs as non-root user (`Dockerfile`) | written, **not built/tested** |

## NOT implemented / needs external setup before production
1. **TLS and network isolation** — terminate HTTPS in front of the service; keep it on a private network (infrastructure).
2. **Rate limiting / abuse protection** — not implemented in the RAG service; do it in Express or the gateway. `/ask` can cost money once an LLM key is set.
3. **Real user identity** — Express must authenticate users and mint tokens; HS256 shared secret must be generated (`openssl rand -hex 32`), stored in a secrets manager and rotated. No key-rotation mechanism is built in.
4. **Streamlit pilot** has one shared admin password and no per-user audit → pilot only.
5. **Data protection** — the dataset has student names (3,857 of 3,983 rows). The academy has approved publication (owner's statement, 2026-10-30); hosting on a third-party cloud is therefore authorised, but backups/volumes need encryption and retention rules; decide which roles may see student names (Express).
6. **LLM provider** — sending metadata to an external provider needs a policy decision; the key must live only in a secrets store.
7. **Dependency / image scanning** (pip-audit, Trivy) not run.
8. **No penetration test** was performed.
9. Known retrieval-side limitation: the answer verifier is rule-based (see EVIDENCE_POLICY.md).
