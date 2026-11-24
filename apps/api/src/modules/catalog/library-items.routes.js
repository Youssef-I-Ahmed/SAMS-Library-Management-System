import express, { Router } from 'express';
import { ContributorRole, ItemType } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { audited } from '../../utils/audit.js';
import { requireGrant } from '../../middleware/require-grant.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { assertInactiveAccess, canSeeInactive } from './catalog-visibility.js';
import { MAX_COVER_BYTES, deleteCover, saveCover } from './covers.js';
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
  academicYear: z.string().trim().max(50).optional().nullable(),
  subjectIds: z.array(z.string().uuid()).max(100).optional()
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

    if (requestedInactive && !canSeeInactive(req.auth)) {
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

    const query = parseOrThrow(z.object({ includeInactive: z.enum(['true', 'false']).optional() }), req.query);
    const includeInactive = assertInactiveAccess(req.auth, query.includeInactive === 'true');
    const data = await listItemContributors(id, { includeInactive });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

libraryItemsRouter.put(
  '/:id/contributors',
  authorize('LIBRARIAN'),
  requireGrant('catalog.update'),
  audited('CATALOG_ITEM_UPDATED', 'LibraryItem', { entityId: (req) => req.params.id }),
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

    if (requestedInactive && !canSeeInactive(req.auth)) {
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
  requireGrant('catalog.create'),
  audited('CATALOG_ITEM_CREATED', 'LibraryItem', { label: (_req, body) => body?.data?.title }),
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
  requireGrant('catalog.update'),
  (req, res, next) => (req.body && Object.hasOwn(req.body, 'isActive')
    ? requireGrant(req.body.isActive === false ? 'catalog.archive' : 'catalog.restore')(req, res, next) : next()),
  audited((req) => (req.body?.isActive === false ? 'CATALOG_ITEM_ARCHIVED' : req.body?.isActive === true ? 'CATALOG_ITEM_RESTORED' : 'CATALOG_ITEM_UPDATED'),
    'LibraryItem', { label: (_req, body) => body?.data?.title }),
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
  requireGrant('catalog.update'),
  audited('CATALOG_ITEM_UPDATED', 'LibraryItem', { entityId: (req) => req.params.id }),
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
  requireGrant('catalog.update'),
  audited('CATALOG_ITEM_UPDATED', 'LibraryItem', { entityId: (req) => req.params.id }),
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

const coverUpload = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: MAX_COVER_BYTES });
const coverId = (req) => parseOrThrow(z.object({ id: z.string().uuid() }), req.params).id;

libraryItemsRouter.put(
  '/:id/cover',
  authorize('LIBRARIAN'),
  requireGrant('catalog.update'),
  audited('CATALOG_COVER_UPLOADED', 'LibraryItem', { label: (_req, body) => body?.data?.title }),
  coverUpload,
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError(400, 'COVER_INVALID', 'Upload the image as the request body.');
      res.json({ data: await saveCover(coverId(req), req.body) });
    } catch (error) { next(error); }
  }
);

libraryItemsRouter.delete(
  '/:id/cover',
  authorize('LIBRARIAN'),
  requireGrant('catalog.update'),
  audited('CATALOG_COVER_REMOVED', 'LibraryItem', { label: (_req, body) => body?.data?.title }),
  async (req, res, next) => {
    try {
      res.json({ data: await deleteCover(coverId(req)) });
    } catch (error) { next(error); }
  }
);
