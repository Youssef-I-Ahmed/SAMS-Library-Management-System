import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

try {
  loadEnvFile(path.join(projectRoot, '.env'));
} catch {}

const apiPort = process.env.API_PORT || '4000';
const apiBase = `http://localhost:${apiPort}/api/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(
  pathname,
  { method = 'GET', token, body, expectedStatus } = {}
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

async function login(email) {
  return request('/auth/dev-login', {
    method: 'POST',
    body: { universityEmail: email }
  });
}

async function verifySession(token, role) {
  const me = await request('/auth/me', { token });
  assert(
    me.user?.roles?.includes(role),
    `/auth/me is missing ${role}.`
  );
}

async function main() {
  console.log('========================================');
  console.log('SAMS Sprint 9G2 Functional Regression');
  console.log('========================================');
  console.log('');
  console.log(`API: ${apiBase}`);
  console.log('');

  const ready = await request('/health/ready');
  assert(
    ready.status === 'ready' &&
      ready.database === 'connected',
    'API readiness failed.'
  );
  console.log('API readiness: OK');

  const [student, librarian, management] =
    await Promise.all([
      login('student@sams.dev'),
      login('librarian@sams.dev'),
      login('management@sams.dev')
    ]);

  await Promise.all([
    verifySession(student.accessToken, 'STUDENT'),
    verifySession(librarian.accessToken, 'LIBRARIAN'),
    verifySession(management.accessToken, 'MANAGEMENT')
  ]);
  console.log('Auth/session regression for all roles: OK');

  const studentToken = student.accessToken;
  const librarianToken = librarian.accessToken;
  const managementToken = management.accessToken;

  const studentSearch = await request(
    '/discovery/items?page=1&pageSize=5',
    { token: studentToken }
  );
  assert(
    Array.isArray(studentSearch.data),
    'Student discovery data missing.'
  );

  if (studentSearch.data.length > 0) {
    const id = studentSearch.data[0].id;
    const detail = await request(
      `/discovery/items/${encodeURIComponent(id)}`,
      { token: studentToken }
    );
    assert(
      detail.data?.id === id,
      'Student item details failed.'
    );
  }

  const studentReservations = await request(
    '/reservations/me?page=1&pageSize=10',
    { token: studentToken }
  );
  const studentBorrowings = await request(
    '/borrowings/me?page=1&pageSize=10',
    { token: studentToken }
  );

  assert(Array.isArray(studentReservations.data));
  assert(Array.isArray(studentBorrowings.data));

  await request(
    '/inventory/copies?page=1&pageSize=1',
    { token: studentToken, expectedStatus: 403 }
  );
  await request(
    '/students?page=1&pageSize=1',
    { token: studentToken, expectedStatus: 403 }
  );
  console.log('Student discovery/circulation/privacy regression: OK');

  const librarianResponses = await Promise.all([
    request('/master-data/branches', { token: librarianToken }),
    request('/reservations?page=1&pageSize=5', { token: librarianToken }),
    request('/borrowings?page=1&pageSize=5', { token: librarianToken }),
    request('/visits?page=1&pageSize=5', { token: librarianToken }),
    request('/catalog/items?includeInactive=true&page=1&pageSize=5', { token: librarianToken }),
    request('/inventory/copies?page=1&pageSize=5', { token: librarianToken }),
    request('/students?includeInactive=true&page=1&pageSize=5', { token: librarianToken }),
    request('/analytics/overview', { token: librarianToken })
  ]);

  for (const [index, response] of librarianResponses.entries()) {
    assert(response, `Librarian response ${index + 1} missing.`);
  }
  assert(
    Array.isArray(librarianResponses[6].data),
    'Librarian Student Directory data missing.'
  );
  assert(
    librarianResponses[7].data?.catalog,
    'Librarian analytics missing.'
  );
  console.log('Librarian operations/catalog/directory/analytics regression: OK');

  const managementResponses = await Promise.all([
    request('/analytics/overview', { token: managementToken }),
    request('/analytics/trends?bucket=DAY', { token: managementToken }),
    request('/analytics/branches', { token: managementToken }),
    request('/analytics/top-items?metric=BORROWINGS&limit=5', { token: managementToken }),
    request('/borrowings?page=1&pageSize=5', { token: managementToken }),
    request('/visits?page=1&pageSize=5', { token: managementToken }),
    request('/students?page=1&pageSize=5', { token: managementToken })
  ]);

  assert(managementResponses[0].data?.catalog);
  assert(Array.isArray(managementResponses[1].data?.data));
  assert(Array.isArray(managementResponses[2].data?.data));
  assert(Array.isArray(managementResponses[3].data?.data));
  assert(Array.isArray(managementResponses[4].data));
  assert(Array.isArray(managementResponses[5].data));
  assert(Array.isArray(managementResponses[6].data));

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

  await request(
    '/students/import',
    {
      method: 'POST',
      token: managementToken,
      body: {
        students: [
          {
            studentId: 'MUST-NOT-IMPORT',
            universityEmail: 'must-not-import@example.invalid',
            displayName: 'Must Not Import'
          }
        ]
      },
      expectedStatus: 403
    }
  );

  await request(
    '/visits/check-in',
    {
      method: 'POST',
      token: managementToken,
      body: {
        studentNumber: 'MUST-NOT-CHECK-IN',
        branchId: '00000000-0000-4000-8000-000000000000',
        source: 'MANUAL'
      },
      expectedStatus: 403
    }
  );

  console.log('Management read-only/RBAC regression: OK');
  console.log('');
  console.log('Sprint 9G2 functional regression PASSED.');
}

main().catch((error) => {
  console.error('');
  console.error('Sprint 9G2 functional regression FAILED.');
  console.error(error);
  process.exitCode = 1;
});
