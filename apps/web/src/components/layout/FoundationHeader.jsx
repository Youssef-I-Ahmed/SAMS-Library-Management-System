import {
  BrandLogo
} from '../brand/BrandLogo';

import {
  LanguageSwitcher
} from '../ui/LanguageSwitcher';

import {
  ThemeToggle
} from '../ui/ThemeToggle';

import {
  useLanguage
} from '../../hooks/useLanguage';

export function FoundationHeader() {
  const {
    t
  } = useLanguage();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a
          href="/"
          className="site-brand"
          aria-label={
            t('common.academy')
          }
        >
          <BrandLogo
            variant="mark"
            surface="auto"
            className="site-brand__mark"
          />

          <span className="site-brand__text">
            <strong>
              SAMS
            </strong>
            <span>
              {t('common.library')}
            </span>
          </span>
        </a>

        <div className="site-header__controls">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
