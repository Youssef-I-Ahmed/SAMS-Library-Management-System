import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BrandLogo } from '../../components/brand/BrandLogo';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

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
        <div className="student-home__copy">
          <span className="student-home__eyebrow">
            {t('studentHome.eyebrow')}
          </span>

          <h1>
            {t('studentHome.greeting')}{' '}
            <span>{auth.user?.displayName?.split(' ')[0]}</span>
          </h1>

          <p>{t('studentHome.subtitle')}</p>

          <form className="student-search" onSubmit={submit}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('studentHome.searchPlaceholder')}
              aria-label={t('studentHome.searchLabel')}
            />

            <button type="submit">
              {t('studentHome.search')}
            </button>
          </form>

          <small className="student-search__hint">
            {t('studentHome.searchHint')}
          </small>
        </div>

        <BrandLogo
          variant="mark"
          surface="dark"
          alt=""
          className="student-home__logo"
        />
      </div>

      <div className="student-home__heading">
        <span>{t('studentHome.browseEyebrow')}</span>
        <h2>{t('studentHome.browseTitle')}</h2>
      </div>

      <div className="collection-grid">
        {['BOOK', 'THESIS', 'PROJECT'].map((type, index) => (
          <button
            key={type}
            type="button"
            className="collection-card"
            onClick={() => navigate(`/student/catalog?type=${type}`)}
          >
            <small>0{index + 1}</small>
            <strong>{t(`itemTypes.${type}`)}</strong>
            <span>{t(`studentHome.collection.${type}`)}</span>
            <b aria-hidden="true">→</b>
          </button>
        ))}
      </div>
    </section>
  );
}
