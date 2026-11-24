import { AcademicStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { writeAudit } from '../../utils/audit.js';

const studentInclude = {
  user: { select: { id: true, universityEmail: true, displayName: true, isActive: true } },
  faculty: { select: { id: true, name: true, isActive: true } },
  department: { select: { id: true, name: true, facultyId: true, isActive: true } }
};

const clean = (value) => typeof value === 'string' ? value.trim() : value;

// Omission is meaningful on updates; defaults belong only to new records.
const importRecordsSchema = z.array(z.object({
  studentId: z.string().trim().min(1).max(80),
  universityEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(180),
  facultyName: z.string().trim().min(2).max(150).nullable().optional(),
  departmentName: z.string().trim().min(2).max(150).nullable().optional(),
  academicStatus: z.nativeEnum(AcademicStatus).optional(),
  isActive: z.boolean().optional()
})).min(1).max(500);

const importUserInclude = { userRoles: { include: { role: true } } };

function requireStudentOnlyAccount(user) {
  if (user.isProtected || user.userRoles.length !== 1 || user.userRoles[0].role.name !== 'STUDENT') {
    throw new AppError(409, 'PROTECTED_ACCOUNT', 'Staff, protected or multi-role accounts cannot be changed from student accounts');
  }
}

function validateImport(records) {
  const parsed = importRecordsSchema.safeParse(records);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Student import requires 1–500 valid student records');
  }
  const studentIds = new Set();
  const emails = new Set();
  for (const record of parsed.data) {
    // Reject case variants rather than guessing whether they identify different students.
    const identity = record.studentId.toLowerCase();
    if (studentIds.has(identity) || emails.has(record.universityEmail)) {
      throw new AppError(409, 'DUPLICATE_IMPORT_IDENTITY', 'Student import contains repeated student IDs or email addresses');
    }
    studentIds.add(identity);
    emails.add(record.universityEmail);
  }
  return parsed.data;
}

async function requireRole(tx, name) {
  const role = await tx.role.findUnique({ where: { name } });
  if (!role) throw new AppError(500, 'ROLE_NOT_CONFIGURED', `Required role ${name} is not configured`);
  return role;
}

async function resolveFaculty(tx, facultyName) {
  if (!facultyName) return null;
  const faculty = await tx.faculty.findUnique({ where: { name: clean(facultyName) } });
  if (!faculty) throw new AppError(400, 'UNKNOWN_FACULTY', `Faculty not found: ${facultyName}`);
  if (!faculty.isActive) throw new AppError(409, 'INACTIVE_FACULTY', `Faculty is inactive: ${facultyName}`);
  return faculty;
}

async function resolveDepartment(tx, faculty, departmentName) {
  if (!departmentName) return null;
  if (!faculty) throw new AppError(400, 'FACULTY_REQUIRED', 'facultyName is required when departmentName is provided');

  const department = await tx.department.findUnique({
    where: { facultyId_name: { facultyId: faculty.id, name: clean(departmentName) } }
  });

  if (!department) {
    throw new AppError(400, 'UNKNOWN_DEPARTMENT', `Department not found under ${faculty.name}: ${departmentName}`);
  }
  if (!department.isActive) {
    throw new AppError(409, 'INACTIVE_DEPARTMENT', `Department is inactive: ${departmentName}`);
  }
  return department;
}

async function prepareImport(tx, record) {
  const students = await tx.student.findMany({
    where: { studentId: { equals: record.studentId, mode: 'insensitive' } },
    include: { user: { include: importUserInclude }, faculty: true, department: true },
    take: 2
  });
  if (students.length > 1 || (students[0] && students[0].studentId !== record.studentId)) {
    throw new AppError(409, 'AMBIGUOUS_STUDENT_ID', 'Student ID conflicts with an existing institutional identity');
  }
  const existingStudent = students[0];
  if (existingStudent) {
    requireStudentOnlyAccount(existingStudent.user);
  }
  const users = await tx.user.findMany({
    where: { universityEmail: { equals: record.universityEmail, mode: 'insensitive' } },
    include: { ...importUserInclude, student: true },
    take: 2
  });
  if (users.length > 1) {
    throw new AppError(409, 'AMBIGUOUS_EMAIL', 'Email address matches multiple existing accounts');
  }
  const existingUser = users[0];
  if (existingUser) requireStudentOnlyAccount(existingUser);
  if (existingStudent && existingUser && existingUser.id !== existingStudent.userId) {
    throw new AppError(409, 'EMAIL_ALREADY_IN_USE', 'Email address is already linked to another account');
  }
  if (!existingStudent && existingUser) {
    throw new AppError(409, 'EXISTING_ACCOUNT_LINK_NOT_ALLOWED', 'Student import cannot attach a new student identity to an existing account');
  }

  const faculty = record.facultyName === undefined
    ? existingStudent?.faculty ?? null
    : await resolveFaculty(tx, record.facultyName);
  const department = record.departmentName === undefined
    ? existingStudent?.department ?? null
    : await resolveDepartment(tx, faculty, record.departmentName);
  if (department && department.facultyId !== faculty?.id) {
    throw new AppError(409, 'DEPARTMENT_FACULTY_MISMATCH', 'Explicitly resolve the department when changing or clearing its faculty');
  }

  return { record, existingStudent, faculty, department };
}

const auditView = (student, user) => ({
  studentId: student.studentId, universityEmail: user.universityEmail, displayName: user.displayName,
  isActive: user.isActive, academicStatus: student.academicStatus,
  facultyId: student.facultyId ?? null, departmentId: student.departmentId ?? null
});

async function applyImport(tx, plan, studentRole, { actor, source = 'import' } = {}) {
  const { record, existingStudent, faculty, department } = plan;
  const { studentId, universityEmail, displayName } = record;
  if (existingStudent) {
    // Deactivating an account also ends its open sessions.
    const deactivating = record.isActive === false && existingStudent.user.isActive !== false;
    const user = await tx.user.update({
      where: { id: existingStudent.userId },
      data: { universityEmail, displayName,
        ...(record.isActive !== undefined ? { isActive: record.isActive } : {}),
        ...(deactivating ? { authVersion: { increment: 1 } } : {}) }
    });
    const student = await tx.student.update({
      where: { userId: existingStudent.userId },
      data: {
        ...(record.facultyName !== undefined ? { facultyId: faculty?.id ?? null } : {}),
        ...(record.departmentName !== undefined ? { departmentId: department?.id ?? null } : {}),
        ...(record.academicStatus !== undefined ? { academicStatus: record.academicStatus } : {})
      }
    });
    // Existing identities and role memberships are never relinked or repaired by import.
    if (actor) {
      await writeAudit(tx, { actor, action: deactivating ? 'STUDENT_DEACTIVATED' : 'STUDENT_UPDATED',
        entityType: 'Student', entityId: existingStudent.userId,
        oldValues: auditView(existingStudent, existingStudent.user), newValues: auditView(student ?? existingStudent, user ?? existingStudent.user),
        metadata: { source } });
    }
    return { action: 'updated', studentId, userId: existingStudent.userId };
  }

  const user = await tx.user.create({
    data: { universityEmail, displayName, isActive: record.isActive ?? true }
  });

  await tx.student.create({
    data: {
      userId: user.id,
      studentId,
      facultyId: faculty?.id ?? null,
      departmentId: department?.id ?? null,
      academicStatus: record.academicStatus ?? AcademicStatus.ACTIVE
    }
  });

  await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } });
  if (actor) {
    await writeAudit(tx, { actor, action: 'STUDENT_CREATED', entityType: 'Student', entityId: user.id,
      newValues: { studentId, universityEmail, displayName, isActive: record.isActive ?? true,
        academicStatus: record.academicStatus ?? AcademicStatus.ACTIVE,
        facultyId: faculty?.id ?? null, departmentId: department?.id ?? null },
      metadata: { source } });
  }
  return { action: 'created', studentId, userId: user.id };
}

export async function importStudents(records) {
  // Internal domain operation only. HTTP access remains closed until a trusted
  // integration authorization mechanism is approved; role names are insufficient.
  const normalized = validateImport(records);
  try {
    return await prisma.$transaction(async (tx) => {
      const plans = [];
      const userIds = new Set();
      // Validate the entire batch against the same snapshot before any writes.
      for (const record of normalized) {
        const plan = await prepareImport(tx, record);
        if (plan.existingStudent) {
          if (userIds.has(plan.existingStudent.userId)) {
            throw new AppError(409, 'DUPLICATE_IMPORT_IDENTITY', 'Student import refers to the same account more than once');
          }
          userIds.add(plan.existingStudent.userId);
        }
        plans.push(plan);
      }
      const studentRole = plans.some((plan) => !plan.existingStudent) ? await requireRole(tx, 'STUDENT') : null;
      const results = [];
      for (const plan of plans) results.push(await applyImport(tx, plan, studentRole));
      return {
        total: results.length,
        created: results.filter((x) => x.action === 'created').length,
        updated: results.filter((x) => x.action === 'updated').length,
        results
      };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['P2034', 'P2002'].includes(error?.code)) {
      throw new AppError(409, 'STUDENT_IMPORT_CONFLICT', 'Student identities changed or conflicted; reconcile the batch before retrying');
    }
    throw error;
  }
}

const singleRecordSchema = importRecordsSchema.element;

function conflict(error) {
  if (['P2034', 'P2002'].includes(error?.code)) {
    return new AppError(409, 'STUDENT_CONFLICT', 'Student ID or email is already used by another account');
  }
  return error;
}

/**
 * Creates or updates one student account (librarian action or one file row).
 * mode: 'create' (fails if the student exists), 'update' (fails if missing), 'upsert'.
 */
export async function saveStudent(input, { mode = 'upsert', actor, source = 'manual', db = prisma } = {}) {
  const parsed = singleRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const record = parsed.data;
  try {
    return await db.$transaction(async (tx) => {
      const plan = await prepareImport(tx, record);
      if (mode === 'create' && plan.existingStudent) {
        throw new AppError(409, 'STUDENT_EXISTS', 'A student with this student ID already exists');
      }
      if (mode === 'update' && !plan.existingStudent) {
        throw new AppError(404, 'NOT_FOUND', 'Student not found');
      }
      const studentRole = plan.existingStudent ? null : await requireRole(tx, 'STUDENT');
      return applyImport(tx, plan, studentRole, { actor, source });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    throw conflict(error);
  }
}

/** Applies a partial change to an existing student, keeping omitted fields. */
export async function updateStudent(studentId, changes, { actor, db = prisma } = {}) {
  const current = await db.student.findUnique({
    where: { studentId },
    include: { user: { select: { universityEmail: true, displayName: true } } }
  });
  if (!current) throw new AppError(404, 'NOT_FOUND', 'Student not found');
  return saveStudent({
    studentId,
    universityEmail: changes.universityEmail ?? current.user.universityEmail,
    displayName: changes.displayName ?? current.user.displayName,
    ...(changes.facultyName !== undefined ? { facultyName: changes.facultyName } : {}),
    ...(changes.departmentName !== undefined ? { departmentName: changes.departmentName } : {}),
    ...(changes.academicStatus !== undefined ? { academicStatus: changes.academicStatus } : {}),
    ...(changes.isActive !== undefined ? { isActive: changes.isActive } : {})
  }, { mode: 'update', actor, db });
}

export async function listStudents({
  search,
  facultyId,
  departmentId,
  academicStatus,
  includeInactive = false,
  page = 1,
  pageSize = 20
}) {
  const where = {
    ...(facultyId ? { facultyId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(academicStatus ? { academicStatus } : {}),
    ...(includeInactive ? {} : { user: { isActive: true } }),
    ...(search ? {
      OR: [
        { studentId: { contains: search, mode: 'insensitive' } },
        { user: { universityEmail: { contains: search, mode: 'insensitive' } } },
        { user: { displayName: { contains: search, mode: 'insensitive' } } }
      ]
    } : {})
  };

  const skip = (page - 1) * pageSize;
  const [total, data] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: studentInclude,
      orderBy: { studentId: 'asc' },
      skip,
      take: pageSize
    })
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

export async function getStudentByStudentId(studentId) {
  const student = await prisma.student.findUnique({
    where: { studentId },
    include: {
      ...studentInclude,
      user: {
        select: {
          id: true,
          universityEmail: true,
          displayName: true,
          isActive: true,
          userRoles: { include: { role: true } }
        }
      }
    }
  });

  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

  return {
    ...student,
    roles: student.user.userRoles.map(({ role }) => role.name)
  };
}
