import { Router } from 'express';
import { ContributorRole, ItemType } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  listLibraryItems,
  getLibraryItem,
  createLibraryItem,
  updateLibraryItem
} from './library-items.service.js';
import {
  putBookDetails,
  putAcademicWorkDetails
} from './item-details.service.js';
import {
  listItemContributors,
  replaceItemContributors
} from './item-contributors.service.js';

export const libraryItemsRouter = Router();

libraryItemsRouter.use(authenticate);

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

function canSeeInactive(req) {
  return req.auth.roles.some((role) =>
    ['LIBRARIAN', 'MANAGEMENT'].includes(role)
  );
}

const nullableUuid = z.union([z.string().uuid(), z.null()]);

const createSchema = z.object({
  type: z.nativeEnum(ItemType),
  title: z.string().trim().min(2).max(500),
  categoryId: z.string().uuid().optional().nullable(),
  deweyClassificationId: z.string().uuid().optional().nullable(),
  deweyCodeRaw: z.string().trim().max(100).optional().nullable(),
  callNumber: z.string().trim().max(150).optional().nullable(),
  language: z.string().trim().max(80).optional().nullable(),
  publicationYear: z.number().int().min(1000).max(2100).optional().nullable(),
  abstract: z.string().trim().max(10000).optional().nullable()
});

const updateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(2).max(500).optional(),
    categoryId: nullableUuid.optional(),
    deweyClassificationId: nullableUuid.optional(),
    deweyCodeRaw: z.string().trim().max(100).optional().nullable(),
    callNumber: z.string().trim().max(150).optional().nullable(),
    language: z.string().trim().max(80).optional().nullable(),
    publicationYear: z.number().int().min(1000).max(2100).optional().nullable(),
    abstract: z.string().trim().max(10000).optional().nullable(),
    isActive: z.boolean().optional()
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'version'),
    { message: 'At least one editable field is required' }
  );

const bookDetailsSchema = z.object({
  version: z.number().int().positive(),
  isbn: z.string().trim().max(50).optional().nullable(),
  publisher: z.string().trim().max(300).optional().nullable(),
  edition: z.string().trim().max(100).optional().nullable()
});

const academicWorkDetailsSchema = z.object({
  version: z.number().int().positive(),
  facultyId: nullableUuid.optional(),
  departmentId: nullableUuid.optional(),
  academicYear: z.string().trim().max(50).optional().nullable()
});

const itemContributorsSchema = z
  .object({
    version: z.number().int().positive(),
    contributors: z
      .array(
        z.object({
          contributorId: z.string().uuid(),
          role: z.nativeEnum(ContributorRole)
        })
      )
      .max(100)
  })
  .superRefine((value, ctx) => {
    const seen = new Set();

    value.contributors.forEach((entry, index) => {
      const key = `${entry.contributorId}:${entry.role}`;

      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contributors', index],
          message: 'Duplicate contributor + role pair'
        });
      }

      seen.add(key);
    });
  });

libraryItemsRouter.get('/', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        search: z.string().trim().max(300).optional(),
        type: z.nativeEnum(ItemType).optional(),
        categoryId: z.string().uuid().optional(),
        deweyClassificationId: z.string().uuid().optional(),
        language: z.string().trim().max(80).optional(),
        publicationYear: z.coerce.number().int().min(1000).max(2100).optional(),
        includeInactive: z.enum(['true', 'false']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20)
      }),
      req.query
    );

    const requestedInactive = query.includeInactive === 'true';

    if (requestedInactive && !canSeeInactive(req)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Students cannot browse archived library items'
      );
    }

    const result = await listLibraryItems({
      ...query,
      includeInactive: requestedInactive
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

libraryItemsRouter.get('/:id/contributors', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(
      z.object({ id: z.string().uuid() }),
      req.params
    );

    const data = await listItemContributors(id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

libraryItemsRouter.put(
  '/:id/contributors',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({ id: z.string().uuid() }),
        req.params
      );

      const body = parseOrThrow(itemContributorsSchema, req.body);
      const data = await replaceItemContributors(id, body);

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

libraryItemsRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(
      z.object({ id: z.string().uuid() }),
      req.params
    );

    const query = parseOrThrow(
      z.object({
        includeInactive: z.enum(['true', 'false']).optional()
      }),
      req.query
    );

    const requestedInactive = query.includeInactive === 'true';

    if (requestedInactive && !canSeeInactive(req)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Students cannot access archived library items'
      );
    }

    const data = await getLibraryItem(id, {
      includeInactive: requestedInactive
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

libraryItemsRouter.post(
  '/',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(createSchema, req.body);
      const data = await createLibraryItem(body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

libraryItemsRouter.patch(
  '/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({ id: z.string().uuid() }),
        req.params
      );

      const body = parseOrThrow(updateSchema, req.body);
      const data = await updateLibraryItem(id, body);

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

libraryItemsRouter.put(
  '/:id/book-details',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({ id: z.string().uuid() }),
        req.params
      );

      const body = parseOrThrow(bookDetailsSchema, req.body);
      const data = await putBookDetails(id, body);

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

libraryItemsRouter.put(
  '/:id/academic-work-details',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(
        z.object({ id: z.string().uuid() }),
        req.params
      );

      const body = parseOrThrow(academicWorkDetailsSchema, req.body);
      const data = await putAcademicWorkDetails(id, body);

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);
