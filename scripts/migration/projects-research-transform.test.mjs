import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalJsonSha256,
  loadAcademicImportPlan,
  normalizeAcademicText,
  scalar,
  stableUuid
} from './projects-research-transform.mjs';

test('normalization preserves display values separately and unifies Arabic search forms', () => {
  assert.equal(scalar('  أبحاث   التِجارة  '), 'أبحاث التِجارة');
  assert.equal(normalizeAcademicText('أبحاث التِجارة'), 'ابحاث التجاره');
  assert.equal(scalar('\\N'), null);
});

test('deterministic UUIDs are stable and source-scoped', () => {
  assert.equal(stableUuid('item:LEGACY_PROJECTS_V1:3'), stableUuid('item:LEGACY_PROJECTS_V1:3'));
  assert.notEqual(stableUuid('item:LEGACY_PROJECTS_V1:3'), stableUuid('item:LEGACY_BOOKS_V1:3'));
});

test('manifest integrity is stable across Windows and Linux line endings', () => {
  const linux = JSON.parse('{\n"a":1,\n"b":[2,3]\n}');
  const windows = JSON.parse('{\r\n"a":1,\r\n"b":[2,3]\r\n}');
  assert.equal(canonicalJsonSha256(linux), canonicalJsonSha256(windows));
});

test('approved source set transforms into a complete privacy-authorized plan', () => {
  const plan = loadAcademicImportPlan();
  assert.deepEqual(plan.summary, {
    sourceNamespace: 'LEGACY_PROJECTS_V1',
    items: 3983,
    copies: 3988,
    subjects: 11,
    subjectLinks: 3951,
    contributors: 15225,
    contributorLinks: 15225,
    publicationYearConflicts: 4,
    projectOnlySubjectExceptions: 2,
    titleDifferences: 3857,
    missingPublicationYears: 10,
    copyStatusCounts: { ARCHIVED: 1, AVAILABLE: 3987 }
  });
  assert.equal(new Set(plan.items.map((item) => item.id)).size, plan.items.length);
  assert.equal(new Set(plan.physicalCopies.map((copy) => copy.id)).size, plan.physicalCopies.length);
  assert.equal(new Set(plan.legacyCatalogIdentities.map((row) => row.legacyCode)).size, plan.items.length);
  assert.ok(plan.items.every((item) => item.type === 'ACADEMIC_WORK' && item.title));
  assert.ok(plan.physicalCopies.every((copy) => ['AVAILABLE', 'ARCHIVED'].includes(copy.status)));
  assert.ok(plan.contract.scope.allowsProductionImport === false);
});
