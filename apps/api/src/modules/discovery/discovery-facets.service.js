import { prisma } from '../../config/prisma.js';

const ITEM_TYPES = ['BOOK', 'THESIS', 'PROJECT'];

const SORT_OPTIONS = [
  {
    value: 'TITLE_ASC',
    label: 'Title A-Z'
  },
  {
    value: 'TITLE_DESC',
    label: 'Title Z-A'
  },
  {
    value: 'YEAR_DESC',
    label: 'Publication year: newest first'
  },
  {
    value: 'YEAR_ASC',
    label: 'Publication year: oldest first'
  },
  {
    value: 'NEWEST',
    label: 'Recently added'
  }
];

export async function getDiscoveryFacets() {
  const [
    typeGroups,
    languageGroups,
    yearGroups,
    categoryGroups,
    deweyGroups,
    branchItemGroups
  ] = await prisma.$transaction([
    prisma.libraryItem.groupBy({
      by: ['type'],
      where: {
        isActive: true
      },
      _count: {
        _all: true
      }
    }),

    prisma.libraryItem.groupBy({
      by: ['language'],
      where: {
        isActive: true,
        language: {
          not: null
        }
      },
      _count: {
        _all: true
      }
    }),

    prisma.libraryItem.groupBy({
      by: ['publicationYear'],
      where: {
        isActive: true,
        publicationYear: {
          not: null
        }
      },
      _count: {
        _all: true
      }
    }),

    prisma.libraryItem.groupBy({
      by: ['categoryId'],
      where: {
        isActive: true,
        categoryId: {
          not: null
        },
        category: {
          is: {
            isActive: true
          }
        }
      },
      _count: {
        _all: true
      }
    }),

    prisma.libraryItem.groupBy({
      by: ['deweyClassificationId'],
      where: {
        isActive: true,
        deweyClassificationId: {
          not: null
        }
      },
      _count: {
        _all: true
      }
    }),

    prisma.physicalCopy.groupBy({
      by: ['branchId', 'itemId', 'status'],
      where: {
        status: {
          not: 'ARCHIVED'
        },
        item: {
          isActive: true
        },
        branch: {
          isActive: true
        }
      },
      _count: {
        _all: true
      }
    })
  ]);

  const categoryIds = categoryGroups
    .map((row) => row.categoryId)
    .filter(Boolean);

  const deweyIds = deweyGroups
    .map((row) => row.deweyClassificationId)
    .filter(Boolean);

  const branchIds = [
    ...new Set(branchItemGroups.map((row) => row.branchId))
  ];

  const [categories, deweyClassifications, branches] =
    await prisma.$transaction([
      categoryIds.length
        ? prisma.category.findMany({
            where: {
              id: {
                in: categoryIds
              },
              isActive: true
            },
            select: {
              id: true,
              name: true
            }
          })
        : Promise.resolve([]),

      deweyIds.length
        ? prisma.deweyClassification.findMany({
            where: {
              id: {
                in: deweyIds
              }
            },
            select: {
              id: true,
              code: true,
              name: true
            }
          })
        : Promise.resolve([]),

      branchIds.length
        ? prisma.branch.findMany({
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
        : Promise.resolve([])
    ]);

  const typeCountMap = new Map(
    typeGroups.map((row) => [
      row.type,
      row._count._all
    ])
  );

  const categoryCountMap = new Map(
    categoryGroups.map((row) => [
      row.categoryId,
      row._count._all
    ])
  );

  const deweyCountMap = new Map(
    deweyGroups.map((row) => [
      row.deweyClassificationId,
      row._count._all
    ])
  );

  const branchCounters = new Map();

  for (const row of branchItemGroups) {
    if (!branchCounters.has(row.branchId)) {
      branchCounters.set(row.branchId, {
        itemIds: new Set(),
        availableItemIds: new Set()
      });
    }

    const counter = branchCounters.get(row.branchId);
    counter.itemIds.add(row.itemId);

    if (row.status === 'AVAILABLE') {
      counter.availableItemIds.add(row.itemId);
    }
  }

  const allActiveItems = typeGroups.reduce(
    (sum, row) => sum + row._count._all,
    0
  );

  const availableItemIds = new Set();

  for (const counter of branchCounters.values()) {
    for (const itemId of counter.availableItemIds) {
      availableItemIds.add(itemId);
    }
  }

  return {
    types: ITEM_TYPES.map((value) => ({
      value,
      count: typeCountMap.get(value) ?? 0
    })),

    categories: categories
      .map((category) => ({
        ...category,
        count: categoryCountMap.get(category.id) ?? 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),

    deweyClassifications: deweyClassifications
      .map((classification) => ({
        ...classification,
        count:
          deweyCountMap.get(classification.id) ?? 0
      }))
      .sort((a, b) =>
        a.code.localeCompare(b.code)
      ),

    languages: languageGroups
      .filter((row) => row.language)
      .map((row) => ({
        value: row.language,
        count: row._count._all
      }))
      .sort((a, b) =>
        a.value.localeCompare(b.value)
      ),

    publicationYears: yearGroups
      .filter(
        (row) => row.publicationYear !== null
      )
      .map((row) => ({
        value: row.publicationYear,
        count: row._count._all
      }))
      .sort((a, b) => b.value - a.value),

    branches: branches
      .map((branch) => {
        const counter = branchCounters.get(branch.id);

        return {
          ...branch,
          totalItems: counter?.itemIds.size ?? 0,
          availableItems:
            counter?.availableItemIds.size ?? 0
        };
      })
      .filter((branch) => branch.totalItems > 0)
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      ),

    availabilityOptions: [
      {
        value: 'ALL',
        count: allActiveItems
      },
      {
        value: 'AVAILABLE_ONLY',
        count: availableItemIds.size
      }
    ],

    sortOptions: SORT_OPTIONS,

    defaults: {
      sort: 'TITLE_ASC',
      pageSize: 20
    }
  };
}
