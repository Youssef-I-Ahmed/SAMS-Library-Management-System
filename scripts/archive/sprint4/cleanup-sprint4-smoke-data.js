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
  'Sprint4A ',
  'Sprint4B ',
  'Sprint4C '
];

const TEST_USER_EMAIL_PREFIXES = [
  'sprint4a-b-',
  'sprint4a-inactive-'
];

const POLICY_FIXTURE = {
  loanDays: 991,
  reservationHoldHours: 17,
  maxActiveLoans: 97,
  maxActiveReservations: 89,
  renewalLimit: 0
};

async function main() {
  console.log('Cleaning Sprint 4 smoke-test data only...');

  const smokeItems = await prisma.libraryItem.findMany({
    where: {
      OR: ITEM_PREFIXES.map((prefix) => ({
        title: {
          startsWith: prefix
        }
      }))
    },
    select: {
      id: true,
      title: true
    }
  });

  const smokeItemIds = smokeItems.map((item) => item.id);

  const reservations = smokeItemIds.length
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

  const reservationIds = reservations.map(
    (reservation) => reservation.id
  );

  if (reservationIds.length > 0) {
    const borrowingCount =
      await prisma.borrowing.count({
        where: {
          reservationId: {
            in: reservationIds
          }
        }
      });

    if (borrowingCount > 0) {
      throw new Error(
        `Refusing cleanup: found ${borrowingCount} borrowing(s) linked to Sprint 4 smoke reservations.`
      );
    }
  }

  const deletedIdempotencyByResult =
    reservationIds.length
      ? await prisma.idempotencyRecord.deleteMany({
          where: {
            OR: [
              {
                resultReference: {
                  in: reservationIds
                }
              },
              {
                key: {
                  startsWith: 's4c-'
                },
                operation: 'CREATE_RESERVATION'
              }
            ]
          }
        })
      : await prisma.idempotencyRecord.deleteMany({
          where: {
            key: {
              startsWith: 's4c-'
            },
            operation: 'CREATE_RESERVATION'
          }
        });

  console.log(
    `Deleted ${deletedIdempotencyByResult.count} Sprint 4 idempotency record(s).`
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
    `Deleted ${deletedReservations.count} Sprint 4 reservation(s).`
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
    `Deleted ${deletedCopies.count} Sprint 4 physical copy/copies.`
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
    `Deleted ${deletedLinks.count} Sprint 4 item-contributor link(s).`
  );
  console.log(
    `Deleted ${deletedBookDetails.count} Sprint 4 book detail record(s).`
  );
  console.log(
    `Deleted ${deletedAcademicDetails.count} Sprint 4 academic-work detail record(s).`
  );
  console.log(
    `Deleted ${deletedItems.count} Sprint 4 library item(s).`
  );

  const testUsers = await prisma.user.findMany({
    where: {
      OR: TEST_USER_EMAIL_PREFIXES.map((prefix) => ({
        universityEmail: {
          startsWith: prefix
        }
      }))
    },
    select: {
      id: true,
      universityEmail: true
    }
  });

  const testUserIds = testUsers.map((user) => user.id);

  if (testUserIds.length > 0) {
    const [remainingReservations, borrowings, visits] =
      await Promise.all([
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
      borrowings > 0 ||
      visits > 0
    ) {
      throw new Error(
        `Refusing test-user cleanup: ${remainingReservations} reservation(s), ${borrowings} borrowing(s), ${visits} visit(s) still reference Sprint 4 test students.`
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
      `Deleted ${deletedUserRoles.count} Sprint 4 test user-role link(s).`
    );
    console.log(
      `Deleted ${deletedStudents.count} Sprint 4 test student profile(s).`
    );
    console.log(
      `Deleted ${deletedUsers.count} Sprint 4 test user(s).`
    );
  } else {
    console.log('No Sprint 4 temporary student users found.');
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
          ? { branchId: mainBranch.id }
          : {}),
        itemType: 'BOOK',
        ...POLICY_FIXTURE
      }
    });

  console.log(
    `Deleted ${deletedPolicies.count} Sprint 4 policy fixture(s).`
  );

  console.log('');
  console.log('Sprint 4 smoke-data cleanup completed.');
  console.log('Persistent Sprint 1 development seed was preserved.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
