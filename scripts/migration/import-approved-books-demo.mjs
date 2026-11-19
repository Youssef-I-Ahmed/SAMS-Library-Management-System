/**
 * SAMS: approved DA book catalog -> LOCAL demo database.
 * Non-destructive and restartable; no schema migration, deletes or updates.
 * Requires the existing Prisma schema (LibraryItem, BookDetails, Contributor,
 * ItemContributor, DeweyClassification, PhysicalCopy, Branch).
 *
 * Usage:
 *   node scripts/migration/import-approved-books-demo.mjs --dry-run
 *   node scripts/migration/import-approved-books-demo.mjs --apply --demo-copies=all
 *   node scripts/migration/import-approved-books-demo.mjs --verify
 *
 * WARNING: --demo-copies=all creates SYNTHETIC AVAILABLE copies for demonstrations.
 * These are NOT verified real library holdings; do not use in production.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ENV = join(ROOT, '.env');
const DATA_DIR = join(ROOT, 'data', 'demo');
const SOURCE_FILE = join(DATA_DIR, 'SAMS_Books_Merged_Book_Names_Corrected.xlsx');
const INPUT_FILE = join(DATA_DIR, 'books-import-payload.json');
const MAPPING_FILE = join(DATA_DIR, 'legacy-book-code-map.json');

if (existsSync(ENV) && !process.env.DATABASE_URL) {
  process.loadEnvFile(ENV);
}

const args = new Set(process.argv.slice(2));
const mode = ['--dry-run', '--apply', '--verify'].filter(x => args.has(x));
const demoCopiesArg = [...args].find(x => x.startsWith('--demo-copies='));
const demoCopies = demoCopiesArg ? demoCopiesArg.split('=')[1] : 'none';
if (mode.length !== 1 || !['none', 'all'].includes(demoCopies) ||
    [...args].some(x => !mode.includes(x) && x !== demoCopiesArg) ||
    (mode[0] !== '--apply' && demoCopiesArg)) {
  console.error('Usage: node scripts/migration/import-approved-books-demo.mjs --dry-run | --verify | --apply [--demo-copies=none|all]');
  process.exit(2);
}

const payload = JSON.parse(readFileSync(INPUT_FILE, 'utf8'));
const mapping = JSON.parse(readFileSync(MAPPING_FILE, 'utf8'));
if (payload.schemaVersion !== 'sams-approved-books-demo-v1' ||
    payload.books.length !== 2821 || payload.sourceRows !== 2842 ||
    mapping.sourceSha256 !== payload.sourceSha256 ||
    Object.keys(mapping.map).length !== 2842) {
  throw new Error('Invalid demo manifest or book mapping; aborting.');
}
const actualHash = createHash('sha256').update(readFileSync(SOURCE_FILE)).digest('hex');
if (actualHash !== payload.sourceSha256) {
  throw new Error('Source Excel hash mismatch; no database action taken.');
}
const allIds = payload.books.map(b => b.itemId);
if (new Set(allIds).size !== allIds.length) {
  throw new Error('Duplicate deterministic item ID in payload.');
}

// This script is deliberately locked to the local Docker SAMS database.
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run with NODE_ENV=production.');
}
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL missing; check project-root .env');
const parsedUrl = new URL(dbUrl);
const hostOk = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
const dbOk = decodeURIComponent(parsedUrl.pathname).replace(/^\//, '') === 'sams_library';
const portOk = parsedUrl.port === '5433';
if (!hostOk || !dbOk || !portOk || !/^postgres(ql)?:$/.test(parsedUrl.protocol)) {
  throw new Error('Safety stop: this script requires local PostgreSQL localhost:5433/sams_library.');
}

const prisma = new PrismaClient();
const BATCH = 180;
const chunks = arr => {
  const batches = [];
  for (let i = 0; i < arr.length; i += BATCH) batches.push(arr.slice(i, i + BATCH));
  return batches;
};
function stableUuid(label) {
  const bytes = createHash('sha1').update(`SAMS/APPROVED-DA-BOOKS/LOCAL-DEMO/v1/${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DDC = [
  ['000', 'Computer science, information and general works'],
  ['100', 'Philosophy and psychology'],
  ['200', 'Religion'],
  ['300', 'Social sciences'],
  ['400', 'Language'],
  ['500', 'Science'],
  ['600', 'Technology'],
  ['700', 'Arts and recreation'],
  ['800', 'Literature'],
  ['900', 'History and geography'],
];
const ddcName = Object.fromEntries(DDC);
const ddcRoot = code => code && /^\d{3}(?:\.\d+)?$/.test(code)
  ? `${code[0]}00` : null;

async function countMatching(model, ids) {
  let total = 0;
  for (const group of chunks(ids)) total += await model.count({where: {id: {in: group}}});
  return total;
}

async function checkNoIdCollisions() {
  for (const group of chunks(payload.books)) {
    const matched = await prisma.libraryItem.findMany({
      where: {id: {in: group.map(b => b.itemId)}},
      select: {id: true, title: true, type: true},
    });
    const original = new Map(group.map(b => [b.itemId, b]));
    for (const row of matched) {
      const expected = original.get(row.id);
      if (!expected || row.type !== 'BOOK' || row.title !== expected.title) {
        throw new Error(`ID collision or edited imported item ${row.id}; refusing to overwrite.`);
      }
    }
  }
}

async function insertMany(model, rows, label) {
  let created = 0;
  for (const [index, chunk] of chunks(rows).entries()) {
    const result = await model.createMany({data: chunk, skipDuplicates: true});
    created += result.count;
    if ((index + 1) % 10 === 0) console.log(`${label}: ${Math.min((index + 1) * BATCH, rows.length)}/${rows.length} inspected`);
  }
  console.log(`${label}: inserted ${created} (already-present rows skipped)`);
  return created;
}

async function main() {
  console.log('\nSAMS approved DA books -> LOCAL DEMO ONLY');
  console.log(`Mode: ${mode[0]}, DEMO copies: ${demoCopies}`);
  console.log(`Source SHA256: ${payload.sourceSha256}`);
  console.log(`Excel rows: ${payload.sourceRows}, merged catalog books: ${payload.books.length}`);
  console.log('Source physical-copy totals/statuses are NOT assumed to be verified.');
  await prisma.$connect();
  const branch = await prisma.branch.findUnique({where: {code: 'MAIN'}, select: {id: true, isActive: true}});
  if (!branch?.isActive) throw new Error('Active MAIN branch missing. Verify/reseed dev actors first.');
  await checkNoIdCollisions();
  if (mode[0] === '--dry-run') {
    const existing = await countMatching(prisma.libraryItem, allIds);
    console.log(`Dry-run passed. Matching books already in database: ${existing}/${allIds.length}`);
    console.log('NO DATABASE WRITES. Next: --apply --demo-copies=all to enable borrow/return demos.');
    return;
  }
  if (mode[0] === '--verify') {
    const existing = await countMatching(prisma.libraryItem, allIds);
    const demoIds = payload.books.map(b => stableUuid(`demo-copy:${b.itemId}`));
    const copies = await countMatching(prisma.physicalCopy, demoIds);
    console.log(`Imported catalog items: ${existing}/${allIds.length}; synthetic demo copies: ${copies}/${allIds.length}`);
    if (existing !== allIds.length) process.exitCode = 1;
    return;
  }

  // Dewey is a classification system, not a subject/category master-data import.
  // Use broad 000..900 DDC roots for useful demo filters, keep the full raw
  // call number and Dewey prefix on LibraryItem to avoid inventing subdivisions.
  const usedRoots = [...new Set(payload.books.map(b => ddcRoot(b.deweyCodeRaw)).filter(Boolean))];
  const found = await prisma.deweyClassification.findMany({
    where: {code: {in: usedRoots}}, select: {id: true, code: true},
  });
  const foundSet = new Set(found.map(c => c.code));
  const newRoots = usedRoots.filter(code => !foundSet.has(code)).map(code => ({
    id: stableUuid(`dewey-root:${code}`), code, name: ddcName[code],
  }));
  if (newRoots.length) await insertMany(prisma.deweyClassification, newRoots, 'Dewey root classes');
  const roots = await prisma.deweyClassification.findMany({
    where: {code: {in: usedRoots}}, select: {id: true, code: true},
  });
  const deweyIds = Object.fromEntries(roots.map(c => [c.code, c.id]));

  const itemData = payload.books.map(b => ({
    id: b.itemId, type: 'BOOK', title: b.title,
    deweyCodeRaw: b.deweyCodeRaw,
    deweyClassificationId: deweyIds[ddcRoot(b.deweyCodeRaw)] ?? null,
    callNumber: b.callNumber, language: b.language,
    publicationYear: b.year, abstractDescription: b.abstractDescription,
    isActive: true,
  }));
  await insertMany(prisma.libraryItem, itemData, 'Books');
  await insertMany(prisma.bookDetails, payload.books.map(b => ({
    itemId: b.itemId, isbn: b.isbn, publisher: b.publisher, edition: b.edition,
  })), 'Book details');

  const authors = [];
  const links = [];
  for (const b of payload.books) {
    for (const name of new Set(b.authors)) {
      const contributorId = stableUuid(`author:${b.itemId}:${name}`);
      authors.push({id: contributorId, fullName: name});
      links.push({itemId: b.itemId, contributorId, role: 'AUTHOR'});
    }
  }
  await insertMany(prisma.contributor, authors, 'Book authors (per book; no unverified identity merges)');
  await insertMany(prisma.itemContributor, links, 'Item-author links');

  if (demoCopies === 'all') {
    console.log('CREATING SYNTHETIC AVAILABLE INVENTORY FOR LOCAL DEMO (NOT VERIFIED HOLDINGS).');
    const demoRows = payload.books.map(b => ({
      id: stableUuid(`demo-copy:${b.itemId}`), itemId: b.itemId, branchId: branch.id,
      copyCode: `DEMO-BOOK-${b.sourceBookCodes[0]}`, barcode: null,
      shelfLocation: 'DEMO ONLY - location not verified',
      status: 'AVAILABLE', condition: null,
    }));
    await insertMany(prisma.physicalCopy, demoRows, 'Synthetic AVAILABLE demo copies');
  }
  const finalCount = await countMatching(prisma.libraryItem, allIds);
  console.log(`\nFinished: ${finalCount}/${allIds.length} catalog books present.`);
  console.log('This import NEVER alters/deletes existing records and is safe to rerun after a partial interruption.');
  console.log('Next: --verify, then test Student -> Reservation -> Librarian Borrow/Return.');
  if (finalCount !== allIds.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Import stopped safely: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
