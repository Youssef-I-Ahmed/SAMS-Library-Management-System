import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { getItemAvailability } from './availability.service.js';

export const availabilityRouter = Router();

availabilityRouter.use(authenticate);

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

availabilityRouter.get(
  '/:itemId/availability',
  async (req, res, next) => {
    try {
      const { itemId } = parseOrThrow(
        z.object({
          itemId: z.string().uuid()
        }),
        req.params
      );

      const data = await getItemAvailability(itemId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);
