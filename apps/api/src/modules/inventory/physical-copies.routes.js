import { Router } from 'express';
import {
  CopyCondition,
  CopyStatus
} from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  listPhysicalCopies,
  getPhysicalCopy,
  createPhysicalCopy,
  updatePhysicalCopy
} from './physical-copies.service.js';

export const physicalCopiesRouter = Router();

physicalCopiesRouter.use(authenticate);
physicalCopiesRouter.use(
  authorize('LIBRARIAN', 'MANAGEMENT')
);

function parseOrThrow(schema, input) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')
    );
  }

  return parsed.data;
}

physicalCopiesRouter.get('/', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        search: z.string().trim().max(300).optional(),
        itemId: z.string().uuid().optional(),
        branchId: z.string().uuid().optional(),
        status: z.nativeEnum(CopyStatus).optional(),
        condition: z.nativeEnum(CopyCondition).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
      }),
      req.query
    );

    const result = await listPhysicalCopies(query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

physicalCopiesRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(
      z.object({
        id: z.string().uuid()
      }),
      req.params
    );

    const data = await getPhysicalCopy(id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

physicalCopiesRouter.post(
  '/',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(
        z.object({
          itemId: z.string().uuid(),
          branchId: z.string().uuid(),
          copyCode: z.string().trim().max(100).optional().nullable(),
          barcode: z.string().trim().max(150).optional().nullable(),
          shelfLocation: z.string().trim().max(200).optional().nullable(),
          status: z.nativeEnum(CopyStatus).optional(),
          condition: z.nativeEnum(CopyCondition).optional().nullable()
        }),
        req.body
      );

      const data = await createPhysicalCopy(body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

physicalCopiesRouter.patch(
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
        z
          .object({
            version: z.number().int().positive(),
            branchId: z.string().uuid().optional(),
            copyCode: z.string().trim().max(100).optional().nullable(),
            barcode: z.string().trim().max(150).optional().nullable(),
            shelfLocation: z.string().trim().max(200).optional().nullable(),
            status: z.nativeEnum(CopyStatus).optional(),
            condition: z.nativeEnum(CopyCondition).optional().nullable()
          })
          .refine(
            (value) =>
              Object.keys(value).some(
                (key) => key !== 'version'
              ),
            {
              message:
                'At least one editable field is required'
            }
          ),
        req.body
      );

      const data = await updatePhysicalCopy(id, body);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);
