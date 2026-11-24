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

console.log('Verifying Sprint 9G3 UI/UX contracts...');

const studentShell = read(
  'apps/web/src/layouts/StudentShell.jsx'
);

assert(
  studentShell.includes('student-mobile-nav'),
  'Student mobile navigation is missing.'
);

assert(
  studentShell.includes('aria-label'),
  'Student navigation accessibility label is missing.'
);

console.log('Student responsive navigation: OK');

const adminModal = read(
  'apps/web/src/components/admin/AdminModal.jsx'
);

assert(
  adminModal.includes("event.key === 'Escape'"),
  'Admin modal Escape handling is missing.'
);

assert(
  adminModal.includes("document.body.style.overflow = 'hidden'"),
  'Admin modal scroll locking is missing.'
);

assert(
  adminModal.includes('aria-modal="true"'),
  'Admin modal aria-modal is missing.'
);

console.log('Modal keyboard/accessibility behavior: OK');

const userMenu = read(
  'apps/web/src/components/layout/UserMenu.jsx'
);

assert(
  userMenu.includes('aria-haspopup="menu"'),
  'User menu aria-haspopup is missing.'
);

assert(
  userMenu.includes("event.key === 'Escape'"),
  'User menu Escape behavior is missing.'
);

assert(
  userMenu.includes("'pointerdown'"),
  'User menu outside-click handling is missing.'
);

console.log('Account menu accessibility behavior: OK');

const css = read(
  'apps/web/src/styles/sprint9g-polish.css'
);

for (const required of [
  '.student-mobile-nav',
  '@media (max-width: 820px)',
  "html[dir='rtl']",
  'prefers-contrast: more',
  'prefers-reduced-motion: reduce',
  '--interactive-min: 44px'
]) {
  assert(
    css.includes(required),
    `Missing polish contract: ${required}`
  );
}

console.log('Responsive/RTL/contrast/touch CSS contracts: OK');
console.log('Sprint 9G3 UI/UX contract smoke PASSED.');
