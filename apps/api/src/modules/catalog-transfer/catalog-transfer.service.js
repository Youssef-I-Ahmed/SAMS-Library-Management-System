import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import {
  ACADEMIC, BOOK, COLUMNS, exportColumns, normalizeText, suggestMapping, templateColumns, validateRow
} from './catalog-columns.js';
import { parseTable, serializeTable } from './tabular.js';

export const MAX_IMPORT_ROWS = 10000;
const MAX_EXPORT_ROWS = 20000;
const ACADEMIC_TYPES = ['ACADEMIC_WORK', 'PROJECT', 'THESIS'];
const ACADEMIC_CATEGORY = 'مشروعات تخرج ورسائل علمية';
const group = (type) => (type === BOOK ? BOOK : ACADEMIC);
const columnKeys = new Set(COLUMNS.map((column) => column.key));

async function loadLookups(db) {
  const [categories, dewey] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.deweyClassification.findMany({ select: { id: true, code: true } })
  ]);
  const byName = new Map(categories.map((category) => [normalizeText(category.name), category.id]));
  return {
    categories: byName,
    academicCategoryId: byName.get(normalizeText(ACADEMIC_CATEGORY)) ?? null,
    dewey: new Map(dewey.map((entry) => [entry.code.trim(), entry.id]))
  };
}

/** Indexes the catalog once per import for ISBN and title(+year) matches. */
async function loadExisting(db) {
  const items = await db.libraryItem.findMany({
    select: { id: true, type: true, title: true, publicationYear: true, bookDetails: { select: { isbn: true } } }
  });
  const byIsbn = new Map();
  const byTitle = new Map();
  for (const item of items) {
    const isbn = item.bookDetails?.isbn?.replace(/[\s-]/g, '').toUpperCase();
    if (isbn) byIsbn.set(isbn, item);
    const key = `${group(item.type)}|${normalizeText(item.title)}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(item);
  }
  return { byIsbn, byTitle };
}

const sameYear = (a, b) => a === null || a === undefined || b === null || b === undefined || a === b;

function cleanMapping(headers, requested) {
  const mapping = suggestMapping(headers);
  if (requested && typeof requested === 'object') {
    for (const [header, key] of Object.entries(requested)) {
      if (!headers.includes(header)) continue;
      if (key === '' || key === null) mapping[header] = '';
      else if (columnKeys.has(key)) mapping[header] = key;
    }
  }
  // One file column per catalog field: a later duplicate target is ignored.
  const used = new Set();
  for (const header of headers) {
    const key = mapping[header];
    if (key && used.has(key)) mapping[header] = '';
    else if (key) used.add(key);
  }
  return mapping;
}

/** Parses, validates and checks duplicates without writing anything. */
export async function analyzeImport(buffer, { format, defaultType, mapping: requested }, db = prisma) {
  const { headers, records } = parseTable(buffer, format);
  if (records.length > MAX_IMPORT_ROWS) {
    throw new AppError(400, 'IMPORT_TOO_MANY_ROWS', `A file can hold at most ${MAX_IMPORT_ROWS} rows.`);
  }
  const mapping = cleanMapping(headers, requested);
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const [lookups, existing] = await Promise.all([loadLookups(db), loadExisting(db)]);
  const seenIsbn = new Map();
  const seenTitle = new Map();
  const rows = records.map(({ rowNumber, values }) => {
    const { record, errors, warnings } = validateRow(values, mapping, { defaultType, lookups });
    let status = errors.length ? 'invalid' : 'ready';
    let duplicate = null;
    // Rows that already exist in the catalog count as duplicates even when an old value
    // (such as a legacy ISBN) would not pass validation, so an export can be re-imported.
    if (record.title && record.type) {
      const titleKey = `${group(record.type)}|${normalizeText(record.title)}`;
      const isbnMatch = record.isbn && existing.byIsbn.get(record.isbn);
      const titleMatch = existing.byTitle.get(titleKey)?.find((item) => sameYear(item.publicationYear, record.publication_year));
      const fileIsbn = status === 'ready' && record.isbn && seenIsbn.get(record.isbn);
      const fileTitle = status === 'ready' && seenTitle.get(titleKey)?.find((seen) => sameYear(seen.year, record.publication_year));
      if (isbnMatch) duplicate = { reason: 'ISBN', id: isbnMatch.id, title: isbnMatch.title };
      else if (titleMatch) {
        const bothYears = titleMatch.publicationYear != null && record.publication_year != null;
        duplicate = { reason: bothYears ? 'TITLE_YEAR' : 'TITLE', id: titleMatch.id, title: titleMatch.title };
      } else if (fileIsbn || fileTitle) duplicate = { reason: 'IN_FILE', rowNumber: (fileIsbn || fileTitle).rowNumber };
      if (duplicate) {
        // A duplicate that also has errors is never created, whatever the policy.
        if (status === 'invalid') duplicate.blocked = true;
        status = 'duplicate';
      }
      if (!errors.length) {
        if (record.isbn && !seenIsbn.has(record.isbn)) seenIsbn.set(record.isbn, { rowNumber });
        if (!seenTitle.has(titleKey)) seenTitle.set(titleKey, []);
        seenTitle.get(titleKey).push({ rowNumber, year: record.publication_year });
      }
    }
    return { rowNumber, status, errors, warnings, duplicate, record };
  });
  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    headers,
    mapping,
    missingRequired: ['title'].filter((key) => !mapped.has(key)),
    typeColumnMapped: mapped.has('type'),
    summary: { total: rows.length, ready: count('ready'), duplicates: count('duplicate'), invalid: count('invalid'),
      creatableDuplicates: rows.filter((row) => row.status === 'duplicate' && !row.duplicate.blocked).length },
    rows
  };
}

async function createRecord(tx, record, caches) {
  const isBook = record.type === BOOK;
  const people = isBook
    ? (record.authors || []).map((name) => [name, 'AUTHOR'])
    : [...(record.researchers || []).map((name) => [name, 'RESEARCHER']),
      ...(record.supervisors || []).map((name) => [name, 'SUPERVISOR'])];
  const contributorIds = [];
  for (const [name, role] of people) {
    let id = caches.contributors.get(name);
    if (!id) {
      id = (await tx.contributor.findFirst({ where: { fullName: name }, select: { id: true } }))?.id;
      if (!id) id = (await tx.contributor.create({ data: { fullName: name }, select: { id: true } })).id;
      caches.pendingContributors.set(name, id);
    }
    contributorIds.push([id, role]);
  }
  const subjectIds = [];
  for (const name of record.subjects || []) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) continue;
    const subject = await tx.subject.upsert({
      where: { normalizedName }, update: {}, create: { name, normalizedName }, select: { id: true }
    });
    subjectIds.push(subject.id);
  }
  const item = await tx.libraryItem.create({
    data: {
      type: isBook ? BOOK : ACADEMIC,
      title: record.title.trim(),
      categoryId: record.categoryId ?? null,
      deweyClassificationId: record.deweyClassificationId ?? null,
      deweyCodeRaw: record.dewey_code?.trim() || null,
      callNumber: record.call_number?.trim() || null,
      language: record.language || null,
      publicationYear: record.publication_year ?? null,
      abstractDescription: record.abstract?.trim() || null,
      isActive: true,
      ...(isBook
        ? { bookDetails: { create: { isbn: record.isbn ?? null, publisher: record.publisher ?? null, edition: record.edition ?? null } } }
        : { academicWorkDetails: { create: {
            workType: ACADEMIC, academicYear: record.academic_year ?? (record.publication_year ? String(record.publication_year) : null),
            extent: record.extent ?? null, dimensions: record.dimensions ?? null
          } } })
    },
    select: { id: true }
  });
  const links = [...new Map(contributorIds.map(([contributorId, role]) => [`${contributorId}|${role}`,
    { itemId: item.id, contributorId, role }])).values()];
  if (links.length) await tx.itemContributor.createMany({ data: links });
  const subjects = [...new Set(subjectIds)];
  if (subjects.length) await tx.itemSubject.createMany({ data: subjects.map((subjectId) => ({ itemId: item.id, subjectId })) });
  return item.id;
}

/** Re-validates the same file on the server, then creates each accepted row in its own transaction. */
export async function commitImport(buffer, options, db = prisma) {
  const analysis = await analyzeImport(buffer, options, db);
  if (analysis.missingRequired.length) {
    throw new AppError(400, 'IMPORT_MAPPING_INCOMPLETE', 'Map a column to the title before importing.');
  }
  const createDuplicates = options.duplicatePolicy === 'create';
  const caches = { contributors: new Map(), pendingContributors: new Map() };
  const report = { total: analysis.summary.total, created: 0, skippedDuplicates: 0, invalid: analysis.summary.invalid,
    failed: [], createdIds: [] };
  for (const row of analysis.rows) {
    if (row.status === 'invalid') continue;
    if (row.status === 'duplicate' && (!createDuplicates || row.duplicate.blocked)) { report.skippedDuplicates += 1; continue; }
    caches.pendingContributors = new Map();
    try {
      const id = await db.$transaction((tx) => createRecord(tx, row.record, caches));
      for (const [name, contributorId] of caches.pendingContributors) caches.contributors.set(name, contributorId);
      report.created += 1;
      if (report.createdIds.length < 200) report.createdIds.push(id);
    } catch (error) {
      report.failed.push({ rowNumber: row.rowNumber, code: error?.code === 'P2002' ? 'CONFLICT' : 'SAVE_FAILED' });
    }
  }
  return { report, rows: analysis.rows.filter((row) => row.status === 'invalid').slice(0, 500) };
}

export function buildTemplate(type, format) {
  const columns = templateColumns(type);
  if (format === 'json') {
    return serializeTable('json', columns, [Object.fromEntries(columns.map((key) => [key, key === 'type' ? type : '']))]);
  }
  const instructions = [['column', 'الاسم', 'Description', 'Required / مطلوب'],
    ...COLUMNS.filter((column) => columns.includes(column.key))
      .map((column) => [column.key, column.ar, column.en, column.required ? 'yes / نعم' : ''])];
  return serializeTable(format, columns, [], {
    sheetName: type === BOOK ? 'Books' : 'Projects & theses',
    extraSheets: [{ name: 'Instructions', rows: instructions }]
  });
}

export async function buildExport({ type, search, includeInactive, format }, db = prisma) {
  const where = {
    ...(type === BOOK ? { type: BOOK } : type === ACADEMIC ? { type: { in: ACADEMIC_TYPES } } : {}),
    ...(includeInactive ? {} : { isActive: true }),
    ...(search ? { title: { contains: search, mode: 'insensitive' } } : {})
  };
  const total = await db.libraryItem.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    throw new AppError(400, 'EXPORT_TOO_LARGE', `Narrow the export: at most ${MAX_EXPORT_ROWS} records per file.`);
  }
  const items = await db.libraryItem.findMany({
    where,
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
    select: {
      id: true, type: true, title: true, callNumber: true, language: true, publicationYear: true,
      abstractDescription: true, deweyCodeRaw: true, isActive: true,
      category: { select: { name: true } },
      deweyClassification: { select: { code: true } },
      bookDetails: { select: { isbn: true, publisher: true, edition: true } },
      academicWorkDetails: { select: { academicYear: true, extent: true, dimensions: true } },
      itemContributors: { select: { role: true, contributor: { select: { fullName: true } } } },
      itemSubjects: { select: { subject: { select: { name: true } } } },
      legacyIdentities: { select: { legacyCode: true }, take: 1 },
      _count: { select: { physicalCopies: true } }
    }
  });
  const names = (item, roles) => item.itemContributors.filter((link) => roles.includes(link.role))
    .map((link) => link.contributor.fullName).join('; ');
  const rows = items.map((item) => ({
    id: item.id,
    legacy_code: item.legacyIdentities[0]?.legacyCode ?? '',
    type: group(item.type),
    title: item.title,
    authors: names(item, ['AUTHOR']),
    researchers: names(item, ['RESEARCHER', 'PROJECT_MEMBER']),
    supervisors: names(item, ['SUPERVISOR']),
    isbn: item.bookDetails?.isbn ?? '',
    publisher: item.bookDetails?.publisher ?? '',
    edition: item.bookDetails?.edition ?? '',
    publication_year: item.publicationYear ?? '',
    language: item.language ?? '',
    call_number: item.callNumber ?? '',
    dewey_code: item.deweyClassification?.code ?? item.deweyCodeRaw ?? '',
    category: item.category?.name ?? '',
    subjects: item.itemSubjects.map((link) => link.subject.name).join('; '),
    abstract: item.abstractDescription ?? '',
    academic_year: item.academicWorkDetails?.academicYear ?? '',
    extent: item.academicWorkDetails?.extent ?? '',
    dimensions: item.academicWorkDetails?.dimensions ?? '',
    copies: item._count.physicalCopies,
    active: item.isActive ? 'yes' : 'no'
  }));
  return serializeTable(format, exportColumns(type || null), rows, {
    sheetName: type === BOOK ? 'Books' : type === ACADEMIC ? 'Projects & theses' : 'Catalog'
  });
}
