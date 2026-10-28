import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  getLanguageDirection, isSupportedLanguage, resources, translate
} from '../src/i18n/index.js';

function leaves(value, prefix = '') {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === 'object' ? leaves(entry, path) : [[path, entry]];
  });
}

for (const [language, action, accountMenu] of [
  ['en', 'Continue', 'Account menu'],
  ['ar', 'دخول', 'قائمة الحساب']
]) {
  test(`${language}: base auth keys and later additions coexist`, () => {
    assert.equal(translate(language, 'auth.continue'), action);
    assert.equal(translate(language, 'auth.accountMenu'), accountMenu);
  });

  test(`${language}: every locale module leaf survives resource assembly`, async () => {
    const directory = new URL('../src/i18n/locales/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.startsWith(language));
    for (const file of files) {
      const module = await import(new URL(file, directory));
      for (const [key, value] of leaves(Object.values(module)[0])) {
        assert.equal(translate(language, key), value, `${file}: ${key}`);
      }
    }
  });
}

test('English and Arabic have matching translation keys', () => {
  assert.deepEqual(
    leaves(resources.en).map(([key]) => key).sort(),
    leaves(resources.ar).map(([key]) => key).sort()
  );
});

test('fallbacks and language direction retain their existing behavior', () => {
  assert.equal(translate('unsupported', 'auth.continue'), 'Continue');
  assert.equal(translate('ar', 'missing.key'), 'missing.key');
  assert.equal(translate('ar', 'missing.key', 'Fallback'), 'Fallback');
  assert.equal(getLanguageDirection('ar'), 'rtl');
  assert.equal(getLanguageDirection('en'), 'ltr');
  assert.equal(isSupportedLanguage('ar'), true);
  assert.equal(isSupportedLanguage('fr'), false);
});
