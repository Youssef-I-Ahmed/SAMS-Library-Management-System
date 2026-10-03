import { AcademicStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const studentInclude = {
  user: { select: { id: true, universityEmail: true, displayName: true, isActive: true } },
  faculty: { select: { id: true, name: true, isActive: true } },
  department: { select: { id: true, name: true, facultyId: true, isActive: true } }
};

const clean = (value) => typeof value === 'string' ? value.trim() : value;

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

async function attachStudentRole(tx, userId) {
  const role = await requireRole(tx, 'STUDENT');
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

async function upsertOne(tx, record) {
  const studentId = clean(record.studentId);
  const universityEmail = clean(record.universityEmail).toLowerCase();
  const displayName = clean(record.displayName);
  const academicStatus = record.academicStatus ?? AcademicStatus.ACTIVE;

  const faculty = await resolveFaculty(tx, record.facultyName);
  const department = await resolveDepartment(tx, faculty, record.departmentName);

  const existingStudent = await tx.student.findUnique({
    where: { studentId },
    include: { user: true }
  });

  if (existingStudent) {
    const conflictingUser = await tx.user.findUnique({ where: { universityEmail } });
    if (conflictingUser && conflictingUser.id !== existingStudent.userId) {
      throw new AppError(409, 'EMAIL_ALREADY_IN_USE', `University email is already linked to another user: ${universityEmail}`);
    }

    await tx.user.update({
      where: { id: existingStudent.userId },
      data: {
        universityEmail,
        displayName,
        isActive: record.isActive ?? true
      }
    });

    await tx.student.update({
      where: { userId: existingStudent.userId },
      data: {
        facultyId: faculty?.id ?? null,
        departmentId: department?.id ?? null,
        academicStatus
      }
    });

    await attachStudentRole(tx, existingStudent.userId);
    return { action: 'updated', studentId, userId: existingStudent.userId };
  }

  const existingUser = await tx.user.findUnique({
    where: { universityEmail },
    include: { student: true }
  });

  if (existingUser?.student) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_LINKED_TO_STUDENT',
      `University email is already linked to student ${existingUser.student.studentId}`
    );
  }

  const user = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: { displayName, isActive: record.isActive ?? true }
      })
    : await tx.user.create({
        data: { universityEmail, displayName, isActive: record.isActive ?? true }
      });

  await tx.student.create({
    data: {
      userId: user.id,
      studentId,
      facultyId: faculty?.id ?? null,
      departmentId: department?.id ?? null,
      academicStatus
    }
  });

  await attachStudentRole(tx, user.id);
  return { action: 'created', studentId, userId: user.id };
}

export async function importStudents(records) {
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const record of records) results.push(await upsertOne(tx, record));

    return {
      total: results.length,
      created: results.filter((x) => x.action === 'created').length,
      updated: results.filter((x) => x.action === 'updated').length,
      results
    };
  });
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
