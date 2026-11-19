import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(
  path.resolve(__dirname, '../.env')
);

import { prisma } from '../apps/api/src/config/prisma.js';

const POLICY = {
  loanDays: 14,
  reservationHoldHours: 24,
  maxActiveLoans: 3,
  maxActiveReservations: 3,
  renewalLimit: 0
};

function utcToday() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    )
  );
}

async function getMainBranch() {
  const branch = await prisma.branch.findUnique({
    where: {
      code: 'MAIN'
    }
  });

  if (!branch) {
    throw new Error('MAIN branch was not found');
  }

  if (!branch.isActive) {
    throw new Error('MAIN branch is inactive');
  }

  return branch;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to create a development circulation policy in production.'
    );
  }

  const branch = await getMainBranch();
  const effectiveFrom = utcToday();

  const existing = await prisma.circulationPolicy.findFirst({
    where: {
      branchId: branch.id,
      itemType: 'BOOK',
      isActive: true,
      effectiveFrom: {
        lte: effectiveFrom
      },
      OR: [
        {
          effectiveTo: null
        },
        {
          effectiveTo: {
            gte: effectiveFrom
          }
        }
      ]
    },
    orderBy: {
      effectiveFrom: 'desc'
    }
  });

  if (existing) {
    process.stdout.write(
      JSON.stringify(
        {
          status: 'already_configured',
          branch: {
            id: branch.id,
            code: branch.code,
            name: branch.name
          },
          policy: existing
        },
        null,
        2
      )
    );
    return;
  }

  const policy = await prisma.circulationPolicy.create({
    data: {
      branchId: branch.id,
      itemType: 'BOOK',
      ...POLICY,
      effectiveFrom,
      isActive: true
    }
  });

  process.stdout.write(
    JSON.stringify(
      {
        status: 'created',
        branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name
        },
        policy
      },
      null,
      2
    )
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
