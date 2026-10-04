import { Router } from 'express';
import { ReservationStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  cancelReservation,
  createReservation,
  expireDueReservations,
  getReservationForOperations,
  listMyReservations,
  listReservationQueue
} from './reservations.service.js';

export const reservationsRouter = Router();

reservationsRouter.use(authenticate);

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

function readIdempotencyKey(req) {
  const raw = req.get('Idempotency-Key');

  if (!raw) {
    return null;
  }

  return parseOrThrow(
    z.string()
      .trim()
      .min(8)
      .max(200),
    raw
  );
}

reservationsRouter.post(
  '/',
  authorize('STUDENT'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(
        z.object({
          itemId: z.string().uuid(),
          branchId: z.string().uuid()
        }),
        req.body
      );

      const idempotencyKey =
        readIdempotencyKey(req);

      const result =
        await createReservation(
          req.auth.id,
          body,
          {
            idempotencyKey
          }
        );

      res.set(
        'Idempotency-Replayed',
        result.replayed ? 'true' : 'false'
      );

      res.status(201).json({
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
);

reservationsRouter.get(
  '/me',
  authorize('STUDENT'),
  async (req, res, next) => {
    try {
      const query = parseOrThrow(
        z.object({
          status: z
            .nativeEnum(ReservationStatus)
            .optional(),
          page: z.coerce
            .number()
            .int()
            .min(1)
            .default(1),
          pageSize: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
        }),
        req.query
      );

      const result =
        await listMyReservations(
          req.auth.id,
          query
        );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

reservationsRouter.post(
  '/expire-due',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const query = parseOrThrow(
        z.object({
          limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(500)
            .default(100)
        }),
        req.query
      );

      const data =
        await expireDueReservations(query);

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

reservationsRouter.get(
  '/',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const query = parseOrThrow(
        z.object({
          q: z.string()
            .trim()
            .min(1)
            .max(300)
            .optional(),
          status: z
            .nativeEnum(ReservationStatus)
            .optional(),
          branchId: z
            .string()
            .uuid()
            .optional(),
          itemId: z
            .string()
            .uuid()
            .optional(),
          studentUserId: z
            .string()
            .uuid()
            .optional(),
          studentNumber: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .optional(),
          holdState: z
            .enum([
              'VALID',
              'OVERDUE'
            ])
            .optional(),
          page: z.coerce
            .number()
            .int()
            .min(1)
            .default(1),
          pageSize: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
        }),
        req.query
      );

      const result =
        await listReservationQueue(query);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

reservationsRouter.post(
  '/:id/cancel',
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({
          id: z.string().uuid()
        }),
        req.params
      );

      const data =
        await cancelReservation(
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

reservationsRouter.get(
  '/:id',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({
          id: z.string().uuid()
        }),
        req.params
      );

      const data =
        await getReservationForOperations(
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
