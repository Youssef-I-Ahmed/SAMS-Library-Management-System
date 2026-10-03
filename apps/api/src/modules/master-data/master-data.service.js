import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

function requireRecord(record, entityName) {
  if (!record) {
    throw new AppError(404, 'NOT_FOUND', `${entityName} not found`);
  }
  return record;
}

export async function listFaculties({ includeInactive = false } = {}) {
  return prisma.faculty.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          departments: true,
          students: true
        }
      }
    }
  });
}

export async function createFaculty(data) {
  return prisma.faculty.create({
    data: {
      name: data.name.trim(),
      isActive: true
    }
  });
}

export async function updateFaculty(id, data) {
  requireRecord(
    await prisma.faculty.findUnique({ where: { id } }),
    'Faculty'
  );

  return prisma.faculty.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
    }
  });
}

export async function listDepartments({ facultyId, includeInactive = false } = {}) {
  return prisma.department.findMany({
    where: {
      ...(facultyId ? { facultyId } : {}),
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: [
      { faculty: { name: 'asc' } },
      { name: 'asc' }
    ],
    include: {
      faculty: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      },
      _count: {
        select: {
          students: true
        }
      }
    }
  });
}

export async function createDepartment(data) {
  const faculty = requireRecord(
    await prisma.faculty.findUnique({ where: { id: data.facultyId } }),
    'Faculty'
  );

  if (!faculty.isActive) {
    throw new AppError(
      409,
      'INACTIVE_FACULTY',
      'Cannot create a department under an inactive faculty'
    );
  }

  return prisma.department.create({
    data: {
      facultyId: data.facultyId,
      name: data.name.trim(),
      isActive: true
    },
    include: {
      faculty: {
        select: { id: true, name: true }
      }
    }
  });
}

export async function updateDepartment(id, data) {
  const department = requireRecord(
    await prisma.department.findUnique({ where: { id } }),
    'Department'
  );

  if (data.facultyId && data.facultyId !== department.facultyId) {
    const faculty = requireRecord(
      await prisma.faculty.findUnique({ where: { id: data.facultyId } }),
      'Faculty'
    );

    if (!faculty.isActive) {
      throw new AppError(
        409,
        'INACTIVE_FACULTY',
        'Cannot move a department to an inactive faculty'
      );
    }
  }

  return prisma.department.update({
    where: { id },
    data: {
      ...(data.facultyId !== undefined ? { facultyId: data.facultyId } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
    },
    include: {
      faculty: {
        select: { id: true, name: true }
      }
    }
  });
}

export async function listBranches({ includeInactive = false } = {}) {
  return prisma.branch.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          physicalCopies: true,
          reservations: true,
          borrowings: true,
          visits: true
        }
      }
    }
  });
}

export async function createBranch(data) {
  return prisma.branch.create({
    data: {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      location: data.location?.trim() || null,
      isActive: true
    }
  });
}

export async function updateBranch(id, data) {
  const branch = requireRecord(
    await prisma.branch.findUnique({ where: { id } }),
    'Branch'
  );

  if (
    data.version !== undefined &&
    data.version !== branch.version
  ) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'Branch was modified by another user. Refresh and try again.'
    );
  }

  const result = await prisma.branch.updateMany({
    where: {
      id,
      version: data.version ?? branch.version
    },
    data: {
      ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.location !== undefined
        ? { location: data.location?.trim() || null }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      version: {
        increment: 1
      }
    }
  });

  if (result.count === 0) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'Branch was modified by another user. Refresh and try again.'
    );
  }

  return prisma.branch.findUnique({ where: { id } });
}
