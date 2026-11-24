import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log('Verifying Sprint 9G foundation contracts...');

const studentsPage = read('apps/web/src/pages/librarian/StudentsAdminPage.jsx');
assert(!studentsPage.includes('importStudents'), 'Student Directory still imports student mutation API.');
assert(!studentsPage.includes('saveStudent'), 'Student Directory still contains student save logic.');
assert(studentsPage.includes('setSelectedStudent'), 'Read-only student detail view is missing.');
console.log('Student ownership/read-only UI contract: OK');

const router = read('apps/web/src/app/router/AppRouter.jsx');
assert(router.includes('Suspense') && router.includes('lazyNamed'), 'Route lazy loading is missing.');
for (const modulePath of [
  '../../pages/student/CatalogPage',
  '../../pages/librarian/CatalogAdminPage',
  '../../pages/librarian/StudentsAdminPage',
  '../../pages/shared/AnalyticsDashboardPage',
  '../../pages/management/ManagementBorrowingsPage'
]) {
  assert(router.includes(`import('${modulePath}')`), `Missing lazy route import: ${modulePath}`);
}
console.log('Route-level code-splitting contract: OK');

const architecture = read('docs/architecture/student-master-data-integration.md');
assert(architecture.includes('Student master data is owned by the university'), 'Student data ownership is not documented.');
assert(architecture.includes('Integration source:** TBD'), 'Student integration source is not documented as TBD.');
console.log('Student integration architecture contract: OK');

console.log('Sprint 9G foundation contract smoke PASSED.');
