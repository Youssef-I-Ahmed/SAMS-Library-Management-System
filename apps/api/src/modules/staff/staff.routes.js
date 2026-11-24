import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { GROUP_IDS, LIBRARIAN_PERMISSION_GROUPS } from './staff-permissions.js';
import { createLibrarian, listLibrarians, updateLibrarian } from './staff.service.js';

export const staffRouter = Router();
staffRouter.use(authenticate, authorize('MANAGEMENT'));

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
}

const permissions = z.array(z.enum(GROUP_IDS)).max(GROUP_IDS.length).transform((list) => [...new Set(list)]);

staffRouter.get('/permission-groups', (_req, res) => {
  res.json({ data: LIBRARIAN_PERMISSION_GROUPS });
});

staffRouter.get('/librarians', async (req, res, next) => {
  try {
    const query = parse(z.object({ includeInactive: z.enum(['true', 'false']).optional() }).strict(), req.query);
    res.json({ data: await listLibrarians({ includeInactive: query.includeInactive !== 'false' }) });
  } catch (error) { next(error); }
});

staffRouter.post('/librarians', async (req, res, next) => {
  try {
    const body = parse(z.object({
      universityEmail: z.string().trim().email().max(254),
      displayName: z.string().trim().min(2).max(180),
      permissions: permissions.optional()
    }).strict(), req.body);
    res.status(201).json({ data: await createLibrarian(body, req.auth) });
  } catch (error) { next(error); }
});

staffRouter.patch('/librarians/:id', async (req, res, next) => {
  try {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(z.object({
      displayName: z.string().trim().min(2).max(180).optional(),
      isActive: z.boolean().optional(),
      permissions: permissions.optional()
    }).strict().refine((value) => Object.keys(value).length > 0, 'Send at least one field to change'), req.body);
    res.json({ data: await updateLibrarian(id, body, req.auth) });
  } catch (error) { next(error); }
});
