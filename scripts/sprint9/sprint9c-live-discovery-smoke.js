import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

try {
  loadEnvFile(path.join(projectRoot, '.env'));
} catch {
  // Local defaults are enough for this smoke.
}

const apiPort = process.env.API_PORT || '4000';
const apiBase = `http://localhost:${apiPort}/api/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

async function main() {
  console.log(`API: ${apiBase}`);
  console.log('');

  const ready = await request('/health/ready');

  assert(
    ready.status === 'ready' && ready.database === 'connected',
    'API is not ready.'
  );

  console.log('API readiness: OK');

  const login = await request('/auth/dev-login', {
    method: 'POST',
    body: { universityEmail: 'student@sams.dev' }
  });

  assert(login.accessToken, 'Student access token is missing.');
  assert(login.user?.roles?.includes('STUDENT'), 'Student role is missing.');

  console.log('Student authentication: OK');

  const token = login.accessToken;
  const facets = await request('/discovery/facets', { token });

  assert(Array.isArray(facets.data?.types), 'Facet types missing.');
  assert(Array.isArray(facets.data?.categories), 'Categories missing.');
  assert(Array.isArray(facets.data?.branches), 'Branches missing.');
  assert(Array.isArray(facets.data?.sortOptions), 'Sort options missing.');
  assert(facets.data?.defaults?.sort === 'TITLE_ASC', 'Default sort mismatch.');

  console.log('Discovery facets contract: OK');

  const search = await request(
    '/discovery/items?page=1&pageSize=5&sort=TITLE_ASC',
    { token }
  );

  assert(Array.isArray(search.data), 'Search data missing.');
  assert(search.pagination?.page === 1, 'Page mismatch.');
  assert(search.pagination?.pageSize === 5, 'Page size mismatch.');
  assert(search.meta?.sort === 'TITLE_ASC', 'Sort metadata mismatch.');

  const searchJson = JSON.stringify(search).toLowerCase();

  for (const forbidden of ['"barcode"', '"copycode"', '"shelflocation"']) {
    assert(
      !searchJson.includes(forbidden),
      `Search leaked ${forbidden}.`
    );
  }

  console.log(
    `Discovery search contract: OK (${search.pagination.total} active items)`
  );

  if (search.data.length > 0) {
    const first = search.data[0];
    const detail = await request(`/discovery/items/${first.id}`, { token });

    assert(detail.data?.id === first.id, 'Detail item mismatch.');
    assert(
      typeof detail.data?.availability?.available === 'boolean',
      'Detail availability missing.'
    );
    assert(
      Array.isArray(detail.data?.availability?.branches),
      'Branch availability missing.'
    );
    assert(
      typeof detail.data?.reservationReadiness?.hasAvailableCopy === 'boolean',
      'Reservation readiness missing.'
    );

    const detailJson = JSON.stringify(detail).toLowerCase();

    for (const forbidden of [
      '"barcode"',
      '"copycode"',
      '"shelflocation"',
      '"physicalcopyid"'
    ]) {
      assert(
        !detailJson.includes(forbidden),
        `Detail leaked ${forbidden}.`
      );
    }

    console.log('Discovery item-detail contract: OK');
    console.log('Raw physical-copy privacy boundary: OK');
  } else {
    console.log('Item-detail smoke skipped: no active items currently exist.');
  }

  console.log('');
  console.log('Sprint 9C live discovery smoke PASSED.');
}

main().catch((error) => {
  console.error('');
  console.error('Sprint 9C live discovery smoke FAILED.');
  console.error(error);
  process.exitCode = 1;
});
