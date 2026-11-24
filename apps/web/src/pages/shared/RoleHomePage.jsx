import { Link } from 'react-router-dom';
import '../../styles/staff-reporting.css';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const roleConfig = {
  STUDENT: {
    title: 'roleHome.studentTitle',
    body: 'roleHome.studentBody',
    next: '/student/catalog',
    nextLabel: 'nav.catalog'
  },
  LIBRARIAN: {
    title: 'roleHome.librarianTitle',
    body: 'roleHome.librarianBody',
    next: '/librarian/borrow',
    nextLabel: 'nav.borrow'
  },
  MANAGEMENT: {
    title: 'roleHome.managementTitle',
    body: 'roleHome.managementBody',
    next: '/management',
    nextLabel: 'nav.analytics'
  }
};

export function RoleHomePage({ role }) {
  const auth = useAuth();
  const { t } = useLanguage();

  const config = roleConfig[role];
  const student = auth.user?.student;

  if (role === 'LIBRARIAN') return <section className="admin-page admin-operations librarian-overview">
    <header className="admin-page__header"><span>{t('roles.LIBRARIAN')}</span><h1 tabIndex={-1}>{t('admin.reporting.deskTitle')}</h1><p>{t('admin.reporting.deskBody')}</p></header>
    <nav className="librarian-task-grid" aria-label={t('admin.reporting.tasks')}>
      {[
        ['borrow', 'nav.borrow', 'borrowTask'], ['return', 'nav.return', 'returnTask'], ['reservations', 'nav.reservations', 'reservationsTask'],
        ['visits', 'nav.visits', 'visitsTask'], ['catalog', 'nav.catalog', 'catalogTask'], ['students', 'admin.nav.students', 'studentsTask'], ['analytics', 'admin.nav.analytics', 'analyticsTask']
      ].map(([path, label, description]) => <Link key={path} to={`/librarian/${path}`}><strong>{t(label)}</strong><span>{t(`admin.reporting.${description}`)}</span></Link>)}
    </nav>
  </section>;

  return (
    <section className="role-home">
      <div className="role-home__hero">
        <span className="role-home__eyebrow">
          {t(`roles.${role}`)}
        </span>

        <h1>{t(config.title)}</h1>
        <p>{t(config.body)}</p>

        <div className="role-home__identity">
          <div>
            <span>{t('auth.signedInAs')}</span>
            <strong>{auth.user?.displayName}</strong>
          </div>

          <div>
            <span>{t('auth.email')}</span>
            <strong>{auth.user?.universityEmail}</strong>
          </div>

          {student && (
            <div>
              <span>{t('auth.studentId')}</span>
              <strong>{student.studentId}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="role-home__next">
        <span>{t('release.workspaceReady')}</span>
        <h2>{t('release.quickActionTitle')}</h2>
        <p>{t('release.quickActionBody')}</p>

        <Link to={config.next} className="role-home__link">
          {t(config.nextLabel)}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
