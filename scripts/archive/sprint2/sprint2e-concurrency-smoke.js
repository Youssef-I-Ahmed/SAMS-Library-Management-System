import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load the project-root .env, regardless of how this script is invoked.
loadEnvFile(path.resolve(__dirname, '../../.env'));

import { prisma } from '../../apps/api/src/config/prisma.js';
import { lockOneAvailableCopy } from '../../apps/api/src/modules/availability/availability.service.js';

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

let itemId = null;
let copyId = null;

async function main() {
  console.log('Concurrency smoke: preparing one available copy...');

  const branch = await prisma.branch.findUnique({
    where: {
      code: 'MAIN'
    }
  });

  if (!branch || !branch.isActive) {
    throw new Error('Active MAIN branch is required.');
  }

  const suffix = Date.now().toString();

  const item = await prisma.libraryItem.create({
    data: {
      type: 'BOOK',
      title: `Sprint2E Concurrency ${suffix}`,
      isActive: true
    }
  });

  itemId = item.id;

  const copy = await prisma.physicalCopy.create({
    data: {
      itemId: item.id,
      branchId: branch.id,
      copyCode: `S2E-CONC-${suffix}`,
      barcode: `S2E-CONC-BAR-${suffix}`,
      status: 'AVAILABLE',
      condition: 'GOOD'
    }
  });

  copyId = copy.id;

  let signalLocked;
  const firstLockReady = new Promise((resolve) => {
    signalLocked = resolve;
  });

  const firstTransaction = prisma.$transaction(
    async (tx) => {
      const locked = await lockOneAvailableCopy(
        tx,
        item.id,
        branch.id
      );

      if (!locked || locked.id !== copy.id) {
        throw new Error(
          'First transaction failed to lock the available copy.'
        );
      }

      console.log(
        'Transaction A locked the only AVAILABLE copy.'
      );

      signalLocked();

      // Hold the row lock long enough for transaction B to try.
      await delay(1200);
    },
    {
      timeout: 5000
    }
  );

  await firstLockReady;

  const startedAt = Date.now();

  const secondResult = await prisma.$transaction(
    async (tx) =>
      lockOneAvailableCopy(
        tx,
        item.id,
        branch.id
      ),
    {
      timeout: 5000
    }
  );

  const elapsedMs = Date.now() - startedAt;

  if (secondResult !== null) {
    throw new Error(
      'Transaction B incorrectly selected a row already locked by transaction A.'
    );
  }

  if (elapsedMs > 900) {
    throw new Error(
      `SKIP LOCKED appears to have waited (${elapsedMs} ms).`
    );
  }

  console.log(
    `Transaction B skipped the locked copy in ${elapsedMs} ms.`
  );

  await firstTransaction;

  const afterRelease = await prisma.$transaction(
    async (tx) =>
      lockOneAvailableCopy(
        tx,
        item.id,
        branch.id
      )
  );

  if (!afterRelease || afterRelease.id !== copy.id) {
    throw new Error(
      'Copy was not selectable after the first transaction released its lock.'
    );
  }

  console.log(
    'After Transaction A committed, the copy became selectable again.'
  );

  console.log(
    'Sprint 2E concurrency smoke PASSED.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (copyId) {
        await prisma.physicalCopy.deleteMany({
          where: {
            id: copyId
          }
        });
      }

      if (itemId) {
        await prisma.libraryItem.deleteMany({
          where: {
            id: itemId
          }
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
