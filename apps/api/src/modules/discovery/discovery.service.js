import { prisma } from '../../config/prisma.js';

function buildInventoryFilter({ branchId, availableOnly }) {
  if (branchId && availableOnly) {
    return {
      branchId,
      status: 'AVAILABLE',
      branch: {
        isActive: true
      }
    };
  }

  if (branchId) {
    return {
      branchId,
      status: {
        not: 'ARCHIVED'
      },
      branch: {
        isActive: true
      }
    };
  }

  if (availableOnly) {
    return {
      status: 'AVAILABLE',
      branch: {
        isActive: true
      }
    };
  }

  return null;
}

function buildOrderBy(sort) {
  switch (sort) {
    case 'TITLE_DESC':
      return [
        { title: 'desc' },
        { id: 'asc' }
      ];

    case 'YEAR_DESC':
      return [
        {
          publicationYear: {
            sort: 'desc',
            nulls: 'last'
          }
        },
        { title: 'asc' },
        { id: 'asc' }
      ];

    case 'YEAR_ASC':
      return [
        {
          publicationYear: {
            sort: 'asc',
            nulls: 'last'
          }
        },
        { title: 'asc' },
        { id: 'asc' }
      ];

    case 'NEWEST':
      return [
        { createdAt: 'desc' },
        { id: 'asc' }
      ];

    case 'TITLE_ASC':
    default:
      return [
        { title: 'asc' },
        { id: 'asc' }
      ];
  }
}

function buildSearchFilter(q) {
  if (!q) return {};

  return {
    OR: [
      {
        title: {
          contains: q,
          mode: 'insensitive'
        }
      },
      {
        callNumber: {
          contains: q,
          mode: 'insensitive'
        }
      },
      {
        deweyCodeRaw: {
          contains: q,
          mode: 'insensitive'
        }
      },
      {
        abstractDescription: {
          contains: q,
          mode: 'insensitive'
        }
      },
      {
        category: {
          is: {
            name: {
              contains: q,
              mode: 'insensitive'
            }
          }
        }
      },
      {
        deweyClassification: {
          is: {
            OR: [
              {
                code: {
                  contains: q,
                  mode: 'insensitive'
                }
              },
              {
                name: {
                  contains: q,
                  mode: 'insensitive'
                }
              }
            ]
          }
        }
      },
      {
        bookDetails: {
          is: {
            OR: [
              {
                isbn: {
                  contains: q,
                  mode: 'insensitive'
                }
              },
              {
                publisher: {
                  contains: q,
                  mode: 'insensitive'
                }
              },
              {
                edition: {
                  contains: q,
                  mode: 'insensitive'
                }
              }
            ]
          }
        }
      },
      {
        academicWorkDetails: {
          is: {
            academicYear: {
              contains: q,
              mode: 'insensitive'
            }
          }
        }
      },
      {
        itemContributors: {
          some: {
            contributor: {
              fullName: {
                contains: q,
                mode: 'insensitive'
              }
            }
          }
        }
      }
    ]
  };
}

async function loadAvailabilityForItems(itemIds) {
  if (itemIds.length === 0) {
    return new Map();
  }

  const grouped = await prisma.physicalCopy.groupBy({
    by: ['itemId', 'branchId', 'status'],
    where: {
      itemId: {
        in: itemIds
      },
      status: {
        not: 'ARCHIVED'
      },
      branch: {
        isActive: true
      }
    },
    _count: {
      _all: true
    }
  });

  const branchIds = [
    ...new Set(grouped.map((row) => row.branchId))
  ];

  const branches = branchIds.length
    ? await prisma.branch.findMany({
        where: {
          id: {
            in: branchIds
          },
          isActive: true
        },
        select: {
          id: true,
          code: true,
          name: true,
          location: true
        }
      })
    : [];

  const branchMap = new Map(
    branches.map((branch) => [
      branch.id,
      branch
    ])
  );

  const availability = new Map();

  for (const itemId of itemIds) {
    availability.set(itemId, {
      totalCopies: 0,
      availableCopies: 0,
      available: false,
      branches: []
    });
  }

  const itemBranchCounters = new Map();

  for (const row of grouped) {
    const branch = branchMap.get(row.branchId);

    if (!branch) continue;

    const itemAvailability =
      availability.get(row.itemId);

    const count = row._count._all;

    itemAvailability.totalCopies += count;

    if (row.status === 'AVAILABLE') {
      itemAvailability.availableCopies += count;
    }

    const key =
      `${row.itemId}:${row.branchId}`;

    if (!itemBranchCounters.has(key)) {
      itemBranchCounters.set(key, {
        itemId: row.itemId,
        branch,
        totalCopies: 0,
        availableCopies: 0
      });
    }

    const branchCounter =
      itemBranchCounters.get(key);

    branchCounter.totalCopies += count;

    if (row.status === 'AVAILABLE') {
      branchCounter.availableCopies += count;
    }
  }

  for (const counter of itemBranchCounters.values()) {
    const itemAvailability =
      availability.get(counter.itemId);

    itemAvailability.branches.push({
      branch: counter.branch,
      totalCopies: counter.totalCopies,
      availableCopies:
        counter.availableCopies,
      available:
        counter.availableCopies > 0
    });
  }

  for (const itemAvailability of availability.values()) {
    itemAvailability.available =
      itemAvailability.availableCopies > 0;

    itemAvailability.branches.sort(
      (a, b) =>
        a.branch.name.localeCompare(
          b.branch.name
        )
    );
  }

  return availability;
}

export async function searchDiscoveryItems({
  q,
  type,
  categoryId,
  deweyClassificationId,
  language,
  publicationYear,
  branchId,
  availableOnly = false,
  sort = 'TITLE_ASC',
  page = 1,
  pageSize = 20
}) {
  const inventoryFilter = buildInventoryFilter({
    branchId,
    availableOnly
  });

  const where = {
    isActive: true,
    ...(type ? { type } : {}),
    ...(categoryId
      ? { categoryId }
      : {}),
    ...(deweyClassificationId
      ? { deweyClassificationId }
      : {}),
    ...(language
      ? {
          language: {
            equals: language,
            mode: 'insensitive'
          }
        }
      : {}),
    ...(publicationYear
      ? { publicationYear }
      : {}),
    ...buildSearchFilter(q),
    ...(inventoryFilter
      ? {
          physicalCopies: {
            some: inventoryFilter
          }
        }
      : {})
  };

  const skip = (page - 1) * pageSize;

  const [total, items] =
    await prisma.$transaction([
      prisma.libraryItem.count({
        where
      }),

      prisma.libraryItem.findMany({
        where,
        orderBy: buildOrderBy(sort),
        skip,
        take: pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          deweyCodeRaw: true,
          callNumber: true,
          language: true,
          publicationYear: true,
          category: {
            select: {
              id: true,
              name: true
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
              {
                contributor: {
                  fullName: 'asc'
                }
              }
            ]
          }
        }
      })
    ]);

  const availabilityMap =
    await loadAvailabilityForItems(
      items.map((item) => item.id)
    );

  const totalPages =
    Math.ceil(total / pageSize);

  return {
    data: items.map((item) => ({
      ...item,
      availability:
        availabilityMap.get(item.id) ?? {
          totalCopies: 0,
          availableCopies: 0,
          available: false,
          branches: []
        }
    })),

    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage:
        totalPages > 0 && page < totalPages
    },

    meta: {
      query: q ?? null,
      sort,
      appliedFilters: {
        type: type ?? null,
        categoryId: categoryId ?? null,
        deweyClassificationId:
          deweyClassificationId ?? null,
        language: language ?? null,
        publicationYear:
          publicationYear ?? null,
        branchId: branchId ?? null,
        availableOnly
      }
    }
  };
}
