import { Link } from 'react-router-dom';

import { getDefaultRoute } from '../../auth/auth-config';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function ForbiddenPage() {
  const auth = useAuth();
  const { t } = useLanguage();

  return (
    <main className="system-page">
      <section className="system-card">
        <span>403</span>
        <h1>{t('system.forbiddenTitle')}</h1>
        <p>{t('system.forbiddenBody')}</p>

        <Link
          to={getDefaultRoute(auth.roles)}
          className="system-card__action"
        >
          {t('system.backToWorkspace')}
        </Link>
      </section>
    </main>
  );
}
