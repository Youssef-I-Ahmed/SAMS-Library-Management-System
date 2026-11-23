import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(import.meta.url);
const __dirname =
  path.dirname(__filename);

loadEnvFile(
  path.resolve(
    __dirname,
    '../../.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

const borrowingId =
  process.argv[2];

if (!borrowingId) {
  throw new Error(
    'Usage: node sprint5b-force-overdue.js <borrowingId>'
  );
}

async function main() {
  const now = Date.now();

  const borrowedAt =
    new Date(
      now -
      4 * 24 * 60 * 60 * 1000
    );

  const dueAt =
    new Date(
      now -
      2 * 24 * 60 * 60 * 1000
    );

  const borrowing =
    await prisma.borrowing.update({
      where: {
        id: borrowingId
      },
      data: {
        borrowedAt,
        dueAt
      },
      select: {
        id: true,
        status: true,
        borrowedAt: true,
        dueAt: true
      }
    });

  process.stdout.write(
    JSON.stringify(borrowing)
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
