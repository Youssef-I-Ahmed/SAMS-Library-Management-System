import { randomUUID } from 'node:crypto';
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
  if (!condition) throw new Error(message);
}

async function request(
  pathname,
  { method = 'GET', token, body, headers = {} } = {}
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
        : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return {
    payload,
    response
  };
}

function assertNoRawStudentInventory(payload, label) {
  const text = JSON.stringify(payload).toLowerCase();

  for (const forbidden of [
    '"barcode"',
    '"copycode"',
    '"shelflocation"',
    '"allocatedcopy"',
    '"copy":'
  ]) {
    assert(
      !text.includes(forbidden),
      `${label} leaked student-forbidden inventory field ${forbidden}.`
    );
  }
}

async function main() {
  console.log(`API: ${apiBase}`);
  console.log('');

  const { payload: ready } = await request('/health/ready');
  assert(
    ready.status === 'ready' && ready.database === 'connected',
    'API is not ready.'
  );
  console.log('API readiness: OK');

  const { payload: login } = await request('/auth/dev-login', {
    method: 'POST',
    body: { universityEmail: 'student@sams.dev' }
  });

  assert(login.accessToken, 'Student token missing.');
  assert(login.user?.student?.studentId, 'Student profile missing.');
  console.log('Student profile/auth contract: OK');

  const token = login.accessToken;

  const { payload: reservations } = await request(
    '/reservations/me?page=1&pageSize=100',
    { token }
  );

  assert(Array.isArray(reservations.data), 'Reservations data missing.');
  assertNoRawStudentInventory(reservations, 'My reservations');
  console.log(
    `My reservations contract: OK (${reservations.pagination.total} records)`
  );

  const { payload: borrowings } = await request(
    '/borrowings/me?page=1&pageSize=100',
    { token }
  );

  assert(Array.isArray(borrowings.data), 'Borrowings data missing.');
  assertNoRawStudentInventory(borrowings, 'My borrowings');

  if (borrowings.data.length > 0) {
    assert(
      typeof borrowings.data[0].isOverdue === 'boolean',
      'Borrowing overdue metric missing.'
    );
  }

  console.log(
    `My borrowings contract: OK (${borrowings.pagination.total} records)`
  );

  const query = encodeURIComponent('DEV Library Discovery Research');

  const { payload: search } = await request(
    `/discovery/items?q=${query}&type=THESIS&availableOnly=true&pageSize=10`,
    { token }
  );

  const candidate = search.data?.find(
    (item) => item.title === 'DEV Library Discovery Research'
  );

  if (!candidate) {
    throw new Error(
      'No available Sprint 9D fixture candidate found. Run the frontend seed first: ' +
      '$env:NODE_ENV="development"; $env:SAMS_FRONTEND_SEED="true"; npm run db:seed:frontend'
    );
  }

  const { payload: detail } = await request(
    `/discovery/items/${candidate.id}`,
    { token }
  );

  const branch =
    detail.data?.reservationReadiness?.candidateBranches?.[0]?.branch;

  assert(branch?.id, 'No reservation-ready branch found.');
  console.log('Reservation-ready discovery contract: OK');

  const idempotencyKey = `sams-9d-${Date.now()}-${randomUUID()}`;

  const { payload: created, response: createdResponse } = await request(
    '/reservations',
    {
      method: 'POST',
      token,
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      body: {
        itemId: candidate.id,
        branchId: branch.id
      }
    }
  );

  assert(created.data?.status === 'ACTIVE', 'Reservation was not ACTIVE.');
  assert(created.data?.item?.id === candidate.id, 'Reservation item mismatch.');
  assert(created.data?.branch?.id === branch.id, 'Reservation branch mismatch.');
  assertNoRawStudentInventory(created, 'Create reservation');

  const replayHeader =
    createdResponse.headers.get('idempotency-replayed');

  assert(
    replayHeader === 'false',
    `Unexpected Idempotency-Replayed header: ${replayHeader}`
  );

  console.log('Reservation creation contract: OK');

  const { payload: activeList } = await request(
    '/reservations/me?status=ACTIVE&page=1&pageSize=100',
    { token }
  );

  assert(
    activeList.data.some(
      (reservation) => reservation.id === created.data.id
    ),
    'Created reservation missing from My Reservations.'
  );

  console.log('My Reservations active-filter contract: OK');

  const { payload: cancelled } = await request(
    `/reservations/${created.data.id}/cancel`,
    {
      method: 'POST',
      token
    }
  );

  assert(
    ['CANCELLED', 'EXPIRED'].includes(cancelled.data?.status),
    `Unexpected cancellation result: ${cancelled.data?.status}`
  );
  assertNoRawStudentInventory(cancelled, 'Cancel reservation');

  console.log(
    `Reservation cancellation contract: OK (${cancelled.data.status})`
  );

  console.log('');
  console.log('Sprint 9D live circulation smoke PASSED.');
}

main().catch((error) => {
  console.error('');
  console.error('Sprint 9D live circulation smoke FAILED.');
  console.error(error);
  process.exitCode = 1;
});
