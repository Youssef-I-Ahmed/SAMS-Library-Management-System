// What Management can switch on or off for each librarian. Each group maps to
// keys from the reviewed permission catalog; grants are stored per key.
import { getPermissionDefinition } from '../authorization/permission-catalog.js';

export const LIBRARIAN_PERMISSION_GROUPS = Object.freeze([
  { id: 'catalog.edit', keys: ['catalog.create', 'catalog.update'] },
  { id: 'catalog.archive', keys: ['catalog.archive', 'catalog.restore'] },
  { id: 'catalog.transfer', keys: ['catalog.import', 'catalog.export'] },
  { id: 'catalog.reference', keys: ['catalog.reference.manage', 'master_data.manage'] },
  { id: 'inventory', keys: ['inventory.copies.manage'] },
  { id: 'circulation', keys: ['circulation.checkout', 'circulation.return'] },
  { id: 'reservations', keys: ['reservations.cancel', 'reservations.expire'] },
  { id: 'visits', keys: ['visits.check_in', 'visits.check_out'] },
  { id: 'students', keys: ['students.directory.read'] },
  { id: 'analytics', keys: ['analytics.read'] }
].map((group) => Object.freeze({ ...group, keys: Object.freeze(group.keys) })));

export const LIBRARIAN_PERMISSION_KEYS = Object.freeze(LIBRARIAN_PERMISSION_GROUPS.flatMap((group) => group.keys));
export const GROUP_IDS = Object.freeze(LIBRARIAN_PERMISSION_GROUPS.map((group) => group.id));

// Every key must exist in the catalog and be usable by a librarian with a GLOBAL grant.
for (const key of LIBRARIAN_PERMISSION_KEYS) {
  const policy = getPermissionDefinition(key);
  if (!policy || !policy.eligibleRoles.includes('LIBRARIAN') || !policy.scopes.includes('GLOBAL') || !policy.ordinaryGrants) {
    throw new Error(`Permission ${key} cannot be granted to librarians`);
  }
}

export const keysForGroups = (groupIds) => LIBRARIAN_PERMISSION_GROUPS
  .filter((group) => groupIds.includes(group.id)).flatMap((group) => group.keys);

/** A group counts as on only when all of its keys are granted. */
export const groupsForKeys = (keys) => {
  const granted = new Set(keys);
  return LIBRARIAN_PERMISSION_GROUPS.filter((group) => group.keys.every((key) => granted.has(key))).map((group) => group.id);
};
