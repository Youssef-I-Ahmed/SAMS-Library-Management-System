import { BrandLogo } from '../brand/BrandLogo';
import { useLanguage } from '../../hooks/useLanguage';

export function LoadingScreen() {
  const { t } = useLanguage();

  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <BrandLogo
        variant="mark"
        surface="auto"
        className="loading-screen__logo"
      />

      <span className="loading-screen__spinner" aria-hidden="true" />

      <p>{t('auth.restoringSession')}</p>
    </main>
  );
}
