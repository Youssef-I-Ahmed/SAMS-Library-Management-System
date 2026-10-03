import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const itemDetailInclude = {
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

async function validateCategory(categoryId) {
  if (!categoryId) return;

  const category = await prisma.category.findUnique({
    where: { id: categoryId }
  });

  if (!category) {
    throw new AppError(400, 'UNKNOWN_CATEGORY', 'Category not found');
  }

  if (!category.isActive) {
    throw new AppError(
      409,
      'INACTIVE_CATEGORY',
      'Cannot use an inactive category'
    );
  }
}

async function validateDewey(deweyClassificationId) {
  if (!deweyClassificationId) return;

  const dewey = await prisma.deweyClassification.findUnique({
    where: { id: deweyClassificationId }
  });

  if (!dewey) {
    throw new AppError(
      400,
      'UNKNOWN_DEWEY_CLASSIFICATION',
      'Dewey classification not found'
    );
  }
}

export async function listLibraryItems({
  search,
  type,
  categoryId,
  deweyClassificationId,
  language,
  publicationYear,
  includeInactive = false,
  page = 1,
  pageSize = 20
}) {
  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(type ? { type } : {}),
    ...(categoryId
      ? { category: { is: { id: categoryId } } }
      : {}),
    ...(deweyClassificationId
      ? { deweyClassification: { is: { id: deweyClassificationId } } }
      : {}),
    ...(language
      ? { language: { equals: language, mode: 'insensitive' } }
      : {}),
    ...(publicationYear ? { publicationYear } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { callNumber: { contains: search, mode: 'insensitive' } },
            { deweyCodeRaw: { contains: search, mode: 'insensitive' } },
            {
              abstractDescription: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              itemContributors: {
                some: {
                  contributor: {
                    fullName: {
                      contains: search,
                      mode: 'insensitive'
                    }
                  }
                }
              }
            }
          ]
        }
      : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, data] = await prisma.$transaction([
    prisma.libraryItem.count({ where }),
    prisma.libraryItem.findMany({
      where,
      orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
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

export async function getLibraryItem(
  id,
  { includeInactive = false } = {}
) {
  const item = await prisma.libraryItem.findFirst({
    where: {
      id,
      ...(includeInactive ? {} : { isActive: true })
    },
    include: itemDetailInclude
  });

  if (!item) {
    throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  }

  return item;
}

export async function createLibraryItem(data) {
  await validateCategory(data.categoryId);
  await validateDewey(data.deweyClassificationId);

  return prisma.libraryItem.create({
    data: {
      type: data.type,
      title: data.title.trim(),
      ...(data.categoryId
        ? { category: { connect: { id: data.categoryId } } }
        : {}),
      ...(data.deweyClassificationId
        ? {
            deweyClassification: {
              connect: { id: data.deweyClassificationId }
            }
          }
        : {}),
      deweyCodeRaw: data.deweyCodeRaw?.trim() || null,
      callNumber: data.callNumber?.trim() || null,
      language: data.language?.trim() || null,
      publicationYear: data.publicationYear ?? null,
      abstractDescription: data.abstract?.trim() || null,
      isActive: true
    }
  });
}

export async function updateLibraryItem(id, data) {
  const current = await prisma.libraryItem.findUnique({
    where: { id }
  });

  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  }

  if (current.version !== data.version) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'Library item was modified by another user. Refresh and try again.'
    );
  }

  if (data.categoryId !== undefined && data.categoryId !== null) {
    await validateCategory(data.categoryId);
  }

  if (
    data.deweyClassificationId !== undefined &&
    data.deweyClassificationId !== null
  ) {
    await validateDewey(data.deweyClassificationId);
  }

  try {
    return await prisma.libraryItem.update({
      where: {
        id,
        version: data.version
      },
      data: {
        ...(data.title !== undefined
          ? { title: data.title.trim() }
          : {}),
        ...(data.categoryId !== undefined
          ? {
              category:
                data.categoryId === null
                  ? { disconnect: true }
                  : { connect: { id: data.categoryId } }
            }
          : {}),
        ...(data.deweyClassificationId !== undefined
          ? {
              deweyClassification:
                data.deweyClassificationId === null
                  ? { disconnect: true }
                  : {
                      connect: {
                        id: data.deweyClassificationId
                      }
                    }
            }
          : {}),
        ...(data.deweyCodeRaw !== undefined
          ? { deweyCodeRaw: data.deweyCodeRaw?.trim() || null }
          : {}),
        ...(data.callNumber !== undefined
          ? { callNumber: data.callNumber?.trim() || null }
          : {}),
        ...(data.language !== undefined
          ? { language: data.language?.trim() || null }
          : {}),
        ...(data.publicationYear !== undefined
          ? { publicationYear: data.publicationYear }
          : {}),
        ...(data.abstract !== undefined
          ? {
              abstractDescription:
                data.abstract?.trim() || null
            }
          : {}),
        ...(data.isActive !== undefined
          ? { isActive: data.isActive }
          : {}),
        version: {
          increment: 1
        }
      }
    });
  } catch (error) {
    if (error?.code === 'P2025') {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Library item was modified by another user. Refresh and try again.'
      );
    }

    throw error;
  }
}
