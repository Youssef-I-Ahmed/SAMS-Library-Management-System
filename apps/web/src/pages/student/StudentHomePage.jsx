import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { BrandLogo } from '../../components/brand/BrandLogo';
import { InventoryNotice } from '../../components/discovery/InventoryNotice';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

function HomeIcon({ type }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    BOOK: <><path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16" /></>,
    THESIS: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" /></>,
    ACADEMIC_WORK: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" /></>,
    PROJECT: <><path d="m3 8 9-5 9 5-9 5zM6 10v7l6 4 6-4v-7M21 8v8" /></>,
    reservations: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16m-12 5 3 2 5-4" /></>,
    borrowings: <><path d="M4 4h6v17H4zM10 7h5v14h-5zM16 5l4-1 4 16-4 1z" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[type]}</svg>;
}

export function StudentHomePage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function submit(event) {
    event.preventDefault();
    const trimmed = query.trim();

    navigate(
      trimmed
        ? `/student/catalog?q=${encodeURIComponent(trimmed)}`
        : '/student/catalog'
    );
  }

  return (
    <section className="student-home">
      <div className="student-home__hero">
        <figure className="student-home__media">
          <img
            src="/images/campus/living-library-concept-1600.webp"
            srcSet="/images/campus/living-library-concept-960.webp 960w, /images/campus/living-library-concept-1600.webp 1600w"
            sizes="100vw"
            width={1600}
            height={900}
            alt=""
            fetchpriority="high"
          />
          <figcaption>{t('studentHome.imageCaption')}</figcaption>
        </figure>
        <div className="home-container student-home__hero-inner">
          <div className="student-home__copy">
            <span className="student-home__eyebrow">{t('common.academy')}</span>
            <h1>
              <span>{t('studentHome.titleLead')}</span>
              <span>{t('studentHome.titleLine')} <em>{t('studentHome.titleAccent')}</em></span>
            </h1>
            <p>{t('studentHome.subtitle')}</p>
            <form className="student-search" onSubmit={submit} role="search">
              <HomeIcon type="search" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('studentHome.searchPlaceholder')}
                aria-label={t('studentHome.searchLabel')}
              />
              <button type="submit">{t('studentHome.search')} <span aria-hidden="true">↗</span></button>
            </form>
            <Link className="student-home__browse" to="/student/catalog">
              {t('studentHome.browseAll')} <span aria-hidden="true">→</span>
            </Link>
            <nav className="student-home__chips" aria-label={t('studentHome.collectionNavigation')}>
              {['BOOK', 'ACADEMIC_WORK'].map((type) => (
                <Link key={type} to={`/student/catalog?type=${type}`}>
                  <HomeIcon type={type} />{t(`itemTypes.${type}`)}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <section className="home-container student-home__collections" aria-labelledby="home-collections-title">
        <div className="student-home__heading">
          <div>
            <span>{t('studentHome.browseEyebrow')}</span>
            <h2 id="home-collections-title">{t('studentHome.browseTitle')}</h2>
          </div>
          <p>{t('studentHome.greeting')}, <bdi>{auth.user?.displayName?.split(' ')[0]}</bdi>.</p>
        </div>
        <div className="collection-grid">
          {['BOOK', 'ACADEMIC_WORK'].map((type, index) => (
            <Link key={type} className="collection-card" to={`/student/catalog?type=${type}`}>
              <div className="collection-card__top">
                <HomeIcon type={type} /><small aria-hidden="true">0{index + 1}</small>
              </div>
              <h3>{t(`studentHome.collectionTitles.${type}`)}</h3>
              <p>{t(`studentHome.collection.${type}`)}</p>
              <span className="collection-card__action">{t('studentHome.explore')} <b aria-hidden="true">→</b></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-container student-home__experience" aria-labelledby="home-experience-title">
        <div className="student-home__heading">
          <div>
            <span>{t('studentHome.experienceEyebrow')}</span>
            <h2 id="home-experience-title">{t('studentHome.experienceTitle')}</h2>
          </div>
        </div>
        <div className="student-home__steps">
          {[
            ['search', '/student/catalog', 'discover'],
            ['reservations', '/student/reservations', 'reserve'],
            ['borrowings', '/student/borrowings', 'learn']
          ].map(([icon, to, key]) => (
            <Link key={key} to={to}>
              <span className="student-home__step-icon"><HomeIcon type={icon} /></span>
              <div><h3>{t(`studentHome.steps.${key}.title`)}</h3><p>{t(`studentHome.steps.${key}.body`)}</p></div>
              <span className="home-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
        <InventoryNotice />
      </section>

      <footer className="student-home__footer">
        <div className="home-container">
          <div className="student-home__footer-brand">
            <BrandLogo variant="mark" surface="dark" alt="" width={48} height={48} />
            <div><strong>SAMS</strong><span>{t('common.academy')}</span></div>
          </div>
          <p>{t('studentHome.footerLine')}</p>
          <Link to="/student/catalog">{t('studentHome.browseAll')} <span aria-hidden="true">→</span></Link>
        </div>
      </footer>
    </section>
  );
}
