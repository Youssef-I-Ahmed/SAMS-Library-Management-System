import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

function versionConflict() {
  return new AppError(
    409,
    'VERSION_CONFLICT',
    'Library item was modified by another user. Refresh and try again.'
  );
}

export async function listItemContributors(itemId) {
  const item = await prisma.libraryItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      type: true,
      title: true,
      version: true,
      isActive: true,
      itemContributors: {
        include: {
          contributor: true
        },
        orderBy: [
          { role: 'asc' },
          { contributor: { fullName: 'asc' } }
        ]
      }
    }
  });

  if (!item) {
    throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  }

  return item;
}

async function validateContributors(tx, contributors) {
  if (contributors.length === 0) return;

  const contributorIds = [
    ...new Set(contributors.map((entry) => entry.contributorId))
  ];

  const existing = await tx.contributor.findMany({
    where: {
      id: {
        in: contributorIds
      }
    },
    select: {
      id: true
    }
  });

  if (existing.length !== contributorIds.length) {
    const existingIds = new Set(existing.map((row) => row.id));
    const missingIds = contributorIds.filter((id) => !existingIds.has(id));

    throw new AppError(
      400,
      'UNKNOWN_CONTRIBUTOR',
      `Contributor not found: ${missingIds.join(', ')}`
    );
  }
}

export async function replaceItemContributors(
  itemId,
  { version, contributors }
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.libraryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        version: true
      }
    });

    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Library item not found');
    }

    if (item.version !== version) {
      throw versionConflict();
    }

    await validateContributors(tx, contributors);

    try {
      await tx.libraryItem.update({
        where: {
          id: itemId,
          version
        },
        data: {
          version: {
            increment: 1
          }
        }
      });
    } catch (error) {
      if (error?.code === 'P2025') {
        throw versionConflict();
      }

      throw error;
    }

    await tx.itemContributor.deleteMany({
      where: {
        itemId
      }
    });

    if (contributors.length > 0) {
      await tx.itemContributor.createMany({
        data: contributors.map((entry) => ({
          itemId,
          contributorId: entry.contributorId,
          role: entry.role
        }))
      });
    }

    return tx.libraryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        type: true,
        title: true,
        version: true,
        isActive: true,
        itemContributors: {
          include: {
            contributor: true
          },
          orderBy: [
            { role: 'asc' },
            { contributor: { fullName: 'asc' } }
          ]
        }
      }
    });
  });
}
