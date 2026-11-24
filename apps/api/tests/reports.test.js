import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma.js', () => ({ prisma: {} }));
const { securityAlerts, staffPerformance } = await import('../src/modules/reports/reports.service.js');

const LIB = 'a1111111-1111-4111-8111-111111111111';
const MAN = 'b2222222-2222-4222-8222-222222222222';
const users = [
  { id: LIB, displayName: 'Lib', universityEmail: 'lib@x', isActive: true, userRoles: [{ role: { name: 'LIBRARIAN' } }] },
  { id: MAN, displayName: 'Man', universityEmail: 'man@x', isActive: true, userRoles: [{ role: { name: 'MANAGEMENT' } }] }
];
// 23:30 Cairo time on 2026-11-20 is 21:30 UTC.
const late = new Date('2026-11-20T21:30:00Z');
const noon = new Date('2026-11-20T10:00:00Z');
const events = [
  { id: 1, actorUserId: LIB, action: 'CATALOG_ITEM_CREATED', createdAt: late, metadata: {} },
  { id: 2, actorUserId: LIB, action: 'COPY_CREATED', createdAt: noon, metadata: {} },
  ...Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, actorUserId: LIB, action: 'ACCESS_DENIED', createdAt: noon, metadata: { permission: 'catalog.import' } })),
  { id: 20, actorUserId: null, action: 'LOGIN_FAILED', createdAt: noon, metadata: { email: 'who@x' } },
  { id: 21, actorUserId: MAN, action: 'LIBRARIAN_PERMISSIONS_CHANGED', entityId: LIB, createdAt: noon, metadata: { added: [], removed: ['catalog.import'] } }
];
const db = {
  user: { findMany: async () => users },
  borrowing: { groupBy: async ({ by }) => (by[0] === 'checkedOutById' ? [{ checkedOutById: LIB, _count: { _all: 4 } }] : []) },
  libraryVisit: { groupBy: async () => [{ registeredById: LIB, _count: { _all: 2 } }] },
  auditLog: { findMany: async ({ where }) => events.filter((e) => !where.entityType || e.action !== 'ACCESS_DENIED' && e.action !== 'LOGIN_FAILED') }
};

describe('staff reports', () => {
  it('counts each staff member\'s work, including quiet accounts', async () => {
    const { data } = await staffPerformance({ from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z' }, db);
    expect(data[0]).toMatchObject({ userId: LIB, checkouts: 4, visits: 2, catalog: 1, copies: 1, total: 8, activeDays: 1 });
    expect(data.find((row) => row.userId === MAN)).toBeTruthy();
  });

  it('raises alerts for denials, failed sign-ins, permission changes and late work', async () => {
    const { data, summary } = await securityAlerts({ from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z' }, db);
    expect(data.map((alert) => alert.type)).toEqual(['ACCESS_DENIED', 'OFF_HOURS', 'LOGIN_FAILED', 'LIBRARIAN_PERMISSIONS_CHANGED']);
    expect(data[0]).toMatchObject({ severity: 'high', count: 5, details: { permissions: ['catalog.import'] } });
    expect(summary).toEqual({ high: 1, medium: 0, low: 2, info: 1 });
  });
});
