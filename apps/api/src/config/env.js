import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),API_PORT:z.coerce.number().int().positive().default(4000),WEB_ORIGIN:z.string().default('http://localhost:5173'),DATABASE_URL:z.string().min(1)});
export const env=schema.parse(process.env);
