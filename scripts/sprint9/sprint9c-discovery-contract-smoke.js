import {
  buildDiscoverySearchParams,
  readDiscoveryFilters
} from '../../apps/web/src/features/discovery/discovery-query.js';

import {
  getAvailabilityState,
  hasRawInventoryLeak
} from '../../apps/web/src/features/discovery/discovery-format.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9C frontend discovery contracts...');

const params = buildDiscoverySearchParams({
  q: 'database',
  type: 'BOOK',
  availableOnly: true,
  sort: 'YEAR_DESC',
  page: 2,
  pageSize: 20
});

assert(params.get('q') === 'database', 'Query mapping failed.');
assert(params.get('type') === 'BOOK', 'Type mapping failed.');
assert(params.get('availableOnly') === 'true', 'Availability mapping failed.');
assert(params.get('sort') === 'YEAR_DESC', 'Sort mapping failed.');
assert(params.get('page') === '2', 'Page mapping failed.');

const roundTrip = readDiscoveryFilters(params);

assert(roundTrip.availableOnly === true, 'availableOnly round-trip failed.');
assert(roundTrip.page === 2, 'Page round-trip failed.');
assert(roundTrip.type === 'BOOK', 'Type round-trip failed.');

assert(
  getAvailabilityState({ available: true, totalCopies: 1 }) === 'available',
  'Available state mapping failed.'
);

assert(
  getAvailabilityState({ available: false, totalCopies: 1 }) === 'unavailable',
  'Unavailable state mapping failed.'
);

assert(
  getAvailabilityState({ available: false, totalCopies: 0 }) === 'noCopies',
  'No-copies state mapping failed.'
);

assert(!hasRawInventoryLeak({ availability: { availableCopies: 1 } }));
assert(hasRawInventoryLeak({ barcode: 'SHOULD-NOT-LEAK' }));

console.log('URL filter contract: OK');
console.log('Availability state contract: OK');
console.log('Privacy boundary helper contract: OK');
console.log('Sprint 9C frontend discovery contract smoke PASSED.');
