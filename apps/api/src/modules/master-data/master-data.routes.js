import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { AppError } from '../../utils/app-error.js';
import {
  listFaculties,
  createFaculty,
  updateFaculty,
  listDepartments,
  createDepartment,
  updateDepartment,
  listBranches,
  createBranch,
  updateBranch
} from './master-data.service.js';

export const masterDataRouter = Router();

masterDataRouter.use(authenticate);

const idParamSchema = z.object({
  id: z.string().uuid()
});

const booleanQuery = z.enum(['true', 'false']).optional();

const facultyCreateSchema = z.object({
  name: z.string().trim().min(2).max(150)
});

const facultyUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

const departmentCreateSchema = z.object({
  facultyId: z.string().uuid(),
  name: z.string().trim().min(2).max(150)
});

const departmentUpdateSchema = z
  .object({
    facultyId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(150).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

const branchCreateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(150),
  location: z.string().trim().max(250).optional().nullable()
});

const branchUpdateSchema = z
  .object({
    code: z.string().trim().min(2).max(30).optional(),
    name: z.string().trim().min(2).max(150).optional(),
    location: z.string().trim().max(250).optional().nullable(),
    isActive: z.boolean().optional(),
    version: z.number().int().positive()
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'version'),
    { message: 'At least one editable field is required' }
  );

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

/* Faculties */

masterDataRouter.get('/faculties', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({ includeInactive: booleanQuery }),
      req.query
    );

    const faculties = await listFaculties({
      includeInactive: query.includeInactive === 'true'
    });

    res.json({ data: faculties });
  } catch (error) {
    next(error);
  }
});

masterDataRouter.post(
  '/faculties',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(facultyCreateSchema, req.body);
      const faculty = await createFaculty(body);
      res.status(201).json({ data: faculty });
    } catch (error) {
      next(error);
    }
  }
);

masterDataRouter.patch(
  '/faculties/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(idParamSchema, req.params);
      const body = parseOrThrow(facultyUpdateSchema, req.body);
      const faculty = await updateFaculty(id, body);
      res.json({ data: faculty });
    } catch (error) {
      next(error);
    }
  }
);

/* Departments */

masterDataRouter.get('/departments', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({
        facultyId: z.string().uuid().optional(),
        includeInactive: booleanQuery
      }),
      req.query
    );

    const departments = await listDepartments({
      facultyId: query.facultyId,
      includeInactive: query.includeInactive === 'true'
    });

    res.json({ data: departments });
  } catch (error) {
    next(error);
  }
});

masterDataRouter.post(
  '/departments',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(departmentCreateSchema, req.body);
      const department = await createDepartment(body);
      res.status(201).json({ data: department });
    } catch (error) {
      next(error);
    }
  }
);

masterDataRouter.patch(
  '/departments/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(idParamSchema, req.params);
      const body = parseOrThrow(departmentUpdateSchema, req.body);
      const department = await updateDepartment(id, body);
      res.json({ data: department });
    } catch (error) {
      next(error);
    }
  }
);

/* Branches */

masterDataRouter.get('/branches', async (req, res, next) => {
  try {
    const query = parseOrThrow(
      z.object({ includeInactive: booleanQuery }),
      req.query
    );

    const branches = await listBranches({
      includeInactive: query.includeInactive === 'true'
    });

    res.json({ data: branches });
  } catch (error) {
    next(error);
  }
});

masterDataRouter.post(
  '/branches',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(branchCreateSchema, req.body);
      const branch = await createBranch(body);
      res.status(201).json({ data: branch });
    } catch (error) {
      next(error);
    }
  }
);

masterDataRouter.patch(
  '/branches/:id',
  authorize('LIBRARIAN'),
  async (req, res, next) => {
    try {
      const { id } = parseOrThrow(idParamSchema, req.params);
      const body = parseOrThrow(branchUpdateSchema, req.body);
      const branch = await updateBranch(id, body);
      res.json({ data: branch });
    } catch (error) {
      next(error);
    }
  }
);
