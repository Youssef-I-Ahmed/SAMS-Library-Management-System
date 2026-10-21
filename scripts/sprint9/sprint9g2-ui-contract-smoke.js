import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const read = (relativePath) =>
  fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Verifying Sprint 9G2 frontend role contracts...');

const router = read(
  'apps/web/src/app/router/AppRouter.jsx'
);

assert(
  router.includes("RequireRole roles={['STUDENT']}"),
  'Student role guard missing.'
);
assert(
  router.includes("RequireRole roles={['LIBRARIAN']}"),
  'Librarian role guard missing.'
);
assert(
  router.includes("RequireRole roles={['MANAGEMENT']}"),
  'Management role guard missing.'
);
assert(
  router.includes('Suspense') &&
    router.includes('lazy'),
  'Route-level lazy loading missing.'
);

for (const route of [
  'path="/student"',
  'path="/librarian"',
  'path="/management"',
  'path="students"',
  'path="analytics"',
  'path="borrowings"',
  'path="visits"'
]) {
  assert(
    router.includes(route),
    `Missing route: ${route}`
  );
}

const students = read(
  'apps/web/src/pages/librarian/StudentsAdminPage.jsx'
);

for (const forbidden of [
  'importStudents',
  'saveStudent',
  'createStudent',
  'updateStudent'
]) {
  assert(
    !students.includes(forbidden),
    `Read-only Student Directory contains: ${forbidden}`
  );
}

assert(
  students.includes('selectedStudent'),
  'Read-only student details workflow missing.'
);

console.log('Role guards/routes: OK');
console.log('Route-level lazy loading: OK');
console.log('Librarian Student Directory read-only UI: OK');
console.log('Sprint 9G2 frontend role contracts PASSED.');
