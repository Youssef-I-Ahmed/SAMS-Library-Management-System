// Insert-only successor to the original controlled importer. Use its --plan and
// --verify modes to inspect the approved source and reconcile the result.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { loadAcademicImportPlan, PROJECT_ROOT, stableUuid } from './projects-research-transform.mjs';

const CHUNK_SIZE = 250;
const [mode, branch, ...extra] = process.argv.slice(2);
if (mode !== '--apply' || branch !== '--branch-code=MAIN' || extra.length) {
  throw new Error('Usage: node scripts/migration/apply-academic-works-demo.mjs --apply --branch-code=MAIN');
}

const envPath = join(PROJECT_ROOT, '.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);
let url;
try { url = new URL(process.env.DATABASE_URL); } catch { /* fail closed */ }
if (!url || process.env.NODE_ENV === 'production' || !/^postgres(ql)?:$/.test(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '5433' ||
    url.pathname !== '/sams_library' || [...url.searchParams].some(([key, value]) =>
      key !== 'schema' || value !== 'public')) {
  throw new Error('Apply requires the local SAMS demo database on port 5433 (public schema).');
}

const plan = loadAcademicImportPlan();
const { items, physicalCopies, subjects, itemSubjects, contributors, itemContributors,
  legacyCatalogIdentities, legacyCopyIdentities, academicWorkDetails } = plan;
const { sourceNamespace } = plan.summary;
const db = new PrismaClient();
let step = 'begin';

class ImportGuardError extends Error {}

async function insert(model, rows, entity) {
  step = `insert ${entity}`;
  let count = 0;
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    count += (await model.createMany({ data: rows.slice(offset, offset + CHUNK_SIZE), skipDuplicates: true })).count;
  }
  return count;
}

async function assertExistingMatches(model, expected, fields) {
  const byId = new Map(expected.map((row) => [row.id, row]));
  const select = Object.fromEntries(['id', ...fields].map((field) => [field, true]));
  for (let offset = 0; offset < expected.length; offset += CHUNK_SIZE) {
    const ids = expected.slice(offset, offset + CHUNK_SIZE).map(({ id }) => id);
    for (const row of await model.findMany({ where: { id: { in: ids } }, select })) {
      if (fields.some((field) => row[field] !== byId.get(row.id)[field])) {
        throw new ImportGuardError('An existing canonical record differs from the approved plan.');
      }
    }
  }
}

async function reconcileIdentities(model, expected, legacyField, targetField) {
  const actual = await model.findMany({
    where: { sourceNamespace }, select: { [legacyField]: true, [targetField]: true }
  });
  const expectedIds = new Map(expected.map((row) => [row[legacyField], row[targetField]]));
  if (actual.length !== expected.length ||
      actual.some((row) => expectedIds.get(row[legacyField]) !== row[targetField])) {
    throw new ImportGuardError('Source identity reconciliation failed.');
  }
}

async function apply(tx) {
  const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(103067, 6) AS locked`;
  if (!locked) throw new ImportGuardError('Another academic-work import is running.');
  const main = await tx.branch.findUnique({ where: { code: 'MAIN' }, select: { id: true, isActive: true } });
  if (!main?.isActive) throw new ImportGuardError('MAIN is not an active branch.');

  const { ar: name, en: description } = plan.contract.catalogLabel;
  const counts = {};
  counts.categories = await insert(tx.category, [{ id: stableUuid(`category:${name}`), name, description }], 'category');
  const category = await tx.category.findUnique({ where: { name }, select: { id: true, isActive: true } });
  if (!category?.isActive) throw new ImportGuardError('The approved category is missing or inactive.');
  const works = items.map((item) => ({ ...item, categoryId: category.id }));
  const copies = physicalCopies.map((copy) => ({ ...copy, branchId: main.id }));
  step = 'check existing identities';
  await assertExistingMatches(tx.libraryItem, works, ['type', 'title', 'categoryId']);
  await assertExistingMatches(tx.contributor, contributors, ['fullName']);
  await assertExistingMatches(tx.physicalCopy, copies, ['itemId', 'copyCode', 'barcode', 'branchId']);

  counts.subjects = await insert(tx.subject, subjects, 'subjects');
  const canonicalSubjects = await tx.subject.findMany({
    where: { normalizedName: { in: subjects.map((subject) => subject.normalizedName) } },
    select: { id: true, normalizedName: true }
  });
  if (canonicalSubjects.length !== subjects.length) throw new ImportGuardError('Subject reconciliation failed.');
  const byName = new Map(canonicalSubjects.map((subject) => [subject.normalizedName, subject.id]));
  const canonicalIds = new Map(subjects.map((subject) => [subject.id, byName.get(subject.normalizedName)]));

  counts.items = await insert(tx.libraryItem, works, 'items');
  counts.details = await insert(tx.academicWorkDetails, academicWorkDetails, 'details');
  counts.catalogIdentities = await insert(tx.legacyCatalogIdentity, legacyCatalogIdentities, 'catalog identities');
  counts.subjectLinks = await insert(tx.itemSubject, itemSubjects.map((link) =>
    ({ ...link, subjectId: canonicalIds.get(link.subjectId) })), 'subject links');
  counts.contributors = await insert(tx.contributor, contributors, 'contributors');
  counts.contributorLinks = await insert(tx.itemContributor, itemContributors, 'contributor links');
  counts.copies = await insert(tx.physicalCopy, copies, 'copies');
  counts.copyIdentities = await insert(tx.legacyCopyIdentity, legacyCopyIdentities, 'copy identities');

  step = 'reconcile persisted rows';
  await reconcileIdentities(tx.legacyCatalogIdentity, legacyCatalogIdentities, 'legacyCode', 'itemId');
  await reconcileIdentities(tx.legacyCopyIdentity, legacyCopyIdentities, 'legacyGeneralCode', 'copyId');
  const where = { item: { legacyIdentities: { some: { sourceNamespace } } } };
  if (await tx.academicWorkDetails.count({ where }) !== academicWorkDetails.length ||
      await tx.itemSubject.count({ where }) !== itemSubjects.length ||
      await tx.itemContributor.count({ where }) !== itemContributors.length) {
    throw new ImportGuardError('Imported metadata does not reconcile with the approved plan.');
  }
  return counts;
}

try {
  const counts = await db.$transaction(apply, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 120000
  });
  console.log(JSON.stringify({ inserted: counts }, null, 2));
  console.log('APPLY PASSED. No existing rows were updated or deleted.');
} catch (error) {
  // Prisma diagnostics may embed row values. Publish only an engine error code.
  const code = error.code ?? error.errorCode;
  const detail = /^[A-Z][0-9]{4}$/.test(code ?? '') ? ` (${code})` : '';
  const reason = error instanceof ImportGuardError ? ` ${error.message}` : '';
  console.error(`APPLY FAILED at ${step}${detail}. The transaction did not commit.${reason}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
