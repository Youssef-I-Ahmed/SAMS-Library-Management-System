import { prisma } from '../../config/prisma.js';

const characterMap = {
  أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ى: 'ي', ة: 'ه', ؤ: 'و', ئ: 'ي'
};

// Equivalent to normalize_text in RAG/sams-library-search/sams_rag/text.py.
// Keep display values intact; do not import its stemming or stopword removal.
export function normalizeCatalogText(text) {
  return String(text ?? '').normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)))
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
    .replace(/[أإآٱىةؤئ]/g, (character) => characterMap[character])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export async function buildCatalogSearchWhere(where, search, { discovery = false } = {}) {
  if (!search) return where;

  const query = normalizeCatalogText(search);
  if (!query) return { ...where, id: { in: [] } };
  const words = [...new Set(query.split(' '))];

  // Apply existing visibility/facet/inventory filters first, then match before
  // counting and paginating. Nested contributors keep one candidate per item.
  const candidates = await prisma.libraryItem.findMany({
    where,
    select: {
      id: true,
      title: true,
      callNumber: true,
      deweyCodeRaw: true,
      abstractDescription: true,
      itemContributors: { select: { contributor: { select: { fullName: true } } } },
      itemSubjects: { select: { subject: { select: { name: true } } } },
      legacyIdentities: { select: { legacyCode: true } },
      ...(discovery ? {
        category: { select: { name: true } },
        deweyClassification: { select: { code: true, name: true } },
        bookDetails: { select: { isbn: true, publisher: true, edition: true } },
        academicWorkDetails: { select: { academicYear: true } }
      } : {})
    }
  });

  const ids = candidates.filter((item) => {
    const fields = [
      item.title, item.callNumber, item.deweyCodeRaw, item.abstractDescription,
      ...item.itemContributors.map(({ contributor }) => contributor.fullName),
      ...(item.itemSubjects ?? []).map(({ subject }) => subject.name),
      ...(item.legacyIdentities ?? []).map(({ legacyCode }) => legacyCode),
      ...(discovery ? [
        item.category?.name,
        item.deweyClassification?.code, item.deweyClassification?.name,
        item.bookDetails?.isbn, item.bookDetails?.publisher, item.bookDetails?.edition,
        item.academicWorkDetails?.academicYear
      ] : [])
    ];

    // Every word of the query must appear in the same field, in any order, so
    // "1001 طريقة" still finds a title stored with the words in another order or
    // apart. Words from different fields never combine into a match.
    return fields.some((field) => {
      const text = normalizeCatalogText(field);
      return text.includes(query) || words.every((word) => text.includes(word));
    });
  }).map((item) => item.id);

  return { ...where, id: { in: ids } };
}
