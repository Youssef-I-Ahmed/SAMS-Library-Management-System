import {
  useLanguage
} from '../../hooks/useLanguage';

import {
  useTheme
} from '../../hooks/useTheme';

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="4"
      />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const {
    isDark,
    toggleTheme
  } = useTheme();

  const {
    t
  } = useLanguage();

  const label = isDark
    ? t(
        'common.switchToLight'
      )
    : t(
        'common.switchToDark'
      );

  return (
    <button
      type="button"
      className="control-button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span
        className="control-button__icon"
      >
        {isDark
          ? <SunIcon />
          : <MoonIcon />}
      </span>

      <span
        className="control-button__text"
      >
        {isDark
          ? t('common.light')
          : t('common.dark')}
      </span>
    </button>
  );
}
