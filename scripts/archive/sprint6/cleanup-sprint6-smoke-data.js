import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(
  path.resolve(
    __dirname,
    '../../.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

const ITEM_PREFIXES = [
  'Sprint6A ',
  'Sprint6B '
];

const TEST_USER_EMAIL_PREFIXES = [
  'sprint6a-',
  'sprint6b-'
];

const POLICY_FIXTURE = {
  loanDays: 9,
  reservationHoldHours: 11,
  maxActiveLoans: 10,
  maxActiveReservations: 10,
  renewalLimit: 0
};

async function main() {
  console.log(
    'Cleaning Sprint 6 smoke-test data only...'
  );

  const smokeItems =
    await prisma.libraryItem.findMany({
      where: {
        OR: ITEM_PREFIXES.map(
          (prefix) => ({
            title: {
              startsWith: prefix
            }
          })
        )
      },
      select: {
        id: true,
        title: true
      }
    });

  const smokeItemIds =
    smokeItems.map(
      (item) => item.id
    );

  const testUsers =
    await prisma.user.findMany({
      where: {
        OR:
          TEST_USER_EMAIL_PREFIXES.map(
            (prefix) => ({
              universityEmail: {
                startsWith: prefix
              }
            })
          )
      },
      select: {
        id: true,
        universityEmail: true
      }
    });

  const testUserIds =
    testUsers.map(
      (user) => user.id
    );

  // Remove transaction history before reservations/copies/items/users.
  const deletedBorrowings =
    await prisma.borrowing.deleteMany({
      where: {
        OR: [
          ...(smokeItemIds.length
            ? [
                {
                  copy: {
                    itemId: {
                      in: smokeItemIds
                    }
                  }
                }
              ]
            : []),

          ...(testUserIds.length
            ? [
                {
                  studentId: {
                    in: testUserIds
                  }
                }
              ]
            : [])
        ]
      }
    });

  console.log(
    `Deleted ${deletedBorrowings.count} Sprint 6 borrowing record(s).`
  );

  const deletedReservations =
    await prisma.reservation.deleteMany({
      where: {
        OR: [
          ...(smokeItemIds.length
            ? [
                {
                  itemId: {
                    in: smokeItemIds
                  }
                }
              ]
            : []),

          ...(testUserIds.length
            ? [
                {
                  studentId: {
                    in: testUserIds
                  }
                }
              ]
            : [])
        ]
      }
    });

  console.log(
    `Deleted ${deletedReservations.count} Sprint 6 reservation(s).`
  );

  const deletedVisits =
    testUserIds.length
      ? await prisma.libraryVisit.deleteMany({
          where: {
            studentId: {
              in: testUserIds
            }
          }
        })
      : { count: 0 };

  console.log(
    `Deleted ${deletedVisits.count} Sprint 6 library visit(s).`
  );

  const deletedCopies =
    smokeItemIds.length
      ? await prisma.physicalCopy.deleteMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  console.log(
    `Deleted ${deletedCopies.count} Sprint 6 physical copy/copies.`
  );

  const deletedLinks =
    smokeItemIds.length
      ? await prisma.itemContributor.deleteMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  const deletedBookDetails =
    smokeItemIds.length
      ? await prisma.bookDetails.deleteMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  const deletedAcademicDetails =
    smokeItemIds.length
      ? await prisma.academicWorkDetails.deleteMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  const deletedItems =
    smokeItemIds.length
      ? await prisma.libraryItem.deleteMany({
          where: {
            id: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  console.log(
    `Deleted ${deletedLinks.count} Sprint 6 item-contributor link(s).`
  );
  console.log(
    `Deleted ${deletedBookDetails.count} Sprint 6 book detail record(s).`
  );
  console.log(
    `Deleted ${deletedAcademicDetails.count} Sprint 6 academic-work detail record(s).`
  );
  console.log(
    `Deleted ${deletedItems.count} Sprint 6 library item(s).`
  );

  if (testUserIds.length > 0) {
    const [
      remainingReservations,
      remainingBorrowings,
      remainingVisits
    ] = await Promise.all([
      prisma.reservation.count({
        where: {
          studentId: {
            in: testUserIds
          }
        }
      }),

      prisma.borrowing.count({
        where: {
          studentId: {
            in: testUserIds
          }
        }
      }),

      prisma.libraryVisit.count({
        where: {
          studentId: {
            in: testUserIds
          }
        }
      })
    ]);

    if (
      remainingReservations > 0 ||
      remainingBorrowings > 0 ||
      remainingVisits > 0
    ) {
      throw new Error(
        `Refusing Sprint 6 test-user cleanup: ${remainingReservations} reservation(s), ${remainingBorrowings} borrowing(s), ${remainingVisits} visit(s) still reference temporary users.`
      );
    }

    await prisma.idempotencyRecord.deleteMany({
      where: {
        userId: {
          in: testUserIds
        }
      }
    });

    const deletedUserRoles =
      await prisma.userRole.deleteMany({
        where: {
          userId: {
            in: testUserIds
          }
        }
      });

    const deletedStudents =
      await prisma.student.deleteMany({
        where: {
          userId: {
            in: testUserIds
          }
        }
      });

    const deletedUsers =
      await prisma.user.deleteMany({
        where: {
          id: {
            in: testUserIds
          }
        }
      });

    console.log(
      `Deleted ${deletedUserRoles.count} Sprint 6 test user-role link(s).`
    );
    console.log(
      `Deleted ${deletedStudents.count} Sprint 6 test student profile(s).`
    );
    console.log(
      `Deleted ${deletedUsers.count} Sprint 6 test user(s).`
    );
  } else {
    console.log(
      'No Sprint 6 temporary student users found.'
    );
  }

  const mainBranch =
    await prisma.branch.findUnique({
      where: {
        code: 'MAIN'
      },
      select: {
        id: true
      }
    });

  const deletedPolicies =
    await prisma.circulationPolicy.deleteMany({
      where: {
        ...(mainBranch
          ? {
              branchId:
                mainBranch.id
            }
          : {}),
        itemType: 'BOOK',
        ...POLICY_FIXTURE
      }
    });

  console.log(
    `Deleted ${deletedPolicies.count} Sprint 6 policy fixture(s).`
  );

  console.log('');
  console.log(
    'Sprint 6 smoke-data cleanup completed.'
  );
  console.log(
    'Persistent Sprint 1 development seed was preserved.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
