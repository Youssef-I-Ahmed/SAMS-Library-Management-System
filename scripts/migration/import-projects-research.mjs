/**
 * Controlled local import for the approved SAMS projects/research source set.
 *
 * Usage:
 *   node scripts/migration/import-projects-research.mjs --plan
 *   node scripts/migration/import-projects-research.mjs --apply --branch-code=MAIN
 *   node scripts/migration/import-projects-research.mjs --verify --branch-code=MAIN
 *
 * The command is deterministic and restartable. It never deletes or updates
 * catalog, inventory, contributor or circulation rows.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadAcademicImportPlan,
  PROJECT_ROOT
} from './projects-research-transform.mjs';

const args = process.argv.slice(2);
const modes = ['--plan', '--apply', '--verify'].filter((value) => args.includes(value));
const branchArg = args.find((value) => value.startsWith('--branch-code='));
const allowed = new Set([...modes, branchArg].filter(Boolean));
if (modes.length !== 1 || args.some((value) => !allowed.has(value)) ||
    (modes[0] !== '--plan' && !branchArg)) {
  console.error('Usage: node scripts/migration/import-projects-research.mjs --plan | --apply --branch-code=MAIN | --verify --branch-code=MAIN');
  process.exit(2);
}

const mode = modes[0];
if (mode === '--apply') {
  const command = fileURLToPath(new URL('./apply-academic-works-demo.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [command, mode, branchArg], { stdio: 'inherit' });
  if (child.error) console.error('Could not start the controlled import.');
  process.exit(child.status ?? 1);
}
const branchCode = branchArg?.slice('--branch-code='.length).trim() || null;
const plan = loadAcademicImportPlan();

console.log('SAMS projects/research controlled local import');
console.log(`Mode: ${mode}`);
console.log(JSON.stringify(plan.summary, null, 2));

if (mode === '--plan') {
  console.log('PLAN PASSED. PostgreSQL connections/writes: 0/0.');
  process.exit(0);
}

const envPath = join(PROJECT_ROOT, '.env');
if (existsSync(envPath) && !process.env.DATABASE_URL) process.loadEnvFile(envPath);
if (process.env.NODE_ENV === 'production') {
  throw new Error('Controlled local importer refuses NODE_ENV=production');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is missing');
const parsedUrl = new URL(databaseUrl);
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
const localDatabase = decodeURIComponent(parsedUrl.pathname).replace(/^\//u, '') === 'sams_library';
if (!localHost || parsedUrl.port !== '5433' || !localDatabase || !/^postgres(ql)?:$/u.test(parsedUrl.protocol)) {
  throw new Error('Safety stop: importer requires local PostgreSQL localhost:5433/sams_library');
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const BATCH_SIZE = 250;

async function findInBatches(model, ids, select) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    rows.push(...await model.findMany({ where: { id: { in: ids.slice(offset, offset + BATCH_SIZE) } }, select }));
  }
  return rows;
}

async function assertNoCollisions() {
  const expectedItems = new Map(plan.items.map((item) => [item.id, item]));
  const existingItems = await findInBatches(prisma.libraryItem, [...expectedItems.keys()], {
    id: true, type: true, title: true
  });
  for (const row of existingItems) {
    const expected = expectedItems.get(row.id);
    if (row.type !== expected.type || row.title !== expected.title) {
      throw new Error(`Catalog collision or edited imported item: ${row.id}`);
    }
  }

  const expectedContributors = new Map(plan.contributors.map((row) => [row.id, row.fullName]));
  const existingContributors = await findInBatches(prisma.contributor, [...expectedContributors.keys()], {
    id: true, fullName: true
  });
  for (const row of existingContributors) {
    if (row.fullName !== expectedContributors.get(row.id)) {
      throw new Error(`Contributor collision: ${row.id}`);
    }
  }

  const expectedCopies = new Map(plan.physicalCopies.map((copy) => [copy.id, copy]));
  const existingCopies = await findInBatches(prisma.physicalCopy, [...expectedCopies.keys()], {
    id: true, itemId: true, copyCode: true
  });
  for (const row of existingCopies) {
    const expected = expectedCopies.get(row.id);
    if (row.itemId !== expected.itemId || row.copyCode !== expected.copyCode) {
      throw new Error(`Physical-copy collision: ${row.id}`);
    }
  }

  const legacyItems = await prisma.legacyCatalogIdentity.findMany({
    where: { sourceNamespace: plan.summary.sourceNamespace },
    select: { legacyCode: true, itemId: true }
  });
  const expectedLegacyItems = new Map(plan.legacyCatalogIdentities.map((row) => [row.legacyCode, row.itemId]));
  for (const row of legacyItems) {
    if (expectedLegacyItems.get(row.legacyCode) !== row.itemId) {
      throw new Error(`Legacy catalog identity collision: ${row.legacyCode}`);
    }
  }

  const legacyCopies = await prisma.legacyCopyIdentity.findMany({
    where: { sourceNamespace: plan.summary.sourceNamespace },
    select: { legacyGeneralCode: true, copyId: true }
  });
  const expectedLegacyCopies = new Map(plan.legacyCopyIdentities.map((row) => [row.legacyGeneralCode, row.copyId]));
  for (const row of legacyCopies) {
    if (expectedLegacyCopies.get(row.legacyGeneralCode) !== row.copyId) {
      throw new Error(`Legacy copy identity collision: ${row.legacyGeneralCode}`);
    }
  }
}

async function verify(branchId) {
  const namespace = plan.summary.sourceNamespace;
  const [itemIdentities, copyIdentities, academicDetails, subjectLinks, contributorLinks, branchCopies] =
    await Promise.all([
      prisma.legacyCatalogIdentity.count({ where: { sourceNamespace: namespace } }),
      prisma.legacyCopyIdentity.count({ where: { sourceNamespace: namespace } }),
      prisma.academicWorkDetails.count({
        where: { item: { legacyIdentities: { some: { sourceNamespace: namespace } } } }
      }),
      prisma.itemSubject.count({
        where: { item: { legacyIdentities: { some: { sourceNamespace: namespace } } } }
      }),
      prisma.itemContributor.count({
        where: { item: { legacyIdentities: { some: { sourceNamespace: namespace } } } }
      }),
      prisma.physicalCopy.count({
        where: { branchId, legacyIdentities: { some: { sourceNamespace: namespace } } }
      })
    ]);
  const actual = { itemIdentities, copyIdentities, academicDetails, subjectLinks, contributorLinks, branchCopies };
  const expected = {
    itemIdentities: plan.items.length,
    copyIdentities: plan.physicalCopies.length,
    academicDetails: plan.academicWorkDetails.length,
    subjectLinks: plan.itemSubjects.length,
    contributorLinks: plan.itemContributors.length,
    branchCopies: plan.physicalCopies.length
  };
  console.log(JSON.stringify({ expected, actual }, null, 2));
  if (Object.keys(expected).some((key) => actual[key] !== expected[key])) {
    throw new Error('Verification counts do not match the approved import plan');
  }
  console.log('VERIFY PASSED. All approved academic works and physical copies are linked.');
}

try {
  await prisma.$connect();
  const branch = await prisma.branch.findUnique({
    where: { code: branchCode }, select: { id: true, code: true, isActive: true }
  });
  if (!branch?.isActive) throw new Error(`Active import branch not found: ${branchCode}`);
  await assertNoCollisions();

  await verify(branch.id);
} finally {
  await prisma.$disconnect();
}
