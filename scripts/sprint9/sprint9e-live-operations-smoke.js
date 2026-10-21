import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

try {
  loadEnvFile(path.join(projectRoot, '.env'));
} catch {
  // Defaults are sufficient.
}

const apiPort = process.env.API_PORT || '4000';
const apiBase = `http://localhost:${apiPort}/api/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(
  pathname,
  { method = 'GET', token, body } = {}
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
    body: body !== undefined
      ? JSON.stringify(body)
      : undefined
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
    ready.status === 'ready' &&
    ready.database === 'connected',
    'API is not ready.'
  );

  console.log('API readiness: OK');

  const login = await request('/auth/dev-login', {
    method: 'POST',
    body: {
      universityEmail: 'librarian@sams.dev'
    }
  });

  assert(login.accessToken, 'Librarian token missing.');
  assert(
    login.user?.roles?.includes('LIBRARIAN'),
    'LIBRARIAN role missing.'
  );

  const token = login.accessToken;

  console.log('Librarian authentication: OK');

  const branches = await request('/master-data/branches', {
    token
  });

  assert(Array.isArray(branches.data), 'Branches data missing.');
  assert(branches.data.length > 0, 'No active branches found.');

  console.log('Branch lookup contract: OK');

  const reservations = await request(
    '/reservations?status=ACTIVE&page=1&pageSize=20',
    { token }
  );

  assert(
    Array.isArray(reservations.data),
    'Reservation queue data missing.'
  );

  if (reservations.data.length > 0) {
    assert(
      reservations.data[0].student?.studentId,
      'Reservation operations student data missing.'
    );
    assert(
      reservations.data[0].allocatedCopy,
      'Reservation operations copy data missing.'
    );
  }

  console.log(
    `Reservation queue contract: OK (${reservations.pagination.total} active)`
  );

  const borrowings = await request(
    '/borrowings?status=ACTIVE&page=1&pageSize=20',
    { token }
  );

  assert(
    Array.isArray(borrowings.data),
    'Borrowing operations data missing.'
  );

  if (borrowings.data.length > 0) {
    assert(
      borrowings.data[0].copy?.id,
      'Borrowing operations copy data missing.'
    );
    assert(
      typeof borrowings.data[0].isOverdue === 'boolean',
      'Overdue metric missing.'
    );
  }

  console.log(
    `Borrowing queue contract: OK (${borrowings.pagination.total} active)`
  );

  const visits = await request(
    '/visits?openOnly=true&page=1&pageSize=20',
    { token }
  );

  assert(Array.isArray(visits.data), 'Visit queue data missing.');

  if (visits.data.length > 0) {
    assert(
      typeof visits.data[0].isOpen === 'boolean',
      'Visit open-state missing.'
    );
    assert(
      typeof visits.data[0].durationMinutes === 'number',
      'Visit duration missing.'
    );
  }

  console.log(
    `Visit queue contract: OK (${visits.pagination.total} open)`
  );

  const copies = await request(
    '/inventory/copies?status=AVAILABLE&search=DEV-FE-200&page=1&pageSize=10',
    { token }
  );

  assert(Array.isArray(copies.data), 'Physical copy list missing.');

  console.log(
    `Available-copy search contract: OK (${copies.pagination.total} matches)`
  );

  console.log('');
  console.log('Sprint 9E live staff-operation smoke PASSED.');
}

main().catch((error) => {
  console.error('');
  console.error('Sprint 9E live staff-operation smoke FAILED.');
  console.error(error);
  process.exitCode = 1;
});
