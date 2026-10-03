import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

function requireRecord(record, entityName) {
  if (!record) {
    throw new AppError(404, 'NOT_FOUND', `${entityName} not found`);
  }
  return record;
}

/* Categories */

export async function listCategories({ includeInactive = false } = {}) {
  return prisma.category.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' }
  });
}

export async function createCategory(data) {
  return prisma.category.create({
    data: {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      isActive: true
    }
  });
}

export async function updateCategory(id, data) {
  requireRecord(
    await prisma.category.findUnique({ where: { id } }),
    'Category'
  );

  return prisma.category.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined
        ? { description: data.description?.trim() || null }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
    }
  });
}

/* Dewey */

export async function listDewey({ parentId, search } = {}) {
  return prisma.deweyClassification.findMany({
    where: {
      ...(parentId !== undefined ? { parentId } : {}),
      ...(search
        ? {
            OR: [
              {
                code: {
                  contains: search,
                  mode: 'insensitive'
                }
              },
              {
                name: {
                  contains: search,
                  mode: 'insensitive'
                }
              }
            ]
          }
        : {})
    },
    orderBy: { code: 'asc' },
    include: {
      parent: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      _count: {
        select: {
          children: true,
          items: true
        }
      }
    }
  });
}

export async function createDewey(data) {
  if (data.parentId) {
    requireRecord(
      await prisma.deweyClassification.findUnique({
        where: { id: data.parentId }
      }),
      'Parent Dewey classification'
    );
  }

  return prisma.deweyClassification.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      parentId: data.parentId ?? null
    },
    include: {
      parent: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });
}

async function isDescendant(candidateParentId, nodeId) {
  let currentId = candidateParentId;
  const visited = new Set();

  while (currentId) {
    if (currentId === nodeId) return true;
    if (visited.has(currentId)) return true;

    visited.add(currentId);

    const current = await prisma.deweyClassification.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });

    if (!current) return false;
    currentId = current.parentId;
  }

  return false;
}

export async function updateDewey(id, data) {
  requireRecord(
    await prisma.deweyClassification.findUnique({ where: { id } }),
    'Dewey classification'
  );

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) {
      throw new AppError(
        409,
        'INVALID_DEWEY_PARENT',
        'A Dewey classification cannot be its own parent'
      );
    }

    requireRecord(
      await prisma.deweyClassification.findUnique({
        where: { id: data.parentId }
      }),
      'Parent Dewey classification'
    );

    if (await isDescendant(data.parentId, id)) {
      throw new AppError(
        409,
        'DEWEY_CYCLE',
        'This parent would create a Dewey hierarchy cycle'
      );
    }
  }

  return prisma.deweyClassification.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: data.code.trim() } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {})
    },
    include: {
      parent: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });
}
