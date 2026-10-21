import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

export const THEME_STORAGE_KEY = 'sams.theme';

export const ThemeContext = createContext(null);

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  try {
    return localStorage.getItem(
      THEME_STORAGE_KEY
    ) === 'dark'
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector(
    'meta[name="theme-color"]'
  );

  if (themeColor) {
    themeColor.setAttribute(
      'content',
      theme === 'dark'
        ? '#07111F'
        : '#F8FAFC'
    );
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    getInitialTheme
  );

  const setTheme = useCallback(
    (nextTheme) => {
      const normalized =
        nextTheme === 'dark'
          ? 'dark'
          : 'light';

      setThemeState(normalized);

      try {
        localStorage.setItem(
          THEME_STORAGE_KEY,
          normalized
        );
      } catch {
        // Storage can be unavailable in privacy modes.
      }
    },
    []
  );

  const toggleTheme = useCallback(
    () => {
      setTheme(
        theme === 'dark'
          ? 'light'
          : 'dark'
      );
    },
    [setTheme, theme]
  );

  useEffect(
    () => {
      applyTheme(theme);
    },
    [theme]
  );

  const value = useMemo(
    () => ({
      theme,
      isDark:
        theme === 'dark',
      setTheme,
      toggleTheme
    }),
    [
      setTheme,
      theme,
      toggleTheme
    ]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
