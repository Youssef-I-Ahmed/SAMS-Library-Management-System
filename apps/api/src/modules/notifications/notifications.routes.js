import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { audited } from '../../utils/audit.js';
import { AUDIENCES, listNotifications, markRead, sendAnnouncement, syncNotifications, unreadCount } from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}

// A failed sync must not hide the notifications that already exist.
async function sync(req) {
  try { await syncNotifications(req.auth); } catch (error) { console.error(`[notifications] sync failed: ${error?.code || error?.name || 'error'}`); }
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional()
}).strict();

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const query = parse(listQuery, req.query);
    await sync(req);
    res.json(await listNotifications(req.auth.id, { page: query.page, pageSize: query.pageSize, unreadOnly: query.unread === 'true' }));
  } catch (error) { next(error); }
});

notificationsRouter.get('/unread-count', async (req, res, next) => {
  try {
    await sync(req);
    res.json({ data: { unreadCount: await unreadCount(req.auth.id) } });
  } catch (error) { next(error); }
});

const readBody = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict()
]);

notificationsRouter.post('/read', async (req, res, next) => {
  try {
    const body = parse(readBody, req.body ?? {});
    res.json({ data: await markRead(req.auth.id, body) });
  } catch (error) { next(error); }
});

const announcementBody = z.object({
  audience: z.enum(Object.keys(AUDIENCES)),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(1000).default(''),
  link: z.string().trim().regex(/^\/(student|librarian|management)(\/[A-Za-z0-9/_-]*)?$/).optional()
}).strict();

notificationsRouter.post('/announcements', authorize('MANAGEMENT'),
  audited('ANNOUNCEMENT_SENT', 'Notification', { entityId: () => 'announcement', label: (req) => `${req.body?.audience}: ${req.body?.title}` }),
  async (req, res, next) => {
    try {
      const body = parse(announcementBody, req.body);
      res.status(201).json({ data: await sendAnnouncement(req.auth, body) });
    } catch (error) { next(error); }
  });
