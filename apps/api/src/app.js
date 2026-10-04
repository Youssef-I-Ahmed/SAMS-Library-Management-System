import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { masterDataRouter } from './modules/master-data/master-data.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { catalogMasterRouter } from './modules/catalog-master/catalog-master.routes.js';
import { libraryItemsRouter } from './modules/catalog/library-items.routes.js';
import { contributorsRouter } from './modules/catalog/contributors.routes.js';
import { physicalCopiesRouter } from './modules/inventory/physical-copies.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { discoveryRouter } from './modules/discovery/discovery.routes.js';
import { reservationsRouter } from './modules/reservations/reservations.routes.js';
import { borrowingsRouter } from './modules/borrowings/borrowings.routes.js';
import { visitsRouter } from './modules/visits/visits.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { requestContext } from './middleware/request-context.js';
import { requestLogger } from './middleware/request-logger.js';
import {
  corsOptions,
  rejectTrace
} from './middleware/security.js';
import {
  notFound,
  errorHandler
} from './middleware/error-handler.js';

export const app =
  express();

// Correlation ID comes first so even rejected requests
// and parser errors can be traced safely.
app.use(
  requestContext
);

app.use(
  requestLogger
);

app.use(
  helmet()
);

app.use(
  rejectTrace
);

app.use(
  cors(
    corsOptions
  )
);

app.use(
  express.json({
    limit:
      env.API_JSON_LIMIT,
    strict: true,
    type:
      'application/json'
  })
);

app.get(
  '/',
  (
    _req,
    res
  ) => {
    res.json({
      service:
        'SAMS Library API',
      version:
        'v1'
    });
  }
);

app.use(
  '/api/v1/health',
  healthRouter
);

app.use(
  '/api/v1/auth',
  authRouter
);

app.use(
  '/api/v1/master-data',
  masterDataRouter
);

app.use(
  '/api/v1/students',
  studentsRouter
);

app.use(
  '/api/v1/catalog-master',
  catalogMasterRouter
);

app.use(
  '/api/v1/catalog/contributors',
  contributorsRouter
);

app.use(
  '/api/v1/catalog/items',
  availabilityRouter
);

app.use(
  '/api/v1/catalog/items',
  libraryItemsRouter
);

app.use(
  '/api/v1/inventory/copies',
  physicalCopiesRouter
);

app.use(
  '/api/v1/discovery',
  discoveryRouter
);

app.use(
  '/api/v1/reservations',
  reservationsRouter
);

app.use(
  '/api/v1/borrowings',
  borrowingsRouter
);

app.use(
  '/api/v1/visits',
  visitsRouter
);

app.use(
  '/api/v1/analytics',
  analyticsRouter
);

app.use(
  notFound
);

app.use(
  errorHandler
);
