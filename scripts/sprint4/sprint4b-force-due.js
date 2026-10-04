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

const reservationId = process.argv[2];

if (!reservationId) {
  throw new Error(
    'Usage: node sprint4b-force-due.js <reservationId>'
  );
}

async function main() {
  const now = Date.now();

  const reservedAt = new Date(
    now - 2 * 60 * 60 * 1000
  );

  const expiresAt = new Date(
    now - 60 * 60 * 1000
  );

  const reservation =
    await prisma.reservation.update({
      where: {
        id: reservationId
      },
      data: {
        reservedAt,
        expiresAt
      },
      select: {
        id: true,
        status: true,
        reservedAt: true,
        expiresAt: true
      }
    });

  process.stdout.write(
    JSON.stringify(reservation)
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
