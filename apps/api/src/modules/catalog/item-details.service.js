import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const itemDetailsInclude = {
  category: {
    select: {
      id: true,
      name: true,
      isActive: true
    }
  },
  deweyClassification: {
    select: {
      id: true,
      code: true,
      name: true
    }
  },
  bookDetails: true,
  academicWorkDetails: {
    include: {
      faculty: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      },
      department: {
        select: {
          id: true,
          name: true,
          facultyId: true,
          isActive: true
        }
      }
    }
  },
  itemContributors: {
    include: {
      contributor: true
    },
    orderBy: [
      { role: 'asc' },
      { contributor: { fullName: 'asc' } }
    ]
  }
};

async function requireItem(itemId) {
  const item = await prisma.libraryItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      type: true,
      version: true,
      isActive: true
    }
  });

  if (!item) {
    throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  }

  return item;
}

function versionConflict() {
  return new AppError(
    409,
    'VERSION_CONFLICT',
    'Library item was modified by another user. Refresh and try again.'
  );
}

export async function putBookDetails(itemId, data) {
  const item = await requireItem(itemId);

  if (item.type !== 'BOOK') {
    throw new AppError(
      409,
      'INVALID_ITEM_TYPE',
      'Book details can only be attached to BOOK items'
    );
  }

  try {
    return await prisma.libraryItem.update({
      where: {
        id: itemId,
        version: data.version
      },
      data: {
        bookDetails: {
          upsert: {
            create: {
              isbn: data.isbn?.trim() || null,
              publisher: data.publisher?.trim() || null,
              edition: data.edition?.trim() || null
            },
            update: {
              isbn: data.isbn?.trim() || null,
              publisher: data.publisher?.trim() || null,
              edition: data.edition?.trim() || null
            }
          }
        },
        version: { increment: 1 }
      },
      include: itemDetailsInclude
    });
  } catch (error) {
    if (error?.code === 'P2025') throw versionConflict();
    throw error;
  }
}

async function resolveAcademicPlacement({ facultyId, departmentId }) {
  let resolvedFacultyId = facultyId ?? null;
  const resolvedDepartmentId = departmentId ?? null;

  if (resolvedFacultyId) {
    const faculty = await prisma.faculty.findUnique({
      where: { id: resolvedFacultyId }
    });

    if (!faculty) {
      throw new AppError(400, 'UNKNOWN_FACULTY', 'Faculty not found');
    }

    if (!faculty.isActive) {
      throw new AppError(
        409,
        'INACTIVE_FACULTY',
        'Cannot assign an inactive faculty'
      );
    }
  }

  if (resolvedDepartmentId) {
    const department = await prisma.department.findUnique({
      where: { id: resolvedDepartmentId },
      include: { faculty: true }
    });

    if (!department) {
      throw new AppError(
        400,
        'UNKNOWN_DEPARTMENT',
        'Department not found'
      );
    }

    if (!department.isActive) {
      throw new AppError(
        409,
        'INACTIVE_DEPARTMENT',
        'Cannot assign an inactive department'
      );
    }

    if (!department.faculty.isActive) {
      throw new AppError(
        409,
        'INACTIVE_FACULTY',
        'The department belongs to an inactive faculty'
      );
    }

    if (
      resolvedFacultyId &&
      resolvedFacultyId !== department.facultyId
    ) {
      throw new AppError(
        409,
        'DEPARTMENT_FACULTY_MISMATCH',
        'Department does not belong to the supplied faculty'
      );
    }

    resolvedFacultyId = department.facultyId;
  }

  return {
    facultyId: resolvedFacultyId,
    departmentId: resolvedDepartmentId
  };
}

export async function putAcademicWorkDetails(itemId, data) {
  const item = await requireItem(itemId);

  if (!['THESIS', 'PROJECT'].includes(item.type)) {
    throw new AppError(
      409,
      'INVALID_ITEM_TYPE',
      'Academic-work details can only be attached to THESIS or PROJECT items'
    );
  }

  const placement = await resolveAcademicPlacement({
    facultyId: data.facultyId,
    departmentId: data.departmentId
  });

  try {
    return await prisma.libraryItem.update({
      where: {
        id: itemId,
        version: data.version
      },
      data: {
        academicWorkDetails: {
          upsert: {
            create: {
              facultyId: placement.facultyId,
              departmentId: placement.departmentId,
              academicYear: data.academicYear?.trim() || null,
              workType: item.type
            },
            update: {
              facultyId: placement.facultyId,
              departmentId: placement.departmentId,
              academicYear: data.academicYear?.trim() || null,
              workType: item.type
            }
          }
        },
        version: { increment: 1 }
      },
      include: itemDetailsInclude
    });
  } catch (error) {
    if (error?.code === 'P2025') throw versionConflict();
    throw error;
  }
}
