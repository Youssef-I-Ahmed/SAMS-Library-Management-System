import {
  useLanguage
} from '../../hooks/useLanguage';

export function LanguageSwitcher() {
  const {
    language,
    setLanguage,
    t
  } = useLanguage();

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={
        t('common.language')
      }
    >
      <button
        type="button"
        className="language-switcher__option"
        data-active={
          language === 'en'
        }
        aria-pressed={
          language === 'en'
        }
        onClick={() =>
          setLanguage('en')
        }
      >
        EN
      </button>

      <button
        type="button"
        className="language-switcher__option"
        data-active={
          language === 'ar'
        }
        aria-pressed={
          language === 'ar'
        }
        onClick={() =>
          setLanguage('ar')
        }
      >
        عربي
      </button>
    </div>
  );
}
