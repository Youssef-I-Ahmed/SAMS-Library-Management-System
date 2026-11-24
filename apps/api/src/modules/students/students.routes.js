import express, { Router } from 'express';
import { z } from 'zod';
import { AcademicStatus } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { listStudents, getStudentByStudentId, saveStudent, updateStudent } from './students.service.js';
import {
  analyzeStudentImport, buildStudentExport, buildStudentTemplate, commitStudentImport
} from './student-transfer.js';
import { CONTENT_TYPES, FORMATS } from '../catalog-transfer/tabular.js';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

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

studentsRouter.get(
  '/',
  authorize('LIBRARIAN', 'MANAGEMENT'),
  async (req, res, next) => {
    try {
      const query = parseOrThrow(
        z.object({
          search: z.string().trim().max(180).optional(),
          facultyId: z.string().uuid().optional(),
          departmentId: z.string().uuid().optional(),
          academicStatus: z.nativeEnum(AcademicStatus).optional(),
          includeInactive: z.enum(['true', 'false']).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20)
        }),
        req.query
      );

      const result = await listStudents({
        ...query,
        includeInactive: query.includeInactive === 'true'
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ---- Student accounts managed by librarians -------------------------------

const optionalName = z.string().trim().min(2).max(150).nullable().optional();
const studentFields = {
  universityEmail: z.string().trim().email().max(254),
  displayName: z.string().trim().min(2).max(180),
  facultyName: optionalName,
  departmentName: optionalName,
  academicStatus: z.nativeEnum(AcademicStatus).optional(),
  isActive: z.boolean().optional()
};

function sendFile(res, buffer, fileFormat, name) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', CONTENT_TYPES[fileFormat]);
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp}.${fileFormat}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

const format = z.enum(FORMATS);

studentsRouter.get('/transfer/template', authorize('LIBRARIAN', 'MANAGEMENT'), (req, res, next) => {
  try {
    const query = parseOrThrow(z.object({ format }).strict(), req.query);
    sendFile(res, buildStudentTemplate(query.format), query.format, 'sams-students-template');
  } catch (error) { next(error); }
});

studentsRouter.get('/transfer/export', authorize('LIBRARIAN', 'MANAGEMENT'), async (req, res, next) => {
  try {
    const query = parseOrThrow(z.object({
      format,
      search: z.string().trim().max(180).optional(),
      academicStatus: z.nativeEnum(AcademicStatus).optional(),
      includeInactive: z.enum(['true', 'false']).optional()
    }).strict(), req.query);
    const buffer = await buildStudentExport({ ...query, includeInactive: query.includeInactive === 'true' });
    sendFile(res, buffer, query.format, 'sams-students');
  } catch (error) { next(error); }
});

const upload = express.raw({ type: 'application/octet-stream', limit: '8mb' });

function importOptions(req) {
  const query = parseOrThrow(z.object({
    format,
    mapping: z.string().max(10000).optional(),
    updateExisting: z.enum(['true', 'false']).optional()
  }).strict(), req.query);
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
  return { format: query.format, mapping, updateExisting: query.updateExisting === 'true', actor: req.auth };
}

studentsRouter.post('/transfer/preview', authorize('LIBRARIAN'), upload, async (req, res, next) => {
  try {
    res.json({ data: await analyzeStudentImport(req.body, importOptions(req)) });
  } catch (error) { next(error); }
});

studentsRouter.post('/transfer/commit', authorize('LIBRARIAN'), upload, async (req, res, next) => {
  try {
    res.json({ data: await commitStudentImport(req.body, importOptions(req)) });
  } catch (error) { next(error); }
});

studentsRouter.post('/', authorize('LIBRARIAN'), async (req, res, next) => {
  try {
    const body = parseOrThrow(z.object({ studentId: z.string().trim().min(1).max(80), ...studentFields }).strict(), req.body);
    const result = await saveStudent(body, { mode: 'create', actor: req.auth });
    res.status(201).json({ data: await getStudentByStudentId(result.studentId) });
  } catch (error) { next(error); }
});

studentsRouter.patch('/:studentId', authorize('LIBRARIAN'), async (req, res, next) => {
  try {
    const { studentId } = parseOrThrow(z.object({ studentId: z.string().trim().min(1).max(80) }), req.params);
    const body = parseOrThrow(z.object({
      ...studentFields,
      universityEmail: studentFields.universityEmail.optional(),
      displayName: studentFields.displayName.optional()
    }).strict().refine((value) => Object.keys(value).length > 0, 'Send at least one field to change'), req.body);
    await updateStudent(studentId, body, { actor: req.auth });
    res.json({ data: await getStudentByStudentId(studentId) });
  } catch (error) { next(error); }
});

studentsRouter.get(
  '/:studentId',
  authorize('LIBRARIAN', 'MANAGEMENT'),
  async (req, res, next) => {
    try {
      const { studentId } = parseOrThrow(
        z.object({ studentId: z.string().trim().min(1).max(80) }),
        req.params
      );

      const student = await getStudentByStudentId(studentId);
      res.json({ data: student });
    } catch (error) {
      next(error);
    }
  }
);

studentsRouter.post(
  '/import',
  (_req, _res, next) => {
    // No trusted integration principal or explicit import grant exists yet.
    // Fail closed in every environment; never substitute a role or dev bypass.
    next(new AppError(403, 'STUDENT_IMPORT_NOT_CONFIGURED',
      'Student import is disabled until trusted university integration authorization is configured'));
  }
);
