export const AUTH_SESSION_KEY = 'sams.devAccessToken';

export const ROLE_ROUTES = {
  STUDENT: '/student',
  LIBRARIAN: '/librarian',
  MANAGEMENT: '/management'
};

export const DEV_ACCOUNTS = [
  { role: 'STUDENT', email: 'student@sams.dev' },
  { role: 'LIBRARIAN', email: 'librarian@sams.dev' },
  { role: 'MANAGEMENT', email: 'management@sams.dev' }
];

export function getDefaultRoute(roles = []) {
  if (roles.includes('LIBRARIAN')) return ROLE_ROUTES.LIBRARIAN;
  if (roles.includes('MANAGEMENT')) return ROLE_ROUTES.MANAGEMENT;
  if (roles.includes('STUDENT')) return ROLE_ROUTES.STUDENT;
  return '/forbidden';
}

export function hasAnyRole(userRoles = [], allowedRoles = []) {
  return allowedRoles.some((role) => userRoles.includes(role));
}
