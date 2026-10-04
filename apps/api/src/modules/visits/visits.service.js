import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

const visitOperationsInclude = {
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
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      location: true
    }
  },
  registeredBy: {
    select: {
      id: true,
      universityEmail: true,
      displayName: true
    }
  },
  checkoutBy: {
    select: {
      id: true,
      universityEmail: true,
      displayName: true
    }
  }
};

async function lockStudentRow(
  tx,
  userId
) {
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

async function getEligibleStudentByNumber(
  tx,
  studentNumber
) {
  const student =
    await tx.student.findUnique({
      where: {
        studentId: studentNumber
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

  await lockStudentRow(
    tx,
    student.userId
  );

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
      'Only academically active students can be checked into the library'
    );
  }

  return student;
}

async function getActiveBranch(
  tx,
  branchId
) {
  const branch =
    await tx.branch.findUnique({
      where: {
        id: branchId
      },
      select: {
        id: true,
        isActive: true
      }
    });

  if (!branch || !branch.isActive) {
    throw new AppError(
      404,
      'BRANCH_NOT_AVAILABLE',
      'Active library branch not found'
    );
  }

  return branch;
}

async function lockVisitRow(
  tx,
  visitId
) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM library_visits
    WHERE id = ${visitId}::uuid
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new AppError(
      404,
      'VISIT_NOT_FOUND',
      'Library visit not found'
    );
  }
}

function toOperationsVisit(
  visit,
  now = new Date()
) {
  return {
    id: visit.id,
    checkedInAt: visit.checkedInAt,
    checkedOutAt: visit.checkedOutAt,
    source: visit.source,
    isOpen: visit.checkedOutAt === null,
    durationMinutes:
      visit.checkedOutAt
        ? Math.max(
            0,
            Math.floor(
              (
                visit.checkedOutAt.getTime() -
                visit.checkedInAt.getTime()
              ) /
              60000
            )
          )
        : Math.max(
            0,
            Math.floor(
              (
                now.getTime() -
                visit.checkedInAt.getTime()
              ) /
              60000
            )
          ),
    student: visit.student,
    branch: visit.branch,
    registeredBy: visit.registeredBy,
    checkoutBy: visit.checkoutBy
  };
}

export async function checkInVisit(
  librarianUserId,
  {
    studentNumber,
    branchId,
    source = 'MANUAL'
  }
) {
  try {
    const visit =
      await prisma.$transaction(
        async (tx) => {
          const student =
            await getEligibleStudentByNumber(
              tx,
              studentNumber
            );

          await getActiveBranch(
            tx,
            branchId
          );

          const openVisit =
            await tx.libraryVisit.findFirst({
              where: {
                studentId:
                  student.userId,
                checkedOutAt: null
              },
              select: {
                id: true,
                branchId: true,
                checkedInAt: true
              }
            });

          if (openVisit) {
            throw new AppError(
              409,
              'OPEN_VISIT_EXISTS',
              'Student already has an open library visit'
            );
          }

          return tx.libraryVisit.create({
            data: {
              studentId:
                student.userId,
              branchId,
              registeredById:
                librarianUserId,
              source
            },
            include:
              visitOperationsInclude
          });
        },
        {
          timeout: 10000
        }
      );

    return toOperationsVisit(
      visit
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError(
        409,
        'OPEN_VISIT_EXISTS',
        'Student already has an open library visit'
      );
    }

    throw error;
  }
}

export async function checkOutVisit(
  librarianUserId,
  visitId
) {
  const visit =
    await prisma.$transaction(
      async (tx) => {
        await lockVisitRow(
          tx,
          visitId
        );

        const current =
          await tx.libraryVisit.findUnique({
            where: {
              id: visitId
            },
            include:
              visitOperationsInclude
          });

        if (current.checkedOutAt) {
          throw new AppError(
            409,
            'VISIT_ALREADY_CLOSED',
            'Library visit is already checked out'
          );
        }

        const checkedOutAt =
          new Date();

        if (
          checkedOutAt <=
          current.checkedInAt
        ) {
          throw new AppError(
            409,
            'INVALID_VISIT_TIME',
            'Checkout time must be after check-in time'
          );
        }

        return tx.libraryVisit.update({
          where: {
            id: visitId
          },
          data: {
            checkedOutAt,
            checkoutById:
              librarianUserId
          },
          include:
            visitOperationsInclude
        });
      },
      {
        timeout: 10000
      }
    );

  return toOperationsVisit(
    visit
  );
}

export async function listVisits({
  q,
  branchId,
  studentNumber,
  source,
  openOnly = false,
  from,
  to,
  page = 1,
  pageSize = 20
}) {
  const where = {
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
    ...(source ? { source } : {}),
    ...(openOnly
      ? {
          checkedOutAt: null
        }
      : {}),
    ...(
      from || to
        ? {
            checkedInAt: {
              ...(from
                ? { gte: from }
                : {}),
              ...(to
                ? { lte: to }
                : {})
            }
          }
        : {}
    ),
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
              branch: {
                is: {
                  name: {
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

  const skip =
    (page - 1) * pageSize;

  const [total, visits] =
    await prisma.$transaction([
      prisma.libraryVisit.count({
        where
      }),
      prisma.libraryVisit.findMany({
        where,
        include:
          visitOperationsInclude,
        orderBy: [
          { checkedInAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: pageSize
      })
    ]);

  const totalPages =
    Math.ceil(total / pageSize);

  const now = new Date();

  return {
    data: visits.map(
      (visit) =>
        toOperationsVisit(
          visit,
          now
        )
    ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPreviousPage:
        page > 1,
      hasNextPage:
        totalPages > 0 &&
        page < totalPages
    },
    meta: {
      query: q ?? null,
      appliedFilters: {
        branchId:
          branchId ?? null,
        studentNumber:
          studentNumber ?? null,
        source:
          source ?? null,
        openOnly,
        from:
          from?.toISOString() ??
          null,
        to:
          to?.toISOString() ??
          null
      }
    }
  };
}

export async function getVisitForOperations(
  visitId
) {
  const visit =
    await prisma.libraryVisit.findUnique({
      where: {
        id: visitId
      },
      include:
        visitOperationsInclude
    });

  if (!visit) {
    throw new AppError(
      404,
      'VISIT_NOT_FOUND',
      'Library visit not found'
    );
  }

  return toOperationsVisit(
    visit
  );
}
