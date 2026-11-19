# Account-wide JWT revocation — prepared implementation

Status: isolated implementation and disposable PostgreSQL QA only. No existing
application-database migration or rollout is authorized.
Production Login is not implemented. Do not start the changed API against an
existing application database to test this work.

## Contract

- User.authVersion starts at 1. New HS256 access tokens require a positive integer
  `av`, UUID `sub`, matching issuer/audience, integer `iat` and `exp`, and an unexpired
  lifetime. Existing secret/issuer/audience/expiry configuration is retained.
- Missing/invalid versions and legacy JWTs are rejected; there is no fallback.
- Authentication reads User and current roles in a primary-database RepeatableRead
  transaction, rejects inactive accounts/version mismatch, and fails closed on DB
  or schema/client unavailability. JWT role claims are advisory only.
  `SET TRANSACTION READ WRITE` rejects a PostgreSQL hot-standby connection before
  principal reads; it does not itself write data. See the PostgreSQL
  [hot standby restrictions](https://www.postgresql.org/docs/current/hot-standby.html).
- `POST /api/v1/auth/logout-all` requires authentication, accepts no body fields and
  returns 204 only after the caller's conditional version increment commits. Replay
  returns 401. It never targets a body-supplied User. `/auth/me` is unchanged.
- Normal frontend Logout remains local and unchanged. This endpoint revokes all
  account sessions, not individual devices. No refresh tokens/session list exists.
- The service returns safe actor/target/reason/correlation/version context for future
  audit integration; the route does not expose it. No durable audit writer or secret
  logging is added. ADMIN-1B.4 must persist required events in the same transaction.

## Prepared PostgreSQL migration

`20261118010000_auth_version_revocation` adds the field and positive constraint.
BEFORE UPDATE guards reject decrement/reset and advance once when activation,
email or external identity changes. Display names/timestamps and no-op writes do
not invalidate sessions. An explicit increment with an identity change is coalesced.

Statement-level transition-table triggers invalidate distinct affected users after
membership insert/delete/update and assigned-role renames. Unchanged membership
sets/names do not advance versions. A shared helper locks users in UUID order.
Introducing a membership also touches its role tuple without changing its name;
this serializes concurrent renames and prevents a stale RepeatableRead rename
from missing a newly assigned user. Cascaded role-ID changes avoid recursive touches.
All changes and invalidations roll back together. Existing updated_at triggers
are left intact. Future granular permission models must add equivalent invalidation.

The signed counter is a PostgreSQL integer; exhaustion fails closed, never wraps.
Do not reuse User UUIDs, restore older counters, disable these triggers, or give
ordinary runtime identities schema-owner powers. Restoring an old database snapshot
requires a coordinated signing-key/session cutover to prevent token revival.

Revocation applies to authentication snapshots beginning after commit. An already
authenticated request is not cancelled. Stronger sensitive-write guarantees require
transactional authorization fencing in those workflows; none is claimed here.

## Isolated verification

Mocked tests cover JWT policy, current-role authorization, account-wide revocation,
concurrent conditional writes, database failures, commit confirmation and boundaries.
Mocks do not establish PostgreSQL trigger/locking guarantees.

The opt-in `apps/api/tests/auth-revocation.postgres.test.js` creates a fresh Docker
container from an already-cached `postgres:16` image (`--pull=never`). It verifies
run-specific labels, tmpfs data storage, a dedicated bridge containing only its
container, disabled inter-container communication, and an ephemeral port published
only on 127.0.0.1. Docker's internal network suppresses published ports, so a private
bridge is needed for the host-side Prisma integration; it is not an air-gapped test.
No existing container, host volume, application DATABASE_URL or .env is accepted.

Before schema operations, the suite proves the database name and empty public
schema. It applies all five actual migration SQL files in order, then the repository
PostgreSQL extensions. It generates a separate Prisma Client in an owned OS-temp
directory using installed tooling, an explicit synthetic datasource and a non-secret
child-environment allowlist. Package auto-installation is disabled; the application's
generated client is not overwritten. Two separate Node API processes exercise the
unmocked auth routes/middleware with independent real Prisma pools against this DB.

The original ten SQL checks cover constraints, activation/identity/membership/role
changes, no-ops, rollback, concurrent conditional updates, snapshot consistency and
role-ID cascades. Advisory-lock gates establish actual overlap for concurrency tests
instead of relying on sleeps. Seven additional integration checks cover the complete
schema, JWTs, revocation, current-role authorization, cross-process logout/replay,
Student Import denial and a real outage of this disposable database. Cleanup verifies
ownership before removing only the created container/network/client directory.

Enable only this suite with `SAMS_RUN_DISPOSABLE_AUTH_PG=1` and use
`--testTimeout=30000 --hookTimeout=120000`; otherwise it is skipped. No application
database is an acceptable substitute if Docker/image access fails. Migration SQL
file application is tested here; a coordinated Prisma deployment rehearsal and
production identity approval remain rollout gates.

### Disposable QA result — 2026-11-18

All 17 checks passed in a clean run: the original ten PostgreSQL checks plus seven
real Prisma/API integration checks, with no skipped tests or unhandled errors.
This includes two separate Node API processes, real commit/replay behavior, and
safe denial after stopping only the disposable database. The mocked suite was not
repeated. PostgreSQL exposed a reserved `current_role` SQL alias in the prepared
migration; it was renamed without changing the intended trigger behavior. Test
concurrency now uses advisory gates, and expected psql failure cleanup handles EOF
without an EPIPE. No application migration, deployment or production login is approved.

## Required rollout order — separate approval

1. Approve and implement verified Production Login; dev-login stays disabled there.
2. Review migration/client readiness, existing SQL guards, privileges and backups.
   Regenerate Prisma Client offline from the updated schema before using that API.
3. Run isolated PostgreSQL tests and integration tests of the generated client.
4. Coordinate all instances: drain old verifiers, apply the approved migration and
   deploy strict version-aware instances together. No legacy-verifier pool remains.
5. Require fresh login; never supply a default version for existing tokens.
6. Verify revocation across instances against the primary database without a cache.
7. Roll back only to a version-aware release, preserving counters and guards; use
   maintenance/fix-forward if necessary, never re-enable signature-only verification.

Until these gates pass, existing development databases/clients are not compatible
with the strict implementation. Use isolated fixtures; do not weaken checks to keep
an unmigrated database working. QA migration/client generation is confined to its
disposable resources; existing databases, generated clients, environment files and
deployment configuration are unchanged.

University approval remains required for identity-provider choice, roster linking,
students without university email, staff onboarding, MFA and recovery. Student
Import remains fail-closed. No production identity provider or permission model is
introduced here.
