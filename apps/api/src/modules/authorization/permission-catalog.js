// Isolated policy vocabulary, NOT runtime enforcement or role-default grants.
// Changes to meanings/eligibility require a reviewed catalog version change.
export const PERMISSION_CATALOG_VERSION = 1;
export const PERMISSION_ROLES = Object.freeze(['STUDENT', 'LIBRARIAN', 'MANAGEMENT']);

const L = ['LIBRARIAN'];
const M = ['MANAGEMENT'];
const STAFF = ['LIBRARIAN', 'MANAGEMENT'];
const G = ['GLOBAL'];
const GB = ['GLOBAL', 'BRANCH'];

function definition(key, eligibleRoles, scopes, classification, delegable, operationStatus, ordinaryGrants = true) {
  return Object.freeze({
    key,
    eligibleRoles: Object.freeze([...eligibleRoles]),
    scopes: Object.freeze([...scopes]),
    classification,
    delegable,
    delegationRoles: Object.freeze(delegable ? [...M] : []),
    globalCoversBranch: scopes.includes('GLOBAL') && scopes.includes('BRANCH'),
    operationStatus,
    ordinaryGrants
  });
}

const entries = [
  definition('catalog.create', L, G, 'ORDINARY', true, 'EXISTING'),
  definition('catalog.update', L, G, 'ORDINARY', true, 'EXISTING'),
  definition('catalog.archive', L, G, 'SENSITIVE', true, 'EXISTING'),
  definition('catalog.restore', L, G, 'SENSITIVE', true, 'EXISTING'),
  definition('catalog.read_inactive', STAFF, G, 'ORDINARY', true, 'EXISTING'),
  definition('catalog.reference.manage', L, G, 'ORDINARY', true, 'EXISTING'),
  definition('master_data.manage', L, G, 'SENSITIVE', false, 'EXISTING'),
  definition('inventory.read', STAFF, GB, 'ORDINARY', true, 'EXISTING'),
  definition('inventory.copies.manage', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('catalog.import', L, G, 'SENSITIVE', true, 'FUTURE_ONLY'),
  definition('catalog.export', L, G, 'SENSITIVE', true, 'FUTURE_ONLY'),
  definition('students.directory.read', STAFF, G, 'SENSITIVE', true, 'EXISTING'),
  definition('students.access.manage', M, G, 'SENSITIVE', false, 'FUTURE_ONLY'),
  // Trusted integration/protected-principal authority is not represented by an
  // ordinary role, caller flag or grant. These remain unavailable in this slice.
  definition('students.master.import', [], G, 'PROTECTED', false, 'FUTURE_ONLY', false),
  definition('students.export', M, G, 'SENSITIVE', false, 'FUTURE_ONLY'),
  definition('borrowings.read', STAFF, GB, 'SENSITIVE', true, 'EXISTING'),
  definition('reservations.read', STAFF, GB, 'SENSITIVE', true, 'EXISTING'),
  definition('visits.read', STAFF, GB, 'SENSITIVE', true, 'EXISTING'),
  definition('circulation.checkout', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('circulation.return', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('reservations.cancel', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('reservations.expire', L, G, 'ORDINARY', true, 'EXISTING'),
  definition('visits.check_in', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('visits.check_out', L, GB, 'ORDINARY', true, 'EXISTING'),
  definition('analytics.read', STAFF, GB, 'SENSITIVE', true, 'EXISTING'),
  definition('staff.librarian.create', M, G, 'SENSITIVE', false, 'FUTURE_ONLY'),
  definition('staff.librarian.deactivate', M, G, 'SENSITIVE', false, 'FUTURE_ONLY'),
  definition('permissions.delegate', M, GB, 'SENSITIVE', false, 'FUTURE_ONLY'),
  definition('audit.operational.read', STAFF, GB, 'SENSITIVE', false, 'FUTURE_ONLY'),
  definition('security.events.read', [], G, 'PROTECTED', false, 'FUTURE_ONLY', false),
  definition('permissions.protected.manage', [], G, 'PROTECTED', false, 'FUTURE_ONLY', false),
  definition('system.admin', [], G, 'PROTECTED', false, 'FUTURE_ONLY', false)
];

export const PERMISSION_CATALOG = Object.freeze(Object.assign(Object.create(null),
  Object.fromEntries(entries.map(entry => [entry.key, entry]))));

export function getPermissionDefinition(key) {
  return typeof key === 'string' && Object.hasOwn(PERMISSION_CATALOG, key) ? PERMISSION_CATALOG[key] : null;
}
