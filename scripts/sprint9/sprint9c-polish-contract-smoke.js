import {
  getContributorRoleLabel,
  getLanguageLabel
} from '../../apps/web/src/features/discovery/discovery-format.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const t = (key, fallback = key) => ({
  'languages.english': 'English',
  'languages.arabic': 'Arabic',
  'contributorRoles.AUTHOR': 'Author'
}[key] ?? fallback);

assert(getLanguageLabel('en', t) === 'English', 'en language mapping failed.');
assert(getLanguageLabel('English', t) === 'English', 'English mapping failed.');
assert(getLanguageLabel('ar', t) === 'Arabic', 'ar language mapping failed.');
assert(getContributorRoleLabel('AUTHOR', t) === 'Author', 'AUTHOR mapping failed.');
assert(getContributorRoleLabel('UNKNOWN_ROLE', t) === 'UNKNOWN_ROLE', 'Role fallback failed.');

console.log('Language label mapping: OK');
console.log('Contributor role label mapping: OK');
console.log('Sprint 9C polish contract smoke PASSED.');
