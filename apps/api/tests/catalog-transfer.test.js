import { describe, expect, it } from 'vitest';
import { parseCsv, parseTable, serializeTable } from '../src/modules/catalog-transfer/tabular.js';
import { normalizeText, suggestMapping, validateRow } from '../src/modules/catalog-transfer/catalog-columns.js';
import { analyzeImport, buildTemplate, commitImport } from '../src/modules/catalog-transfer/catalog-transfer.service.js';

const lookups = { categories: new Map(), dewey: new Map([['004', 'dewey-004']]), academicCategoryId: 'cat-academic' };

function fakeDb(items = []) {
  const created = [];
  let n = 0;
  const tx = {
    contributor: { findFirst: async () => null, create: async () => ({ id: `c${++n}` }) },
    subject: { upsert: async ({ where }) => ({ id: `s-${where.normalizedName}` }) },
    libraryItem: { create: async ({ data }) => { created.push(data); return { id: `i${created.length}` }; } },
    itemContributor: { createMany: async () => ({}) },
    itemSubject: { createMany: async () => ({}) }
  };
  return {
    created,
    category: { findMany: async () => [{ id: 'cat-academic', name: 'مشروعات تخرج ورسائل علمية' }] },
    deweyClassification: { findMany: async () => [{ id: 'dewey-004', code: '004' }] },
    libraryItem: { findMany: async () => items },
    $transaction: async (fn) => fn(tx)
  };
}

describe('catalog files', () => {
  it('parses CSV with quotes, semicolons and a BOM', () => {
    expect(parseCsv('﻿title;authors\r\n"A; B ""quoted""";x\n\n')).toEqual([['title', 'authors'], ['A; B "quoted"', 'x']]);
  });

  it('round-trips XLSX, CSV and JSON', () => {
    for (const format of ['xlsx', 'csv', 'json']) {
      const buffer = serializeTable(format, ['title', 'publication_year'], [{ title: 'كتاب عربي, "مقتبس"', publication_year: 2020 }]);
      const { headers, records } = parseTable(buffer, format);
      expect(headers).toEqual(['title', 'publication_year']);
      expect(records[0]).toEqual({ rowNumber: 2, values: { title: 'كتاب عربي, "مقتبس"', publication_year: '2020' } });
    }
  });

  it('builds templates whose headers map back onto the catalog columns', () => {
    const { headers } = parseTable(buildTemplate('BOOK', 'xlsx'), 'xlsx');
    expect(headers).toContain('isbn');
    expect(Object.values(suggestMapping(headers)).every(Boolean)).toBe(true);
  });
});

describe('row validation', () => {
  it('maps Arabic and legacy headers', () => {
    expect(suggestMapping(['العنوان', 'المؤلف', 'PUBLISHING_DATE', 'Students', 'غير معروف'])).toEqual({
      'العنوان': 'title', 'المؤلف': 'authors', PUBLISHING_DATE: 'publication_year', Students: 'researchers', 'غير معروف': ''
    });
  });

  it('normalizes values and reports problems per field', () => {
    const mapping = { t: 'type', title: 'title', isbn: 'isbn', year: 'publication_year', lang: 'language', a: 'authors', d: 'dewey_code' };
    const ok = validateRow({ t: 'كتاب', title: 'Clean Code', isbn: '978-0-13-235088-4', year: '2008.0', lang: 'English', a: 'Robert Martin; Robert Martin', d: '004' },
      mapping, { lookups });
    expect(ok.errors).toEqual([]);
    expect(ok.record).toMatchObject({ type: 'BOOK', isbn: '9780132350884', publication_year: 2008, language: 'en',
      authors: ['Robert Martin'], deweyClassificationId: 'dewey-004' });
    const bad = validateRow({ t: 'magazine', title: 'x', isbn: '123', year: 'soon' }, mapping, { lookups });
    expect(bad.errors.map((error) => error.code).sort()).toEqual(['INVALID_ISBN', 'INVALID_TYPE', 'INVALID_YEAR', 'TOO_SHORT']);
  });

  it('puts projects and theses in the shared collection category', () => {
    const { record } = validateRow({ title: 'نظام مكتبة' }, { title: 'title' }, { defaultType: 'ACADEMIC_WORK', lookups });
    expect(record).toMatchObject({ type: 'ACADEMIC_WORK', categoryId: 'cat-academic' });
    expect(normalizeText('مَكْتَبة  الإسكندرية')).toBe(normalizeText('مكتبه الاسكندريه'));
  });
});

describe('import', () => {
  const file = serializeTable('csv', ['type', 'title', 'isbn', 'publication_year'], [
    { type: 'BOOK', title: 'New book', isbn: '', publication_year: 2024 },
    { type: 'BOOK', title: 'Existing Book', isbn: '', publication_year: 2020 },
    { type: 'BOOK', title: 'Has ISBN', isbn: '0306406152', publication_year: '' },
    { type: 'BOOK', title: 'New book', isbn: '', publication_year: 2024 },
    { type: 'magazine', title: 'Unknown kind', isbn: '', publication_year: '' }
  ]);
  const items = [
    { id: 'e1', type: 'BOOK', title: 'existing book', publicationYear: null, bookDetails: null },
    { id: 'e2', type: 'BOOK', title: 'Other', publicationYear: 1999, bookDetails: { isbn: '0-306-40615-2' } }
  ];

  it('previews statuses and duplicates without writing', async () => {
    const db = fakeDb(items);
    const result = await analyzeImport(file, { format: 'csv' }, db);
    expect(result.summary).toEqual({ total: 5, ready: 1, duplicates: 3, invalid: 1, creatableDuplicates: 3 });
    expect(result.rows.map((row) => row.duplicate?.reason ?? row.status))
      .toEqual(['ready', 'TITLE', 'ISBN', 'IN_FILE', 'invalid']);
    expect(db.created).toEqual([]);
  });

  it('creates ready rows and skips duplicates unless asked', async () => {
    const skip = fakeDb(items);
    expect((await commitImport(file, { format: 'csv' }, skip)).report)
      .toMatchObject({ created: 1, skippedDuplicates: 3, invalid: 1, failed: [] });
    const create = fakeDb(items);
    expect((await commitImport(file, { format: 'csv', duplicatePolicy: 'create' }, create)).report.created).toBe(4);
  });
});

describe('re-importing an export', () => {
  it('treats existing records with legacy values as duplicates that are never created', async () => {
    const file = serializeTable('csv', ['type', 'title', 'isbn', 'publication_year'], [
      { type: 'BOOK', title: 'Old Book', isbn: '041519550', publication_year: 2001 }
    ]);
    const db = fakeDb([{ id: 'o1', type: 'BOOK', title: 'Old Book', publicationYear: 2001, bookDetails: { isbn: '041519550' } }]);
    const preview = await analyzeImport(file, { format: 'csv' }, db);
    expect(preview.rows[0]).toMatchObject({ status: 'duplicate', duplicate: { reason: 'TITLE_YEAR', blocked: true } });
    expect(preview.summary).toMatchObject({ duplicates: 1, invalid: 0, creatableDuplicates: 0 });
    const result = await commitImport(file, { format: 'csv', duplicatePolicy: 'create' }, db);
    expect(result.report).toMatchObject({ created: 0, skippedDuplicates: 1 });
  });
});
