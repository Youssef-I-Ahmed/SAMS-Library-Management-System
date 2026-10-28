import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    libraryItem: { findMany: vi.fn(), count: vi.fn() },
    physicalCopy: { groupBy: vi.fn() },
    $transaction: vi.fn()
  }
}));

import { prisma } from '../src/config/prisma.js';
import { normalizeCatalogText, buildCatalogSearchWhere } from '../src/modules/catalog/catalog-search.js';
import { listLibraryItems } from '../src/modules/catalog/library-items.service.js';
import { searchDiscoveryItems } from '../src/modules/discovery/discovery.service.js';
import { app } from '../src/app.js';

const candidate = (id, fields = {}) => ({ id, title: 'Other book', itemContributors: [], ...fields });
const contributors = (...names) => names.map((fullName) => ({ contributor: { fullName } }));
const candidates = [
  candidate('author-hamza', { itemContributors: contributors('أَحْـمَد   ماهر', 'احمد ماهر') }),
  candidate('author-bare', { itemContributors: contributors('احمد ماهر') }),
  candidate('title', { title: 'مؤلفات أحمد، ماهر', itemContributors: contributors('أحمد ماهر') }),
  candidate('unrelated', { title: 'أحمد', itemContributors: contributors('ماهر') })
];

beforeEach(() => {
  vi.resetAllMocks();
  prisma.libraryItem.findMany.mockResolvedValue([]);
  prisma.libraryItem.count.mockResolvedValue(0);
  prisma.physicalCopy.groupBy.mockResolvedValue([]);
  prisma.$transaction.mockImplementation((operations) => Promise.all(operations));
});

describe('catalog normalization from sams_rag/text.py', () => {
  it.each([
    ['أحمد ماهر', 'احمد ماهر'],
    ['أ إ آ ٱ ى ة ؤ ئ', 'ا ا ا ا ي ه و ي'],
    ['أَحْـمَد\u0610\u061a\u065f\u0670\u06d6\u06ed ماهر', 'احمد ماهر'],
    ['٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹', '0123456789 0123456789'],
    ['  أحمد،\tماهر؛\nمكتبة؟_C++ C#  ', 'احمد ماهر مكتبه c++ c#'],
    ['كتاب في الإدارة Books Written', 'كتاب في الاداره books written'],
    [null, ''],
    [undefined, '']
  ])('normalizes %j to %j without stemming or stopword removal', (input, expected) => {
    expect(normalizeCatalogText(input)).toBe(expected);
    expect(normalizeCatalogText(expected)).toBe(expected);
  });
});

describe('normalized catalog matching', () => {
  it.each(['أحمد ماهر', 'احمد ماهر', '  أَحْـمَد،\tماهر  '])(
    'matches both stored spellings and returns each item once for %j', async (query) => {
      prisma.libraryItem.findMany.mockResolvedValue(candidates);

      const where = await buildCatalogSearchWhere({ isActive: true }, query);

      expect(where).toEqual({
        isActive: true,
        id: { in: ['author-hamza', 'author-bare', 'title'] }
      });
      // Multiple matching contributors/title must not duplicate an item, and
      // separate fields must not be concatenated into a spurious phrase match.
      expect(new Set(where.id.in).size).toBe(where.id.in.length);
      expect(candidates[0].itemContributors[0].contributor.fullName).toBe('أَحْـمَد   ماهر');
    }
  );

  it.each(['title', 'callNumber', 'deweyCodeRaw', 'abstractDescription'])(
    'normalizes searchable %s values', async (field) => {
      prisma.libraryItem.findMany.mockResolvedValue([
        candidate('match', { [field]: 'إِدارة_١٢' }),
        candidate('other', { [field]: null })
      ]);

      const where = await buildCatalogSearchWhere({}, 'اداره ۱۲');
      expect(where.id.in).toEqual(['match']);
    }
  );

  it.each([
    ['category', 'name'],
    ['deweyClassification', 'code'],
    ['deweyClassification', 'name'],
    ['bookDetails', 'isbn'],
    ['bookDetails', 'publisher'],
    ['bookDetails', 'edition'],
    ['academicWorkDetails', 'academicYear']
  ])('normalizes discovery field %s.%s', async (relation, field) => {
    prisma.libraryItem.findMany.mockResolvedValue([
      candidate('match', { [relation]: { [field]: 'إِدارة_١٢' } }),
      candidate('other', { [relation]: null })
    ]);

    const where = await buildCatalogSearchWhere({}, 'اداره ۱۲', { discovery: true });
    expect(where.id.in).toEqual(['match']);
    expect((await buildCatalogSearchWhere({}, 'اداره ۱۲')).id.in).toEqual([]);
  });

  it.each([undefined, ''])('keeps browsing without a query unchanged (%j)', async (query) => {
    const filters = { isActive: true, type: 'BOOK' };
    expect(await buildCatalogSearchWhere(filters, query)).toBe(filters);
    expect(prisma.libraryItem.findMany).not.toHaveBeenCalled();
  });

  it.each(['ـَ', '،؟_'])('does not match the entire catalog for an empty normalized query (%j)', async (query) => {
    expect(await buildCatalogSearchWhere({ isActive: true }, query)).toEqual({
      isActive: true, id: { in: [] }
    });
    expect(prisma.libraryItem.findMany).not.toHaveBeenCalled();
  });
});

describe('catalog search service contracts', () => {
  it.each(['أحمد ماهر', 'احمد ماهر'])(
    'preserves discovery filters, sorting, counts, pagination and original query for %j', async (q) => {
      const pageItem = candidates[2];
      prisma.libraryItem.findMany.mockResolvedValueOnce(candidates).mockResolvedValueOnce([pageItem]);
      prisma.libraryItem.count.mockResolvedValue(3);

      const result = await searchDiscoveryItems({
        q, type: 'BOOK', categoryId: 'category', deweyClassificationId: 'dewey',
        language: 'ar', publicationYear: 2026, branchId: 'branch', availableOnly: true,
        sort: 'YEAR_DESC', page: 2, pageSize: 1
      });

      const filters = {
        isActive: true, type: 'BOOK', categoryId: 'category', deweyClassificationId: 'dewey',
        language: { equals: 'ar', mode: 'insensitive' }, publicationYear: 2026,
        physicalCopies: { some: { branchId: 'branch', status: 'AVAILABLE', branch: { isActive: true } } }
      };
      const where = { ...filters, id: { in: ['author-hamza', 'author-bare', 'title'] } };
      expect(prisma.libraryItem.findMany.mock.calls[0][0]).toEqual({
        where: filters, select: expect.any(Object)
      });
      expect(prisma.libraryItem.count).toHaveBeenCalledWith({ where });
      expect(prisma.libraryItem.findMany).toHaveBeenNthCalledWith(2, {
        where, skip: 1, take: 1,
        orderBy: [{ publicationYear: { sort: 'desc', nulls: 'last' } }, { title: 'asc' }, { id: 'asc' }],
        select: expect.any(Object)
      });
      expect(result.data).toEqual([{
        ...pageItem, availability: { totalCopies: 0, availableCopies: 0, available: false, branches: [] }
      }]);
      expect(result.pagination).toEqual({
        page: 2, pageSize: 1, total: 3, totalPages: 3, hasPreviousPage: true, hasNextPage: true
      });
      expect(result.meta.query).toBe(q);
      expect(result.meta.sort).toBe('YEAR_DESC');
      expect(result.meta.appliedFilters).toEqual({
        type: 'BOOK', categoryId: 'category', deweyClassificationId: 'dewey',
        language: 'ar', publicationYear: 2026, branchId: 'branch', availableOnly: true
      });
      expect(prisma.physicalCopy.groupBy.mock.calls[0][0].where.itemId.in).toEqual(['title']);
    }
  );

  it.each(['أحمد ماهر', 'احمد ماهر'])(
    'preserves catalog filters and pagination for %j', async (search) => {
      prisma.libraryItem.findMany.mockResolvedValueOnce(candidates).mockResolvedValueOnce([candidates[2]]);
      prisma.libraryItem.count.mockResolvedValue(3);

      const result = await listLibraryItems({
        search, type: 'BOOK', categoryId: 'category', deweyClassificationId: 'dewey',
        language: 'ar', publicationYear: 2026, page: 2, pageSize: 1
      });

      const filters = {
        isActive: true, type: 'BOOK', category: { is: { id: 'category' } },
        deweyClassification: { is: { id: 'dewey' } },
        language: { equals: 'ar', mode: 'insensitive' }, publicationYear: 2026
      };
      const where = { ...filters, id: { in: ['author-hamza', 'author-bare', 'title'] } };
      expect(prisma.libraryItem.findMany.mock.calls[0][0].where).toEqual(filters);
      expect(prisma.libraryItem.count).toHaveBeenCalledWith({ where });
      expect(prisma.libraryItem.findMany).toHaveBeenNthCalledWith(2, {
        where, skip: 1, take: 1, orderBy: [{ title: 'asc' }, { createdAt: 'asc' }]
      });
      expect(result).toEqual({
        data: [candidates[2]], pagination: { page: 2, pageSize: 1, total: 3, totalPages: 3 }
      });
    }
  );

  it('preserves staff includeInactive behavior', async () => {
    await listLibraryItems({ search: 'أحمد ماهر', includeInactive: true });
    expect(prisma.libraryItem.findMany.mock.calls[0][0].where).toEqual({});
    expect(prisma.libraryItem.count).toHaveBeenCalledWith({ where: { id: { in: [] } } });
  });

  it.each(['/api/v1/catalog/items', '/api/v1/discovery/items'])(
    'still requires authentication for %s', async (path) => {
      await request(app).get(path).query({ q: 'أحمد ماهر', search: 'احمد ماهر' }).expect(401);
      expect(prisma.libraryItem.findMany).not.toHaveBeenCalled();
    }
  );
});
