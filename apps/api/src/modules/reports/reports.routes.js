import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { CONTENT_TYPES, FORMATS } from '../catalog-transfer/tabular.js';
import { securityAlerts, staffPerformance, staffPerformanceFile } from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate, authorize('MANAGEMENT'));

const rangeQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  format: z.enum(FORMATS).optional()
}).strict().refine((value) => !value.from || !value.to || new Date(value.from) < new Date(value.to), 'from must be before to');

function parse(input) {
  const parsed = rangeQuery.safeParse(input);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}

reportsRouter.get('/staff-performance', async (req, res, next) => {
  try {
    const query = parse(req.query);
    if (query.format) {
      const buffer = await staffPerformanceFile(query, query.format);
      res.setHeader('Content-Type', CONTENT_TYPES[query.format]);
      res.setHeader('Content-Disposition', `attachment; filename="sams-staff-performance-${new Date().toISOString().slice(0, 10)}.${query.format}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(buffer);
    }
    res.json(await staffPerformance(query));
  } catch (error) { next(error); }
});

reportsRouter.get('/security-alerts', async (req, res, next) => {
  try {
    res.json(await securityAlerts(parse(req.query)));
  } catch (error) { next(error); }
});
