import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedFrontendFixtures, assertFrontendSeedEnvironment } from './seed-frontend.js';

// Capture writes in memory: these checks must never connect to PostgreSQL.
function captureClient() {
  const rows = {};
  const tx = {};
  for (const model of ['branch', 'category', 'deweyClassification', 'contributor', 'user',
    'libraryItem', 'circulationPolicy', 'physicalCopy', 'reservation', 'borrowing', 'libraryVisit']) {
    rows[model] = [];
    tx[model] = {
      async create({ data }) {
        assert.ok(!rows[model].some((row) => row.id === data.id), `Duplicate ${model} ID`);
        rows[model].push(structuredClone(data));
        return data;
      },
      async findUnique({ where }) {
        return rows[model].find((row) => Object.entries(where).every(([key, value]) => row[key] === value));
      },
      async upsert({ where, create }) {
        return await this.findUnique({ where }) ?? this.create({ data: create });
      }
    };
  }
  return { rows, prisma: { $transaction: async (fn) => fn(tx) } };
}

const context = {
  studentId: '00000000-0000-4000-8000-000000000001',
  librarianId: '00000000-0000-4000-8000-000000000002',
  studentRoleId: 1, facultyId: '00000000-0000-4000-8000-000000000003',
  departmentId: '00000000-0000-4000-8000-000000000004'
};

test('frontend fixture opt-in rejects production and missing development acknowledgment', () => {
  for (const env of [{}, { NODE_ENV: 'production', SAMS_FRONTEND_SEED: 'true' },
    { NODE_ENV: 'development' }, { SAMS_FRONTEND_SEED: 'true' }]) {
    assert.throws(() => assertFrontendSeedEnvironment(env));
  }
  assert.doesNotThrow(() => assertFrontendSeedEnvironment({ NODE_ENV: 'development', SAMS_FRONTEND_SEED: 'true' }));
});

test('synthetic fixture provides consistent catalog, allocation, loan and visit scenarios', async () => {
  const { rows, prisma } = captureClient();
  const now = new Date('2026-10-07T12:00:00Z');
  await seedFrontendFixtures(prisma, context, now);
  const copyById = new Map(rows.physicalCopy.map((copy) => [copy.id, copy]));
  const itemById = new Map(rows.libraryItem.map((item) => [item.id, item]));
  assert.deepEqual(new Set(rows.libraryItem.map((item) => item.type)), new Set(['BOOK', 'THESIS', 'PROJECT']));
  assert.ok(rows.libraryItem.some((item) => !rows.physicalCopy.some((copy) => copy.itemId === item.id)));
  assert.ok(rows.libraryItem.some((item) => item.language === 'ar'));
  assert.equal(new Set(rows.physicalCopy.map((copy) => copy.barcode)).size, rows.physicalCopy.length);
  for (const item of rows.libraryItem) {
    assert.equal(item.type === 'BOOK', !!item.bookDetails);
    if (item.academicWorkDetails) assert.equal(item.academicWorkDetails.create.workType, item.type);
  }
  for (const copy of rows.physicalCopy) {
    assert.ok(itemById.has(copy.itemId));
    assert.ok(rows.branch.some((branch) => branch.id === copy.branchId));
    if (copy.status === 'RESERVED') {
      assert.equal(rows.reservation.filter((r) => r.allocatedCopyId === copy.id && r.status === 'ACTIVE').length, 1);
    }
    if (copy.status === 'BORROWED') {
      assert.equal(rows.borrowing.filter((b) => b.copyId === copy.id && b.status === 'ACTIVE').length, 1);
    }
  }
  for (const r of rows.reservation) {
    const copy = copyById.get(r.allocatedCopyId);
    assert.equal(copy.itemId, r.itemId);
    assert.equal(copy.branchId, r.branchId);
    assert.ok(r.expiresAt > r.reservedAt);
    if (r.status === 'ACTIVE') assert.ok(r.expiresAt > now);
  }
  for (const loan of rows.borrowing) {
    const copy = copyById.get(loan.copyId);
    assert.equal(copy.branchId, loan.branchId);
    assert.ok(loan.dueAt > loan.borrowedAt);
    if (loan.status === 'ACTIVE') {
      assert.equal(copy.status, 'BORROWED');
      assert.ok(loan.dueAt < now); // Demonstrates derived overdue state.
    } else {
      assert.ok(loan.returnedAt >= loan.borrowedAt);
      assert.equal(copy.status, 'AVAILABLE');
      const reservation = rows.reservation.find((r) => r.id === loan.reservationId);
      assert.equal(reservation.status, 'FULFILLED');
      assert.equal(reservation.studentId, loan.studentId);
      assert.equal(reservation.allocatedCopyId, copy.id);
    }
  }
  assert.equal(rows.libraryVisit.filter((visit) => !visit.checkedOutAt).length, 1);
  assert.ok(rows.libraryVisit.some((visit) => visit.checkedOutAt > visit.checkedInAt));
  assert.ok(rows.user.some((user) => user.student.create.academicStatus === 'SUSPENDED'));
  for (const branch of rows.branch) {
    assert.ok(rows.circulationPolicy.some((policy) => policy.branchId === branch.id && policy.effectiveFrom <= now));
  }
});

test('rerunning fixture preserves edited states and dates without creating extra rows', async () => {
  const { rows, prisma } = captureClient();
  await seedFrontendFixtures(prisma, context, new Date('2026-10-07T12:00:00Z'));
  rows.libraryItem[0].title = 'Edited through the frontend';
  rows.reservation[0].status = 'CANCELLED';
  const before = structuredClone(rows);
  await seedFrontendFixtures(prisma, context, new Date('2026-11-07T12:00:00Z'));
  assert.deepEqual(rows, before);
});
