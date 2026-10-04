import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const itemSummarySelect = {
  id: true,
  type: true,
  title: true,
  callNumber: true,
  language: true,
  publicationYear: true
};

const branchSummarySelect = {
  id: true,
  code: true,
  name: true,
  location: true
};

const borrowingPublicInclude = {
  copy: {
    select: {
      item: {
        select: itemSummarySelect
      }
    }
  },
  branch: {
    select: branchSummarySelect
  }
};

const borrowingOperationsInclude = {
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
  copy: {
    select: {
      id: true,
      copyCode: true,
      barcode: true,
      shelfLocation: true,
      status: true,
      condition: true,
      version: true,
      item: {
        select: itemSummarySelect
      }
    }
  },
  branch: {
    select: branchSummarySelect
  },
  checkedOutBy: {
    select: {
      id: true,
      universityEmail: true,
      displayName: true
    }
  }
};

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

async function lockStudentRow(tx, userId) {
  const rows = await tx.$queryRaw`
    SELECT user_id
    FROM students
    WHERE user_id = ${userId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      404,
      'STUDENT_NOT_FOUND',
      'Student not found'
    );
  }
}

async function getEligibleStudentByUserId(
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
      404,
      'STUDENT_NOT_FOUND',
      'Student not found'
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
      'Only academically active students can borrow library items'
    );
  }

  return student;
}

async function getEligibleStudentByNumber(
  tx,
  studentNumber
) {
  const found = await tx.student.findUnique({
    where: {
      studentId: studentNumber
    },
    select: {
      userId: true
    }
  });

  if (!found) {
    throw new AppError(
      404,
      'STUDENT_NOT_FOUND',
      'Student not found'
    );
  }

  await lockStudentRow(tx, found.userId);

  return getEligibleStudentByUserId(
    tx,
    found.userId
  );
}

async function lockCopyRow(tx, copyId) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM physical_copies
    WHERE id = ${copyId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      404,
      'COPY_NOT_FOUND',
      'Physical copy not found'
    );
  }
}

async function loadCheckoutCopy(tx, copyId) {
  const copy = await tx.physicalCopy.findUnique({
    where: {
      id: copyId
    },
    include: {
      item: {
        select: {
          id: true,
          type: true,
          title: true,
          isActive: true
        }
      },
      branch: {
        select: {
          id: true,
          isActive: true
        }
      }
    }
  });

  if (!copy) {
    throw new AppError(
      404,
      'COPY_NOT_FOUND',
      'Physical copy not found'
    );
  }

  if (!copy.item.isActive) {
    throw new AppError(
      409,
      'ITEM_INACTIVE',
      'The library item is inactive'
    );
  }

  if (!copy.branch.isActive) {
    throw new AppError(
      409,
      'BRANCH_INACTIVE',
      'The copy branch is inactive'
    );
  }

  return copy;
}

async function ensureLoanCapacity(
  tx,
  studentUserId,
  policy
) {
  const activeLoanCount =
    await tx.borrowing.count({
      where: {
        studentId: studentUserId,
        status: 'ACTIVE'
      }
    });

  if (
    activeLoanCount >=
    policy.maxActiveLoans
  ) {
    throw new AppError(
      409,
      'LOAN_LIMIT_REACHED',
      'Student has reached the maximum number of active loans'
    );
  }
}

function calculateDueAt(
  borrowedAt,
  loanDays
) {
  return new Date(
    borrowedAt.getTime() +
    loanDays * 24 * 60 * 60 * 1000
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getOverdueMetrics(
  borrowing,
  now = new Date()
) {
  const activeOverdueMs =
    borrowing.status === 'ACTIVE'
      ? Math.max(
          0,
          now.getTime() -
            borrowing.dueAt.getTime()
        )
      : 0;

  const returnedOverdueMs =
    borrowing.status === 'RETURNED' &&
    borrowing.returnedAt
      ? Math.max(
          0,
          borrowing.returnedAt.getTime() -
            borrowing.dueAt.getTime()
        )
      : 0;

  return {
    isOverdue: activeOverdueMs > 0,
    overdueDays:
      activeOverdueMs > 0
        ? Math.ceil(
            activeOverdueMs / DAY_MS
          )
        : 0,
    wasReturnedOverdue:
      returnedOverdueMs > 0,
    overdueAtReturnDays:
      returnedOverdueMs > 0
        ? Math.ceil(
            returnedOverdueMs / DAY_MS
          )
        : 0
  };
}

function toPublicBorrowing(
  borrowing,
  now = new Date()
) {
  return {
    id: borrowing.id,
    status: borrowing.status,
    borrowedAt: borrowing.borrowedAt,
    dueAt: borrowing.dueAt,
    returnedAt: borrowing.returnedAt,
    returnCondition:
      borrowing.returnCondition,
    notes: borrowing.notes,
    ...getOverdueMetrics(
      borrowing,
      now
    ),
    item: borrowing.copy.item,
    branch: borrowing.branch
  };
}

function toOperationsBorrowing(
  borrowing,
  now = new Date()
) {
  return {
    id: borrowing.id,
    status: borrowing.status,
    borrowedAt: borrowing.borrowedAt,
    dueAt: borrowing.dueAt,
    returnedAt: borrowing.returnedAt,
    returnCondition:
      borrowing.returnCondition,
    notes: borrowing.notes,
    ...getOverdueMetrics(
      borrowing,
      now
    ),
    reservationId:
      borrowing.reservationId,
    student: borrowing.student,
    item: borrowing.copy.item,
    branch: borrowing.branch,
    copy: {
      id: borrowing.copy.id,
      copyCode: borrowing.copy.copyCode,
      barcode: borrowing.copy.barcode,
      shelfLocation:
        borrowing.copy.shelfLocation,
      status: borrowing.copy.status,
      condition: borrowing.copy.condition,
      version: borrowing.copy.version
    },
    checkedOutBy:
      borrowing.checkedOutBy
  };
}

async function checkoutReservation(
  tx,
  librarianUserId,
  reservationId,
  notes
) {
  const reservationRows = await tx.$queryRaw`
    SELECT id
    FROM reservations
    WHERE id = ${reservationId}::uuid
    FOR UPDATE
  `;

  if (!reservationRows.length) {
    throw new AppError(
      404,
      'RESERVATION_NOT_FOUND',
      'Reservation not found'
    );
  }

  const reservation =
    await tx.reservation.findUnique({
      where: {
        id: reservationId
      },
      include: {
        item: {
          select: {
            id: true,
            type: true,
            isActive: true
          }
        },
        branch: {
          select: {
            id: true,
            isActive: true
          }
        }
      }
    });

  if (reservation.status !== 'ACTIVE') {
    throw new AppError(
      409,
      'RESERVATION_NOT_ACTIVE',
      `Reservation is ${reservation.status}, expected ACTIVE`
    );
  }

  const borrowedAt = new Date();

  if (reservation.expiresAt <= borrowedAt) {
    throw new AppError(
      409,
      'RESERVATION_HOLD_EXPIRED',
      'Reservation hold has expired and must be reconciled before checkout'
    );
  }

  if (!reservation.item.isActive) {
    throw new AppError(
      409,
      'ITEM_INACTIVE',
      'The reserved library item is inactive'
    );
  }

  if (!reservation.branch.isActive) {
    throw new AppError(
      409,
      'BRANCH_INACTIVE',
      'The reservation branch is inactive'
    );
  }

  if (!reservation.allocatedCopyId) {
    throw new AppError(
      409,
      'RESERVATION_COPY_MISSING',
      'Active reservation has no allocated copy'
    );
  }

  await lockStudentRow(
    tx,
    reservation.studentId
  );

  await getEligibleStudentByUserId(
    tx,
    reservation.studentId
  );

  await lockCopyRow(
    tx,
    reservation.allocatedCopyId
  );

  const copy = await loadCheckoutCopy(
    tx,
    reservation.allocatedCopyId
  );

  if (copy.status !== 'RESERVED') {
    throw new AppError(
      409,
      'RESERVED_COPY_STATE_CONFLICT',
      `Allocated copy is ${copy.status}, expected RESERVED`
    );
  }

  if (
    copy.itemId !== reservation.itemId ||
    copy.branchId !== reservation.branchId
  ) {
    throw new AppError(
      409,
      'RESERVATION_COPY_MISMATCH',
      'Allocated copy does not match the reservation item and branch'
    );
  }

  const policy =
    await resolveCirculationPolicy(
      tx,
      copy.branchId,
      copy.item.type,
      borrowedAt
    );

  await ensureLoanCapacity(
    tx,
    reservation.studentId,
    policy
  );

  const dueAt = calculateDueAt(
    borrowedAt,
    policy.loanDays
  );

  await tx.physicalCopy.update({
    where: {
      id: copy.id
    },
    data: {
      status: 'BORROWED',
      version: {
        increment: 1
      }
    }
  });

  const borrowing =
    await tx.borrowing.create({
      data: {
        studentId:
          reservation.studentId,
        copyId: copy.id,
        branchId: copy.branchId,
        reservationId:
          reservation.id,
        borrowedAt,
        dueAt,
        checkedOutById:
          librarianUserId,
        status: 'ACTIVE',
        notes: notes ?? null
      },
      include:
        borrowingOperationsInclude
    });

  await tx.reservation.update({
    where: {
      id: reservation.id
    },
    data: {
      status: 'FULFILLED',
      fulfilledAt: borrowedAt
    }
  });

  return borrowing;
}

async function checkoutDirect(
  tx,
  librarianUserId,
  {
    studentNumber,
    copyId,
    notes
  }
) {
  const student =
    await getEligibleStudentByNumber(
      tx,
      studentNumber
    );

  await lockCopyRow(tx, copyId);

  const copy =
    await loadCheckoutCopy(
      tx,
      copyId
    );

  if (copy.status !== 'AVAILABLE') {
    throw new AppError(
      409,
      'COPY_NOT_AVAILABLE_FOR_CHECKOUT',
      `Copy is ${copy.status}, expected AVAILABLE`
    );
  }

  const borrowedAt = new Date();

  const policy =
    await resolveCirculationPolicy(
      tx,
      copy.branchId,
      copy.item.type,
      borrowedAt
    );

  await ensureLoanCapacity(
    tx,
    student.userId,
    policy
  );

  const dueAt = calculateDueAt(
    borrowedAt,
    policy.loanDays
  );

  await tx.physicalCopy.update({
    where: {
      id: copy.id
    },
    data: {
      status: 'BORROWED',
      version: {
        increment: 1
      }
    }
  });

  return tx.borrowing.create({
    data: {
      studentId: student.userId,
      copyId: copy.id,
      branchId: copy.branchId,
      borrowedAt,
      dueAt,
      checkedOutById:
        librarianUserId,
      status: 'ACTIVE',
      notes: notes ?? null
    },
    include:
      borrowingOperationsInclude
  });
}

export async function checkoutBorrowing(
  librarianUserId,
  input
) {
  try {
    const borrowing =
      await prisma.$transaction(
        async (tx) => {
          if (input.reservationId) {
            return checkoutReservation(
              tx,
              librarianUserId,
              input.reservationId,
              input.notes
            );
          }

          return checkoutDirect(
            tx,
            librarianUserId,
            input
          );
        },
        {
          timeout: 10000
        }
      );

    return toOperationsBorrowing(
      borrowing
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError(
        409,
        'BORROWING_CONFLICT',
        'This checkout conflicts with an existing active borrowing'
      );
    }

    throw error;
  }
}

export async function listMyBorrowings(
  studentUserId,
  {
    status,
    page = 1,
    pageSize = 20
  }
) {
  const where = {
    studentId: studentUserId,
    ...(status ? { status } : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, borrowings] =
    await prisma.$transaction([
      prisma.borrowing.count({
        where
      }),
      prisma.borrowing.findMany({
        where,
        include:
          borrowingPublicInclude,
        orderBy: [
          { borrowedAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: pageSize
      })
    ]);

  const now = new Date();

  return {
    data: borrowings.map(
      (borrowing) =>
        toPublicBorrowing(
          borrowing,
          now
        )
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

export async function listBorrowings({
  q,
  status,
  branchId,
  studentNumber,
  overdueOnly = false,
  page = 1,
  pageSize = 20
}) {
  const now = new Date();

  const where = {
    ...(status ? { status } : {}),
    ...(branchId ? { branchId } : {}),
    ...(studentNumber
      ? {
          student: {
            is: {
              studentId:
                studentNumber
            }
          }
        }
      : {}),
    ...(overdueOnly
      ? {
          status: 'ACTIVE',
          dueAt: {
            lt: now
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
              copy: {
                is: {
                  copyCode: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              }
            },
            {
              copy: {
                is: {
                  barcode: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              }
            },
            {
              copy: {
                is: {
                  item: {
                    is: {
                      title: {
                        contains: q,
                        mode: 'insensitive'
                      }
                    }
                  }
                }
              }
            },
            {
              copy: {
                is: {
                  item: {
                    is: {
                      callNumber: {
                        contains: q,
                        mode: 'insensitive'
                      }
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

  const [total, borrowings] =
    await prisma.$transaction([
      prisma.borrowing.count({
        where
      }),
      prisma.borrowing.findMany({
        where,
        include:
          borrowingOperationsInclude,
        orderBy: [
          { borrowedAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: pageSize
      })
    ]);

  const totalPages =
    Math.ceil(total / pageSize);

  return {
    data: borrowings.map(
      (borrowing) =>
        toOperationsBorrowing(
          borrowing,
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
    }
  };
}

export async function getBorrowingForOperations(
  borrowingId
) {
  const borrowing =
    await prisma.borrowing.findUnique({
      where: {
        id: borrowingId
      },
      include:
        borrowingOperationsInclude
    });

  if (!borrowing) {
    throw new AppError(
      404,
      'BORROWING_NOT_FOUND',
      'Borrowing not found'
    );
  }

  return toOperationsBorrowing(
    borrowing
  );
}

function mergeBorrowingNotes(
  existingNotes,
  returnNote
) {
  const trimmed =
    returnNote?.trim();

  if (!trimmed) {
    return existingNotes;
  }

  if (!existingNotes) {
    return `Return note: ${trimmed}`;
  }

  return `${existingNotes}\nReturn note: ${trimmed}`;
}

async function lockBorrowingRow(
  tx,
  borrowingId
) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM borrowings
    WHERE id = ${borrowingId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      404,
      'BORROWING_NOT_FOUND',
      'Borrowing not found'
    );
  }
}

function getReturnOutcome(outcome) {
  switch (outcome) {
    case 'GOOD':
      return {
        borrowingStatus: 'RETURNED',
        copyStatus: 'AVAILABLE',
        copyCondition: 'GOOD',
        setReturnedAt: true
      };

    case 'FAIR':
      return {
        borrowingStatus: 'RETURNED',
        copyStatus: 'AVAILABLE',
        copyCondition: 'FAIR',
        setReturnedAt: true
      };

    case 'DAMAGED':
      return {
        borrowingStatus: 'RETURNED',
        copyStatus: 'DAMAGED',
        copyCondition: 'DAMAGED',
        setReturnedAt: true
      };

    case 'LOST':
      return {
        borrowingStatus: 'LOST',
        copyStatus: 'LOST',
        copyCondition: null,
        setReturnedAt: false
      };

    default:
      throw new AppError(
        400,
        'INVALID_RETURN_OUTCOME',
        'Unsupported return outcome'
      );
  }
}

export async function returnBorrowing(
  librarianUserId,
  borrowingId,
  {
    outcome,
    notes
  }
) {
  const borrowing =
    await prisma.$transaction(
      async (tx) => {
        await lockBorrowingRow(
          tx,
          borrowingId
        );

        const current =
          await tx.borrowing.findUnique({
            where: {
              id: borrowingId
            },
            include:
              borrowingOperationsInclude
          });

        if (current.status !== 'ACTIVE') {
          throw new AppError(
            409,
            'BORROWING_NOT_ACTIVE',
            `Borrowing is ${current.status}, expected ACTIVE`
          );
        }

        await lockCopyRow(
          tx,
          current.copyId
        );

        const copy =
          await tx.physicalCopy.findUnique({
            where: {
              id: current.copyId
            },
            select: {
              id: true,
              status: true,
              condition: true
            }
          });

        if (copy.status !== 'BORROWED') {
          throw new AppError(
            409,
            'BORROWED_COPY_STATE_CONFLICT',
            `Physical copy is ${copy.status}, expected BORROWED`
          );
        }

        const now = new Date();
        const result =
          getReturnOutcome(outcome);

        const updatedBorrowing =
          await tx.borrowing.update({
            where: {
              id: borrowingId
            },
            data: {
              status:
                result.borrowingStatus,
              returnedAt:
                result.setReturnedAt
                  ? now
                  : null,
              returnedById:
                librarianUserId,
              returnCondition: outcome,
              notes: mergeBorrowingNotes(
                current.notes,
                notes
              )
            },
            include:
              borrowingOperationsInclude
          });

        await tx.physicalCopy.update({
          where: {
            id: current.copyId
          },
          data: {
            status:
              result.copyStatus,
            ...(result.copyCondition
              ? {
                  condition:
                    result.copyCondition
                }
              : {}),
            version: {
              increment: 1
            }
          }
        });

        return tx.borrowing.findUnique({
          where: {
            id:
              updatedBorrowing.id
          },
          include:
            borrowingOperationsInclude
        });
      },
      {
        timeout: 10000
      }
    );

  return toOperationsBorrowing(
    borrowing
  );
}

