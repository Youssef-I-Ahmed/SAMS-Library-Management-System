# Permission storage foundation — ADMIN-1B.3B.2

Prepared infrastructure, not a permission-enforcement cutover. Existing role guards,
JWT claims and Student Import's fail-closed policy remain unchanged. No grants,
protected users or custodians are provisioned by this migration.

## Storage and consistency

`20261118020000_permission_storage` adds `User.isProtected` (false), the singleton
`AuthorizationControl` (bootstrap incomplete), and `PermissionGrant`. Grants have a
UUID, restricted target/grantor/optional branch foreign keys, a closed catalog key,
USE/DELEGATE kind, GLOBAL/BRANCH scope, timestamp, justification and positive version.
Deletion is revocation; there is no soft-deleted grant or role inheritance table.

Partial unique indexes distinguish GLOBAL identities from per-branch identities.
CHECK constraints enforce scope/branch shape and catalog-approved kinds/scopes.
Unknown keys, wildcards, self-issued grants and every `students.master.import`
grant are rejected. Ordinary grant storage does not establish permission usage or
prove a grantor's delegation ceiling; future audited administration must enforce
those rules transactionally. Runtime authorization does not consume these rows.

The migration contains a fixed catalog-v1 SQL snapshot. The focused consistency
check compares every definition field and version with the 32-key JS catalog.
The unused snapshot loader also refuses catalog drift or unavailable storage with
a generic 503. It accepts an explicit client, uses a primary READ WRITE,
RepeatableRead transaction, and returns roles, authVersion and grants together.
It does not authenticate its caller or create an authenticated principal.

## Revocation and concurrency

Grant insertion/deletion and meaningful edits atomically increment affected users'
authVersion; reassignment increments both users. Statement-level transition tables
deduplicate users. Identity/timestamp are immutable; meaningful edits advance the
grant version by exactly one. Callers must include the expected version in their
mutation predicate and handle a conflict; automatic versioning alone is not an
optimistic concurrency check. No-op edits change neither version nor authVersion.
Justification and issuer changes count as meaningful edits.

Protection changes invalidate the affected user. Bootstrap completion invalidates
protected users. Control revision changes alone do not invalidate JWTs. Existing
identity, activation, membership and role-name revocation triggers are retained;
the previously validated authVersion migration is unchanged. All changes and
version increments roll back together.

Security-sensitive statements update the singleton revision before changing rows.
This serializes competing administrative changes, including changes to different
users, and forces stale RepeatableRead writers to retry rather than validate an
old custodian snapshot. It is intentionally a global write bottleneck; future
administration must use short transactions, bounded retries for serialization or
deadlock errors, and deterministic lock ordering. Never retry uncertain writes
blindly. Revision/authVersion overflow fails closed and requires reviewed recovery.

## Protected bootstrap remains unavailable

Protected maintenance requires membership of the PostgreSQL maintenance group
`sams_authorization_bootstrap_operator`. The migration does **not** create that
group or grant membership. This is a future database-operator prerequisite, not
an application role or a SUPER_ADMIN account. Synthetic tests create it only in
their disposable cluster.

Protected account changes, DELEGATE grants, `permissions.delegate`, and protected
keys cannot be maintained by an ordinary database session. Such grants require
an active protected MANAGEMENT target and a distinct protected issuer. Student
master import remains ungrantable even through this maintenance path.

Once explicit bootstrap completes, deferred constraints require at least one
active protected MANAGEMENT principal with GLOBAL USE
`permissions.protected.manage`. Account status/protection changes, membership or
role changes and grant removal cannot remove the final qualifying principal.
The singleton cannot be deleted or reset; TRUNCATE bypasses are rejected.

Activation requires separate approval of verified custodians, durable audit
logging, strong identity verification/recovery and a reviewed maintenance process.
Application database credentials must be non-owner, non-superuser, unable to
assume this group, change trigger/function definitions or disable constraints.
Database owners/superusers can alter DDL and remain outside this threat boundary.
No production bootstrap runner or assignment endpoint is provided here. Future
bootstrap must use one locked, audited transaction to establish reviewed
custodians and their cross-issued grants before completing the singleton flag.

## Compatibility plan — dry run only

`planCompatibilityGrants()` is a pure projection with `apply: false`; it cannot
read a database or execute changes. Only EXISTING ordinary catalog permissions
become GLOBAL USE candidates:

| Existing roles | Candidate grants | Treatment |
| --- | ---: | --- |
| STUDENT | 0 | Existing discovery/ownership access stays unchanged |
| LIBRARIAN | 20 | Existing global operational access |
| MANAGEMENT | 7 | Existing global reporting/read access |
| LIBRARIAN + MANAGEMENT | 20 | Deduplicated union, mandatory review |

Other known multi-role combinations also use a deduplicated union and require
review. Inactive, protected or unknown-role identities are excluded for review.
Future permissions, delegation, staff administration, bulk import/export,
audit/security access and trusted Student import are never baseline grants.
No grantor is guessed. A future cutover needs an approved distinct issuer,
per-user diff/endpoint coverage review, special-identity resolution and durable
audit. Materialize and validate approved baselines before switching guards;
coordinate instances and require fresh login. Do not add a runtime role fallback
or permit a partial bootstrap to lock users out.

## Future policy changes and rollout

Do not edit the catalog snapshot in an applied migration. Add a new migration,
advance the catalog version, update/revalidate stored grant constraints, and
increment authVersion for all affected principals in the same reviewed change.
Eligibility, delegation and scope semantic changes need revocation even if rows
are unchanged. Coordinate API versions, reject drift and require fresh login.

This migration was prepared for isolated validation only. Existing-environment
application, DB privilege review, production login, deployment and bootstrap need
separate approval. Before permission enforcement: audit foundations, reviewed
cutover coverage, fail-closed snapshot integration and disposable concurrency
tests. ADMIN-1B.3B.3 should review those prerequisites and the inactive storage
boundary; permission delegation stays unavailable until audit and custodianship
are approved.
