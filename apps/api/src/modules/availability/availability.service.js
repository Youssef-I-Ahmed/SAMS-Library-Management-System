import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const NON_LISTED_COPY_STATUS = 'ARCHIVED';

export async function getItemAvailability(itemId) {
  const item = await prisma.libraryItem.findFirst({
    where: {
      id: itemId,
      isActive: true
    },
    select: {
      id: true,
      type: true,
      title: true,
      callNumber: true
    }
  });

  if (!item) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'Active library item not found'
    );
  }

  const branches = await prisma.branch.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      code: true,
      name: true,
      location: true
    },
    orderBy: {
      name: 'asc'
    }
  });

  if (branches.length === 0) {
    return {
      item,
      totalCopies: 0,
      availableCopies: 0,
      available: false,
      branches: []
    };
  }

  const branchIds = branches.map((branch) => branch.id);

  const grouped = await prisma.physicalCopy.groupBy({
    by: ['branchId', 'status'],
    where: {
      itemId,
      branchId: {
        in: branchIds
      },
      status: {
        not: NON_LISTED_COPY_STATUS
      }
    },
    _count: {
      _all: true
    }
  });

  const counters = new Map();

  for (const row of grouped) {
    const current = counters.get(row.branchId) ?? {
      totalCopies: 0,
      availableCopies: 0
    };

    current.totalCopies += row._count._all;

    if (row.status === 'AVAILABLE') {
      current.availableCopies += row._count._all;
    }

    counters.set(row.branchId, current);
  }

  const availabilityByBranch = branches
    .map((branch) => {
      const counts = counters.get(branch.id) ?? {
        totalCopies: 0,
        availableCopies: 0
      };

      return {
        branch,
        totalCopies: counts.totalCopies,
        availableCopies: counts.availableCopies,
        available: counts.availableCopies > 0
      };
    })
    .filter((entry) => entry.totalCopies > 0);

  const totalCopies = availabilityByBranch.reduce(
    (sum, entry) => sum + entry.totalCopies,
    0
  );

  const availableCopies = availabilityByBranch.reduce(
    (sum, entry) => sum + entry.availableCopies,
    0
  );

  return {
    item,
    totalCopies,
    availableCopies,
    available: availableCopies > 0,
    branches: availabilityByBranch
  };
}

/**
 * Reservation-safe copy selection primitive.
 *
 * IMPORTANT:
 * - Must be called inside a Prisma interactive transaction.
 * - The returned copy row stays locked until the caller transaction ends.
 * - SKIP LOCKED means competing transactions do not wait on the same copy.
 * - A null result means there is currently no lockable AVAILABLE copy.
 *
 * Sprint 4 reservation code should use this function rather than:
 *   1) reading availability count,
 *   2) then separately choosing/updating a copy.
 *
 * That check-then-write pattern is race-prone.
 */
export async function lockOneAvailableCopy(
  tx,
  itemId,
  branchId
) {
  const rows = await tx.$queryRaw(
    Prisma.sql`
      SELECT
        pc.id,
        pc.item_id AS "itemId",
        pc.branch_id AS "branchId",
        pc.status
      FROM physical_copies pc
      INNER JOIN library_items li
        ON li.id = pc.item_id
      INNER JOIN branches b
        ON b.id = pc.branch_id
      WHERE pc.item_id = ${itemId}::uuid
        AND pc.branch_id = ${branchId}::uuid
        AND pc.status = 'AVAILABLE'
        AND li.is_active = TRUE
        AND b.is_active = TRUE
      ORDER BY pc.created_at ASC, pc.id ASC
      FOR UPDATE OF pc SKIP LOCKED
      LIMIT 1
    `
  );

  return rows[0] ?? null;
}
