import { PERMISSION_CATALOG, PERMISSION_CATALOG_VERSION } from './permission-catalog.js';
import { AppError } from '../../utils/app-error.js';

const unavailable = () => new AppError(503, 'AUTHORIZATION_POLICY_UNAVAILABLE', 'Authorization policy is temporarily unavailable');
const canonical = rows => JSON.stringify(rows.map(row => ({
  key: row.permission_key, roles: [...row.eligible_roles].sort(), scopes: [...row.allowed_scopes].sort(),
  classification: row.classification, delegable: row.delegable, operationStatus: row.operation_status,
  ordinaryGrants: row.ordinary_grants, delegationRoles: [...row.delegation_roles].sort(), globalCoversBranch: row.global_covers_branch
})).sort((a, b) => a.key.localeCompare(b.key)));

export function assertPermissionCatalogConsistency(rows, version) {
  try {
    const expected = Object.values(PERMISSION_CATALOG).map(policy => ({
      permission_key: policy.key, eligible_roles: policy.eligibleRoles, allowed_scopes: policy.scopes,
      classification: policy.classification, delegable: policy.delegable, operation_status: policy.operationStatus,
      ordinary_grants: policy.ordinaryGrants, delegation_roles: policy.delegationRoles, global_covers_branch: policy.globalCoversBranch
    }));
    if (version !== PERMISSION_CATALOG_VERSION || canonical(rows) !== canonical(expected)) throw unavailable();
  } catch { throw unavailable(); }
}

/** Data-access preparation only: never imported by authenticate()/authorize().
 * Explicit client injection prevents use of any ambient application datasource.
 * A database lookup does not authenticate a caller: no isAuthenticated flag is
 * manufactured here. A future cutover must verify JWT and compare authVersion.
 */
export async function loadPermissionPrincipalSnapshot(db, userId) {
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ WRITE`;
      const [{ version }] = await tx.$queryRaw`SELECT public.permission_catalog_version() AS version`;
      const catalog = await tx.$queryRaw`SELECT * FROM public.permission_catalog_snapshot()`;
      assertPermissionCatalogConsistency(catalog, version);
      const control = await tx.authorizationControl.findUnique({ where: { id: 1 } });
      if (!control) throw unavailable();
      const user = await tx.user.findUnique({ where: { id: userId }, select: {
        id: true, isActive: true, isProtected: true, authVersion: true,
        userRoles: { select: { role: { select: { name: true } } } },
        permissionGrants: { orderBy: { id: 'asc' }, select: {
          userId: true, permissionKey: true, kind: true, scope: true, branchId: true
        } }
      } });
      if (!user?.isActive) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
      if (!Number.isInteger(user.authVersion) || user.authVersion < 1 || user.authVersion > 2_147_483_647) throw unavailable();
      return { principal: { id: user.id, isActive: user.isActive, isProtected: user.isProtected,
        authVersion: user.authVersion, roles: user.userRoles.map(link => link.role.name) },
        grants: user.permissionGrants.map(grant => ({ userId: grant.userId, permission: grant.permissionKey, kind: grant.kind,
          scope: grant.scope === 'GLOBAL' ? { type: 'GLOBAL' } : { type: 'BRANCH', branchId: grant.branchId } })),
        control: { bootstrapCompleted: control.bootstrapCompleted, revision: control.revision }, catalogVersion: version };
    }, { isolationLevel: 'RepeatableRead' });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) throw error;
    // Do not expose driver errors, profile data, reasons or connection strings.
    throw unavailable();
  }
}
