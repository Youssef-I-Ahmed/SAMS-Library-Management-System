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
  'Sprint5A ',
  'Sprint5B '
];

const TEST_USER_EMAIL_PREFIXES = [
  'sprint5a-a-',
  'sprint5a-b-',
  'sprint5a-c-',
  'sprint5b-good-',
  'sprint5b-damaged-',
  'sprint5b-lost-',
  'sprint5c-a-',
  'sprint5c-b-',
  'sprint5c-inactive-'
];

const POLICY_FIXTURE = {
  loanDays: 13,
  reservationHoldHours: 19,
  maxActiveLoans: 2,
  maxActiveReservations: 20,
  renewalLimit: 0
};

async function main() {
  console.log('Cleaning Sprint 5 smoke-test data only...');

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

  const smokeReservations =
    smokeItemIds.length
      ? await prisma.reservation.findMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          },
          select: {
            id: true
          }
        })
      : [];

  const smokeReservationIds =
    smokeReservations.map(
      (reservation) =>
        reservation.id
    );

  // Borrowings must be removed before reservations/copies/items.
  const deletedBorrowingsByItem =
    smokeItemIds.length
      ? await prisma.borrowing.deleteMany({
          where: {
            copy: {
              itemId: {
                in: smokeItemIds
              }
            }
          }
        })
      : { count: 0 };

  const deletedBorrowingsByUser =
    testUserIds.length
      ? await prisma.borrowing.deleteMany({
          where: {
            studentId: {
              in: testUserIds
            }
          }
        })
      : { count: 0 };

  console.log(
    `Deleted ${deletedBorrowingsByItem.count + deletedBorrowingsByUser.count} Sprint 5 borrowing record(s).`
  );

  const deletedReservations =
    smokeItemIds.length
      ? await prisma.reservation.deleteMany({
          where: {
            itemId: {
              in: smokeItemIds
            }
          }
        })
      : { count: 0 };

  console.log(
    `Deleted ${deletedReservations.count} Sprint 5 reservation(s).`
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
    `Deleted ${deletedVisits.count} Sprint 5 library visit(s).`
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
    `Deleted ${deletedCopies.count} Sprint 5 physical copy/copies.`
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
    `Deleted ${deletedLinks.count} Sprint 5 item-contributor link(s).`
  );
  console.log(
    `Deleted ${deletedBookDetails.count} Sprint 5 book detail record(s).`
  );
  console.log(
    `Deleted ${deletedAcademicDetails.count} Sprint 5 academic-work detail record(s).`
  );
  console.log(
    `Deleted ${deletedItems.count} Sprint 5 library item(s).`
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
        `Refusing test-user cleanup: ${remainingReservations} reservation(s), ${remainingBorrowings} borrowing(s), ${remainingVisits} visit(s) still reference Sprint 5 test students.`
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
      `Deleted ${deletedUserRoles.count} Sprint 5 test user-role link(s).`
    );
    console.log(
      `Deleted ${deletedStudents.count} Sprint 5 test student profile(s).`
    );
    console.log(
      `Deleted ${deletedUsers.count} Sprint 5 test user(s).`
    );
  } else {
    console.log(
      'No Sprint 5 temporary student users found.'
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
    `Deleted ${deletedPolicies.count} Sprint 5 policy fixture(s).`
  );

  console.log('');
  console.log(
    'Sprint 5 smoke-data cleanup completed.'
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
