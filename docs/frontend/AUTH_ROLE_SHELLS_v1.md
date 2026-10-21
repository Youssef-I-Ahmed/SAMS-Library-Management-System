# SAMS Frontend Authentication & Role Shells v1

**Sprint:** 9B

## Development authentication

The current frontend integrates with:

```text
POST /api/v1/auth/dev-login
GET  /api/v1/auth/me
```

Development accounts:

```text
student@sams.dev
librarian@sams.dev
management@sams.dev
```

This login surface is development-only.

Before production:

```text
DEV_AUTH_ENABLED=false
```

and the entry authentication step must be replaced with the approved university authentication/SSO integration.

## Session behavior

The development access token is stored in `sessionStorage` using:

```text
sams.devAccessToken
```

This restores the session after refresh in the current browser tab without creating a persistent cross-session token.

## Role destinations

```text
STUDENT    -> /student
LIBRARIAN  -> /librarian
MANAGEMENT -> /management
```

Frontend guards are for UX. Backend RBAC remains the authorization source of truth.

## Branding / language / theme

Every shell reuses Sprint 9A:

```text
English / Arabic
LTR / RTL
Light / Dark
surface-aware SAMS branding
```

The dark staff sidebar always uses the white SAMS full logo regardless of the global theme.
