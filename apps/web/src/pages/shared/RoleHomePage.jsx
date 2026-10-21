import { Link } from 'react-router-dom';

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
    next: '/management/analytics',
    nextLabel: 'nav.analytics'
  }
};

export function RoleHomePage({ role }) {
  const auth = useAuth();
  const { t } = useLanguage();

  const config = roleConfig[role];
  const student = auth.user?.student;

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
