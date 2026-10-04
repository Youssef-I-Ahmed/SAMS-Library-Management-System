import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { lockOneAvailableCopy } from '../availability/availability.service.js';

const reservationPublicInclude = {
  item: {
    select: {
      id: true,
      type: true,
      title: true,
      callNumber: true,
      language: true,
      publicationYear: true
    }
  },
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      location: true
    }
  }
};

const reservationOperationsInclude = {
  ...reservationPublicInclude,
  student: {
    select: {
      userId: true,
      studentId: true,
      academicStatus: true,
      user: {
        select: {
          id: true,
          universityEmail: true,
          displayName: true,
          isActive: true
        }
      },
      faculty: {
        select: {
          id: true,
          name: true
        }
      },
      department: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  allocatedCopy: {
    select: {
      id: true,
      copyCode: true,
      barcode: true,
      shelfLocation: true,
      status: true,
      condition: true
    }
  }
};

const IDEMPOTENCY_OPERATION = 'CREATE_RESERVATION';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function startOfUtcDate(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
}

function policySpecificity(policy, branchId, itemType) {
  let score = 0;

  if (policy.branchId === branchId) score += 2;
  if (policy.itemType === itemType) score += 1;

  return score;
}

async function resolveCirculationPolicy(
  tx,
  branchId,
  itemType,
  now
) {
  const policyDate = startOfUtcDate(now);

  const policies = await tx.circulationPolicy.findMany({
    where: {
      isActive: true,
      effectiveFrom: {
        lte: policyDate
      },
      AND: [
        {
          OR: [
            { effectiveTo: null },
            {
              effectiveTo: {
                gte: policyDate
              }
            }
          ]
        },
        {
          OR: [
            { branchId },
            { branchId: null }
          ]
        },
        {
          OR: [
            { itemType },
            { itemType: null }
          ]
        }
      ]
    }
  });

  policies.sort((a, b) => {
    const scoreDifference =
      policySpecificity(b, branchId, itemType) -
      policySpecificity(a, branchId, itemType);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (
      b.effectiveFrom.getTime() -
      a.effectiveFrom.getTime()
    );
  });

  const policy = policies[0];

  if (!policy) {
    throw new AppError(
      409,
      'NO_CIRCULATION_POLICY',
      'No active circulation policy applies to this item and branch'
    );
  }

  return policy;
}

async function validateStudentForReservation(
  tx,
  userId
) {
  const student = await tx.student.findUnique({
    where: {
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          isActive: true
        }
      }
    }
  });

  if (!student) {
    throw new AppError(
      403,
      'STUDENT_PROFILE_REQUIRED',
      'A student profile is required to create a reservation'
    );
  }

  if (!student.user.isActive) {
    throw new AppError(
      409,
      'STUDENT_ACCOUNT_INACTIVE',
      'Student account is inactive'
    );
  }

  if (student.academicStatus !== 'ACTIVE') {
    throw new AppError(
      409,
      'STUDENT_NOT_ELIGIBLE',
      'Only academically active students can create reservations'
    );
  }

  return student;
}

async function validateItemAndBranch(
  tx,
  itemId,
  branchId
) {
  const [item, branch] = await Promise.all([
    tx.libraryItem.findUnique({
      where: {
        id: itemId
      },
      select: {
        id: true,
        type: true,
        isActive: true
      }
    }),

    tx.branch.findUnique({
      where: {
        id: branchId
      },
      select: {
        id: true,
        isActive: true
      }
    })
  ]);

  if (!item || !item.isActive) {
    throw new AppError(
      404,
      'ITEM_NOT_AVAILABLE',
      'Active library item not found'
    );
  }

  if (!branch || !branch.isActive) {
    throw new AppError(
      404,
      'BRANCH_NOT_AVAILABLE',
      'Active library branch not found'
    );
  }

  return {
    item,
    branch
  };
}

function toPublicReservation(reservation) {
  return {
    id: reservation.id,
    status: reservation.status,
    reservedAt: reservation.reservedAt,
    expiresAt: reservation.expiresAt,
    fulfilledAt: reservation.fulfilledAt,
    cancelledAt: reservation.cancelledAt,
    item: reservation.item,
    branch: reservation.branch
  };
}

function toOperationsReservation(
  reservation,
  now = new Date()
) {
  return {
    id: reservation.id,
    status: reservation.status,
    reservedAt: reservation.reservedAt,
    expiresAt: reservation.expiresAt,
    fulfilledAt: reservation.fulfilledAt,
    cancelledAt: reservation.cancelledAt,
    isHoldOverdue:
      reservation.status === 'ACTIVE' &&
      reservation.expiresAt <= now,
    student: reservation.student,
    item: reservation.item,
    branch: reservation.branch,
    allocatedCopy: reservation.allocatedCopy
  };
}

function reservationRequestMatches(
  storedRequest,
  currentRequest
) {
  return (
    storedRequest?.itemId === currentRequest.itemId &&
    storedRequest?.branchId === currentRequest.branchId
  );
}

function parseIdempotencyBody(record) {
  const body = record?.responseBody;

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return {
      request: null,
      response: null
    };
  }

  return {
    request: body.request ?? null,
    response: body.response ?? null
  };
}

async function readIdempotencyReplay(
  userId,
  key,
  request,
  now = new Date()
) {
  const record =
    await prisma.idempotencyRecord.findUnique({
      where: {
        userId_operation_key: {
          userId,
          operation: IDEMPOTENCY_OPERATION,
          key
        }
      }
    });

  if (!record || record.expiresAt <= now) {
    return null;
  }

  const parsed = parseIdempotencyBody(record);

  if (
    !reservationRequestMatches(
      parsed.request,
      request
    )
  ) {
    throw new AppError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different reservation request'
    );
  }

  if (!parsed.response) {
    throw new AppError(
      409,
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      'The same idempotent reservation request is still being processed'
    );
  }

  return parsed.response;
}

async function createReservationInTransaction(
  tx,
  userId,
  {
    itemId,
    branchId
  }
) {
  const now = new Date();

  await validateStudentForReservation(
    tx,
    userId
  );

  const { item } =
    await validateItemAndBranch(
      tx,
      itemId,
      branchId
    );

  const policy =
    await resolveCirculationPolicy(
      tx,
      branchId,
      item.type,
      now
    );

  const duplicateReservation =
    await tx.reservation.findFirst({
      where: {
        studentId: userId,
        itemId,
        status: {
          in: ['PENDING', 'ACTIVE']
        }
      },
      select: {
        id: true
      }
    });

  if (duplicateReservation) {
    throw new AppError(
      409,
      'ACTIVE_RESERVATION_EXISTS',
      'Student already has an active reservation for this item'
    );
  }

  const activeReservationCount =
    await tx.reservation.count({
      where: {
        studentId: userId,
        status: {
          in: ['PENDING', 'ACTIVE']
        },
        expiresAt: {
          gt: now
        }
      }
    });

  if (
    activeReservationCount >=
    policy.maxActiveReservations
  ) {
    throw new AppError(
      409,
      'RESERVATION_LIMIT_REACHED',
      'Student has reached the maximum number of active reservations'
    );
  }

  const lockedCopy =
    await lockOneAvailableCopy(
      tx,
      itemId,
      branchId
    );

  if (!lockedCopy) {
    throw new AppError(
      409,
      'NO_AVAILABLE_COPY',
      'No available copy can be reserved at this branch'
    );
  }

  await tx.physicalCopy.update({
    where: {
      id: lockedCopy.id
    },
    data: {
      status: 'RESERVED',
      version: {
        increment: 1
      }
    }
  });

  const expiresAt = new Date(
    now.getTime() +
    policy.reservationHoldHours *
      60 *
      60 *
      1000
  );

  return tx.reservation.create({
    data: {
      studentId: userId,
      itemId,
      branchId,
      allocatedCopyId: lockedCopy.id,
      status: 'ACTIVE',
      reservedAt: now,
      expiresAt
    },
    include: reservationPublicInclude
  });
}

async function lockReservation(
  tx,
  reservationId
) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM reservations
    WHERE id = ${reservationId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      404,
      'RESERVATION_NOT_FOUND',
      'Reservation not found'
    );
  }
}

async function actorCanManageReservation(
  tx,
  actorUserId,
  reservationStudentId
) {
  if (actorUserId === reservationStudentId) {
    return true;
  }

  const actor = await tx.user.findUnique({
    where: {
      id: actorUserId
    },
    select: {
      userRoles: {
        select: {
          role: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  return Boolean(
    actor?.userRoles.some(
      (entry) => entry.role.name === 'LIBRARIAN'
    )
  );
}

async function releaseAllocatedCopy(
  tx,
  allocatedCopyId
) {
  if (!allocatedCopyId) {
    return;
  }

  const rows = await tx.$queryRaw`
    SELECT id
    FROM physical_copies
    WHERE id = ${allocatedCopyId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      409,
      'RESERVATION_COPY_MISSING',
      'Allocated reservation copy no longer exists'
    );
  }

  const copy = await tx.physicalCopy.findUnique({
    where: {
      id: allocatedCopyId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (copy.status !== 'RESERVED') {
    throw new AppError(
      409,
      'RESERVATION_COPY_STATE_CONFLICT',
      `Allocated copy is ${copy.status}, expected RESERVED`
    );
  }

  await tx.physicalCopy.update({
    where: {
      id: allocatedCopyId
    },
    data: {
      status: 'AVAILABLE',
      version: {
        increment: 1
      }
    }
  });
}

async function expireLockedReservation(
  tx,
  reservation
) {
  await releaseAllocatedCopy(
    tx,
    reservation.allocatedCopyId
  );

  return tx.reservation.update({
    where: {
      id: reservation.id
    },
    data: {
      status: 'EXPIRED'
    },
    include: reservationPublicInclude
  });
}

export async function createReservation(
  userId,
  request,
  {
    idempotencyKey = null
  } = {}
) {
  const now = new Date();

  if (idempotencyKey) {
    const replay = await readIdempotencyReplay(
      userId,
      idempotencyKey,
      request,
      now
    );

    if (replay) {
      return {
        data: replay,
        replayed: true
      };
    }
  }

  try {
    const reservation = await prisma.$transaction(
      async (tx) => {
        let idempotencyRecordId = null;

        if (idempotencyKey) {
          await tx.idempotencyRecord.deleteMany({
            where: {
              userId,
              operation:
                IDEMPOTENCY_OPERATION,
              key: idempotencyKey,
              expiresAt: {
                lte: now
              }
            }
          });

          const record =
            await tx.idempotencyRecord.create({
              data: {
                key: idempotencyKey,
                userId,
                operation:
                  IDEMPOTENCY_OPERATION,
                responseBody: {
                  request,
                  response: null
                },
                expiresAt: new Date(
                  now.getTime() +
                  IDEMPOTENCY_TTL_MS
                )
              }
            });

          idempotencyRecordId = record.id;
        }

        const created =
          await createReservationInTransaction(
            tx,
            userId,
            request
          );

        const publicReservation =
          toPublicReservation(created);

        if (idempotencyRecordId) {
          await tx.idempotencyRecord.update({
            where: {
              id: idempotencyRecordId
            },
            data: {
              resultReference: created.id,
              responseBody: {
                request,
                response:
                  publicReservation
              }
            }
          });
        }

        return publicReservation;
      },
      {
        timeout: 10000
      }
    );

    return {
      data: reservation,
      replayed: false
    };
  } catch (error) {
    if (
      idempotencyKey &&
      error?.code === 'P2002'
    ) {
      const replay = await readIdempotencyReplay(
        userId,
        idempotencyKey,
        request,
        new Date()
      );

      if (replay) {
        return {
          data: replay,
          replayed: true
        };
      }
    }

    if (error?.code === 'P2002') {
      throw new AppError(
        409,
        'RESERVATION_CONFLICT',
        'Reservation conflicts with an existing active reservation'
      );
    }

    throw error;
  }
}

export async function listMyReservations(
  userId,
  {
    status,
    page = 1,
    pageSize = 20
  }
) {
  const where = {
    studentId: userId,
    ...(status ? { status } : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, reservations] =
    await prisma.$transaction([
      prisma.reservation.count({
        where
      }),

      prisma.reservation.findMany({
        where,
        include: reservationPublicInclude,
        orderBy: [
          { reservedAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: pageSize
      })
    ]);

  return {
    data: reservations.map(
      toPublicReservation
    ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages:
        Math.ceil(total / pageSize)
    }
  };
}

export async function listReservationQueue({
  q,
  status,
  branchId,
  itemId,
  studentUserId,
  studentNumber,
  holdState,
  page = 1,
  pageSize = 20
}) {
  const now = new Date();

  const where = {
    ...(status ? { status } : {}),
    ...(branchId ? { branchId } : {}),
    ...(itemId ? { itemId } : {}),
    ...(studentUserId
      ? { studentId: studentUserId }
      : {}),
    ...(studentNumber
      ? {
          student: {
            is: {
              studentId: studentNumber
            }
          }
        }
      : {}),
    ...(holdState === 'OVERDUE'
      ? {
          status: 'ACTIVE',
          expiresAt: {
            lte: now
          }
        }
      : {}),
    ...(holdState === 'VALID'
      ? {
          status: 'ACTIVE',
          expiresAt: {
            gt: now
          }
        }
      : {}),
    ...(q
      ? {
          OR: [
            {
              student: {
                is: {
                  studentId: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              }
            },
            {
              student: {
                is: {
                  user: {
                    is: {
                      universityEmail: {
                        contains: q,
                        mode: 'insensitive'
                      }
                    }
                  }
                }
              }
            },
            {
              student: {
                is: {
                  user: {
                    is: {
                      displayName: {
                        contains: q,
                        mode: 'insensitive'
                      }
                    }
                  }
                }
              }
            },
            {
              item: {
                is: {
                  title: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              }
            },
            {
              item: {
                is: {
                  callNumber: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              }
            }
          ]
        }
      : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, reservations] =
    await prisma.$transaction([
      prisma.reservation.count({
        where
      }),

      prisma.reservation.findMany({
        where,
        include:
          reservationOperationsInclude,
        orderBy: [
          { reservedAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: pageSize
      })
    ]);

  const totalPages =
    Math.ceil(total / pageSize);

  return {
    data: reservations.map(
      (reservation) =>
        toOperationsReservation(
          reservation,
          now
        )
    ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage:
        totalPages > 0 &&
        page < totalPages
    },
    meta: {
      query: q ?? null,
      appliedFilters: {
        status: status ?? null,
        branchId: branchId ?? null,
        itemId: itemId ?? null,
        studentUserId:
          studentUserId ?? null,
        studentNumber:
          studentNumber ?? null,
        holdState:
          holdState ?? null
      }
    }
  };
}

export async function getReservationForOperations(
  reservationId
) {
  const reservation =
    await prisma.reservation.findUnique({
      where: {
        id: reservationId
      },
      include:
        reservationOperationsInclude
    });

  if (!reservation) {
    throw new AppError(
      404,
      'RESERVATION_NOT_FOUND',
      'Reservation not found'
    );
  }

  return toOperationsReservation(
    reservation
  );
}

export async function cancelReservation(
  actorUserId,
  reservationId
) {
  const reservation = await prisma.$transaction(
    async (tx) => {
      await lockReservation(
        tx,
        reservationId
      );

      const current =
        await tx.reservation.findUnique({
          where: {
            id: reservationId
          },
          include: reservationPublicInclude
        });

      const canManage =
        await actorCanManageReservation(
          tx,
          actorUserId,
          current.studentId
        );

      if (!canManage) {
        throw new AppError(
          404,
          'RESERVATION_NOT_FOUND',
          'Reservation not found'
        );
      }

      if (current.status === 'CANCELLED') {
        return current;
      }

      if (current.status === 'EXPIRED') {
        throw new AppError(
          409,
          'RESERVATION_ALREADY_EXPIRED',
          'Expired reservations cannot be cancelled'
        );
      }

      if (current.status === 'FULFILLED') {
        throw new AppError(
          409,
          'RESERVATION_ALREADY_FULFILLED',
          'Fulfilled reservations cannot be cancelled'
        );
      }

      const now = new Date();

      if (
        current.status === 'ACTIVE' &&
        current.expiresAt <= now
      ) {
        return expireLockedReservation(
          tx,
          current
        );
      }

      await releaseAllocatedCopy(
        tx,
        current.allocatedCopyId
      );

      return tx.reservation.update({
        where: {
          id: reservationId
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledByUserId:
            actorUserId
        },
        include:
          reservationPublicInclude
      });
    },
    {
      timeout: 10000
    }
  );

  return toPublicReservation(reservation);
}

export async function expireDueReservations({
  limit = 100
} = {}) {
  return prisma.$transaction(
    async (tx) => {
      const dueRows = await tx.$queryRaw`
        SELECT id
        FROM reservations
        WHERE status = 'ACTIVE'
          AND expires_at <= NOW()
        ORDER BY expires_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;

      let expiredCount = 0;

      for (const row of dueRows) {
        const reservation =
          await tx.reservation.findUnique({
            where: {
              id: row.id
            },
            select: {
              id: true,
              allocatedCopyId: true,
              status: true
            }
          });

        if (
          !reservation ||
          reservation.status !== 'ACTIVE'
        ) {
          continue;
        }

        await releaseAllocatedCopy(
          tx,
          reservation.allocatedCopyId
        );

        await tx.reservation.update({
          where: {
            id: reservation.id
          },
          data: {
            status: 'EXPIRED'
          }
        });

        expiredCount += 1;
      }

      return {
        expiredCount
      };
    },
    {
      timeout: 10000
    }
  );
}
