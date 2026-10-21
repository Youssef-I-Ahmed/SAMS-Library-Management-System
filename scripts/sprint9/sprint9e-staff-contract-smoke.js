import {
  buildQuery
} from '../../apps/web/src/features/staff/staff-query.js';

import {
  borrowingTone,
  copyLabel,
  reservationTone,
  visitTone
} from '../../apps/web/src/features/staff/staff-format.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9E staff-operation contracts...');

const query = buildQuery({
  q: 'student',
  status: 'ACTIVE',
  openOnly: true,
  page: 2,
  pageSize: 20,
  unused: ''
});

assert(query.get('q') === 'student', 'q mapping failed.');
assert(query.get('status') === 'ACTIVE', 'status mapping failed.');
assert(query.get('openOnly') === 'true', 'boolean mapping failed.');
assert(query.get('page') === '2', 'page mapping failed.');
assert(!query.has('unused'), 'empty filter was not omitted.');

assert(reservationTone({ status: 'ACTIVE' }) === 'success');
assert(reservationTone({ status: 'ACTIVE', isHoldOverdue: true }) === 'danger');
assert(borrowingTone({ status: 'ACTIVE', isOverdue: true }) === 'danger');
assert(visitTone({ isOpen: true }) === 'success');

assert(
  copyLabel({ barcode: 'B-1', copyCode: 'C-1' }) === 'B-1',
  'Barcode should be preferred for staff copy label.'
);

console.log('Query builder contract: OK');
console.log('Operational status mapping: OK');
console.log('Staff copy-label contract: OK');
console.log('Sprint 9E staff-operation contract smoke PASSED.');
