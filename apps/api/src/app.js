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
import { notFound, errorHandler } from './middleware/error-handler.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    service: 'SAMS Library API',
    version: 'v1'
  });
});

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/master-data', masterDataRouter);
app.use('/api/v1/students', studentsRouter);
app.use('/api/v1/catalog-master', catalogMasterRouter);
app.use('/api/v1/catalog/contributors', contributorsRouter);

/*
 * Keep this before the generic library-items router so
 * /:itemId/availability is resolved explicitly.
 */
app.use('/api/v1/catalog/items', availabilityRouter);
app.use('/api/v1/catalog/items', libraryItemsRouter);

app.use('/api/v1/inventory/copies', physicalCopiesRouter);

app.use(notFound);
app.use(errorHandler);
