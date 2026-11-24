import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/app-error.js';
import { evaluatePermission } from '../modules/authorization/permission.service.js';

const unavailable = () => new AppError(503, 'AUTHORIZATION_POLICY_UNAVAILABLE', 'Authorization policy is temporarily unavailable');

async function loadGrants(req) {
  if (!req.permissionGrants) {
    req.permissionGrants = prisma.permissionGrant.findMany({
      where: { userId: req.auth.id, kind: 'USE', scope: 'GLOBAL' },
      select: { permissionKey: true }
    }).then((rows) => rows.map((row) => ({
      userId: req.auth.id, permission: row.permissionKey, kind: 'USE', scope: { type: 'GLOBAL' }
    })));
  }
  return req.permissionGrants;
}

/**
 * Use after authorize(). Management keeps its role access; a librarian also
 * needs an explicit USE grant for the permission, set by Management.
 */
export function requireGrant(permission) {
  return async (req, _res, next) => {
    try {
      if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
      if (!req.auth.roles.includes('LIBRARIAN') || req.auth.roles.includes('MANAGEMENT')) return next();
      let grants;
      try { grants = await loadGrants(req); } catch { throw unavailable(); }
      const decision = evaluatePermission({
        principal: { id: req.auth.id, isAuthenticated: true, isActive: true, roles: [...req.auth.roles] },
        grants, permission, action: 'USE', scope: { type: 'GLOBAL' }
      });
      if (!decision.allowed) {
        throw new AppError(403, 'PERMISSION_DENIED', 'Management has not given this account permission for this action');
      }
      next();
    } catch (error) { next(error); }
  };
}
