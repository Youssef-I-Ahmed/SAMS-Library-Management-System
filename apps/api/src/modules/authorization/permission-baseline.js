import { PERMISSION_CATALOG, PERMISSION_CATALOG_VERSION, PERMISSION_ROLES } from './permission-catalog.js';

/** Pure planning only. No client, writes, IDs, grantor selection or execution API.
 * Existing authenticated discovery and Student ownership rules are unchanged.
 * This is a reviewed one-time cutover candidate, never a runtime role fallback.
 */
export function planCompatibilityGrants(principals) {
  if (!Array.isArray(principals)) throw new TypeError('Expected synthetic/reviewed principal projections');
  const seen = new Set(), grants = [], review = [];
  for (const principal of [...principals].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
    if (!principal || typeof principal.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(principal.id)
      || seen.has(principal.id.toLowerCase()) || !Array.isArray(principal.roles)
      || new Set(principal.roles).size !== principal.roles.length) throw new TypeError('Ambiguous principal plan input');
    seen.add(principal.id.toLowerCase());
    if (principal.isActive !== true || principal.isProtected === true || principal.roles.some(role => !PERMISSION_ROLES.includes(role))) {
      review.push({ userId: principal.id, reason: 'INACTIVE_PROTECTED_OR_UNKNOWN_IDENTITY' }); continue;
    }
    if (new Set(principal.roles).size > 1) review.push({ userId: principal.id, reason: 'MULTI_ROLE_BASELINE_REQUIRES_REVIEW' });
    for (const policy of Object.values(PERMISSION_CATALOG).sort((a, b) => a.key.localeCompare(b.key))) {
      if (policy.operationStatus === 'EXISTING' && policy.ordinaryGrants && policy.scopes.includes('GLOBAL')
        && principal.roles.some(role => policy.eligibleRoles.includes(role))) {
        grants.push({ userId: principal.id, permissionKey: policy.key, kind: 'USE', scope: 'GLOBAL', branchId: null,
          reason: `REVIEWED_LEGACY_ROLE_BASELINE_V${PERMISSION_CATALOG_VERSION}` });
      }
    }
  }
  return { apply: false, catalogVersion: PERMISSION_CATALOG_VERSION, grants, review,
    requires: ['APPROVED_DISTINCT_GRANTOR', 'DIFF_AND_COVERAGE_REVIEW', 'AUDIT_AND_FRESH_LOGIN_CUTOVER'],
    studentOwnershipRules: 'UNCHANGED' };
}
