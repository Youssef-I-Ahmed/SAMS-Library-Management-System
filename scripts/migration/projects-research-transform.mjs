import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from './lib/xlsx-lite.mjs';

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const DEFAULT_IMPORT_CONTRACT = resolve(
  PROJECT_ROOT,
  'docs/planning/SPRINT_10D6_IMPORT_CONTRACT.json'
);

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'none', 'null', '\\n', '\\N']);
const LANGUAGE_MAP = new Map([
  ['1', 'ar'],
  ['2', 'en'],
  ['3', 'fr'],
  ['04', 'he']
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJsonSha256(value) {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

export function scalar(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return MISSING.has(text) || MISSING.has(text.toLowerCase()) ? null : text;
}

export function normalizeAcademicText(value) {
  const text = scalar(value);
  if (!text) return null;
  return text
    .replace(/[٠-٩۰-۹]/gu, (digit) =>
      String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)))
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '')
    .replaceAll('أ', 'ا')
    .replaceAll('إ', 'ا')
    .replaceAll('آ', 'ا')
    .replaceAll('ٱ', 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAll('ؤ', 'و')
    .replaceAll('ئ', 'ي')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}\s+#]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function stableUuid(label) {
  const bytes = createHash('sha1')
    .update(`SAMS/ACADEMIC-WORKS/v1/${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function insideRoot(root, path) {
  const candidate = relative(root, path);
  return candidate && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function table(rows, requiredHeaders, label) {
  if (!rows?.length) throw new Error(`${label}: worksheet is empty`);
  const headers = rows[0].map((value) => scalar(value));
  const actual = headers.filter(Boolean);
  for (const required of requiredHeaders) {
    if (!actual.includes(required)) throw new Error(`${label}: required column ${required} is missing`);
  }
  if (new Set(actual).size !== actual.length) throw new Error(`${label}: duplicate headers are not allowed`);
  return rows.slice(1)
    .filter((row) => row.some((value) => scalar(value) !== null))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? null]).filter(([header]) => header)
    ));
}

function approvedBytes(root, metadata) {
  const path = resolve(root, metadata.repositoryRelativePath);
  if (!insideRoot(root, path)) throw new Error(`${metadata.logicalName}: source escapes the project root`);
  const bytes = readFileSync(path);
  if (bytes.length !== metadata.byteLength || sha256(bytes) !== metadata.sha256) {
    throw new Error(`${metadata.logicalName}: approved source fingerprint mismatch`);
  }
  return bytes;
}

function splitParticipants(value) {
  const text = scalar(value);
  if (!text) return [];
  const values = text.split(/\s*\|\s*|[\r\n]+/gu).map(scalar).filter(Boolean);
  const seen = new Set();
  return values.filter((name) => {
    const key = normalizeAcademicText(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitSubjects(value) {
  const text = scalar(value);
  return text ? text.split(/\s*\|\s*/gu).map(scalar).filter(Boolean) : [];
}

function parseYear(value) {
  const text = scalar(value);
  const match = text?.match(/(?:^|\D)(\d{4})(?:\D|$)/u);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : null;
}

function indexUnique(rows, field, label) {
  const result = new Map();
  for (const row of rows) {
    const key = scalar(row[field]);
    if (!key) throw new Error(`${label}: blank ${field}`);
    if (result.has(key)) throw new Error(`${label}: duplicate ${field} ${key}`);
    result.set(key, row);
  }
  return result;
}

function assertCount(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, found ${actual}`);
}

export function loadAcademicImportPlan({
  root = PROJECT_ROOT,
  contractPath = DEFAULT_IMPORT_CONTRACT
} = {}) {
  const contract = readJson(contractPath);
  if (contract.status !== 'APPROVED_CONTROLLED_LOCAL_IMPORT_V1' ||
      contract.scope?.allowsControlledLocalImport !== true ||
      contract.scope?.allowsProductionImport !== false) {
    throw new Error('Academic-work import contract is not approved for a controlled local import');
  }
  const sourceManifestPath = resolve(root, contract.sourceManifestPath);
  if (!insideRoot(root, sourceManifestPath)) throw new Error('Source manifest escapes the project root');
  const sourceManifestBytes = readFileSync(sourceManifestPath);
  const sourceManifest = JSON.parse(sourceManifestBytes);
  if (canonicalJsonSha256(sourceManifest) !== contract.sourceManifestCanonicalSha256) {
    throw new Error('Source manifest fingerprint mismatch');
  }
  if (sourceManifest.status !== 'APPROVED_MIGRATION_SOURCE_SET_V1' ||
      sourceManifest.sourceNamespace !== contract.sourceNamespace) {
    throw new Error('Unexpected source manifest contract');
  }

  const projectMeta = sourceManifest.files.find((file) => file.logicalName === 'PROJECT_HANDOFF');
  const starterMeta = sourceManifest.files.find((file) => file.logicalName === 'PROJECTS_ANALYSIS_STARTER');
  if (!projectMeta || !starterMeta) throw new Error('Approved workbook metadata is incomplete');
  const projectBook = readXlsx(approvedBytes(root, projectMeta));
  const starterBook = readXlsx(approvedBytes(root, starterMeta));

  const projectRows = table(projectBook.get('Research'),
    ['BOOK_CODE', 'TITLE', 'Students', 'Supervisor', 'PUBLISHING_DATE', 'CALL_NUM', 'EXTENT', 'DIMENSION', 'SUBJECTS'],
    'Project.Research');
  const works = table(starterBook.get('ACADEMIC_WORKS'),
    ['BOOK_CODE', 'TITLE', 'PUBLISHING_DATE', 'CALL_NUM', 'EXTENT', 'DIMENSION', 'LANG_CODE', 'RECORD_TYPE'],
    'Starter.ACADEMIC_WORKS');
  const copies = table(starterBook.get('COPIES'),
    ['GENERAL_CODE', 'BOOK_CODE', 'COPY_CODE', 'VOL_CODE', 'STATUS'], 'Starter.COPIES');
  const starterContributors = table(starterBook.get('CONTRIBUTORS'),
    ['BOOK_CODE', 'EDIT_CODE', 'EDIT_NAME', 'EDIT_NATURE'], 'Starter.CONTRIBUTORS');
  const starterSubjects = table(starterBook.get('SUBJECTS'),
    ['BOOK_CODE', 'SUBJECT_CODE', 'SUBJECT_NAME'], 'Starter.SUBJECTS');

  const expected = contract.expectedControls;
  assertCount(projectRows.length, expected.academicWorks, 'Project rows');
  assertCount(works.length, expected.academicWorks, 'Starter academic works');
  assertCount(copies.length, expected.copies, 'Starter copies');
  assertCount(starterContributors.length, expected.starterContributors, 'Starter contributors');
  assertCount(starterSubjects.length, expected.starterSubjects, 'Starter subjects');

  const projectByCode = indexUnique(projectRows, 'BOOK_CODE', 'Project.Research');
  const workByCode = indexUnique(works, 'BOOK_CODE', 'Starter.ACADEMIC_WORKS');
  const codes = [...projectByCode.keys()].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  if (codes.length !== workByCode.size || codes.some((code) => !workByCode.has(code))) {
    throw new Error('Approved sources no longer contain the same academic-work identities');
  }

  const namespace = contract.sourceNamespace;
  const itemIdByCode = new Map(codes.map((code) => [code, stableUuid(`item:${namespace}:${code}`)]));
  const subjectCandidates = new Map();
  const subjectCodesByWork = new Map(codes.map((code) => [code, new Set()]));
  const registerSubject = (bookCode, nameValue, codeValue = null) => {
    const name = scalar(nameValue);
    const normalizedName = normalizeAcademicText(name);
    if (!name || !normalizedName || !subjectCodesByWork.has(bookCode)) return;
    if (!subjectCandidates.has(normalizedName)) {
      subjectCandidates.set(normalizedName, { name, code: scalar(codeValue) });
    } else if (!subjectCandidates.get(normalizedName).code && scalar(codeValue)) {
      subjectCandidates.get(normalizedName).code = scalar(codeValue);
    }
    subjectCodesByWork.get(bookCode).add(normalizedName);
  };
  for (const row of starterSubjects) registerSubject(scalar(row.BOOK_CODE), row.SUBJECT_NAME, row.SUBJECT_CODE);
  for (const row of projectRows) {
    const code = scalar(row.BOOK_CODE);
    for (const name of splitSubjects(row.SUBJECTS)) registerSubject(code, name);
  }

  const subjects = [...subjectCandidates.entries()].map(([normalizedName, value]) => ({
    id: stableUuid(`subject:${normalizedName}`),
    code: value.code,
    name: value.name,
    normalizedName
  }));
  const subjectIdByName = new Map(subjects.map((subject) => [subject.normalizedName, subject.id]));

  const items = [];
  const academicWorkDetails = [];
  const legacyCatalogIdentities = [];
  const contributors = [];
  const itemContributors = [];
  const itemSubjects = [];
  let publicationYearConflicts = 0;
  let titleDifferences = 0;

  for (const code of codes) {
    const project = projectByCode.get(code);
    const structural = workByCode.get(code);
    const itemId = itemIdByCode.get(code);
    const title = scalar(project.TITLE);
    if (!title) throw new Error(`Missing approved title for academic work ${code}`);
    const projectYearRaw = scalar(project.PUBLISHING_DATE);
    const structuralYearRaw = scalar(structural.PUBLISHING_DATE);
    const projectYear = parseYear(projectYearRaw);
    const structuralYear = parseYear(structuralYearRaw);
    if (projectYearRaw && structuralYearRaw && projectYearRaw !== structuralYearRaw) {
      publicationYearConflicts += 1;
    }
    if (normalizeAcademicText(title) !== normalizeAcademicText(structural.TITLE)) titleDifferences += 1;
    const publicationYear = projectYear ?? structuralYear;
    const languageCode = scalar(structural.LANG_CODE);
    const recordType = scalar(structural.RECORD_TYPE_NAME) ?? scalar(structural.RECORD_TYPE_ARABIC_NAME) ?? scalar(structural.RECORD_TYPE);

    items.push({
      id: itemId,
      type: 'ACADEMIC_WORK',
      title,
      deweyCodeRaw: null,
      callNumber: scalar(structural.CALL_NUM) ?? scalar(project.CALL_NUM),
      language: LANGUAGE_MAP.get(languageCode) ?? null,
      publicationYear,
      abstractDescription: null,
      isActive: true
    });
    academicWorkDetails.push({
      itemId,
      academicYear: publicationYear ? String(publicationYear) : null,
      workType: 'ACADEMIC_WORK',
      extent: scalar(structural.EXTENT) ?? scalar(project.EXTENT),
      dimensions: scalar(structural.DIMENSION) ?? scalar(project.DIMENSION),
      recordType
    });
    legacyCatalogIdentities.push({ sourceNamespace: namespace, legacyCode: code, itemId });
    for (const normalizedName of subjectCodesByWork.get(code)) {
      itemSubjects.push({ itemId, subjectId: subjectIdByName.get(normalizedName) });
    }

    const participantGroups = [
      ['RESEARCHER', splitParticipants(project.Students)],
      ['SUPERVISOR', splitParticipants(project.Supervisor)]
    ];
    for (const [role, names] of participantGroups) {
      names.forEach((fullName, index) => {
        const contributorId = stableUuid(`contributor:${namespace}:${code}:${role}:${index + 1}:${normalizeAcademicText(fullName)}`);
        contributors.push({ id: contributorId, fullName });
        itemContributors.push({ itemId, contributorId, role });
      });
    }
  }

  const canonicalStatus = contract.canonicalRules.copyStatusMap;
  const physicalCopies = [];
  const legacyCopyIdentities = [];
  const seenGeneralCodes = new Set();
  for (const row of copies) {
    const bookCode = scalar(row.BOOK_CODE);
    const legacyGeneralCode = scalar(row.GENERAL_CODE);
    const rawStatus = scalar(row.STATUS);
    if (!itemIdByCode.has(bookCode) || !legacyGeneralCode || seenGeneralCodes.has(legacyGeneralCode)) {
      throw new Error('Invalid or duplicate legacy physical-copy identity');
    }
    const status = canonicalStatus[rawStatus];
    if (!status) throw new Error(`Unmapped legacy copy status ${rawStatus}`);
    seenGeneralCodes.add(legacyGeneralCode);
    const copyId = stableUuid(`copy:${namespace}:${legacyGeneralCode}`);
    physicalCopies.push({
      id: copyId,
      itemId: itemIdByCode.get(bookCode),
      copyCode: legacyGeneralCode,
      barcode: scalar(row.BARCODE),
      shelfLocation: scalar(workByCode.get(bookCode)?.LOCATION),
      status,
      condition: null
    });
    legacyCopyIdentities.push({
      sourceNamespace: namespace,
      legacyGeneralCode,
      copyId,
      legacyBookCode: bookCode,
      legacyStatus: rawStatus,
      legacyCopyCode: scalar(row.COPY_CODE),
      legacyVolumeCode: scalar(row.VOL_CODE)
    });
  }

  assertCount(publicationYearConflicts, expected.publicationYearConflicts, 'Publication-year conflicts');
  const starterWorkSubjects = new Set(starterSubjects.map((row) => scalar(row.BOOK_CODE)));
  const projectOnlySubjectExceptions = projectRows.filter((row) =>
    splitSubjects(row.SUBJECTS).length > 0 && !starterWorkSubjects.has(scalar(row.BOOK_CODE))).length;
  assertCount(projectOnlySubjectExceptions, expected.projectOnlySubjectExceptions, 'Project-only subject exceptions');

  return {
    contract,
    sourceManifest,
    items,
    academicWorkDetails,
    legacyCatalogIdentities,
    subjects,
    itemSubjects,
    contributors,
    itemContributors,
    physicalCopies,
    legacyCopyIdentities,
    summary: {
      sourceNamespace: namespace,
      items: items.length,
      copies: physicalCopies.length,
      subjects: subjects.length,
      subjectLinks: itemSubjects.length,
      contributors: contributors.length,
      contributorLinks: itemContributors.length,
      publicationYearConflicts,
      projectOnlySubjectExceptions,
      titleDifferences,
      missingPublicationYears: items.filter((item) => item.publicationYear === null).length,
      copyStatusCounts: Object.fromEntries([...physicalCopies.reduce((map, copy) => {
        map.set(copy.status, (map.get(copy.status) ?? 0) + 1);
        return map;
      }, new Map()).entries()].sort())
    }
  };
}
