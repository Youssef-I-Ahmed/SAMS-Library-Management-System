import { AppError } from '../../utils/app-error.js';

// Existing role-based visibility policy. Independent of the unwired grant model.
export function canSeeInactive(auth) {
  return auth.roles.some(role => ['LIBRARIAN', 'MANAGEMENT'].includes(role));
}

export function assertInactiveAccess(auth, includeInactive) {
  if (includeInactive && !canSeeInactive(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot access archived library items');
  }
  return includeInactive;
}
