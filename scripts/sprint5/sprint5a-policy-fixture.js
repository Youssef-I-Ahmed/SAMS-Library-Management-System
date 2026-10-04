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

const FIXTURE = {
  loanDays: 13,
  reservationHoldHours: 19,
  maxActiveLoans: 2,
  maxActiveReservations: 20,
  renewalLimit: 0
};

async function getMainBranch() {
  const branch =
    await prisma.branch.findUnique({
      where: {
        code: 'MAIN'
      }
    });

  if (!branch || !branch.isActive) {
    throw new Error(
      'Active MAIN branch is required'
    );
  }

  return branch;
}

async function createFixture() {
  const branch =
    await getMainBranch();

  await prisma.circulationPolicy.deleteMany({
    where: {
      branchId: branch.id,
      itemType: 'BOOK',
      ...FIXTURE
    }
  });

  const now = new Date();

  const effectiveFrom = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    )
  );

  const policy =
    await prisma.circulationPolicy.create({
      data: {
        branchId: branch.id,
        itemType: 'BOOK',
        ...FIXTURE,
        effectiveFrom,
        isActive: true
      }
    });

  process.stdout.write(
    JSON.stringify({
      id: policy.id,
      branchId: branch.id,
      loanDays: policy.loanDays,
      maxActiveLoans:
        policy.maxActiveLoans
    })
  );
}

async function cleanupFixture() {
  const branch =
    await getMainBranch();

  const result =
    await prisma.circulationPolicy.deleteMany({
      where: {
        branchId: branch.id,
        itemType: 'BOOK',
        ...FIXTURE
      }
    });

  process.stdout.write(
    JSON.stringify({
      deleted: result.count
    })
  );
}

async function main() {
  const action = process.argv[2];

  if (action === 'create') {
    await createFixture();
    return;
  }

  if (action === 'cleanup') {
    await cleanupFixture();
    return;
  }

  throw new Error(
    'Usage: node sprint5a-policy-fixture.js create|cleanup'
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
