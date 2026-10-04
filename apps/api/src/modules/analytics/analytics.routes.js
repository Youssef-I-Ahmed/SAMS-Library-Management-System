import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  getAnalyticsBranchComparison,
  getAnalyticsOverview,
  getAnalyticsTrends,
  getTopAnalyticsItems
} from './analytics.service.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

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


function resolveAnalyticsPeriod({
  from,
  to
}) {
  const resolvedTo =
    to ?? new Date();

  const resolvedFrom =
    from ??
    new Date(
      resolvedTo.getTime() -
      30 *
        24 *
        60 *
        60 *
        1000
    );

  if (
    resolvedFrom >=
    resolvedTo
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      '`from` must be before `to`'
    );
  }

  return {
    from: resolvedFrom,
    to: resolvedTo
  };
}

function enforceTrendRange(
  from,
  to,
  bucket
) {
  const days =
    (
      to.getTime() -
      from.getTime()
    ) /
    (
      24 *
      60 *
      60 *
      1000
    );

  const limits = {
    DAY: 366,
    WEEK: 1830,
    MONTH: 3660
  };

  if (
    days >
    limits[bucket]
  ) {
    throw new AppError(
      400,
      'ANALYTICS_RANGE_TOO_LARGE',
      `Date range is too large for ${bucket} buckets`
    );
  }
}

analyticsRouter.get(
  '/overview',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const parsed =
        parseOrThrow(
          z.object({
            branchId:
              z.string()
                .uuid()
                .optional(),
            from:
              z.coerce
                .date()
                .optional(),
            to:
              z.coerce
                .date()
                .optional()
          }),
          req.query
        );

      const {
        from,
        to
      } =
        resolveAnalyticsPeriod(
          parsed
        );

      const data =
        await getAnalyticsOverview({
          branchId:
            parsed.branchId,
          from,
          to
        });

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/trends',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const parsed =
        parseOrThrow(
          z.object({
            branchId:
              z.string()
                .uuid()
                .optional(),
            from:
              z.coerce
                .date()
                .optional(),
            to:
              z.coerce
                .date()
                .optional(),
            bucket:
              z.enum([
                'DAY',
                'WEEK',
                'MONTH'
              ])
              .default('DAY')
          }),
          req.query
        );

      const {
        from,
        to
      } =
        resolveAnalyticsPeriod(
          parsed
        );

      enforceTrendRange(
        from,
        to,
        parsed.bucket
      );

      const data =
        await getAnalyticsTrends({
          branchId:
            parsed.branchId,
          from,
          to,
          bucket:
            parsed.bucket
        });

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/branches',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const parsed =
        parseOrThrow(
          z.object({
            from:
              z.coerce
                .date()
                .optional(),
            to:
              z.coerce
                .date()
                .optional()
          }),
          req.query
        );

      const {
        from,
        to
      } =
        resolveAnalyticsPeriod(
          parsed
        );

      const data =
        await getAnalyticsBranchComparison({
          from,
          to
        });

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/top-items',
  authorize(
    'LIBRARIAN',
    'MANAGEMENT'
  ),
  async (req, res, next) => {
    try {
      const parsed =
        parseOrThrow(
          z.object({
            metric:
              z.enum([
                'BORROWINGS',
                'RESERVATIONS'
              ])
              .default(
                'BORROWINGS'
              ),
            branchId:
              z.string()
                .uuid()
                .optional(),
            from:
              z.coerce
                .date()
                .optional(),
            to:
              z.coerce
                .date()
                .optional(),
            limit:
              z.coerce
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
          }),
          req.query
        );

      const {
        from,
        to
      } =
        resolveAnalyticsPeriod(
          parsed
        );

      const data =
        await getTopAnalyticsItems({
          metric:
            parsed.metric,
          branchId:
            parsed.branchId,
          from,
          to,
          limit:
            parsed.limit
        });

      res.json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

