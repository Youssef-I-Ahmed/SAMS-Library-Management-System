import { useState } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';

import {
  DEV_ACCOUNTS,
  getDefaultRoute
} from '../../auth/auth-config';

import { BrandLogo } from '../../components/brand/BrandLogo';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function LoginPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingRole, setPendingRole] = useState(null);
  const [error, setError] = useState(null);

  if (auth.isAuthenticated) {
    return (
      <Navigate
        to={getDefaultRoute(auth.roles)}
        replace
      />
    );
  }

  async function login(account) {
    setPendingRole(account.role);
    setError(null);

    try {
      const user = await auth.devLogin(account.email);
      const defaultPath = getDefaultRoute(user.roles);
      const requestedPath = location.state?.from;

      navigate(
        requestedPath && requestedPath !== '/login'
          ? requestedPath
          : defaultPath,
        { replace: true }
      );
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPendingRole(null);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-visual__overlay" />

        <div className="login-visual__content">
          <BrandLogo
            variant="full"
            surface="dark"
            className="login-visual__logo"
          />

          <span className="login-visual__eyebrow">
            {t('auth.portalEyebrow')}
          </span>

          <h1>{t('auth.heroTitle')}</h1>
          <p>{t('auth.heroBody')}</p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__controls">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="login-card">
          <BrandLogo
            variant="mark"
            surface="auto"
            className="login-card__logo"
          />

          <span className="login-card__eyebrow">SAMS</span>

          <h2>{t('auth.welcome')}</h2>

          <p className="login-card__intro">
            {t('auth.devIntro')}
          </p>

          {error && (
            <InlineAlert
              title={t('auth.loginFailed')}
              message={error.message}
              requestId={error.requestId}
            />
          )}

          <div className="dev-login-grid">
            {DEV_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                type="button"
                className="dev-login-card"
                disabled={Boolean(pendingRole)}
                onClick={() => login(account)}
              >
                <span className="dev-login-card__role">
                  {t(`roles.${account.role}`)}
                </span>

                <span className="dev-login-card__email">
                  {account.email}
                </span>

                <span className="dev-login-card__action">
                  {pendingRole === account.role
                    ? t('auth.signingIn')
                    : t('auth.continue')}
                </span>
              </button>
            ))}
          </div>

          <p className="login-card__note">
            {t('auth.devOnly')}
          </p>
        </div>
      </section>
    </main>
  );
}
