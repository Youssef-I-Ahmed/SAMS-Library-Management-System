import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

export async function listContributors({
  search,
  page = 1,
  pageSize = 20
}) {
  const where = search
    ? {
        fullName: {
          contains: search,
          mode: 'insensitive'
        }
      }
    : {};

  const skip = (page - 1) * pageSize;

  const [total, data] = await prisma.$transaction([
    prisma.contributor.count({ where }),
    prisma.contributor.findMany({
      where,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
      include: {
        _count: {
          select: {
            itemContributors: true
          }
        }
      }
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

export async function getContributor(id) {
  const contributor = await prisma.contributor.findUnique({
    where: { id },
    include: {
      itemContributors: {
        include: {
          item: {
            select: {
              id: true,
              type: true,
              title: true,
              isActive: true
            }
          }
        },
        orderBy: {
          role: 'asc'
        }
      }
    }
  });

  if (!contributor) {
    throw new AppError(404, 'NOT_FOUND', 'Contributor not found');
  }

  return contributor;
}

export async function createContributor(data) {
  return prisma.contributor.create({
    data: {
      fullName: data.fullName.trim()
    }
  });
}

export async function updateContributor(id, data) {
  const contributor = await prisma.contributor.findUnique({
    where: { id }
  });

  if (!contributor) {
    throw new AppError(404, 'NOT_FOUND', 'Contributor not found');
  }

  return prisma.contributor.update({
    where: { id },
    data: {
      fullName: data.fullName.trim()
    }
  });
}
