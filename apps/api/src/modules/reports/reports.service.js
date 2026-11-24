// Management reports: what each staff member did, and security alerts.
// Both read only from the audit log and the circulation tables.
import { prisma } from '../../config/prisma.js';
import { serializeTable } from '../catalog-transfer/tabular.js';

const MAX_EVENTS = 50000;
const TIME_ZONE = 'Africa/Cairo';
const hourIn = (date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));
const dayIn = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);

export const PERFORMANCE_COLUMNS = ['name', 'email', 'roles', 'checkouts', 'returns', 'visits', 'catalog', 'copies',
  'students', 'reservations', 'total', 'active_days', 'last_active'];

const GROUPS = [
  ['catalog', (action) => action.startsWith('CATALOG_')],
  ['copies', (action) => action.startsWith('COPY_')],
  ['students', (action) => action.startsWith('STUDENT_')],
  ['reservations', (action) => action.startsWith('RESERVATION')]
];

function range({ from, to }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  return { gte: start, lt: end };
}

async function staffUsers(db) {
  const users = await db.user.findMany({
    where: { userRoles: { some: { role: { name: { in: ['LIBRARIAN', 'MANAGEMENT'] } } } } },
    select: { id: true, displayName: true, universityEmail: true, isActive: true, userRoles: { select: { role: { select: { name: true } } } } }
  });
  return new Map(users.map((user) => [user.id, user]));
}

export async function staffPerformance(filters, db = prisma) {
  const when = range(filters);
  const [staff, checkouts, returns, visits, events] = await Promise.all([
    staffUsers(db),
    db.borrowing.groupBy({ by: ['checkedOutById'], where: { borrowedAt: when }, _count: { _all: true } }),
    db.borrowing.groupBy({ by: ['returnedById'], where: { returnedAt: when, returnedById: { not: null } }, _count: { _all: true } }),
    db.libraryVisit.groupBy({ by: ['registeredById'], where: { checkedInAt: when }, _count: { _all: true } }),
    db.auditLog.findMany({ where: { createdAt: when, actorUserId: { not: null }, entityType: { not: 'Security' } },
      select: { actorUserId: true, action: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: MAX_EVENTS })
  ]);
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { userId: id, checkouts: 0, returns: 0, visits: 0, catalog: 0, copies: 0, students: 0,
      reservations: 0, days: new Set(), lastActive: null });
    return rows.get(id);
  };
  for (const entry of checkouts) row(entry.checkedOutById).checkouts = entry._count._all;
  for (const entry of returns) row(entry.returnedById).returns = entry._count._all;
  for (const entry of visits) row(entry.registeredById).visits = entry._count._all;
  for (const event of events) {
    const target = row(event.actorUserId);
    const group = GROUPS.find(([, test]) => test(event.action));
    if (group) target[group[0]] += 1;
    target.days.add(dayIn(event.createdAt));
    if (!target.lastActive || event.createdAt > target.lastActive) target.lastActive = event.createdAt;
  }
  const data = [...rows.values()].filter((entry) => staff.has(entry.userId)).map((entry) => {
    const user = staff.get(entry.userId);
    const { days, ...counts } = entry;
    return {
      ...counts,
      displayName: user.displayName,
      universityEmail: user.universityEmail,
      isActive: user.isActive,
      roles: user.userRoles.map(({ role }) => role.name),
      activeDays: days.size,
      total: entry.checkouts + entry.returns + entry.visits + entry.catalog + entry.copies + entry.students + entry.reservations
    };
  });
  // Staff with no activity still appear, so a quiet account is visible too.
  for (const [id, user] of staff) {
    if (!rows.has(id)) data.push({ userId: id, displayName: user.displayName, universityEmail: user.universityEmail, isActive: user.isActive,
      roles: user.userRoles.map(({ role }) => role.name), checkouts: 0, returns: 0, visits: 0, catalog: 0, copies: 0, students: 0,
      reservations: 0, total: 0, activeDays: 0, lastActive: null });
  }
  data.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  return { range: { from: when.gte, to: when.lt }, data, truncated: events.length === MAX_EVENTS };
}

export async function staffPerformanceFile(filters, format, db = prisma) {
  const { data } = await staffPerformance(filters, db);
  return serializeTable(format, PERFORMANCE_COLUMNS, data.map((entry) => ({
    name: entry.displayName, email: entry.universityEmail, roles: entry.roles.join(', '),
    checkouts: entry.checkouts, returns: entry.returns, visits: entry.visits, catalog: entry.catalog, copies: entry.copies,
    students: entry.students, reservations: entry.reservations, total: entry.total, active_days: entry.activeDays,
    last_active: entry.lastActive ? new Date(entry.lastActive).toISOString() : ''
  })), { sheetName: 'Staff performance' });
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

/**
 * Alerts worth a look, newest first:
 * denied attempts, failed sign-ins, permission and account changes, bulk
 * changes, and staff activity late at night (Cairo time).
 */
export async function securityAlerts(filters, db = prisma) {
  const when = range({ from: filters.from ?? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), to: filters.to });
  const [staff, events] = await Promise.all([
    staffUsers(db),
    db.auditLog.findMany({ where: { createdAt: when }, orderBy: { createdAt: 'desc' }, take: MAX_EVENTS,
      select: { id: true, actorUserId: true, action: true, entityId: true, metadata: true, newValues: true, createdAt: true } })
  ]);
  const who = (id) => (id && staff.get(id)) ? { id, displayName: staff.get(id).displayName, universityEmail: staff.get(id).universityEmail } : null;
  const alerts = [];
  const grouped = (list, key) => list.reduce((map, event) => map.set(key(event), [...(map.get(key(event)) || []), event]), new Map());

  for (const [actorId, list] of grouped(events.filter((e) => e.action === 'ACCESS_DENIED'), (e) => e.actorUserId)) {
    alerts.push({ type: 'ACCESS_DENIED', severity: list.length >= 5 ? 'high' : 'medium', count: list.length, actor: who(actorId),
      at: list[0].createdAt, details: { permissions: [...new Set(list.map((e) => e.metadata?.permission || e.metadata?.path).filter(Boolean))].slice(0, 8) } });
  }
  for (const [email, list] of grouped(events.filter((e) => e.action === 'LOGIN_FAILED'), (e) => e.metadata?.email || 'unknown')) {
    alerts.push({ type: 'LOGIN_FAILED', severity: list.length >= 5 ? 'high' : 'low', count: list.length, actor: null,
      at: list[0].createdAt, details: { email } });
  }
  for (const event of events.filter((e) => ['LIBRARIAN_PERMISSIONS_CHANGED', 'LIBRARIAN_CREATED', 'LIBRARIAN_ACTIVATED', 'LIBRARIAN_DEACTIVATED'].includes(e.action))) {
    const target = staff.get(event.entityId);
    alerts.push({ type: event.action, severity: 'info', count: 1, actor: who(event.actorUserId), at: event.createdAt,
      details: { target: target?.displayName ?? event.newValues?.displayName ?? null, added: event.metadata?.added ?? null, removed: event.metadata?.removed ?? null } });
  }
  for (const event of events.filter((e) => e.action === 'CATALOG_IMPORTED')) {
    alerts.push({ type: 'BULK_IMPORT', severity: 'info', count: 1, actor: who(event.actorUserId), at: event.createdAt,
      details: { label: event.metadata?.label ?? null } });
  }
  const studentImports = events.filter((e) => e.metadata?.source === 'file-import');
  for (const [key, list] of grouped(studentImports, (e) => `${e.actorUserId}|${dayIn(e.createdAt)}`)) {
    if (list.length < 20) continue;
    alerts.push({ type: 'BULK_STUDENT_CHANGES', severity: list.length >= 200 ? 'medium' : 'info', count: list.length,
      actor: who(key.split('|')[0]), at: list[0].createdAt, details: { day: key.split('|')[1] } });
  }
  const lateNight = events.filter((e) => e.actorUserId && staff.has(e.actorUserId) && e.action !== 'LOGIN_SUCCEEDED'
    && e.action !== 'ACCESS_DENIED' && (hourIn(e.createdAt) >= 22 || hourIn(e.createdAt) < 6));
  for (const [key, list] of grouped(lateNight, (e) => `${e.actorUserId}|${dayIn(e.createdAt)}`)) {
    alerts.push({ type: 'OFF_HOURS', severity: 'low', count: list.length, actor: who(key.split('|')[0]), at: list[0].createdAt,
      details: { day: key.split('|')[1] } });
  }
  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || new Date(b.at) - new Date(a.at));
  const summary = Object.fromEntries(Object.keys(SEVERITY_ORDER).map((level) => [level, alerts.filter((a) => a.severity === level).length]));
  return { range: { from: when.gte, to: when.lt }, summary, data: alerts };
}
