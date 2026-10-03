import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  listDewey,
  createDewey,
  updateDewey
} from './catalog-master.service.js';

export const catalogMasterRouter = Router();

catalogMasterRouter.use(authenticate);

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

const idSchema = z.object({
  id: z.string().uuid()
});

/* Categories */

catalogMasterRouter.get('/categories', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        includeInactive: z.enum(['true', 'false']).optional()
      }),
      req.query
    );

    const data = await listCategories({
      includeInactive: query.includeInactive === 'true'
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

catalogMasterRouter.post(
  '/categories',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(
        z.object({
          name: z.string().trim().min(2).max(150),
          description: z.string().trim().max(500).optional().nullable()
        }),
        req.body
      );

      const data = await createCategory(body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

catalogMasterRouter.patch(
  '/categories/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(idSchema, req.params);

      const body = parseOrThrow(
        z
          .object({
            name: z.string().trim().min(2).max(150).optional(),
            description: z.string().trim().max(500).optional().nullable(),
            isActive: z.boolean().optional()
          })
          .refine((value) => Object.keys(value).length > 0, {
            message: 'At least one field is required'
          }),
        req.body
      );

      const data = await updateCategory(id, body);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/* Dewey */

catalogMasterRouter.get('/dewey', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        parentId: z.string().uuid().optional(),
        search: z.string().trim().max(100).optional()
      }),
      req.query
    );

    const data = await listDewey(query);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

catalogMasterRouter.post(
  '/dewey',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(
        z.object({
          code: z.string().trim().min(1).max(50),
          name: z.string().trim().min(2).max(200),
          parentId: z.string().uuid().optional().nullable()
        }),
        req.body
      );

      const data = await createDewey(body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

catalogMasterRouter.patch(
  '/dewey/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(idSchema, req.params);

      const body = parseOrThrow(
        z
          .object({
            code: z.string().trim().min(1).max(50).optional(),
            name: z.string().trim().min(2).max(200).optional(),
            parentId: z.string().uuid().optional().nullable()
          })
          .refine((value) => Object.keys(value).length > 0, {
            message: 'At least one field is required'
          }),
        req.body
      );

      const data = await updateDewey(id, body);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);
