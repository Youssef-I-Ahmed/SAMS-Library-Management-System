import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(path.resolve(__dirname, '../../.env'));

import { prisma } from '../../apps/api/src/config/prisma.js';

const ITEM_PREFIXES = [
  'Sprint3A ',
  'Sprint3B ',
  'Sprint3C '
];

const CONTRIBUTOR_PREFIXES = [
  'Sprint3A ',
  'Sprint3B '
];

async function main() {
  console.log('Cleaning Sprint 3 smoke-test data only...');

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
        `Refusing cleanup: found ${reservationCount} reservation(s) and ${borrowingCount} borrowing(s) linked to Sprint 3 smoke items.`
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
      `Deleted ${deletedCopies.count} Sprint 3 smoke physical copy/copies.`
    );
    console.log(
      `Deleted ${deletedLinks.count} Sprint 3 smoke item-contributor link(s).`
    );
    console.log(
      `Deleted ${deletedBookDetails.count} Sprint 3 smoke book detail record(s).`
    );
    console.log(
      `Deleted ${deletedAcademicDetails.count} Sprint 3 smoke academic-work detail record(s).`
    );
    console.log(
      `Deleted ${deletedItems.count} Sprint 3 smoke library item(s).`
    );
  } else {
    console.log('No Sprint 3 smoke library items found.');
  }

  const deletedContributors = await prisma.contributor.deleteMany({
    where: {
      OR: CONTRIBUTOR_PREFIXES.map((prefix) => ({
        fullName: {
          startsWith: prefix
        }
      }))
    }
  });

  console.log(
    `Deleted ${deletedContributors.count} Sprint 3 smoke contributor(s).`
  );

  const deletedCategories = await prisma.category.deleteMany({
    where: {
      name: {
        startsWith: 'Sprint3C Category '
      }
    }
  });

  console.log(
    `Deleted ${deletedCategories.count} Sprint 3 smoke category/categories.`
  );

  const deletedDewey = await prisma.deweyClassification.deleteMany({
    where: {
      code: {
        startsWith: 'S3C-'
      }
    }
  });

  console.log(
    `Deleted ${deletedDewey.count} Sprint 3 smoke Dewey classification(s).`
  );

  console.log('');
  console.log('Sprint 3 smoke-data cleanup completed.');
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
