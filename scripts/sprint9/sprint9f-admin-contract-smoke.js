import {
  buildAdminQuery,
  toIsoNextDay,
  toIsoStartOfDay
} from '../../apps/web/src/features/admin/admin-query.js';

import {
  copyStatusTone,
  emptyCopyDraft,
  emptyItemDraft,
  itemStatusTone,
  trendMax
} from '../../apps/web/src/features/admin/admin-format.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log('Verifying Sprint 9F admin/analytics contracts...');

const query = buildAdminQuery({
  search: 'db',
  includeInactive: true,
  page: 2,
  empty: ''
});

assert(
  query.get('search') === 'db',
  'Admin search query mapping failed.'
);

assert(
  query.get('includeInactive') === 'true',
  'Boolean query mapping failed.'
);

assert(
  !query.has('empty'),
  'Empty admin filter was not omitted.'
);

assert(
  toIsoStartOfDay('2026-10-01') ===
    '2026-10-01T00:00:00.000Z',
  'Analytics start-of-day UTC mapping failed.'
);

assert(
  toIsoNextDay('2026-10-01') ===
    '2026-10-02T00:00:00.000Z',
  'Analytics exclusive end-date UTC mapping failed.'
);

assert(
  emptyItemDraft().type === 'BOOK',
  'Default item draft failed.'
);

assert(
  emptyCopyDraft().status === 'AVAILABLE',
  'Default copy draft failed.'
);

assert(
  itemStatusTone({ isActive: true }) === 'success',
  'Active item status tone failed.'
);

assert(
  copyStatusTone('LOST') === 'danger',
  'Lost-copy status tone failed.'
);

assert(
  trendMax([{ visits: 7 }]) === 7,
  'Analytics trend scaling failed.'
);

console.log('Admin query contract: OK');
console.log('Analytics UTC period contract: OK');
console.log('Draft/status contract: OK');
console.log('Analytics trend scaling contract: OK');
console.log('Sprint 9F admin/analytics contract smoke PASSED.');
