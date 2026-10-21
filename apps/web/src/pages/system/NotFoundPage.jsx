import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

export function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <main className="system-page">
      <section className="system-card">
        <span>404</span>
        <h1>{t('system.notFoundTitle')}</h1>
        <p>{t('system.notFoundBody')}</p>

        <Link to="/" className="system-card__action">
          {t('system.backHome')}
        </Link>
      </section>
    </main>
  );
}
