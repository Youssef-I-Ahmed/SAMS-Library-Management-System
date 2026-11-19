import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_CATALOG, PERMISSION_CATALOG_VERSION } from '../src/modules/authorization/permission-catalog.js';
import { assertPermissionCatalogConsistency, loadPermissionPrincipalSnapshot } from '../src/modules/authorization/permission-storage.js';
import { planCompatibilityGrants } from '../src/modules/authorization/permission-baseline.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';
const principal = (id, roles, extra = {}) => ({ id, roles, isActive: true, isProtected: false, ...extra });
const rows = () => Object.values(PERMISSION_CATALOG).map(policy => ({ permission_key: policy.key,
  eligible_roles: [...policy.eligibleRoles], allowed_scopes: [...policy.scopes], classification: policy.classification,
  delegable: policy.delegable, operation_status: policy.operationStatus, ordinary_grants: policy.ordinaryGrants,
  delegation_roles: [...policy.delegationRoles], global_covers_branch: policy.globalCoversBranch }));

describe('review-only compatibility planning', () => {
  it('plans 20 existing Librarian and 7 Management USE/GLOBAL grants; Student ownership remains separate', () => {
    const plan = planCompatibilityGrants([principal(ID, ['LIBRARIAN']), principal(OTHER, ['MANAGEMENT']), principal(THIRD, ['STUDENT'])]);
    expect(plan.apply).toBe(false);
    expect(plan.grants.filter(grant => grant.userId === ID)).toHaveLength(20);
    expect(plan.grants.filter(grant => grant.userId === OTHER)).toHaveLength(7);
    expect(plan.grants.filter(grant => grant.userId === THIRD)).toHaveLength(0);
    expect(plan.studentOwnershipRules).toBe('UNCHANGED');
    expect(plan.grants.every(grant => grant.kind === 'USE' && grant.scope === 'GLOBAL' && grant.branchId === null
      && PERMISSION_CATALOG[grant.permissionKey].operationStatus === 'EXISTING'
      && PERMISSION_CATALOG[grant.permissionKey].ordinaryGrants)).toBe(true);
    expect(plan.grants.every(grant => !('grantedByUserId' in grant))).toBe(true);
  });
  it('unions known multi-role access without duplicate grants and flags it for review', () => {
    const first = planCompatibilityGrants([principal(ID, ['LIBRARIAN', 'MANAGEMENT', 'STUDENT'])]);
    const reordered = planCompatibilityGrants([principal(ID, ['STUDENT', 'MANAGEMENT', 'LIBRARIAN'])]);
    expect(first).toEqual(reordered);
    expect(first.grants).toHaveLength(20);
    expect(new Set(first.grants.map(grant => grant.permissionKey)).size).toBe(20);
    expect(first.review[0].reason).toBe('MULTI_ROLE_BASELINE_REQUIRES_REVIEW');
  });
  it('does not automatically plan inactive, protected or unknown-role identities', () => {
    const plan = planCompatibilityGrants([principal(ID, ['LIBRARIAN'], { isActive: false }),
      principal(OTHER, ['MANAGEMENT'], { isProtected: true }), principal(THIRD, ['LIBRARIAN', 'UNKNOWN'])]);
    expect(plan.grants).toEqual([]); expect(plan.review).toHaveLength(3);
  });
  it('rejects ambiguous identities and leaves frozen inputs unchanged', () => {
    expect(() => planCompatibilityGrants([principal(ID, ['LIBRARIAN']), principal(ID, ['MANAGEMENT'])])).toThrow();
    expect(() => planCompatibilityGrants([principal('bad', ['LIBRARIAN'])])).toThrow();
    const value = Object.freeze([Object.freeze(principal(ID, Object.freeze(['LIBRARIAN'])))]);
    expect(planCompatibilityGrants(value)).toEqual(planCompatibilityGrants(value));
  });
});

describe('closed code-to-database catalog consistency', () => {
  it('accepts only an identical version and semantic snapshot, independent of row order', () => {
    expect(() => assertPermissionCatalogConsistency(rows().reverse(), PERMISSION_CATALOG_VERSION)).not.toThrow();
  });
  it.each(['permission_key', 'eligible_roles', 'allowed_scopes', 'classification', 'delegable', 'operation_status', 'ordinary_grants', 'delegation_roles', 'global_covers_branch'])(
    'rejects drift in %s', field => {
      const changed = rows(); changed[0][field] = Array.isArray(changed[0][field]) ? ['INVALID']
        : typeof changed[0][field] === 'boolean' ? !changed[0][field] : 'INVALID';
      expect(() => assertPermissionCatalogConsistency(changed, PERMISSION_CATALOG_VERSION)).toThrow();
    }
  );
  it('rejects missing/duplicate definitions, malformed records and version drift', () => {
    for (const value of [[], [...rows(), rows()[0]], null, [{}]]) {
      expect(() => assertPermissionCatalogConsistency(value, PERMISSION_CATALOG_VERSION)).toThrow();
    }
    expect(() => assertPermissionCatalogConsistency(rows(), PERMISSION_CATALOG_VERSION + 1)).toThrow();
  });
});

describe('unused permission principal data loader', () => {
  const setup = () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ version: PERMISSION_CATALOG_VERSION }]).mockResolvedValueOnce(rows()),
      authorizationControl: { findUnique: vi.fn().mockResolvedValue({ bootstrapCompleted: false, revision: 1 }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: ID, isActive: true, isProtected: false, authVersion: 2,
        userRoles: [{ role: { name: 'LIBRARIAN' } }], permissionGrants: [] }) } };
    const db = { $transaction: vi.fn(async work => work(tx)) };
    return { db, tx };
  };
  it('uses one primary RepeatableRead snapshot and does not manufacture authentication or grant defaults', async () => {
    const { db, tx } = setup(); const snapshot = await loadPermissionPrincipalSnapshot(db, ID);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(tx.$executeRaw.mock.calls[0][0][0]).toBe('SET TRANSACTION READ WRITE');
    expect(snapshot.principal).not.toHaveProperty('isAuthenticated');
    expect(snapshot.grants).toEqual([]);
    expect(snapshot.principal.roles).toEqual(['LIBRARIAN']);
  });
  it('does not expose database exceptions or silently fall back to roles', async () => {
    const { db, tx } = setup(); tx.user.findUnique.mockRejectedValue(new Error('Fixture connection detail'));
    await expect(loadPermissionPrincipalSnapshot(db, ID)).rejects.toMatchObject({ statusCode: 503,
      code: 'AUTHORIZATION_POLICY_UNAVAILABLE', message: 'Authorization policy is temporarily unavailable' });
  });
  it('rejects invalid identity before touching any database', async () => {
    const { db } = setup(); await expect(loadPermissionPrincipalSnapshot(db, 'invalid')).rejects.toMatchObject({ statusCode: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects missing control and invalid version data', async () => {
    let { db, tx } = setup(); tx.authorizationControl.findUnique.mockResolvedValue(null);
    await expect(loadPermissionPrincipalSnapshot(db, ID)).rejects.toMatchObject({ statusCode: 503 });
    ({ db, tx } = setup()); tx.user.findUnique.mockResolvedValue({ id: ID, isActive: true, authVersion: undefined });
    await expect(loadPermissionPrincipalSnapshot(db, ID)).rejects.toMatchObject({ statusCode: 503 });
  });
});
