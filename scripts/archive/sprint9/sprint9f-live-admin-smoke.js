import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

try {
  loadEnvFile(path.join(projectRoot, '.env'));
} catch {
  // Local defaults are sufficient.
}

const apiPort = process.env.API_PORT || '4000';
const apiBase = `http://localhost:${apiPort}/api/v1`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(
  pathname,
  {
    method = 'GET',
    token,
    body,
    expectedStatus
  } = {}
) {
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
    body:
      body !== undefined
        ? JSON.stringify(body)
        : undefined
  });

  const payload = await response.json().catch(() => null);

  if (expectedStatus !== undefined) {
    assert(
      response.status === expectedStatus,
      `${method} ${pathname}: expected HTTP ${expectedStatus}, got ${response.status}: ${JSON.stringify(payload)}`
    );

    return payload;
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

async function login(universityEmail) {
  return request('/auth/dev-login', {
    method: 'POST',
    body: { universityEmail }
  });
}

async function main() {
  console.log(`API: ${apiBase}`);
  console.log('');

  const ready = await request('/health/ready');

  assert(
    ready.status === 'ready' &&
      ready.database === 'connected',
    'API is not ready.'
  );

  console.log('API readiness: OK');

  const librarian = await login('librarian@sams.dev');
  const management = await login('management@sams.dev');

  assert(
    librarian.user?.roles?.includes('LIBRARIAN'),
    'Librarian role missing.'
  );

  assert(
    management.user?.roles?.includes('MANAGEMENT'),
    'Management role missing.'
  );

  console.log('Librarian + Management authentication: OK');

  const librarianToken = librarian.accessToken;
  const managementToken = management.accessToken;

  const catalog = await request(
    '/catalog/items?includeInactive=true&page=1&pageSize=10',
    { token: librarianToken }
  );

  assert(
    Array.isArray(catalog.data),
    'Catalog administration response is missing data[].'
  );

  console.log(
    `Catalog administration list: OK (${catalog.pagination?.total ?? catalog.data.length} items)`
  );

  const copies = await request(
    '/inventory/copies?page=1&pageSize=10',
    { token: librarianToken }
  );

  assert(
    Array.isArray(copies.data),
    'Physical-copy administration response is missing data[].'
  );

  console.log(
    `Physical-copy administration list: OK (${copies.pagination?.total ?? copies.data.length} copies)`
  );

  const students = await request(
    '/students?includeInactive=true&page=1&pageSize=10',
    { token: librarianToken }
  );

  assert(
    Array.isArray(students.data),
    'Student administration response is missing data[].'
  );

  console.log(
    `Student administration list: OK (${students.pagination?.total ?? students.data.length} students)`
  );

  const categories = await request(
    '/catalog-master/categories',
    { token: librarianToken }
  );

  const dewey = await request(
    '/catalog-master/dewey',
    { token: librarianToken }
  );

  const contributors = await request(
    '/catalog/contributors?page=1&pageSize=10',
    { token: librarianToken }
  );

  assert(
    Array.isArray(categories.data),
    'Category lookup response is missing data[].'
  );

  assert(
    Array.isArray(dewey.data),
    'Dewey lookup response is missing data[].'
  );

  assert(
    Array.isArray(contributors.data),
    'Contributor lookup response is missing data[].'
  );

  console.log('Catalog editor lookup contracts: OK');

  const overview = await request(
    '/analytics/overview',
    { token: managementToken }
  );

  const trends = await request(
    '/analytics/trends?bucket=DAY',
    { token: managementToken }
  );

  const branches = await request(
    '/analytics/branches',
    { token: managementToken }
  );

  const topItems = await request(
    '/analytics/top-items?metric=BORROWINGS&limit=10',
    { token: managementToken }
  );

  assert(
    overview.data?.catalog,
    'Analytics overview catalog metrics are missing.'
  );

  assert(
    Array.isArray(trends.data?.data),
    'Analytics trends response is missing data.data[].'
  );

  assert(
    Array.isArray(branches.data?.data),
    'Analytics branch response is missing data.data[].'
  );

  assert(
    Array.isArray(topItems.data?.data),
    'Analytics top-items response is missing data.data[].'
  );

  console.log('Management analytics contracts: OK');

  const managementBorrowings = await request(
    '/borrowings?page=1&pageSize=10',
    { token: managementToken }
  );

  const managementVisits = await request(
    '/visits?page=1&pageSize=10',
    { token: managementToken }
  );

  assert(
    Array.isArray(managementBorrowings.data),
    'Management borrowings response is missing data[].'
  );

  assert(
    Array.isArray(managementVisits.data),
    'Management visits response is missing data[].'
  );

  console.log('Management read-only operational lists: OK');

  await request(
    '/catalog/items',
    {
      method: 'POST',
      token: managementToken,
      body: {
        type: 'BOOK',
        title: 'MUST NOT BE CREATED'
      },
      expectedStatus: 403
    }
  );

  console.log('Management mutation denial: OK (403)');

  console.log('');
  console.log('Sprint 9F live admin/analytics smoke PASSED.');
}

main().catch((error) => {
  console.error('');
  console.error('Sprint 9F live admin/analytics smoke FAILED.');
  console.error(error);
  process.exitCode = 1;
});
