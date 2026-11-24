import { AppError } from '../utils/app-error.js';
import { recordSecurityEvent } from '../utils/audit.js';

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required'));
    }

    const allowed = req.auth.roles.some((role) => allowedRoles.includes(role));

    if (!allowed) {
      recordSecurityEvent('ACCESS_DENIED', { actor: req.auth, metadata: { roles: allowedRoles, method: req.method, path: req.originalUrl.split('?')[0] } });
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }

    next();
  };
}
