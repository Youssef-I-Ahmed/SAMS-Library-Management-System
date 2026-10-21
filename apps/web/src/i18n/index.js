import { ar } from './locales/ar.js';
import { en } from './locales/en.js';
import { arDiscovery } from './locales/ar-discovery.js';
import { enDiscovery } from './locales/en-discovery.js';
import { arCirculation } from './locales/ar-circulation.js';
import { enCirculation } from './locales/en-circulation.js';
import { arStaff } from './locales/ar-staff.js';
import { enStaff } from './locales/en-staff.js';
import { arAdmin } from './locales/ar-admin.js';
import { enAdmin } from './locales/en-admin.js';
import { ar9g } from './locales/ar-9g.js';
import { en9g } from './locales/en-9g.js';
import { ar9g3 } from './locales/ar-9g3.js';
import { en9g3 } from './locales/en-9g3.js';
import { ar9g4 } from './locales/ar-9g4.js';
import { en9g4 } from './locales/en-9g4.js';

export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES = [
  'en',
  'ar'
];

export const resources = {
  en: {
    ...en,
    ...enDiscovery,
    ...enCirculation,
    ...enStaff,
    ...enAdmin,
    ...en9g,
    ...en9g3,
    ...en9g4
  },

  ar: {
    ...ar,
    ...arDiscovery,
    ...arCirculation,
    ...arStaff,
    ...arAdmin,
    ...ar9g,
    ...ar9g3,
    ...ar9g4
  }
};

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

export function getLanguageDirection(language) {
  return language === 'ar'
    ? 'rtl'
    : 'ltr';
}

function getByPath(object, key) {
  return key
    .split('.')
    .reduce(
      (value, part) =>
        value?.[part],
      object
    );
}

export function translate(
  language,
  key,
  fallback = key
) {
  const resource =
    resources[language] ??
    resources[DEFAULT_LANGUAGE];

  return (
    getByPath(resource, key) ??
    getByPath(
      resources[DEFAULT_LANGUAGE],
      key
    ) ??
    fallback
  );
}
