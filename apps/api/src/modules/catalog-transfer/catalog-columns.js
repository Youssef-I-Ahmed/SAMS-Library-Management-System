// The catalog file format shared by templates, exports and imports.
// Column keys are stable English names; Arabic names and the legacy source headers map onto them.

export const BOOK = 'BOOK';
export const ACADEMIC = 'ACADEMIC_WORK';
const BOTH = [BOOK, ACADEMIC];

export const COLUMNS = [
  { key: 'type', ar: 'النوع', en: 'Type (BOOK or ACADEMIC_WORK)', for: BOTH, aliases: ['نوع', 'itemtype', 'record type'] },
  { key: 'title', ar: 'العنوان', en: 'Title', for: BOTH, required: true, max: 500, aliases: ['عنوان', 'booktitle', 'name'] },
  { key: 'authors', ar: 'المؤلفون', en: 'Authors (separate with ;)', for: [BOOK], list: true, aliases: ['المؤلف', 'مؤلف', 'المؤلفين', 'author'] },
  { key: 'researchers', ar: 'الطلبة / الباحثون', en: 'Students or researchers (separate with ;)', for: [ACADEMIC], list: true, aliases: ['الطلبة', 'الطلاب', 'الباحث', 'الباحثين', 'الباحثون', 'students', 'student', 'researcher'] },
  { key: 'supervisors', ar: 'المشرفون', en: 'Supervisors (separate with ;)', for: [ACADEMIC], list: true, aliases: ['المشرف', 'المشرفين', 'supervisor'] },
  { key: 'isbn', ar: 'ISBN', en: 'ISBN (10 or 13 digits)', for: [BOOK], aliases: ['ردمك', 'رقم isbn'] },
  { key: 'publisher', ar: 'الناشر', en: 'Publisher', for: [BOOK], max: 300, aliases: ['دار النشر', 'ناشر'] },
  { key: 'edition', ar: 'الطبعة', en: 'Edition', for: [BOOK], max: 100, aliases: ['طبعة'] },
  { key: 'publication_year', ar: 'سنة النشر', en: 'Publication year', for: BOTH, aliases: ['السنة', 'سنه النشر', 'year', 'publishing date', 'publishingdate', 'publicationyear'] },
  { key: 'language', ar: 'اللغة', en: 'Language (ar, en, fr…)', for: BOTH, max: 80, aliases: ['لغة', 'lang', 'lang code', 'langcode'] },
  { key: 'call_number', ar: 'رقم الاستدعاء', en: 'Call number', for: BOTH, max: 150, aliases: ['call num', 'callnum', 'callnumber', 'رقم الطلب'] },
  { key: 'dewey_code', ar: 'رقم ديوي', en: 'Dewey code', for: BOTH, max: 100, aliases: ['ديوي', 'تصنيف ديوي', 'dewey', 'deweycode'] },
  { key: 'category', ar: 'الفئة', en: 'Category (must already exist)', for: BOTH, aliases: ['فئة', 'التصنيف'] },
  { key: 'subjects', ar: 'الموضوعات', en: 'Subjects (separate with ;)', for: BOTH, list: true, aliases: ['الموضوع', 'موضوعات', 'subject'] },
  { key: 'abstract', ar: 'الملخص', en: 'Abstract', for: BOTH, max: 10000, aliases: ['ملخص', 'الوصف', 'description', 'summary'] },
  { key: 'academic_year', ar: 'العام الأكاديمي', en: 'Academic year (e.g. 2024/2025)', for: [ACADEMIC], max: 30, aliases: ['العام الدراسي', 'academicyear'] },
  { key: 'extent', ar: 'عدد الصفحات', en: 'Extent (pages)', for: [ACADEMIC], max: 100, aliases: ['الامتداد', 'الصفحات', 'pages'] },
  { key: 'dimensions', ar: 'الأبعاد', en: 'Dimensions', for: [ACADEMIC], max: 100, aliases: ['المقاس', 'dimension'] }
];

/** Columns that exports add for reference; imports ignore them. */
export const EXPORT_ONLY = ['id', 'legacy_code', 'copies', 'active'];

export const templateColumns = (type) => COLUMNS.filter((column) => column.for.includes(type)).map((column) => column.key);
export const exportColumns = (type) => [...EXPORT_ONLY.slice(0, 2),
  ...(type ? templateColumns(type) : COLUMNS.map((column) => column.key)), ...EXPORT_ONLY.slice(2)];

const headerKey = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('und')
  .replace(/[\s_\-./()]+/g, '').replaceAll('أ', 'ا').replaceAll('إ', 'ا').replaceAll('ة', 'ه').replaceAll('ى', 'ي');

const HEADER_INDEX = new Map();
for (const column of COLUMNS) {
  for (const name of [column.key, column.ar, column.en, ...column.aliases]) HEADER_INDEX.set(headerKey(name), column.key);
}
for (const key of EXPORT_ONLY) HEADER_INDEX.set(headerKey(key), `#${key}`);

/** Suggests a target column for every header in the file ('' = ignore). */
export function suggestMapping(headers) {
  const used = new Set();
  return Object.fromEntries(headers.map((header) => {
    const key = HEADER_INDEX.get(headerKey(header));
    if (!key || key.startsWith('#') || used.has(key)) return [header, ''];
    used.add(key);
    return [header, key];
  }));
}

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC')
    .replace(/[٠-٩۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)))
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu, '')
    .replace(/[أإآٱ]/g, 'ا').replaceAll('ى', 'ي').replaceAll('ة', 'ه').replaceAll('ؤ', 'و').replaceAll('ئ', 'ي')
    .toLocaleLowerCase('und').replace(/[^\p{L}\p{N}\s+#]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

const TYPE_VALUES = new Map([
  ...['book', 'books', 'كتاب', 'كتب', 'مرجع'].map((v) => [v, BOOK]),
  ...['academicwork', 'academic', 'project', 'projects', 'thesis', 'theses', 'graduationproject',
    'مشروع', 'مشروعتخرج', 'مشروعاتتخرج', 'رساله', 'رسالهعلميه', 'رسائل', 'بحث', 'بحثتخرج', 'عملاكاديمي',
    'مشروعاتتخرجورسائلعلميه'].map((v) => [v, ACADEMIC])
]);
export const parseType = (value) => TYPE_VALUES.get(headerKey(value)) ?? null;

const LANGUAGES = new Map([
  ...['ar', 'ara', 'arabic', 'عربي', 'عربى', 'العربية', 'العربيه'].map((v) => [v, 'ar']),
  ...['en', 'eng', 'english', 'انجليزي', 'إنجليزي', 'الانجليزية', 'الإنجليزية', 'الانجليزيه'].map((v) => [v, 'en']),
  ...['fr', 'fre', 'fra', 'french', 'فرنسي', 'الفرنسية', 'الفرنسيه'].map((v) => [v, 'fr']),
  ...['de', 'ger', 'deu', 'german', 'ألماني', 'الالمانية', 'الألمانية'].map((v) => [v, 'de']),
  ...['he', 'heb', 'hebrew', 'عبري', 'العبرية'].map((v) => [v, 'he'])
]);
function parseLanguage(value) {
  const text = value.trim();
  const known = LANGUAGES.get(text.toLocaleLowerCase('und'));
  if (known) return known;
  return /^[a-z]{2,3}$/i.test(text) ? text.toLowerCase() : text;
}

export function parseYear(value) {
  const match = String(value).match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : null;
}

export function normalizeIsbn(value) {
  const compact = String(value).replace(/[\s-]/g, '').toUpperCase();
  return /^\d{9}[\dX]$/.test(compact) || /^\d{13}$/.test(compact) ? compact : null;
}

export const splitList = (value) => [...new Set(String(value).split(/\s*[;|؛\n]\s*/).map((part) => part.trim()).filter(Boolean))];

/**
 * Turns one mapped row into a catalog record. Errors block the row; warnings do not.
 * lookups: { categories: Map(normalizedName → id), dewey: Map(code → id) }
 */
export function validateRow(values, mapping, { defaultType, lookups }) {
  const raw = {};
  for (const [header, key] of Object.entries(mapping)) {
    if (key && values[header] !== undefined && values[header] !== '') raw[key] = values[header];
  }
  const errors = [];
  const warnings = [];
  const type = raw.type ? parseType(raw.type) : defaultType || null;
  if (!type) errors.push({ field: 'type', code: raw.type ? 'INVALID_TYPE' : 'REQUIRED' });

  const record = { type };
  for (const column of COLUMNS) {
    const value = raw[column.key];
    if (column.key === 'type') continue;
    if (value === undefined) {
      if (column.required) errors.push({ field: column.key, code: 'REQUIRED' });
      continue;
    }
    if (type && !column.for.includes(type)) {
      warnings.push({ field: column.key, code: 'IGNORED_FOR_TYPE' });
      continue;
    }
    if (column.list) {
      const items = splitList(value);
      if (items.some((item) => item.length > 300)) errors.push({ field: column.key, code: 'TOO_LONG' });
      record[column.key] = items;
      continue;
    }
    if (column.max && value.length > column.max) { errors.push({ field: column.key, code: 'TOO_LONG' }); continue; }
    record[column.key] = value;
  }

  if (record.title !== undefined && record.title.length < 2) errors.push({ field: 'title', code: 'TOO_SHORT' });
  if (record.publication_year !== undefined) {
    const year = parseYear(record.publication_year);
    if (year === null) errors.push({ field: 'publication_year', code: 'INVALID_YEAR' });
    record.publication_year = year;
  }
  if (record.isbn !== undefined) {
    const isbn = normalizeIsbn(record.isbn);
    if (!isbn) errors.push({ field: 'isbn', code: 'INVALID_ISBN' });
    record.isbn = isbn;
  }
  if (record.language !== undefined) record.language = parseLanguage(record.language);
  if (record.category !== undefined) {
    record.categoryId = lookups.categories.get(normalizeText(record.category)) ?? null;
    if (!record.categoryId) errors.push({ field: 'category', code: 'CATEGORY_NOT_FOUND' });
  } else if (type === ACADEMIC && lookups.academicCategoryId) {
    // Imported projects and theses share one collection category.
    record.categoryId = lookups.academicCategoryId;
  }
  if (record.dewey_code !== undefined) {
    record.deweyClassificationId = lookups.dewey.get(record.dewey_code.trim()) ?? null;
    if (!record.deweyClassificationId) warnings.push({ field: 'dewey_code', code: 'DEWEY_NOT_LISTED' });
  }
  return { record, errors, warnings };
}
