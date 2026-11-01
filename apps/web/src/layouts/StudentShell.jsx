import { NavLink, Outlet, useMatch } from 'react-router-dom';

import { BrandLogo } from '../components/brand/BrandLogo';
import { ShellControls } from '../components/layout/ShellControls';
import { useLanguage } from '../hooks/useLanguage';
import { AI_ASSISTANT_ENABLED } from '../features/ai/ai-config.js';

const studentLinks = [
  ['/student', 'nav.home', 'home'],
  ['/student/catalog', 'nav.catalog', 'catalog'],
  ['/student/reservations', 'nav.myReservations', 'holds'],
  ['/student/borrowings', 'nav.myBorrowings', 'loans'],
  ...(AI_ASSISTANT_ENABLED ? [['/student/ai', 'ai.nav', 'assistant']] : [])
];

function StudentNavigation({
  t,
  className,
  mobile = false
}) {
  return (
    <nav
      className={className}
      aria-label={t('nav.studentNavigation')}
    >
      {studentLinks.map(([to, key, mobileKey]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/student'}
          aria-label={AI_ASSISTANT_ENABLED && mobile ? t(key) : undefined}
          className={({ isActive }) =>
            isActive ? 'is-active' : undefined
          }
        >
          {AI_ASSISTANT_ENABLED && mobile
            ? <span className="student-mobile-nav__label" aria-hidden="true">{t(`ai.mobileNav.${mobileKey}`)}</span>
            : t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

export function StudentShell() {
  const { t } = useLanguage();
  const isHome = useMatch('/student');

  return (
    <div className={`student-shell${AI_ASSISTANT_ENABLED ? ' student-shell--ai-enabled' : ''}`}>
      <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>
      <header className="student-shell__header">
        <div className="student-shell__header-inner">
          <NavLink
            to="/student"
            className="student-shell__brand"
            aria-label={`${t('common.academy')} — ${t('common.library')}`}
          >
            <BrandLogo
              variant="mark"
              surface="auto"
              className="student-shell__logo"
              alt=""
              width={44}
              height={44}
            />

            <span>
              <strong>SAMS</strong>
              <small>{t('common.library')}</small>
            </span>
          </NavLink>

          <StudentNavigation
            t={t}
            className="student-shell__nav"
          />

          <ShellControls />
        </div>
      </header>

      <main
        className={`student-shell__main${isHome ? ' student-shell__main--home' : ''}`}
        id="main-content"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      <StudentNavigation
        t={t}
        className="student-mobile-nav"
        mobile
      />
    </div>
  );
}
