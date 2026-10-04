# SAMS Security Baseline v1

## Scope

Sprint 8A establishes the MVP API runtime security baseline.

It is not a penetration test and does not replace production infrastructure controls.

---

# Environment guardrails

Production startup is rejected when:

```text
DEV_AUTH_ENABLED = true
```

Production also requires:

```text
AUTH_TOKEN_SECRET >= 48 characters
WEB_ORIGIN uses HTTPS
```

Development remains compatible with the current dev-login workflow.

---

# CORS

Browser requests are allowed only from:

```text
WEB_ORIGIN
```

Requests without `Origin` remain allowed for:

```text
server-to-server requests
PowerShell/CLI smoke tests
health checks
```

Disallowed browser origins receive:

```text
403 CORS_ORIGIN_DENIED
```

Credentials remain enabled for future browser auth compatibility.

Allowed request headers include:

```text
Authorization
Content-Type
Idempotency-Key
X-Request-Id
```

---

# Request correlation

Every HTTP request has:

```text
X-Request-Id
```

A safe incoming ID may be preserved.

Unsafe/malformed IDs are replaced with a generated UUID.

The same request ID is included in API error responses.

This allows client errors to be correlated with server logs without returning stack traces.

---

# Error boundary

Client-safe errors retain their explicit:

```text
HTTP status
error code
message
requestId
```

Unexpected 5xx responses return only:

```text
Unexpected server error
```

The detailed internal error is logged server-side.

Special parser errors are normalized:

```text
invalid JSON
→ 400 INVALID_JSON

oversized JSON
→ 413 PAYLOAD_TOO_LARGE
```

---

# Request body size

Default JSON body limit:

```text
2mb
```

Config:

```text
API_JSON_LIMIT
```

This protects the API from unexpectedly large JSON requests while leaving enough room for current student/import operations.

---

# HTTP headers

Helmet remains enabled.

The smoke verifies at least:

```text
X-Powered-By absent
X-Content-Type-Options = nosniff
```

---

# TRACE

HTTP TRACE is explicitly rejected:

```text
405 METHOD_NOT_ALLOWED
```

---

# Structured request logging

When:

```text
REQUEST_LOGGING=true
```

the API writes one structured JSON log line per completed request containing:

```text
event
requestId
method
path
status
durationMs
```

Query strings and request bodies are intentionally not logged by this middleware.

Tests suppress request logging automatically.

---

# Remaining infrastructure responsibilities

Before production deployment, the hosting layer should still provide:

```text
TLS termination
network/firewall controls
managed secrets
database backups
central log retention
rate limiting / WAF where appropriate
monitoring and alerting
```

Sprint 8A does not pretend these are application-code-only concerns.
