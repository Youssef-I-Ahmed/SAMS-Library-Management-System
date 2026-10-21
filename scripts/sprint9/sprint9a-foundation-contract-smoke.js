import {
  getLanguageDirection,
  isSupportedLanguage,
  translate
} from '../../apps/web/src/i18n/index.js';

import {
  resolveBrandAsset,
  resolveBrandPalette
} from '../../apps/web/src/components/brand/brand-assets.js';

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log(
  'Verifying Sprint 9A frontend foundation contracts...'
);

assert(
  isSupportedLanguage('en'),
  'English must be supported.'
);

assert(
  isSupportedLanguage('ar'),
  'Arabic must be supported.'
);

assert(
  getLanguageDirection('en') ===
    'ltr',
  'English must use LTR.'
);

assert(
  getLanguageDirection('ar') ===
    'rtl',
  'Arabic must use RTL.'
);

assert(
  translate(
    'en',
    'foundation.title'
  ) !==
    'foundation.title',
  'English foundation copy is missing.'
);

assert(
  translate(
    'ar',
    'foundation.title'
  ) !==
    'foundation.title',
  'Arabic foundation copy is missing.'
);

assert(
  resolveBrandPalette({
    surface: 'light',
    theme: 'dark'
  }) === 'navy',
  'Light surfaces must use the navy brand asset regardless of global theme.'
);

assert(
  resolveBrandPalette({
    surface: 'dark',
    theme: 'light'
  }) === 'white',
  'Dark surfaces must use the white brand asset regardless of global theme.'
);

assert(
  resolveBrandAsset({
    variant: 'full',
    surface: 'light',
    theme: 'dark'
  }) ===
    '/brand/sams-full-logo-navy.png',
  'Full navy logo mapping is incorrect.'
);

assert(
  resolveBrandAsset({
    variant: 'full',
    surface: 'dark',
    theme: 'light'
  }) ===
    '/brand/sams-full-logo-white.png',
  'Full white logo mapping is incorrect.'
);

assert(
  resolveBrandAsset({
    variant: 'mark',
    surface: 'auto',
    theme: 'dark'
  }) ===
    '/brand/sams-logo-white.png',
  'Auto dark-theme mark mapping is incorrect.'
);

console.log(
  'Language + RTL/LTR contract: OK'
);

console.log(
  'Surface-aware brand contract: OK'
);

console.log(
  'Sprint 9A foundation contract smoke PASSED.'
);
