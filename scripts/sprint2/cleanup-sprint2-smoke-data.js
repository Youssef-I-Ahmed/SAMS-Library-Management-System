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

const CONTRIBUTOR_PREFIX = 'Sprint2C ';

function prefixWhere(prefixes) {
  return {
    OR: prefixes.map((prefix) => ({
      title: {
        startsWith: prefix
      }
    }))
  };
}

async function main() {
  console.log('Cleaning Sprint 2 smoke-test data only...');

  const smokeItems = await prisma.libraryItem.findMany({
    where: prefixWhere(ITEM_PREFIXES),
    select: {
      id: true,
      title: true
    }
  });

  const smokeItemIds = smokeItems.map((item) => item.id);

  if (smokeItemIds.length > 0) {
    const reservationCount = await prisma.reservation.count({
      where: {
        itemId: {
          in: smokeItemIds
        }
      }
    });

    const borrowingCount = await prisma.borrowing.count({
      where: {
        copy: {
          itemId: {
            in: smokeItemIds
          }
        }
      }
    });

    if (reservationCount > 0 || borrowingCount > 0) {
      throw new Error(
        `Refusing cleanup: found ${reservationCount} reservation(s) and ${borrowingCount} borrowing(s) linked to Sprint 2 smoke items.`
      );
    }

    const deletedCopies = await prisma.physicalCopy.deleteMany({
      where: {
        itemId: {
          in: smokeItemIds
        }
      }
    });

    const deletedLinks = await prisma.itemContributor.deleteMany({
      where: {
        itemId: {
          in: smokeItemIds
        }
      }
    });

    const deletedBookDetails = await prisma.bookDetails.deleteMany({
      where: {
        itemId: {
          in: smokeItemIds
        }
      }
    });

    const deletedAcademicDetails =
      await prisma.academicWorkDetails.deleteMany({
        where: {
          itemId: {
            in: smokeItemIds
          }
        }
      });

    const deletedItems = await prisma.libraryItem.deleteMany({
      where: {
        id: {
          in: smokeItemIds
        }
      }
    });

    console.log(
      `Deleted ${deletedCopies.count} Sprint 2 smoke physical copy/copies.`
    );
    console.log(
      `Deleted ${deletedLinks.count} Sprint 2 smoke item-contributor link(s).`
    );
    console.log(
      `Deleted ${deletedBookDetails.count} Sprint 2 smoke book detail record(s).`
    );
    console.log(
      `Deleted ${deletedAcademicDetails.count} Sprint 2 smoke academic-work detail record(s).`
    );
    console.log(
      `Deleted ${deletedItems.count} Sprint 2 smoke library item(s).`
    );
  } else {
    console.log('No Sprint 2 smoke library items found.');
  }

  const deletedContributors = await prisma.contributor.deleteMany({
    where: {
      fullName: {
        startsWith: CONTRIBUTOR_PREFIX
      }
    }
  });

  console.log(
    `Deleted ${deletedContributors.count} Sprint 2 smoke contributor(s).`
  );

  console.log('');
  console.log('Sprint 2 smoke-data cleanup completed.');
  console.log('Sprint 1 persistent development seed was preserved.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
