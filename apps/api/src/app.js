import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { masterDataRouter } from './modules/master-data/master-data.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { notFound, errorHandler } from './middleware/error-handler.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({ service: 'SAMS Library API', version: 'v1' });
});

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/master-data', masterDataRouter);
app.use('/api/v1/students', studentsRouter);

app.use(notFound);
app.use(errorHandler);
