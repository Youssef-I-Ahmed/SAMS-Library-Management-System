import {
  buildPagedParams
} from '../../apps/web/src/features/circulation/circulation-query.js';

import {
  getBorrowingTone,
  getReservationTone,
  hasStudentCirculationPrivacyLeak,
  isReservationCancellable,
  makeReservationIdempotencyKey
} from '../../apps/web/src/features/circulation/circulation-format.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9D student circulation contracts...');

const params = buildPagedParams({
  status: 'ACTIVE',
  page: 2,
  pageSize: 20
});

assert(params.get('status') === 'ACTIVE', 'Status query mapping failed.');
assert(params.get('page') === '2', 'Page query mapping failed.');
assert(params.get('pageSize') === '20', 'Page-size mapping failed.');

assert(getReservationTone('ACTIVE') === 'success');
assert(getReservationTone('EXPIRED') === 'warning');
assert(isReservationCancellable({ status: 'ACTIVE' }));
assert(!isReservationCancellable({ status: 'FULFILLED' }));

assert(
  getBorrowingTone({ status: 'ACTIVE', isOverdue: true }) === 'danger',
  'Overdue borrowing tone failed.'
);

const key = makeReservationIdempotencyKey(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

assert(key.length >= 8, 'Idempotency key is too short.');

assert(
  !hasStudentCirculationPrivacyLeak({
    item: { title: 'Safe' },
    branch: { name: 'Main' }
  }),
  'Safe public response was falsely flagged.'
);

assert(
  hasStudentCirculationPrivacyLeak({
    barcode: 'FORBIDDEN'
  }),
  'Privacy leak detector failed.'
);

console.log('Paged query contract: OK');
console.log('Reservation state contract: OK');
console.log('Borrowing overdue contract: OK');
console.log('Idempotency-key contract: OK');
console.log('Student privacy helper contract: OK');
console.log('Sprint 9D circulation contract smoke PASSED.');
