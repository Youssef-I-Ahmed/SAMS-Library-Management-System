import { Router } from 'express';
import { VisitSource } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  checkInVisit,
  checkOutVisit,
  getVisitForOperations,
  listVisits
} from './visits.service.js';

export const visitsRouter = Router();

visitsRouter.use(authenticate);

function parseOrThrow(
  schema,
  input
) {
  const parsed =
    schema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues
        .map(
          (issue) =>
            issue.message
        )
        .join('; ')
    );
  }

  return parsed.data;
}

visitsRouter.post(
  '/check-in',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body =
        parseOrThrow(
          z.object({
            studentNumber:
              z.string()
                .trim()
                .min(1)
                .max(100),
            branchId:
              z.string().uuid(),
            source:
              z.nativeEnum(
                VisitSource
              )
              .default('MANUAL')
          }),
          req.body
        );

      const data =
        await checkInVisit(
          req.auth.id,
          body
        );

      res.status(201).json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

visitsRouter.post(
  '/:id/check-out',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } =
        parseOrThrow(
          z.object({
            id: z.string().uuid()
          }),
          req.params
        );

      const data =
        await checkOutVisit(
          req.auth.id,
          id
        );

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

visitsRouter.get(
  '/',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const query =
        parseOrThrow(
          z.object({
            q: z.string()
              .trim()
              .min(1)
              .max(300)
              .optional(),
            branchId:
              z.string()
                .uuid()
                .optional(),
            studentNumber:
              z.string()
                .trim()
                .min(1)
                .max(100)
                .optional(),
            source:
              z.nativeEnum(
                VisitSource
              )
              .optional(),
            openOnly:
              z.enum([
                'true',
                'false'
              ])
              .default('false')
              .transform(
                (value) =>
                  value === 'true'
              ),
            from:
              z.coerce
                .date()
                .optional(),
            to:
              z.coerce
                .date()
                .optional(),
            page:
              z.coerce
                .number()
                .int()
                .min(1)
                .default(1),
            pageSize:
              z.coerce
                .number()
                .int()
                .min(1)
                .max(100)
                .default(20)
          }),
          req.query
        );

      if (
        query.from &&
        query.to &&
        query.from > query.to
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          '`from` must be before or equal to `to`'
        );
      }

      const result =
        await listVisits(query);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

visitsRouter.get(
  '/:id',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const { id } =
        parseOrThrow(
          z.object({
            id: z.string().uuid()
          }),
          req.params
        );

      const data =
        await getVisitForOperations(
          id
        );

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);
