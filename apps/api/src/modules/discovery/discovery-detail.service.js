import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { getItemAvailability } from '../availability/availability.service.js';

export async function getDiscoveryItemDetail(itemId) {
  const item = await prisma.libraryItem.findFirst({
    where: {
      id: itemId,
      isActive: true
    },
    select: {
      id: true,
      type: true,
      title: true,
      deweyCodeRaw: true,
      callNumber: true,
      language: true,
      publicationYear: true,
      abstractDescription: true,
      category: {
        select: {
          id: true,
          name: true,
          description: true
        }
      },
      deweyClassification: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      bookDetails: {
        select: {
          isbn: true,
          publisher: true,
          edition: true
        }
      },
      academicWorkDetails: {
        select: {
          academicYear: true,
          workType: true,
          faculty: {
            select: {
              id: true,
              name: true
            }
          },
          department: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      itemContributors: {
        select: {
          role: true,
          contributor: {
            select: {
              id: true,
              fullName: true
            }
          }
        },
        orderBy: [
          { role: 'asc' },
          { contributor: { fullName: 'asc' } }
        ]
      }
    }
  });

  if (!item) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'Active library item not found'
    );
  }

  const availability = await getItemAvailability(itemId);

  const reservationCandidateBranches = availability.branches
    .filter((entry) => entry.availableCopies > 0)
    .map((entry) => ({
      branch: entry.branch,
      availableCopies: entry.availableCopies
    }));

  return {
    ...item,
    availability: {
      totalCopies: availability.totalCopies,
      availableCopies: availability.availableCopies,
      available: availability.available,
      branches: availability.branches
    },
    reservationReadiness: {
      hasAvailableCopy: availability.available,
      candidateBranches: reservationCandidateBranches
    }
  };
}
