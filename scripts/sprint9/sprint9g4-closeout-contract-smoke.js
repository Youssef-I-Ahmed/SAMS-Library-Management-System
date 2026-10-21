import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9G4 closeout contracts...');

const catalog = read(
  'apps/web/src/pages/librarian/CatalogAdminPage.jsx'
);

assert(
  catalog.includes('copyDraft.status !== copyDraft.originalStatus'),
  'Copy update no longer protects unchanged circulation-managed status.'
);

assert(
  catalog.includes('copyDraft.branchId !== copyDraft.originalBranchId'),
  'Copy update no longer protects unchanged circulation-managed branch.'
);

assert(
  catalog.includes("['RESERVED', 'BORROWED'].includes(copyDraft.originalStatus)"),
  'Circulation-managed copy guard is missing.'
);

assert(
  catalog.includes('disabled={copyCirculationManaged}'),
  'Circulation-managed branch/status controls are not protected.'
);

console.log('Physical-copy circulation ownership contract: OK');

const roleHome = read(
  'apps/web/src/pages/shared/RoleHomePage.jsx'
);

assert(
  !roleHome.includes('checkpoint:') &&
    !roleHome.includes('Sprint 9'),
  'Internal Sprint checkpoint copy is still present in RoleHomePage.'
);

assert(
  roleHome.includes("t('release.quickActionTitle')"),
  'Release-safe role-home copy is missing.'
);

console.log('Release-safe role-home copy: OK');

const studentArchitecture = read(
  'docs/architecture/student-master-data-integration.md'
);

assert(
  studentArchitecture.includes(
    'Student master data is owned by the university'
  ),
  'University ownership of Student Master Data is missing.'
);

console.log('Student Master Data ownership documentation: OK');

const release = read(
  'docs/release/frontend-rc1.md'
);

assert(
  release.includes('SAMS Frontend RC1') &&
    release.includes('Deferred / integration-dependent work'),
  'Frontend RC release notes are incomplete.'
);

console.log('Frontend RC closeout documentation: OK');
console.log('Sprint 9G4 closeout contract smoke PASSED.');
