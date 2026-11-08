/**
 * SAMS Projects & Research approved source-set dry run.
 *
 * Reads the two ignored XLSX sources, verifies their committed fingerprints,
 * reconciles aggregate controls and writes a privacy-safe JSON report.
 * It has no database client, performs no network calls and never emits source
 * rows, titles, participant names or legacy codes.
 *
 * Usage:
 *   node scripts/migration/projects-research-dry-run.mjs --output <report.json>
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readXlsx} from './lib/xlsx-lite.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_MANIFEST = resolve(ROOT, 'docs/planning/SPRINT_10D4A_SOURCE_MANIFEST.json');
const MISSING = new Set(['', 'na', 'n/a', 'nan', 'none', 'null', '\\n']);

function usage() {
  console.error('Usage: node scripts/migration/projects-research-dry-run.mjs --output <report.json> [--manifest <manifest.json>]');
  process.exit(2);
}

function parseArgs(args) {
  const out = {manifest: DEFAULT_MANIFEST, output: null};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--output' && args[index + 1]) out.output = resolve(args[++index]);
    else if (current === '--manifest' && args[index + 1]) out.manifest = resolve(args[++index]);
    else usage();
  }
  if (!out.output) usage();
  return out;
}

function insideRoot(path) {
  const candidate = relative(ROOT, path);
  return candidate && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return MISSING.has(text.toLowerCase()) ? null : text;
}

function normalized(value) {
  const text = scalar(value);
  if (text === null) return null;
  return text
    .replace(/[\u064B-\u065F\u0670]/gu, '')
    .replaceAll('أ', 'ا').replaceAll('إ', 'ا').replaceAll('آ', 'ا')
    .replaceAll('ى', 'ي').replaceAll('ة', 'ه')
    .toLocaleLowerCase('und');
}

function table(rows, expectedHeaders, label) {
  if (!rows.length) throw new Error(`${label}: worksheet is empty`);
  const headers = rows[0].map(value => scalar(value));
  const actual = headers.filter(value => value !== null);
  for (const required of expectedHeaders) {
    if (!actual.includes(required)) throw new Error(`${label}: required column ${required} is missing`);
  }
  if (new Set(actual).size !== actual.length) throw new Error(`${label}: duplicate headers are not allowed`);
  return rows.slice(1).filter(row => row.some(value => scalar(value) !== null)).map(row =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]).filter(([header]) => header !== null)));
}

function compareField(keys, projectByCode, starterByCode, projectField, starterField = projectField) {
  let projectMissing = 0;
  let starterMissing = 0;
  let equal = 0;
  let different = 0;
  let missingBoth = 0;
  let oneSideMissing = 0;
  for (const key of keys) {
    const left = normalized(projectByCode.get(key)?.[projectField]);
    const right = normalized(starterByCode.get(key)?.[starterField]);
    if (left === null) projectMissing += 1;
    if (right === null) starterMissing += 1;
    if (left === null && right === null) missingBoth += 1;
    else if ((left === null) !== (right === null)) oneSideMissing += 1;
    else if (left === right) equal += 1;
    else different += 1;
  }
  return {projectMissing, starterMissing, equal, different, missingBoth, oneSideMissing};
}

function setFor(map, key) {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function assertControls(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${label}.${key}: expected ${value}, found ${actual[key]}`);
  }
}

function loadApprovedSource(manifestFile, logicalName) {
  const path = resolve(ROOT, manifestFile.repositoryRelativePath);
  if (!insideRoot(path)) throw new Error(`${logicalName}: source path must remain inside the repository workspace`);
  const bytes = readFileSync(path);
  if (bytes.length !== manifestFile.byteLength || sha256(bytes) !== manifestFile.sha256) {
    throw new Error(`${logicalName}: source fingerprint mismatch`);
  }
  return {bytes, path};
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (insideRoot(args.output)) throw new Error('Output report must be written outside the repository');
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  if (manifest.status !== 'APPROVED_MIGRATION_SOURCE_SET_V1' || manifest.canonicalImportAllowed !== false) {
    throw new Error('Manifest is not an approved non-import source contract');
  }
  const projectMeta = manifest.files.find(file => file.logicalName === 'PROJECT_HANDOFF');
  const starterMeta = manifest.files.find(file => file.logicalName === 'PROJECTS_ANALYSIS_STARTER');
  if (!projectMeta || !starterMeta) throw new Error('Approved source entries are missing from the manifest');

  const projectSource = loadApprovedSource(projectMeta, projectMeta.logicalName);
  const starterSource = loadApprovedSource(starterMeta, starterMeta.logicalName);
  const projectBook = readXlsx(projectSource.bytes);
  const starterBook = readXlsx(starterSource.bytes);

  const project = table(projectBook.get('Research') ?? [],
    ['BOOK_CODE', 'TITLE', 'Students', 'Supervisor', 'PUBLISHING_DATE', 'CALL_NUM', 'EXTENT', 'DIMENSION', 'SUBJECTS'],
    'Project.Research');
  const academic = table(starterBook.get('ACADEMIC_WORKS') ?? [],
    ['BOOK_CODE', 'TITLE', 'PUBLISHING_DATE', 'CALL_NUM', 'EXTENT', 'DIMENSION'], 'Starter.ACADEMIC_WORKS');
  const copies = table(starterBook.get('COPIES') ?? [],
    ['GENERAL_CODE', 'BOOK_CODE', 'COPY_CODE', 'STATUS'], 'Starter.COPIES');
  const contributors = table(starterBook.get('CONTRIBUTORS') ?? [],
    ['BOOK_CODE', 'EDIT_CODE', 'EDIT_NAME', 'EDIT_NATURE'], 'Starter.CONTRIBUTORS');
  const subjects = table(starterBook.get('SUBJECTS') ?? [],
    ['BOOK_CODE', 'SUBJECT_CODE', 'SUBJECT_NAME'], 'Starter.SUBJECTS');
  const documents = table(starterBook.get('DOCUMENT_LINK_REVIEW') ?? [],
    ['Document', 'MatchStatus', 'BOOK_CODEs'], 'Starter.DOCUMENT_LINK_REVIEW');

  const projectByCode = new Map(project.map(row => [scalar(row.BOOK_CODE), row]));
  const starterByCode = new Map(academic.map(row => [scalar(row.BOOK_CODE), row]));
  if (projectByCode.has(null) || starterByCode.has(null)) throw new Error('Blank BOOK_CODE is not allowed');
  if (projectByCode.size !== project.length || starterByCode.size !== academic.length) {
    throw new Error('Duplicate BOOK_CODE is not allowed');
  }
  const keys = [...projectByCode.keys()].filter(key => starterByCode.has(key)).sort();

  const fields = {
    title: compareField(keys, projectByCode, starterByCode, 'TITLE'),
    publicationYear: compareField(keys, projectByCode, starterByCode, 'PUBLISHING_DATE'),
    callNumber: compareField(keys, projectByCode, starterByCode, 'CALL_NUM'),
    extent: compareField(keys, projectByCode, starterByCode, 'EXTENT'),
    dimension: compareField(keys, projectByCode, starterByCode, 'DIMENSION'),
  };

  const projectSubjects = new Map();
  for (const row of project) {
    const target = setFor(projectSubjects, scalar(row.BOOK_CODE));
    const value = scalar(row.SUBJECTS);
    if (value) for (const part of value.split('|')) {
      const item = normalized(part);
      if (item) target.add(item);
    }
  }
  const starterSubjects = new Map();
  for (const row of subjects) {
    const item = normalized(row.SUBJECT_NAME);
    if (item) setFor(starterSubjects, scalar(row.BOOK_CODE)).add(item);
  }
  const subjectResult = {equalSets: 0, missingBoth: 0, projectOnly: 0, starterOnly: 0, differentSets: 0};
  for (const key of new Set([...projectByCode.keys(), ...starterByCode.keys()])) {
    const left = projectSubjects.get(key) ?? new Set();
    const right = starterSubjects.get(key) ?? new Set();
    if (!left.size && !right.size) subjectResult.missingBoth += 1;
    else if (left.size && !right.size) subjectResult.projectOnly += 1;
    else if (!left.size && right.size) subjectResult.starterOnly += 1;
    else if (equalSets(left, right)) subjectResult.equalSets += 1;
    else subjectResult.differentSets += 1;
  }

  const bookMap = JSON.parse(readFileSync(resolve(ROOT, 'data/demo/legacy-book-code-map.json'), 'utf8')).map;
  const bookCodes = new Set(Object.keys(bookMap).map(value => scalar(value)));
  const collisions = [...projectByCode.keys()].filter(key => bookCodes.has(key)).length;
  const countBy = (rows, field) => Object.fromEntries([...rows.reduce((map, row) => {
    const key = scalar(row[field]) ?? '<MISSING>';
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));

  const relationships = {
    copyRows: copies.length,
    projectsWithCopies: new Set(copies.map(row => scalar(row.BOOK_CODE))).size,
    contributorRows: contributors.length,
    projectsWithContributors: new Set(contributors.map(row => scalar(row.BOOK_CODE))).size,
    supervisorMarkedRows: contributors.filter(row => scalar(row.EDIT_NATURE) === 'S').length,
    subjectRows: subjects.length,
    projectsWithSubjects: new Set(subjects.map(row => scalar(row.BOOK_CODE))).size,
    documentReviewRows: documents.length,
  };

  const expected = manifest.reconciliationControls;
  assertControls({
    titleNormalizedEqual: fields.title.equal,
    titleNormalizedDifferent: fields.title.different,
    publicationYearEqual: fields.publicationYear.equal,
    publicationYearDifferent: fields.publicationYear.different,
    publicationYearMissingBoth: fields.publicationYear.missingBoth,
    callNumberEqual: fields.callNumber.equal,
    extentEqual: fields.extent.equal,
    extentMissingBoth: fields.extent.missingBoth,
    dimensionEqual: fields.dimension.equal,
    dimensionMissingBoth: fields.dimension.missingBoth,
  }, expected.fields, 'fields');
  assertControls(subjectResult, expected.subjects, 'subjects');
  assertControls(relationships, expected.relationships, 'relationships');
  assertControls({
    projectRows: project.length,
    starterRows: academic.length,
    projectUniqueCodes: projectByCode.size,
    starterUniqueCodes: starterByCode.size,
    commonCodes: keys.length,
    bookCrosswalkCodeCollisions: collisions,
  }, {
    projectRows: manifest.identityControls.academicWorkRowsPerSource,
    starterRows: manifest.identityControls.academicWorkRowsPerSource,
    projectUniqueCodes: manifest.identityControls.uniqueBookCodesPerSource,
    starterUniqueCodes: manifest.identityControls.uniqueBookCodesPerSource,
    commonCodes: manifest.identityControls.commonBookCodes,
    bookCrosswalkCodeCollisions: manifest.identityControls.bareCodeCollisionsWithBookCrosswalk,
  }, 'identity');

  const report = {
    schemaVersion: 'sams-projects-research-dry-run-v1',
    generatedAt: new Date().toISOString(),
    sourceNamespace: manifest.sourceNamespace,
    sourceIntegrity: 'PASS',
    databaseConnected: false,
    databaseWrites: 0,
    containsSourceRows: false,
    containsPrivateValues: false,
    sources: manifest.files.map(file => ({
      logicalName: file.logicalName, sha256: file.sha256, byteLength: file.byteLength,
    })),
    identity: {
      projectRows: project.length,
      starterRows: academic.length,
      uniqueCodesPerSource: projectByCode.size,
      commonCodes: keys.length,
      bookCrosswalkCodeCollisions: collisions,
      identityRule: ['sourceNamespace', 'legacyBookCode'],
    },
    fields,
    subjects: subjectResult,
    relationships: {
      ...relationships,
      copyStatusCounts: countBy(copies, 'STATUS'),
      contributorRoleCounts: countBy(contributors, 'EDIT_NATURE'),
      documentMatchStatusCounts: countBy(documents, 'MatchStatus'),
    },
    canonicalImportGate: {
      status: 'BLOCKED',
      blockers: [
        {code: 'WORK_TYPE_UNRESOLVED', count: academic.length},
        {code: 'PUBLIC_TITLE_REVIEW_REQUIRED', count: academic.length},
        {code: 'PUBLIC_TITLE_SOURCE_DIFFERENCE', count: fields.title.different},
        {code: 'PUBLICATION_YEAR_CONFLICT', count: fields.publicationYear.different},
        {code: 'SUBJECT_SOURCE_EXCEPTION', count: subjectResult.projectOnly + subjectResult.starterOnly + subjectResult.differentSets},
        {code: 'COPY_BRANCH_MAPPING_REQUIRED', count: copies.length},
        {code: 'PRIVATE_PARTICIPANT_STORAGE_REQUIRED', count: project.length},
      ],
    },
  };

  mkdirSync(dirname(args.output), {recursive: true});
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
  console.log(`Projects & Research dry-run PASS: ${project.length} identities reconciled.`);
  console.log(`Canonical import gate: ${report.canonicalImportGate.status}. Database connections/writes: 0/0.`);
  console.log(`Privacy-safe report: ${args.output}`);
}

try {
  main();
} catch (error) {
  console.error(`Dry-run stopped safely: ${error.message}`);
  process.exitCode = 1;
}
