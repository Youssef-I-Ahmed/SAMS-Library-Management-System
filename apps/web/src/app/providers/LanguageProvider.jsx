import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  DEFAULT_LANGUAGE,
  getLanguageDirection,
  isSupportedLanguage,
  translate
} from '../../i18n';

export const LANGUAGE_STORAGE_KEY =
  'sams.language';

export const LanguageContext =
  createContext(null);

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  try {
    const stored =
      localStorage.getItem(
        LANGUAGE_STORAGE_KEY
      );

    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Fall through to browser preference.
  }

  return navigator.language
    ?.toLowerCase()
    .startsWith('ar')
    ? 'ar'
    : DEFAULT_LANGUAGE;
}

function applyLanguage(language) {
  const root =
    document.documentElement;

  root.lang = language;
  root.dir =
    getLanguageDirection(language);
}

export function LanguageProvider({
  children
}) {
  const [language, setLanguageState] =
    useState(getInitialLanguage);

  const setLanguage = useCallback(
    (nextLanguage) => {
      const normalized =
        isSupportedLanguage(
          nextLanguage
        )
          ? nextLanguage
          : DEFAULT_LANGUAGE;

      setLanguageState(normalized);

      try {
        localStorage.setItem(
          LANGUAGE_STORAGE_KEY,
          normalized
        );
      } catch {
        // Storage can be unavailable in privacy modes.
      }
    },
    []
  );

  const toggleLanguage = useCallback(
    () => {
      setLanguage(
        language === 'ar'
          ? 'en'
          : 'ar'
      );
    },
    [language, setLanguage]
  );

  const t = useCallback(
    (key, fallback) =>
      translate(
        language,
        key,
        fallback
      ),
    [language]
  );

  useEffect(
    () => {
      applyLanguage(language);

      document.title = t(
        'meta.title',
        'SAMS Library System'
      );
    },
    [language, t]
  );

  const value = useMemo(
    () => ({
      language,
      direction:
        getLanguageDirection(
          language
        ),
      isRtl:
        language === 'ar',
      setLanguage,
      toggleLanguage,
      t
    }),
    [
      language,
      setLanguage,
      t,
      toggleLanguage
    ]
  );

  return (
    <LanguageContext.Provider
      value={value}
    >
      {children}
    </LanguageContext.Provider>
  );
}
