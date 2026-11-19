import { getPermissionDefinition, PERMISSION_ROLES } from './permission-catalog.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = value => typeof value === 'string' && UUID.test(value);
const sameId = (a, b) => a.toLowerCase() === b.toLowerCase();
const deny = reason => Object.freeze({ allowed: false, reason });
const allow = Object.freeze({ allowed: true, reason: 'EXPLICIT_GRANT' });

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(property => 'value' in property);
  } catch { return false; }
}

function dataArray(value, predicate) {
  if (!Array.isArray(value)) return false;
  try {
    if (Object.keys(value).length !== value.length) return false;
    for (let index = 0; index < value.length; index++) {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      if (!property || !('value' in property) || !predicate(property.value)) return false;
    }
    return true;
  } catch { return false; }
}

function exactKeys(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validScope(scope, policy) {
  if (!record(scope) || !policy.scopes.includes(scope.type)) return false;
  if (scope.type === 'GLOBAL') return exactKeys(scope, ['type']);
  return exactKeys(scope, ['type', 'branchId']) && isUuid(scope.branchId);
}

function validGrant(grant, principalId) {
  if (!exactKeys(grant, ['userId', 'permission', 'kind', 'scope'])
    || !isUuid(grant.userId) || !sameId(grant.userId, principalId)
    || !['USE', 'DELEGATE'].includes(grant.kind)) return false;
  const policy = getPermissionDefinition(grant.permission);
  return Boolean(policy && validScope(grant.scope, policy)
    && (grant.kind !== 'DELEGATE' || policy.delegable));
}

function covers(granted, required, policy) {
  if (required.type === 'GLOBAL') return granted.type === 'GLOBAL';
  if (granted.type === 'GLOBAL') return policy.globalCoversBranch;
  return sameId(granted.branchId, required.branchId);
}

/**
 * Pure, currently unwired evaluator. No DB, role-default fallback, clock or I/O.
 * principal: trusted { id, isAuthenticated, isActive, roles } projection.
 * grants: [{ userId, permission, kind: USE|DELEGATE, scope: { type, branchId? } }].
 * BRANCH requests require BOTH scope.branchId and a separately server-resolved
 * resourceBranchId. Equality detects mismatches, not provenance: a future caller
 * must resolve the resource from the DB, never copy client input into both fields.
 * DELEGATE checks the actor's ceiling only; it does not authorize assignment to a
 * recipient. Target, self-approval, transaction and audit checks belong elsewhere.
 * Future-only metadata is not an endpoint activation switch or a default grant.
 */
export function evaluatePermission(input) {
  try { return evaluateRequest(input); }
  catch { return deny('INVALID_REQUEST'); } // malformed reflective DTOs also fail closed
}

function evaluateRequest(input) {
  if (!record(input)) return deny('INVALID_REQUEST');
  const { principal, grants, permission, action, scope, resourceBranchId } = input;
  const policy = getPermissionDefinition(permission);
  if (!policy) return deny('UNKNOWN_PERMISSION');
  if (!record(principal) || principal.isAuthenticated !== true || principal.isActive !== true
    || !isUuid(principal.id) || !dataArray(principal.roles, role => PERMISSION_ROLES.includes(role))
    || new Set(principal.roles).size !== principal.roles.length) return deny('INVALID_PRINCIPAL');
  if (!['USE', 'DELEGATE'].includes(action)) return deny('INVALID_ACTION');
  if (!validScope(scope, policy)) return deny('INVALID_SCOPE');
  if (scope.type === 'BRANCH') {
    if (!isUuid(resourceBranchId) || !sameId(scope.branchId, resourceBranchId)) return deny('RESOURCE_SCOPE_MISMATCH');
  } else if (resourceBranchId !== undefined) return deny('RESOURCE_SCOPE_MISMATCH');
  if (!dataArray(grants, grant => validGrant(grant, principal.id))) return deny('INVALID_GRANTS');
  if (!policy.ordinaryGrants) return deny('PROTECTED_AUTHORITY_UNAVAILABLE');

  const matching = (key, kind, definition) => grants.some(grant => grant.permission === key && grant.kind === kind
    && covers(grant.scope, scope, definition));
  if (action === 'USE') {
    if (!principal.roles.some(role => policy.eligibleRoles.includes(role))) return deny('INELIGIBLE_ROLE');
    return matching(permission, 'USE', policy) ? allow : deny('MISSING_USE_GRANT');
  }

  if (!policy.delegable || !principal.roles.some(role => policy.delegationRoles.includes(role))) return deny('DELEGATION_NOT_ALLOWED');
  const control = getPermissionDefinition('permissions.delegate');
  if (!principal.roles.some(role => control.eligibleRoles.includes(role))
    || !matching(control.key, 'USE', control)) return deny('MISSING_DELEGATION_AUTHORITY');
  return matching(permission, 'DELEGATE', policy) ? allow : deny('MISSING_DELEGATION_CEILING');
}
