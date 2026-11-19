import { Router } from 'express';
import { z } from 'zod';
import { AcademicStatus } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import { listStudents, getStudentByStudentId } from './students.service.js';

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
