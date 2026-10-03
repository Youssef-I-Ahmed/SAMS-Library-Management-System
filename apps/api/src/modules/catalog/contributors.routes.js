import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  listContributors,
  getContributor,
  createContributor,
  updateContributor
} from './contributors.service.js';

export const contributorsRouter = Router();

contributorsRouter.use(authenticate);

function parseOrThrow(schema, input) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues.map((issue) => issue.message).join('; ')
    );
  }

  return parsed.data;
}

contributorsRouter.get('/', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        search: z.string().trim().max(250).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20)
      }),
      req.query
    );

    const result = await listContributors(query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contributorsRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(
      z.object({
        id: z.string().uuid()
      }),
      req.params
    );

    const data = await getContributor(id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

contributorsRouter.post(
  '/',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(
        z.object({
          fullName: z.string().trim().min(2).max(250)
        }),
        req.body
      );

      const data = await createContributor(body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

contributorsRouter.patch(
  '/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({
          id: z.string().uuid()
        }),
        req.params
      );

      const body = parseOrThrow(
        z.object({
          fullName: z.string().trim().min(2).max(250)
        }),
        req.body
      );

      const data = await updateContributor(id, body);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);
