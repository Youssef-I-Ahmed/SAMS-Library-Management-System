import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_CATALOG, PERMISSION_CATALOG_VERSION, getPermissionDefinition } from '../src/modules/authorization/permission-catalog.js';
import { evaluatePermission } from '../src/modules/authorization/permission.service.js';

// Any accidental database dependency in this pure layer fails before construction.
vi.mock('../src/config/prisma.js', () => { throw new Error('Permission evaluation must not load a database'); });

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const global = () => ({ type: 'GLOBAL' });
const branch = branchId => ({ type: 'BRANCH', branchId });
const principal = (roles = ['LIBRARIAN']) => ({ id: USER, isAuthenticated: true, isActive: true, roles });
const grant = (permission = 'catalog.update', kind = 'USE', scope = global()) => ({ userId: USER, permission, kind, scope });
const input = (overrides = {}) => ({ principal: principal(), permission: 'catalog.update', action: 'USE',
  scope: global(), grants: [grant()], ...overrides });
const allowed = overrides => evaluatePermission(input(overrides)).allowed;

describe('closed immutable permission catalog', () => {
  const keys = ['catalog.create', 'catalog.update', 'catalog.archive', 'catalog.restore', 'catalog.read_inactive',
    'catalog.reference.manage', 'master_data.manage', 'inventory.read', 'inventory.copies.manage', 'catalog.import',
    'catalog.export', 'students.directory.read', 'students.access.manage', 'students.master.import', 'students.export',
    'borrowings.read', 'reservations.read', 'visits.read', 'circulation.checkout', 'circulation.return', 'reservations.cancel',
    'reservations.expire', 'visits.check_in', 'visits.check_out', 'analytics.read', 'staff.librarian.create',
    'staff.librarian.deactivate', 'permissions.delegate', 'audit.operational.read', 'security.events.read',
    'permissions.protected.manage', 'system.admin'];
  it('contains exactly the reviewed identifiers and metadata with no wildcard or default grants', () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(1);
    expect(Object.keys(PERMISSION_CATALOG).sort()).toEqual(keys.sort());
    for (const [key, policy] of Object.entries(PERMISSION_CATALOG)) {
      expect(policy.key).toBe(key);
      expect(['ORDINARY', 'SENSITIVE', 'PROTECTED']).toContain(policy.classification);
      expect(['EXISTING', 'FUTURE_ONLY']).toContain(policy.operationStatus);
      expect(policy.eligibleRoles.every(role => ['STUDENT', 'LIBRARIAN', 'MANAGEMENT'].includes(role))).toBe(true);
      expect(policy.scopes.every(scope => ['GLOBAL', 'BRANCH'].includes(scope))).toBe(true);
      expect(policy).not.toHaveProperty('defaultGrants');
      expect(policy.key).not.toContain('*');
    }
  });
  it('cannot be mutated through exported objects, nested arrays or policy lookup', () => {
    expect(Object.isFrozen(PERMISSION_CATALOG)).toBe(true);
    for (const policy of Object.values(PERMISSION_CATALOG)) {
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.eligibleRoles)).toBe(true);
      expect(Object.isFrozen(policy.scopes)).toBe(true);
      expect(Object.isFrozen(policy.delegationRoles)).toBe(true);
    }
    expect(() => { getPermissionDefinition('catalog.update').eligibleRoles.push('MANAGEMENT'); }).toThrow();
  });
  it.each(['*', 'catalog.*', 'constructor', '__proto__', 'toString', 'catalog.update ', '', null, 1])('rejects unknown key %j', key => {
    expect(getPermissionDefinition(key)).toBe(null);
    expect(allowed({ permission: key })).toBe(false);
  });
});

describe('explicit usage and role eligibility', () => {
  it('allows an eligible active principal only with its explicit matching USE grant', () => {
    expect(allowed()).toBe(true);
    expect(allowed({ grants: [] })).toBe(false);
    expect(allowed({ principal: principal(['MANAGEMENT']) })).toBe(false);
    expect(allowed({ principal: principal(['STUDENT']) })).toBe(false);
    expect(allowed({ grants: [{ ...grant(), userId: OTHER }] })).toBe(false);
  });
  it('does not let multiple roles, permission-like flags or a DELEGATE grant substitute for USE', () => {
    expect(allowed({ principal: principal(['STUDENT', 'LIBRARIAN', 'MANAGEMENT']), grants: [] })).toBe(false);
    expect(allowed({ principal: principal(['LIBRARIAN', 'MANAGEMENT']) })).toBe(true);
    expect(allowed({ principal: { ...principal(['MANAGEMENT']), isProtected: true, permissions: ['catalog.update'] } })).toBe(false);
    expect(allowed({ grants: [grant('catalog.update', 'DELEGATE')] })).toBe(false);
  });
  it.each([
    null, {}, { ...principal(), isAuthenticated: false }, { ...principal(), isActive: false },
    { ...principal(), isAuthenticated: 'true' }, { ...principal(), id: 'invalid' },
    principal(['SUPER_ADMIN']), principal(['LIBRARIAN', 'UNKNOWN']), principal(['LIBRARIAN', 'LIBRARIAN']),
    principal(new Array(1)), principal('LIBRARIAN')
  ])('denies malformed or unauthenticated principal (%#)', value => {
    expect(allowed({ principal: value })).toBe(false);
  });
  it('gives future operations no automatic grants while permitting explicit modeled USE where eligible', () => {
    const request = { principal: principal(['MANAGEMENT']), permission: 'staff.librarian.create' };
    expect(allowed({ ...request, grants: [] })).toBe(false);
    expect(allowed({ ...request, grants: [grant(request.permission)] })).toBe(true);
    expect(allowed({ ...request, principal: principal(['LIBRARIAN']), grants: [grant(request.permission)] })).toBe(false);
    // A modeled allow neither creates an endpoint nor changes current runtime guards.
  });
});

describe('scope and trusted resource identity', () => {
  const scoped = overrides => ({ permission: 'inventory.copies.manage', scope: branch(A), resourceBranchId: A,
    grants: [grant('inventory.copies.manage', 'USE', branch(A))], ...overrides });
  it('matches exact branch grants and policy-permitted GLOBAL coverage', () => {
    expect(allowed(scoped())).toBe(true);
    expect(allowed(scoped({ grants: [grant('inventory.copies.manage')] }))).toBe(true);
    expect(allowed(scoped({ grants: [grant('inventory.copies.manage', 'USE', branch(B))] }))).toBe(false);
  });
  it('rejects a forged scope even when it matches a grant but not the resolved resource', () => {
    expect(allowed(scoped({ resourceBranchId: B }))).toBe(false);
    expect(allowed(scoped({ resourceBranchId: undefined }))).toBe(false);
    expect(allowed(scoped({ scope: global() }))).toBe(false);
  });
  it('never uses branch grants for a global operation or branch scope for a global-only key', () => {
    expect(allowed(scoped({ scope: global(), resourceBranchId: undefined }))).toBe(false);
    expect(allowed({ scope: branch(A), resourceBranchId: A })).toBe(false);
    expect(allowed({ permission: 'reservations.expire', scope: branch(A), resourceBranchId: A,
      grants: [grant('reservations.expire')] })).toBe(false);
  });
  it('compares UUID identities canonically without changing input', () => {
    expect(allowed(scoped({ resourceBranchId: A.toUpperCase(), grants: [grant('inventory.copies.manage', 'USE', branch(A.toUpperCase()))] }))).toBe(true);
  });
  it.each([null, {}, { type: 'GLOBAL', branchId: A }, { type: 'GLOBAL', branchId: null },
    { type: 'BRANCH' }, { type: 'BRANCH', branchId: 'bad' }, { type: 'GLOBAL', trusted: true }, { type: 'ANY' }])(
    'denies malformed required scope (%#)', scope => expect(allowed({ scope })).toBe(false)
  );
});

describe('usage and delegation are distinct', () => {
  const delegation = overrides => ({ principal: principal(['MANAGEMENT']), action: 'DELEGATE',
    grants: [grant('permissions.delegate'), grant('catalog.update', 'DELEGATE')], ...overrides });
  it('requires both delegation authority and an explicit ceiling, not USE of the target permission', () => {
    expect(allowed(delegation())).toBe(true);
    expect(allowed(delegation({ grants: [grant('catalog.update')] }))).toBe(false);
    expect(allowed(delegation({ principal: principal(['LIBRARIAN', 'MANAGEMENT']),
      grants: [grant('permissions.delegate'), grant('catalog.update')] }))).toBe(false);
    expect(allowed(delegation({ grants: [grant('catalog.update', 'DELEGATE')] }))).toBe(false);
    expect(allowed(delegation({ grants: [grant('permissions.delegate')] }))).toBe(false);
    expect(allowed(delegation({ action: 'USE' }))).toBe(false);
    expect(allowed(delegation({ principal: principal(['LIBRARIAN']) }))).toBe(false);
  });
  it('bounds both authority and ceiling to the requested branch', () => {
    const request = delegation({ permission: 'inventory.copies.manage', scope: branch(A), resourceBranchId: A });
    expect(allowed({ ...request, grants: [grant('permissions.delegate', 'USE', branch(A)), grant(request.permission, 'DELEGATE', branch(A))] })).toBe(true);
    expect(allowed({ ...request, grants: [grant('permissions.delegate', 'USE', branch(B)), grant(request.permission, 'DELEGATE')] })).toBe(false);
    expect(allowed({ ...request, grants: [grant('permissions.delegate'), grant(request.permission, 'DELEGATE', branch(B))] })).toBe(false);
    expect(allowed({ ...request, scope: global(), resourceBranchId: undefined,
      grants: [grant('permissions.delegate', 'USE', branch(A)), grant(request.permission, 'DELEGATE')] })).toBe(false);
  });
  it.each(['permissions.delegate', 'staff.librarian.create', 'students.access.manage', 'students.export', 'master_data.manage', 'audit.operational.read'])(
    'does not delegate nondelegable %s', permission => expect(allowed(delegation({ permission,
      grants: [grant('permissions.delegate'), grant(permission, 'DELEGATE')] }))).toBe(false)
  );
});

describe('protected authority is not represented by ordinary grants', () => {
  it.each(['students.master.import', 'security.events.read', 'permissions.protected.manage', 'system.admin'])(
    'keeps %s unavailable despite all current roles and caller flags', permission => {
      const request = { permission, principal: { ...principal(['STUDENT', 'LIBRARIAN', 'MANAGEMENT']), isProtected: true, trustedIntegration: true },
        grants: [grant(permission)] };
      expect(allowed(request)).toBe(false);
      expect(allowed({ ...request, action: 'DELEGATE', grants: [grant(permission, 'DELEGATE'), grant('permissions.delegate')] })).toBe(false);
    }
  );
});

describe('malformed policy data and purity', () => {
  it.each([null, {}, [null], [grant(), null], [grant('unknown')], [grant('catalog.update', 'ADMIN')],
    [{ ...grant(), scope: { type: 'GLOBAL', branchId: A } }], [{ ...grant(), canDelegate: true }], new Array(1),
    [{ ...grant(), userId: 'not-a-uuid' }]].map(value => [value]))('denies malformed grant sets without filtering corruption away (%#)', grants => {
    expect(allowed({ grants })).toBe(false);
  });
  it.each([undefined, null, [], 'catalog.update'].map(value => [value]))('denies malformed request %j', value => expect(evaluatePermission(value).allowed).toBe(false));
  it.each([undefined, null, 'use', 'ASSIGN', '*'])('denies invalid action %j', action => expect(allowed({ action })).toBe(false));
  it('does not execute accessor grants', () => {
    const getter = vi.fn(() => 'catalog.update');
    const value = { userId: USER, kind: 'USE', scope: global(), get permission() { return getter(); } };
    expect(allowed({ grants: [value] })).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it('fails closed for revoked or throwing reflective input rather than throwing', () => {
    const revoked = Proxy.revocable(grant(), {}); revoked.revoke();
    expect(allowed({ grants: [revoked.proxy] })).toBe(false);
    const throwing = new Proxy(input(), { get() { throw new Error('Malformed reflective input'); } });
    expect(evaluatePermission(throwing).allowed).toBe(false);
  });
  it('is deterministic, leaves frozen input unchanged and uses no clock or database', () => {
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const request = freeze(input()); const before = JSON.stringify(request);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('No clock in pure evaluator'); });
    try {
      const result = evaluatePermission(request);
      expect(result.allowed).toBe(true);
      for (let index = 0; index < 5; index++) expect(evaluatePermission(request)).toEqual(result);
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.stringify(request)).toBe(before);
    } finally { clock.mockRestore(); }
  });
});
