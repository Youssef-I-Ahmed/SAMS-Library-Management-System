import { Router } from 'express';
import { BorrowingStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  checkoutBorrowing,
  getBorrowingForOperations,
  listBorrowings,
  listMyBorrowings,
  returnBorrowing
} from './borrowings.service.js';

export const borrowingsRouter = Router();

borrowingsRouter.use(authenticate);

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

const checkoutSchema = z
  .object({
    reservationId:
      z.string().uuid().optional(),
    studentNumber:
      z.string().trim().min(1).max(100).optional(),
    copyId:
      z.string().uuid().optional(),
    notes:
      z.string().trim().max(1000).optional()
  })
  .superRefine((value, ctx) => {
    const reservationMode =
      Boolean(value.reservationId);

    const directMode =
      Boolean(
        value.studentNumber &&
        value.copyId
      );

    if (reservationMode === directMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either reservationId OR studentNumber + copyId'
      });
    }
  });

borrowingsRouter.post(
  '/checkout',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body =
        parseOrThrow(
          checkoutSchema,
          req.body
        );

      const data =
        await checkoutBorrowing(
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


const returnSchema = z.object({
  outcome: z.enum([
    'GOOD',
    'FAIR',
    'DAMAGED',
    'LOST'
  ]),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
});

borrowingsRouter.post(
  '/:id/return',
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

      const body =
        parseOrThrow(
          returnSchema,
          req.body
        );

      const data =
        await returnBorrowing(
          req.auth.id,
          id,
          body
        );

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

borrowingsRouter.get(
  '/me',
  authorize('STUDENT'),
  async (req, res, next) => {
    try {
      const query =
        parseOrThrow(
          z.object({
            status: z
              .nativeEnum(BorrowingStatus)
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
        await listMyBorrowings(
          req.auth.id,
          query
        );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

borrowingsRouter.get(
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
            status: z
              .nativeEnum(BorrowingStatus)
              .optional(),
            branchId: z
              .string()
              .uuid()
              .optional(),
            studentNumber:
              z.string()
                .trim()
                .min(1)
                .max(100)
                .optional(),
            overdueOnly: z
              .enum(['true', 'false'])
              .default('false')
              .transform(
                (value) =>
                  value === 'true'
              ),
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
        await listBorrowings(query);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

borrowingsRouter.get(
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
        await getBorrowingForOperations(
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
