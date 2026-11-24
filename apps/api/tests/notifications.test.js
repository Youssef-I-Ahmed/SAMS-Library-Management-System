import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma.js', () => ({ prisma: {} }));
const { studentEvents, librarianEvents, managementEvents, syncNotifications, sendAnnouncement, resetNotificationSyncForTests } =
  await import('../src/modules/notifications/notifications.service.js');

const NOW = new Date('2026-11-24T10:00:00Z');
const ME = 'a1111111-1111-4111-8111-111111111111';
const STAFF = 'b2222222-2222-4222-8222-222222222222';
const hours = (h) => new Date(NOW.getTime() + h * 3600 * 1000);
const item = { title: 'Database Systems' };

describe('student notifications', () => {
  const reservations = [
    { id: 'r1', status: 'ACTIVE', reservedAt: hours(-20), expiresAt: hours(5), item, branch: { name: 'المكتبة الرئيسية' } },
    { id: 'r5', status: 'ACTIVE', reservedAt: hours(-1), expiresAt: hours(5), item },
    { id: 'r2', status: 'CANCELLED', reservedAt: hours(-50), cancelledAt: hours(-1), cancelledByUserId: STAFF, item },
    { id: 'r3', status: 'CANCELLED', reservedAt: hours(-50), cancelledAt: hours(-1), cancelledByUserId: ME, item },
    { id: 'r4', status: 'EXPIRED', reservedAt: hours(-24 * 40), updatedAt: hours(-3), item }
  ];
  const borrowings = [
    { id: 'b1', status: 'ACTIVE', borrowedAt: hours(-24 * 6), dueAt: hours(24), copy: { item } },
    { id: 'b2', status: 'ACTIVE', borrowedAt: hours(-24 * 40), dueAt: hours(-1), copy: { item } },
    { id: 'b3', status: 'RETURNED', borrowedAt: hours(-24 * 3), returnedAt: hours(-4), dueAt: hours(24 * 7), copy: { item } }
  ];
  const keys = studentEvents({ userId: ME, reservations, borrowings, now: NOW }).map((event) => event.key);

  it('covers reservations: confirmed, ending soon, cancelled by staff and expired', () => {
    expect(keys).toEqual(expect.arrayContaining(['reservation:r1:confirmed', 'reservation:r1:ending', 'reservation:r2:cancelled', 'reservation:r4:expired']));
    expect(keys).not.toContain('reservation:r3:cancelled');
    // A short hold that just started gets no reminder yet.
    expect(keys).not.toContain('reservation:r5:ending');
    expect(keys).not.toContain('reservation:r4:confirmed');
  });

  it('covers borrowings: started, due soon, overdue and returned', () => {
    expect(keys).toEqual(expect.arrayContaining(['borrowing:b1:started', 'borrowing:b1:due-soon', 'borrowing:b2:overdue', 'borrowing:b3:returned']));
    expect(keys).not.toContain('borrowing:b2:started');
    expect(keys).not.toContain('borrowing:b3:due-soon');
  });
});

describe('staff notifications', () => {
  it('tells librarians about new reservations, late holds, overdue books and their own permission changes', () => {
    const events = librarianEvents({
      reservations: [{ id: 'r1', reservedAt: hours(-1), item, student: { user: { displayName: 'سارة' } } }],
      overdueHolds: [{ id: 'r2', expiresAt: hours(-2), item }],
      overdueCount: 3,
      permissionChanges: [{ id: 'e1', createdAt: hours(-5), metadata: { added: ['catalog.import'], removed: [] } }],
      now: NOW
    });
    expect(events.map((event) => event.type)).toEqual(['STAFF_NEW_RESERVATION', 'STAFF_HOLD_OVERDUE', 'STAFF_OVERDUE_SUMMARY', 'PERMISSIONS_CHANGED']);
    expect(events[2]).toMatchObject({ key: 'overdue-summary:2026-11-24', data: { count: 3 } });
    expect(events[3].data).toEqual({ added: 1, removed: 0 });
  });

  it('tells Management only about high security alerts', () => {
    const events = managementEvents({ alerts: [
      { type: 'ACCESS_DENIED', severity: 'high', count: 6, at: hours(-1), actor: { id: STAFF, displayName: 'منى' }, details: {} },
      { type: 'OFF_HOURS', severity: 'low', count: 1, at: hours(-1), actor: { id: STAFF } }
    ] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'SECURITY_ALERT', data: { alert: 'ACCESS_DENIED', count: 6, who: 'منى' } });
  });
});

describe('sync and announcements', () => {
  it('writes events once, skipping duplicates and future events', async () => {
    resetNotificationSyncForTests();
    const createMany = vi.fn(async ({ data }) => ({ count: data.length }));
    const db = {
      reservation: { findMany: async () => [{ id: 'r1', status: 'ACTIVE', reservedAt: hours(-2), expiresAt: hours(30), item }] },
      borrowing: { findMany: async () => [] },
      notification: { createMany }
    };
    const auth = { id: ME, roles: ['STUDENT'] };
    expect(await syncNotifications(auth, { db, now: NOW })).toBe(1);
    expect(createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, data: [{ userId: ME, type: 'RESERVATION_CONFIRMED', dedupeKey: 'reservation:r1:confirmed' }] });
    // A second call straight after is throttled.
    expect(await syncNotifications(auth, { db, now: new Date(NOW.getTime() + 1000) })).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it('sends an announcement to active accounts of the chosen roles, not the sender', async () => {
    const findMany = vi.fn(async () => [{ id: ME }]);
    const createMany = vi.fn(async ({ data }) => ({ count: data.length }));
    const result = await sendAnnouncement({ id: STAFF }, { audience: 'STUDENT', title: 'المكتبة مقفولة الخميس', body: '' },
      { user: { findMany }, notification: { createMany } });
    expect(result).toEqual({ sent: 1 });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ isActive: true, id: { not: STAFF }, userRoles: { some: { role: { name: { in: ['STUDENT'] } } } } });
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ userId: ME, type: 'ANNOUNCEMENT', senderId: STAFF, data: { title: 'المكتبة مقفولة الخميس' } });
  });
});
