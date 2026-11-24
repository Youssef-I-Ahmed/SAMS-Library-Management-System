import express, { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { analyzeImport, buildExport, buildTemplate, commitImport } from './catalog-transfer.service.js';
import { CONTENT_TYPES, FORMATS } from './tabular.js';

export const catalogTransferRouter = Router();
catalogTransferRouter.use(authenticate);

const MAX_UPLOAD = '8mb';
const format = z.enum(FORMATS);
const type = z.enum(['BOOK', 'ACADEMIC_WORK']);

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  return parsed.data;
}

function sendFile(res, buffer, fileFormat, name) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', CONTENT_TYPES[fileFormat]);
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp}.${fileFormat}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

const importQuery = z.object({
  format,
  type: type.optional(),
  // A JSON object {fileHeader: columnKey | ""}; optional, the server suggests one.
  mapping: z.string().max(20000).optional(),
  duplicatePolicy: z.enum(['skip', 'create']).default('skip')
}).strict();

function importOptions(req) {
  const query = parse(importQuery, req.query);
  let mapping;
  if (query.mapping) {
    try { mapping = JSON.parse(query.mapping); } catch { throw new AppError(400, 'VALIDATION_ERROR', 'mapping must be JSON'); }
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'mapping must be an object');
    }
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    throw new AppError(400, 'IMPORT_FILE_INVALID', 'Upload the file as the request body.');
  }
  return { format: query.format, defaultType: query.type, mapping, duplicatePolicy: query.duplicatePolicy };
}

const upload = express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD });

catalogTransferRouter.get('/template', authorize('LIBRARIAN', 'MANAGEMENT'), (req, res, next) => {
  try {
    const query = parse(z.object({ type, format }).strict(), req.query);
    sendFile(res, buildTemplate(query.type, query.format), query.format,
      query.type === 'BOOK' ? 'sams-books-template' : 'sams-projects-theses-template');
  } catch (error) { next(error); }
});

catalogTransferRouter.get('/export', authorize('LIBRARIAN', 'MANAGEMENT'), async (req, res, next) => {
  try {
    const query = parse(z.object({
      format,
      type: type.optional(),
      search: z.string().trim().max(300).optional(),
      includeInactive: z.enum(['true', 'false']).optional()
    }).strict(), req.query);
    const buffer = await buildExport({ ...query, includeInactive: query.includeInactive === 'true' });
    sendFile(res, buffer, query.format,
      query.type === 'BOOK' ? 'sams-books' : query.type === 'ACADEMIC_WORK' ? 'sams-projects-theses' : 'sams-catalog');
  } catch (error) { next(error); }
});

catalogTransferRouter.post('/import/preview', authorize('LIBRARIAN'), upload, async (req, res, next) => {
  try {
    res.json({ data: await analyzeImport(req.body, importOptions(req)) });
  } catch (error) { next(error); }
});

catalogTransferRouter.post('/import/commit', authorize('LIBRARIAN'), upload, async (req, res, next) => {
  try {
    res.json({ data: await commitImport(req.body, importOptions(req)) });
  } catch (error) { next(error); }
});
