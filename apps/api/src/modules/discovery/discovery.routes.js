import { Router } from 'express';
import { ItemType } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { searchDiscoveryItems } from './discovery.service.js';
import { getDiscoveryItemDetail } from './discovery-detail.service.js';
import { getDiscoveryFacets } from './discovery-facets.service.js';

export const discoveryRouter = Router();

discoveryRouter.use(authenticate);

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

discoveryRouter.get('/facets', async (_req, res, next) => {
  try {
    const data = await getDiscoveryFacets();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

discoveryRouter.get('/items', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        q: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .optional(),
        type: z.nativeEnum(ItemType).optional(),
        categoryId: z.string().uuid().optional(),
        deweyClassificationId: z.string().uuid().optional(),
        language: z.string().trim().max(80).optional(),
        publicationYear: z.coerce
          .number()
          .int()
          .min(1000)
          .max(2100)
          .optional(),
        branchId: z.string().uuid().optional(),
        availableOnly: z
          .enum(['true', 'false'])
          .default('false')
          .transform(
            (value) => value === 'true'
          ),
        sort: z
          .enum([
            'TITLE_ASC',
            'TITLE_DESC',
            'YEAR_DESC',
            'YEAR_ASC',
            'NEWEST'
          ])
          .default('TITLE_ASC'),
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
      await searchDiscoveryItems(query);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

discoveryRouter.get('/items/:id', async (req, res, next) => {
  try {
    const { id } = parseOrThrow(
      z.object({
        id: z.string().uuid()
      }),
      req.params
    );

    const data =
      await getDiscoveryItemDetail(id);

    res.json({ data });
  } catch (error) {
    next(error);
  }
});
