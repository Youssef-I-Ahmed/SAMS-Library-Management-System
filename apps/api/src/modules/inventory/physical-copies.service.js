import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const copyInclude = {
  item: {
    select: {
      id: true,
      type: true,
      title: true,
      callNumber: true,
      isActive: true
    }
  },
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      location: true,
      isActive: true
    }
  }
};

const circulationOwnedStatuses = new Set([
  'RESERVED',
  'BORROWED'
]);

async function requireActiveItem(itemId) {
  const item = await prisma.libraryItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      isActive: true
    }
  });

  if (!item) {
    throw new AppError(
      400,
      'UNKNOWN_LIBRARY_ITEM',
      'Library item not found'
    );
  }

  if (!item.isActive) {
    throw new AppError(
      409,
      'INACTIVE_LIBRARY_ITEM',
      'Cannot add or move inventory for an archived library item'
    );
  }

  return item;
}

async function requireActiveBranch(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      isActive: true
    }
  });

  if (!branch) {
    throw new AppError(
      400,
      'UNKNOWN_BRANCH',
      'Branch not found'
    );
  }

  if (!branch.isActive) {
    throw new AppError(
      409,
      'INACTIVE_BRANCH',
      'Cannot assign a copy to an inactive branch'
    );
  }

  return branch;
}

function ensureManualStatusAllowed(status) {
  if (status && circulationOwnedStatuses.has(status)) {
    throw new AppError(
      409,
      'CIRCULATION_STATUS_MANAGED',
      `${status} is managed by reservation/borrowing workflows and cannot be assigned manually`
    );
  }
}

export async function listPhysicalCopies({
  search,
  itemId,
  branchId,
  status,
  condition,
  page = 1,
  pageSize = 20
}) {
  const where = {
    ...(itemId ? { itemId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
    ...(condition ? { condition } : {}),
    ...(search
      ? {
          OR: [
            {
              copyCode: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              barcode: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              shelfLocation: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              item: {
                title: {
                  contains: search,
                  mode: 'insensitive'
                }
              }
            }
          ]
        }
      : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, data] = await prisma.$transaction([
    prisma.physicalCopy.count({ where }),
    prisma.physicalCopy.findMany({
      where,
      include: copyInclude,
      orderBy: [
        { branch: { name: 'asc' } },
        { item: { title: 'asc' } },
        { createdAt: 'asc' }
      ],
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

export async function getPhysicalCopy(id) {
  const copy = await prisma.physicalCopy.findUnique({
    where: { id },
    include: copyInclude
  });

  if (!copy) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'Physical copy not found'
    );
  }

  return copy;
}

export async function createPhysicalCopy(data) {
  await requireActiveItem(data.itemId);
  await requireActiveBranch(data.branchId);
  ensureManualStatusAllowed(data.status);

  return prisma.physicalCopy.create({
    data: {
      itemId: data.itemId,
      branchId: data.branchId,
      copyCode: data.copyCode?.trim() || null,
      barcode: data.barcode?.trim() || null,
      shelfLocation: data.shelfLocation?.trim() || null,
      status: data.status ?? 'AVAILABLE',
      condition: data.condition ?? null
    },
    include: copyInclude
  });
}

export async function updatePhysicalCopy(id, data) {
  const current = await prisma.physicalCopy.findUnique({
    where: { id }
  });

  if (!current) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'Physical copy not found'
    );
  }

  if (current.version !== data.version) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'Physical copy was modified by another user. Refresh and try again.'
    );
  }

  if (data.branchId !== undefined) {
    await requireActiveBranch(data.branchId);
  }

  if (data.status !== undefined) {
    ensureManualStatusAllowed(data.status);
  }

  const changingOperationalPlacement =
    data.branchId !== undefined ||
    data.status !== undefined;

  if (
    changingOperationalPlacement &&
    circulationOwnedStatuses.has(current.status)
  ) {
    throw new AppError(
      409,
      'COPY_IN_CIRCULATION',
      `Copy is currently ${current.status} and its branch/status cannot be changed manually`
    );
  }

  try {
    return await prisma.physicalCopy.update({
      where: {
        id,
        version: data.version
      },
      data: {
        ...(data.branchId !== undefined
          ? { branchId: data.branchId }
          : {}),
        ...(data.copyCode !== undefined
          ? { copyCode: data.copyCode?.trim() || null }
          : {}),
        ...(data.barcode !== undefined
          ? { barcode: data.barcode?.trim() || null }
          : {}),
        ...(data.shelfLocation !== undefined
          ? {
              shelfLocation:
                data.shelfLocation?.trim() || null
            }
          : {}),
        ...(data.status !== undefined
          ? { status: data.status }
          : {}),
        ...(data.condition !== undefined
          ? { condition: data.condition }
          : {}),
        version: {
          increment: 1
        }
      },
      include: copyInclude
    });
  } catch (error) {
    if (error?.code === 'P2025') {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Physical copy was modified by another user. Refresh and try again.'
      );
    }

    throw error;
  }
}
