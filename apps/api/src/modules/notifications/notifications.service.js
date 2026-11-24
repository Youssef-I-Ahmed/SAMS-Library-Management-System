// In-app notifications.
//
// Most notifications are derived from what already happened in the library
// (reservations, borrowings, permission changes, security alerts). Each time a
// person opens or polls their notifications, the events since the last check are
// turned into rows; a unique (user, dedupeKey) keeps one row per event, so the
// work is safe to repeat and needs no changes in the circulation code paths.
// Management announcements are written directly.
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { securityAlerts } from '../reports/reports.service.js';

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
export const LOOKBACK_DAYS = 30;
export const DUE_SOON_DAYS = 2;
export const HOLD_ENDING_HOURS = 12;
const SYNC_EVERY_MS = 20 * 1000;
const lastSync = new Map();

const titleOf = (item) => item?.title ?? null;

// A reminder comes in the last part of a period: the usual length, or half of a
// shorter period, so a short hold or loan does not start with a reminder.
const reminderWindow = (start, end, usual) => {
  const length = end - new Date(start ?? end).getTime();
  return length > 0 ? Math.min(usual, length / 2) : usual;
};

/** Student: their reservations and borrowings. Pure, so it can be tested on its own. */
export function studentEvents({ userId, reservations, borrowings, now = new Date() }) {
  const since = now.getTime() - LOOKBACK_DAYS * DAY;
  const recent = (date) => date && new Date(date).getTime() >= since;
  const out = [];
  for (const r of reservations) {
    const base = { title: titleOf(r.item), branch: r.branch?.name ?? null };
    if (recent(r.reservedAt)) {
      out.push({ type: 'RESERVATION_CONFIRMED', key: `reservation:${r.id}:confirmed`, at: r.reservedAt,
        data: { ...base, expiresAt: r.expiresAt }, link: '/student/reservations' });
    }
    if (r.status === 'ACTIVE') {
      // Remind in the last part of the hold: 12 hours, or half of a shorter hold.
      const end = new Date(r.expiresAt).getTime();
      const window = reminderWindow(r.reservedAt, end, HOLD_ENDING_HOURS * HOUR);
      if (end > now.getTime() && end - now.getTime() <= window) {
        out.push({ type: 'RESERVATION_ENDING', key: `reservation:${r.id}:ending`, at: new Date(end - window),
          data: { ...base, expiresAt: r.expiresAt }, link: '/student/reservations' });
      }
    }
    if (r.status === 'CANCELLED' && recent(r.cancelledAt) && r.cancelledByUserId && r.cancelledByUserId !== userId) {
      out.push({ type: 'RESERVATION_CANCELLED', key: `reservation:${r.id}:cancelled`, at: r.cancelledAt, data: base, link: '/student/reservations' });
    }
    if (r.status === 'EXPIRED' && recent(r.updatedAt)) {
      out.push({ type: 'RESERVATION_EXPIRED', key: `reservation:${r.id}:expired`, at: r.updatedAt, data: base, link: '/student/reservations' });
    }
  }
  for (const b of borrowings) {
    const data = { title: titleOf(b.copy?.item), dueAt: b.dueAt };
    if (recent(b.borrowedAt)) {
      out.push({ type: 'BORROWING_STARTED', key: `borrowing:${b.id}:started`, at: b.borrowedAt, data, link: '/student/borrowings' });
    }
    if (b.status === 'RETURNED' && recent(b.returnedAt)) {
      out.push({ type: 'BORROWING_RETURNED', key: `borrowing:${b.id}:returned`, at: b.returnedAt, data, link: '/student/borrowings' });
    }
    if (b.status === 'ACTIVE') {
      const due = new Date(b.dueAt).getTime();
      const window = reminderWindow(b.borrowedAt, due, DUE_SOON_DAYS * DAY);
      if (due <= now.getTime()) {
        out.push({ type: 'BORROWING_OVERDUE', key: `borrowing:${b.id}:overdue`, at: b.dueAt, data, link: '/student/borrowings' });
      } else if (due - now.getTime() <= window) {
        out.push({ type: 'BORROWING_DUE_SOON', key: `borrowing:${b.id}:due-soon`, at: new Date(due - window), data, link: '/student/borrowings' });
      }
    }
  }
  return out;
}

const cairoDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);

/** Librarian: new reservations, holds past their time, and a daily overdue count. */
export function librarianEvents({ reservations, overdueHolds, overdueCount, permissionChanges, now = new Date() }) {
  const out = [];
  for (const r of reservations) {
    out.push({ type: 'STAFF_NEW_RESERVATION', key: `reservation:${r.id}:new`, at: r.reservedAt,
      data: { title: titleOf(r.item), student: r.student?.user?.displayName ?? null, branch: r.branch?.name ?? null }, link: '/librarian/reservations' });
  }
  for (const r of overdueHolds) {
    out.push({ type: 'STAFF_HOLD_OVERDUE', key: `reservation:${r.id}:hold-overdue`, at: r.expiresAt,
      data: { title: titleOf(r.item), student: r.student?.user?.displayName ?? null }, link: '/librarian/reservations' });
  }
  if (overdueCount > 0) {
    out.push({ type: 'STAFF_OVERDUE_SUMMARY', key: `overdue-summary:${cairoDay(now)}`, at: now, data: { count: overdueCount }, link: '/librarian/return' });
  }
  for (const event of permissionChanges) {
    out.push({ type: 'PERMISSIONS_CHANGED', key: `audit:${event.id}`, at: event.createdAt,
      data: { added: event.metadata?.added?.length ?? 0, removed: event.metadata?.removed?.length ?? 0 }, link: '/librarian' });
  }
  return out;
}

/** Management: the alerts marked high on the security report. */
export function managementEvents({ alerts }) {
  return alerts.filter((alert) => alert.severity === 'high').map((alert) => ({
    type: 'SECURITY_ALERT',
    key: `security:${alert.type}:${alert.actor?.id ?? alert.details?.email ?? 'unknown'}:${cairoDay(new Date(alert.at))}`,
    at: alert.at,
    data: { alert: alert.type, count: alert.count, who: alert.actor?.displayName ?? alert.details?.email ?? null },
    link: '/management/reports'
  }));
}

async function collect(auth, db, now) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const roles = auth.roles ?? [];
  const events = [];
  if (roles.includes('STUDENT')) {
    const [reservations, borrowings] = await Promise.all([
      db.reservation.findMany({ where: { studentId: auth.id, OR: [{ status: 'ACTIVE' }, { updatedAt: { gte: since } }] },
        select: { id: true, status: true, reservedAt: true, expiresAt: true, cancelledAt: true, cancelledByUserId: true, updatedAt: true,
          item: { select: { title: true } }, branch: { select: { name: true } } }, take: 200 }),
      db.borrowing.findMany({ where: { studentId: auth.id, OR: [{ status: 'ACTIVE' }, { updatedAt: { gte: since } }] },
        select: { id: true, status: true, borrowedAt: true, dueAt: true, returnedAt: true, copy: { select: { item: { select: { title: true } } } } }, take: 200 })
    ]);
    events.push(...studentEvents({ userId: auth.id, reservations, borrowings, now }));
  }
  if (roles.includes('LIBRARIAN') && !roles.includes('MANAGEMENT')) {
    const staffSince = new Date(Math.max(since.getTime(), now.getTime() - 3 * DAY));
    const who = { item: { select: { title: true } }, student: { select: { user: { select: { displayName: true } } } }, branch: { select: { name: true } } };
    const [reservations, overdueHolds, overdueCount, permissionChanges] = await Promise.all([
      db.reservation.findMany({ where: { reservedAt: { gte: staffSince } }, select: { id: true, reservedAt: true, ...who }, orderBy: { reservedAt: 'desc' }, take: 50 }),
      db.reservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now, gte: staffSince } }, select: { id: true, expiresAt: true, ...who }, take: 50 }),
      db.borrowing.count({ where: { status: 'ACTIVE', dueAt: { lte: now } } }),
      db.auditLog.findMany({ where: { entityType: 'User', entityId: auth.id, action: 'LIBRARIAN_PERMISSIONS_CHANGED', createdAt: { gte: since } },
        // Only the latest change: several edits in a row become one notice.
        select: { id: true, createdAt: true, metadata: true }, orderBy: { createdAt: 'desc' }, take: 1 })
    ]);
    events.push(...librarianEvents({ reservations, overdueHolds, overdueCount, permissionChanges, now }));
  }
  if (roles.includes('MANAGEMENT')) {
    const { data } = await securityAlerts({ from: new Date(now.getTime() - DAY).toISOString() }, db);
    events.push(...managementEvents({ alerts: data }));
  }
  // Nothing from before the account existed, and nothing in the future.
  return events.filter((event) => event.at && new Date(event.at) <= now);
}

/** Turns recent events into rows for this person. Runs at most every few seconds per person. */
export async function syncNotifications(auth, { db = prisma, now = new Date(), force = false } = {}) {
  const last = lastSync.get(auth.id) ?? 0;
  if (!force && now.getTime() - last < SYNC_EVERY_MS) return 0;
  lastSync.set(auth.id, now.getTime());
  const events = await collect(auth, db, now);
  if (!events.length) return 0;
  const result = await db.notification.createMany({
    data: events.map((event) => ({ userId: auth.id, type: event.type, data: event.data ?? {}, link: event.link ?? null,
      dedupeKey: event.key, createdAt: new Date(event.at) })),
    skipDuplicates: true
  });
  return result.count;
}

export async function listNotifications(userId, { page = 1, pageSize = 20, unreadOnly = false } = {}, db = prisma) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, unreadCount, rows] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, type: true, data: true, link: true, createdAt: true, readAt: true, sender: { select: { displayName: true } } } })
  ]);
  return { data: rows, unreadCount, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export const unreadCount = (userId, db = prisma) => db.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId, { ids, all }, db = prisma) {
  const where = { userId, readAt: null, ...(all ? {} : { id: { in: ids } }) };
  const { count } = await db.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: count, unreadCount: await unreadCount(userId, db) };
}

export const AUDIENCES = { STUDENT: ['STUDENT'], LIBRARIAN: ['LIBRARIAN'], STAFF: ['LIBRARIAN', 'MANAGEMENT'], ALL: ['STUDENT', 'LIBRARIAN', 'MANAGEMENT'] };

/** Management sends a short message to a group of active accounts. */
export async function sendAnnouncement(actor, { audience, title, body, link }, db = prisma) {
  const roles = AUDIENCES[audience];
  if (!roles) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown audience');
  const users = await db.user.findMany({
    where: { isActive: true, id: { not: actor.id }, userRoles: { some: { role: { name: { in: roles } } } } }, select: { id: true }
  });
  if (!users.length) return { sent: 0 };
  const { count } = await db.notification.createMany({
    data: users.map((user) => ({ userId: user.id, type: 'ANNOUNCEMENT', data: { title, body }, link: link ?? null, senderId: actor.id }))
  });
  return { sent: count };
}

export function resetNotificationSyncForTests() { lastSync.clear(); }
