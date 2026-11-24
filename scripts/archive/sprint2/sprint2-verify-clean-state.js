import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the project-root .env explicitly so this script works when executed
// directly with: node .\scripts\sprint2\<script>.js
loadEnvFile(path.resolve(__dirname, '../../.env'));

import { prisma } from '../../apps/api/src/config/prisma.js';

const ITEM_PREFIXES = [
  'Sprint2A ',
  'Sprint2B ',
  'Sprint2C ',
  'Sprint2D ',
  'Sprint2E '
];

async function main() {
  console.log('Verifying Sprint 2 clean state and persistent development seed...');

  const [
    smokeItems,
    smokeContributors,
    studentUser,
    librarianUser,
    managementUser,
    devFaculty,
    devDepartment,
    mainBranch
  ] = await Promise.all([
    prisma.libraryItem.count({
      where: {
        OR: ITEM_PREFIXES.map((prefix) => ({
          title: {
            startsWith: prefix
          }
        }))
      }
    }),

    prisma.contributor.count({
      where: {
        fullName: {
          startsWith: 'Sprint2C '
        }
      }
    }),

    prisma.user.findUnique({
      where: {
        universityEmail: 'student@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.user.findUnique({
      where: {
        universityEmail: 'librarian@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.user.findUnique({
      where: {
        universityEmail: 'management@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.faculty.findUnique({
      where: {
        name: 'DEV Faculty'
      }
    }),

    prisma.department.findFirst({
      where: {
        name: 'DEV Department',
        faculty: {
          name: 'DEV Faculty'
        }
      }
    }),

    prisma.branch.findUnique({
      where: {
        code: 'MAIN'
      }
    })
  ]);

  if (smokeItems !== 0) {
    throw new Error(
      `Expected 0 Sprint 2 smoke library items, found ${smokeItems}.`
    );
  }

  if (smokeContributors !== 0) {
    throw new Error(
      `Expected 0 Sprint 2 smoke contributors, found ${smokeContributors}.`
    );
  }

  const expectedRoles = [
    [studentUser, 'STUDENT', 'student@sams.dev'],
    [librarianUser, 'LIBRARIAN', 'librarian@sams.dev'],
    [managementUser, 'MANAGEMENT', 'management@sams.dev']
  ];

  for (const [user, roleName, email] of expectedRoles) {
    if (!user) {
      throw new Error(`Missing persistent dev user: ${email}`);
    }

    const roleNames = user.userRoles.map((entry) => entry.role.name);

    if (!roleNames.includes(roleName)) {
      throw new Error(
        `${email} is missing expected role ${roleName}`
      );
    }

    console.log(`${roleName} role: OK`);
  }

  if (!devFaculty?.isActive) {
    throw new Error('Active DEV Faculty is missing.');
  }

  console.log('DEV Faculty: OK');

  if (!devDepartment?.isActive) {
    throw new Error('Active DEV Department is missing.');
  }

  console.log('DEV Department: OK');

  if (!mainBranch?.isActive) {
    throw new Error('Active MAIN branch is missing.');
  }

  console.log('MAIN branch: OK');

  console.log('Sprint 2 smoke records: CLEAN');
  console.log('');
  console.log('Sprint 2 clean-state verification PASSED.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
