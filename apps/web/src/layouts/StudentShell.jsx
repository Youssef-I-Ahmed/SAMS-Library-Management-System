import { NavLink, Outlet } from 'react-router-dom';

import { BrandLogo } from '../components/brand/BrandLogo';
import { ShellControls } from '../components/layout/ShellControls';
import { useLanguage } from '../hooks/useLanguage';

const studentLinks = [
  ['/student', 'nav.home'],
  ['/student/catalog', 'nav.catalog'],
  ['/student/reservations', 'nav.myReservations'],
  ['/student/borrowings', 'nav.myBorrowings']
];

function StudentNavigation({
  t,
  className
}) {
  return (
    <nav
      className={className}
      aria-label={t('nav.studentNavigation')}
    >
      {studentLinks.map(([to, key]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/student'}
          className={({ isActive }) =>
            isActive ? 'is-active' : undefined
          }
        >
          {t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

export function StudentShell() {
  const { t } = useLanguage();

  return (
    <div className="student-shell">
      <header className="student-shell__header">
        <div className="student-shell__header-inner">
          <NavLink
            to="/student"
            className="student-shell__brand"
            aria-label="SAMS Library"
          >
            <BrandLogo
              variant="mark"
              surface="auto"
              className="student-shell__logo"
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
        className="student-shell__main"
        id="main-content"
      >
        <Outlet />
      </main>

      <StudentNavigation
        t={t}
        className="student-mobile-nav"
      />
    </div>
  );
}
