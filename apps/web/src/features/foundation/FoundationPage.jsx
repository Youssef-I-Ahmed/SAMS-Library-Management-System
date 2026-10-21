import {
  BrandLogo
} from '../../components/brand/BrandLogo';

import {
  FoundationHeader
} from '../../components/layout/FoundationHeader';

import {
  useLanguage
} from '../../hooks/useLanguage';

const roleCards = [
  {
    key: 'student',
    eyebrow: '01'
  },
  {
    key: 'librarian',
    eyebrow: '02'
  },
  {
    key: 'management',
    eyebrow: '03'
  }
];

export function FoundationPage() {
  const {
    t
  } = useLanguage();

  return (
    <div className="app-shell">
      <FoundationHeader />

      <main
        id="main-content"
        className="foundation-page"
      >
        <section className="foundation-hero">
          <div className="foundation-hero__content">
            <span className="foundation-badge">
              {t(
                'foundation.badge'
              )}
            </span>

            <h1>
              {t(
                'foundation.title'
              )}
            </h1>

            <p className="foundation-hero__lead">
              {t(
                'foundation.subtitle'
              )}
            </p>

            <div className="foundation-status">
              <span
                className="foundation-status__dot"
                aria-hidden="true"
              />
              {t(
                'foundation.status'
              )}
            </div>
          </div>

          <div
            className="foundation-hero__brand"
            aria-hidden="true"
          >
            <div className="foundation-hero__glow" />

            <BrandLogo
              variant="full"
              surface="dark"
              alt=""
              className="foundation-hero__logo"
            />
          </div>
        </section>

        <section
          className="foundation-section"
          aria-labelledby="roles-title"
        >
          <div className="section-heading">
            <p className="section-heading__eyebrow">
              SAMS
            </p>

            <h2 id="roles-title">
              {t(
                'foundation.systemTitle'
              )}
            </h2>
          </div>

          <div className="role-grid">
            {roleCards.map(
              ({
                key,
                eyebrow
              }) => (
                <article
                  key={key}
                  className="role-card"
                >
                  <span className="role-card__number">
                    {eyebrow}
                  </span>

                  <h3>
                    {t(
                      `foundation.${key}Title`
                    )}
                  </h3>

                  <p>
                    {t(
                      `foundation.${key}Body`
                    )}
                  </p>
                </article>
              )
            )}
          </div>
        </section>

        <section className="foundation-grid">
          <article className="foundation-card">
            <div className="foundation-card__icon">
              Aa
            </div>

            <h2>
              {t(
                'foundation.languageTitle'
              )}
            </h2>

            <p>
              {t(
                'foundation.languageBody'
              )}
            </p>
          </article>

          <article className="foundation-card">
            <div className="foundation-card__icon">
              ◐
            </div>

            <h2>
              {t(
                'foundation.themeTitle'
              )}
            </h2>

            <p>
              {t(
                'foundation.themeBody'
              )}
            </p>
          </article>

          <article className="foundation-card foundation-card--wide">
            <div className="foundation-card__copy">
              <div className="foundation-card__icon">
                S
              </div>

              <div>
                <h2>
                  {t(
                    'foundation.brandTitle'
                  )}
                </h2>

                <p>
                  {t(
                    'foundation.brandBody'
                  )}
                </p>
              </div>
            </div>

            <div className="brand-showcase">
              <div className="brand-swatch brand-swatch--light">
                <span>
                  {t(
                    'foundation.brandLight'
                  )}
                </span>

                <BrandLogo
                  variant="full"
                  surface="light"
                  className="brand-swatch__logo"
                />
              </div>

              <div className="brand-swatch brand-swatch--dark">
                <span>
                  {t(
                    'foundation.brandDark'
                  )}
                </span>

                <BrandLogo
                  variant="full"
                  surface="dark"
                  className="brand-swatch__logo"
                />
              </div>
            </div>
          </article>
        </section>

        <section className="next-foundation-card">
          <BrandLogo
            variant="mark"
            surface="auto"
            className="next-foundation-card__logo"
          />

          <div>
            <h2>
              {t(
                'foundation.nextTitle'
              )}
            </h2>

            <p>
              {t(
                'foundation.nextBody'
              )}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
