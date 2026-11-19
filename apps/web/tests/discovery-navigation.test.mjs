import assert from 'node:assert/strict';
import test from 'node:test';
import { readCatalogReturn } from '../src/features/discovery/discovery-navigation.js';

test('Catalog return preserves its existing query parameters and list view', () => {
  const to = '/student/catalog?q=research%20%26%20%D8%A8%D8%AD%D8%AB&type=THESIS&page=3&pageSize=20&sort=YEAR_DESC';
  assert.deepEqual(readCatalogReturn({ catalogReturn: { to, view: 'list' } }), { to, view: 'list' });
});

for (const to of [undefined, null, 4, {}, 'https://evil.test/student/catalog', '//evil.test/student/catalog',
  '/student/catalogue', '/student/items/item', '/librarian/ai', '/student/catalog\\evil', '/student/catalog\n?x=1', 'javascript:alert(1)']) {
  test(`untrusted return destination falls back safely: ${JSON.stringify(to)}`, () => {
    assert.deepEqual(readCatalogReturn({ catalogReturn: { to, view: 'list' } }), { to: '/student/catalog', view: 'grid' });
  });
}

test('direct links and unsupported views use grid; return hashes never trigger jumps', () => {
  assert.deepEqual(readCatalogReturn(), { to: '/student/catalog', view: 'grid' });
  assert.deepEqual(readCatalogReturn({ catalogReturn: { to: '/student/catalog?type=PROJECT#surprise', view: 'unknown' } }),
    { to: '/student/catalog?type=PROJECT', view: 'grid' });
});
