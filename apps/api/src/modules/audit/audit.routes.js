import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';

export const auditRouter = Router();
auditRouter.use(authenticate, authorize('MANAGEMENT'));

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}

const listQuery = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  actorUserId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
}).strict();

export function auditWhere({ action, entityType, actorUserId, from, to }) {
  return {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {})
  };
}

auditRouter.get('/', async (req, res, next) => {
  try {
    const query = parse(listQuery, req.query);
    const where = auditWhere(query);
    const [total, rows] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { id: true, action: true, entityType: true, entityId: true, oldValues: true, newValues: true, metadata: true, createdAt: true,
          actor: { select: { id: true, displayName: true, universityEmail: true } } }
      })
    ]);
    res.json({ data: rows, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
  } catch (error) { next(error); }
});

// Values for the filter menus: the actions and the people that appear in the log.
auditRouter.get('/facets', async (_req, res, next) => {
  try {
    const [actions, actors] = await Promise.all([
      prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
      prisma.auditLog.groupBy({ by: ['actorUserId'], _count: { _all: true } })
    ]);
    const ids = actors.map((row) => row.actorUserId).filter(Boolean);
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, universityEmail: true } }) : [];
    res.json({ data: {
      actions: actions.map((row) => ({ action: row.action, count: row._count._all })),
      actors: users.map((user) => ({ ...user, count: actors.find((row) => row.actorUserId === user.id)._count._all }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    } });
  } catch (error) { next(error); }
});
