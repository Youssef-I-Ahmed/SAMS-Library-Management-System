import {
  DEV_ACCOUNTS,
  ROLE_ROUTES,
  getDefaultRoute,
  hasAnyRole
} from '../../apps/web/src/auth/auth-config.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9B auth + role contracts...');

assert(
  DEV_ACCOUNTS.length === 3,
  'Expected three development role accounts.'
);

assert(
  getDefaultRoute(['STUDENT']) === ROLE_ROUTES.STUDENT,
  'Student route mapping is incorrect.'
);

assert(
  getDefaultRoute(['LIBRARIAN']) === ROLE_ROUTES.LIBRARIAN,
  'Librarian route mapping is incorrect.'
);

assert(
  getDefaultRoute(['MANAGEMENT']) === ROLE_ROUTES.MANAGEMENT,
  'Management route mapping is incorrect.'
);

assert(
  hasAnyRole(['STUDENT'], ['STUDENT']),
  'Student role guard contract failed.'
);

assert(
  !hasAnyRole(['STUDENT'], ['LIBRARIAN']),
  'Cross-role guard contract failed.'
);

console.log('Role routing contract: OK');
console.log('Role guard contract: OK');
console.log('Sprint 9B auth + role contract smoke PASSED.');
