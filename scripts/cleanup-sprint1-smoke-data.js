import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning Sprint 1 smoke-test data only...');

  const smokeStudents = await prisma.student.findMany({
    where: {
      studentId: {
        startsWith: 'SYNC-'
      }
    },
    select: {
      userId: true,
      studentId: true
    }
  });

  if (smokeStudents.length > 0) {
    const userIds = smokeStudents.map((student) => student.userId);

    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: {
          userId: {
            in: userIds
          }
        }
      }),
      prisma.student.deleteMany({
        where: {
          userId: {
            in: userIds
          }
        }
      }),
      prisma.user.deleteMany({
        where: {
          id: {
            in: userIds
          }
        }
      })
    ]);

    console.log(`Deleted ${smokeStudents.length} Sprint 1C smoke student(s).`);
  } else {
    console.log('No Sprint 1C smoke students found.');
  }

  const deweyRoots = await prisma.deweyClassification.findMany({
    where: {
      code: {
        startsWith: 'DEV-'
      }
    },
    select: {
      id: true
    }
  });

  if (deweyRoots.length > 0) {
    const rootIds = deweyRoots.map((row) => row.id);

    await prisma.deweyClassification.deleteMany({
      where: {
        parentId: {
          in: rootIds
        }
      }
    });

    await prisma.deweyClassification.deleteMany({
      where: {
        id: {
          in: rootIds
        }
      }
    });

    console.log(`Deleted ${deweyRoots.length} Sprint 1D Dewey root classification(s) and their children.`);
  } else {
    console.log('No Sprint 1D Dewey smoke classifications found.');
  }

  const categories = await prisma.category.deleteMany({
    where: {
      name: {
        startsWith: 'Sprint1D Category '
      }
    }
  });

  console.log(`Deleted ${categories.count} Sprint 1D smoke category/categories.`);

  const branches = await prisma.branch.deleteMany({
    where: {
      AND: [
        {
          name: {
            startsWith: 'Sprint1B Branch '
          }
        },
        {
          location: {
            in: ['Smoke Test', 'Updated by Sprint1B smoke test']
          }
        }
      ]
    }
  });

  console.log(`Deleted ${branches.count} Sprint 1B smoke branch(es).`);

  const departments = await prisma.department.deleteMany({
    where: {
      name: 'Sprint1B Department',
      faculty: {
        name: {
          startsWith: 'Sprint1B Faculty '
        }
      }
    }
  });

  console.log(`Deleted ${departments.count} Sprint 1B smoke department(s).`);

  const faculties = await prisma.faculty.deleteMany({
    where: {
      name: {
        startsWith: 'Sprint1B Faculty '
      }
    }
  });

  console.log(`Deleted ${faculties.count} Sprint 1B smoke faculty/faculties.`);

  console.log('');
  console.log('Sprint 1 smoke-data cleanup completed.');
  console.log('Development seed data was preserved.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
