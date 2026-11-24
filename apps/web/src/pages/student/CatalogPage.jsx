import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { DiscoveryFilters } from '../../components/discovery/DiscoveryFilters';
import { DiscoveryItemCard } from '../../components/discovery/DiscoveryItemCard';
import { InventoryNotice } from '../../components/discovery/InventoryNotice';
import { InlineAlert } from '../../components/ui/InlineAlert';

import {
  getDiscoveryFacets,
  searchDiscoveryItems
} from '../../features/discovery/discovery-api';

import {
  DISCOVERY_DEFAULTS,
  buildDiscoverySearchParams,
  readDiscoveryFilters
} from '../../features/discovery/discovery-query';
import { getCategoryLabel, getLanguageLabel } from '../../features/discovery/discovery-format';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const EMPTY_FACETS = {
  types: [],
  categories: [],
  deweyClassifications: [],
  languages: [],
  publicationYears: [],
  branches: [],
  sortOptions: []
};

export function CatalogPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(
    () => readDiscoveryFilters(searchParams),
    [searchParams]
  );

  const [queryDraft, setQueryDraft] = useState(filters.q);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [facetsError, setFacetsError] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const view = location.state?.catalogView === 'list' ? 'list' : 'grid';
  const [retryVersion, setRetryVersion] = useState(0);
  const [facetsRetryVersion, setFacetsRetryVersion] = useState(0);
  const searchRef = useRef(null);
  const resultsRef = useRef(null);
  const focusFrameRef = useRef(null);

  useEffect(() => () => window.cancelAnimationFrame(focusFrameRef.current), []);

  const [result, setResult] = useState({
    data: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false
    }
  });

  useEffect(() => {
    setQueryDraft(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const controller = new AbortController();

    getDiscoveryFacets(auth.token, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setFacets(response?.data || EMPTY_FACETS);
        setFacetsError(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setFacetsError(error);
        }
      });

    return () => controller.abort();
  }, [auth.token, facetsRetryVersion]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setSearchError(null);

    searchDiscoveryItems(auth.token, filters, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setSearchError(error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    auth.token,
    filters.q,
    filters.type,
    filters.categoryId,
    filters.deweyClassificationId,
    filters.language,
    filters.publicationYear,
    filters.branchId,
    filters.availableOnly,
    filters.sort,
    filters.page,
    filters.pageSize,
    retryVersion
  ]);

  useEffect(() => {
    if (loading) {
      // Keep fast searches quiet, and clear the previous completion so that an
      // equal result count on a later search can still be announced.
      setAnnouncement('');
      const timer = window.setTimeout(() => {
        setAnnouncement(t('discovery.catalog.loading'));
      }, 300);
      return () => window.clearTimeout(timer);
    }

    // InlineAlert already announces errors; avoid a second announcement here.
    if (searchError) {
      setAnnouncement('');
      return;
    }

    const summary = result.data.length === 0
      ? t('discovery.empty.title')
      : `${result.pagination.total} ${t('discovery.catalog.results')}. `
        + `${t('discovery.pagination.page')} ${result.pagination.page} `
        + `${t('discovery.pagination.of')} ${Math.max(result.pagination.totalPages, 1)}`;

    setAnnouncement(`${t('discovery.catalog.loaded')} ${summary}`);
  }, [loading, searchError, result, t]);

  function apply(next) {
    setSearchParams(buildDiscoverySearchParams(next), { state: { catalogView: view } });
  }

  function setView(mode) {
    // The view belongs to the history entry; API query parameters stay unchanged.
    navigate(location.pathname + location.search, { replace: true, state: { catalogView: mode } });
  }

  function submit(event) {
    event.preventDefault();

    apply({
      ...filters,
      q: queryDraft.trim(),
      page: 1
    });
  }

  function clearFilters() {
    apply({
      ...DISCOVERY_DEFAULTS,
      q: filters.q
    });
  }

  function showResults() {
    // Wait for the disclosure/chip layout to settle before scrolling to its new position.
    window.cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = window.requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }

  const typeLabel = (type) => type === 'ACADEMIC_WORK'
    ? t('catalogRefinement.academicWork') : t(`itemTypes.${type}`);
  // URL filters remain authoritative, including selections whose facet is missing.
  const activeFilters = [
    ['q', filters.q, t('discovery.catalog.search')],
    ['type', filters.type && typeLabel(filters.type), t('discovery.filters.type')],
    ['categoryId', filters.categoryId && getCategoryLabel(
      facets.categories?.find((item) => item.id === filters.categoryId)?.name || filters.categoryId, t
    ), t('discovery.filters.category')],
    ['deweyClassificationId', filters.deweyClassificationId && (
      facets.deweyClassifications?.find((item) => item.id === filters.deweyClassificationId)?.code
      || filters.deweyClassificationId
    ), t('discovery.filters.dewey')],
    ['language', getLanguageLabel(filters.language, t), t('discovery.filters.language')],
    ['publicationYear', filters.publicationYear, t('discovery.filters.year')],
    ['branchId', filters.branchId && (
      facets.branches?.find((item) => item.id === filters.branchId)?.name || filters.branchId
    ), t('discovery.filters.branch')],
    ['availableOnly', filters.availableOnly && t('discovery.filters.availableOnly'), '']
  ].filter(([, value]) => value);

  return (
    <section className="catalog-page catalog-page--discovery">
      <header className="catalog-header">
        <div className="catalog-header__copy">
          <span>{t('discovery.catalog.eyebrow')}</span>
          <h1>{t('discovery.catalog.title')}</h1>
          <p>{t('discovery.catalog.subtitle')}</p>
        </div>
      </header>

      <InventoryNotice />

      <form className="catalog-search" onSubmit={submit}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
        <input
          ref={searchRef}
          type="search"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          placeholder={t('discovery.catalog.searchPlaceholder')}
          aria-label={t('discovery.catalog.searchLabel')}
        />
        <button type="submit">
          {t('discovery.catalog.search')}
        </button>
      </form>

      <div className="catalog-types" role="group" aria-label={t('discovery.filters.type')}>
        {['', 'BOOK', 'PROJECT', 'THESIS', 'ACADEMIC_WORK'].filter((type) => !type || filters.type === type ||
          !facets.types || (facets.types.find((item) => item.value === type)?.count ?? 0) > 0).map((type) => {
          const count = type ? facets.types?.find((item) => item.value === type)?.count
            : facets.types?.reduce((sum, item) => sum + item.count, 0);
          return <button type="button" key={type} aria-pressed={filters.type === type}
            onClick={() => apply({ ...filters, type, page: 1 })}>
            {type ? typeLabel(type) : t('discovery.catalog.allResources')}
            {count !== undefined && <span className="catalog-types__count"> ({count})</span>}
          </button>;
        })}
      </div>

      {facetsError && (
        <div className="catalog-facets-error">
          <InlineAlert
            title={t('discovery.errors.facetsTitle')}
            message={facetsError.message}
            requestId={facetsError.requestId}
          />
          <button type="button" onClick={() => {
            setFacetsRetryVersion((version) => version + 1);
            searchRef.current?.focus();
          }}>
            {t('catalogRefinement.retryFilters')}
          </button>
        </div>
      )}

      {activeFilters.length > 0 && (
        <section className="catalog-active-filters" aria-label={t('catalogRefinement.appliedFilters')}>
          <span>{t('catalogRefinement.appliedFilters')}</span>
          <ul>
            {activeFilters.map(([key, value, label]) => (
              <li key={key}>
                <button type="button"
                  aria-label={`${t('catalogRefinement.removeFilter')}: ${label ? `${label}: ` : ''}${value}`}
                  onClick={() => {
                    apply({ ...filters, [key]: key === 'availableOnly' ? false : '', page: 1 });
                    showResults();
                  }}>
                  <span>{label && <span>{label}: </span>}<bdi>{value}</bdi></span>
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="catalog-layout">
        <DiscoveryFilters
          facets={facets}
          filters={filters}
          onChange={apply}
          onClear={clearFilters}
          onShowResults={showResults}
        />

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        <div className="catalog-results" aria-busy={loading}>
          <div className="catalog-toolbar">
            <div>
              <h2 ref={resultsRef} tabIndex={-1} id="catalog-results">
                {loading
                  ? t('discovery.catalog.loading')
                  : searchError ? t('catalogRefinement.resultsUnavailable')
                  : `${result.pagination.total} ${t('discovery.catalog.results')}`}
              </h2>

              {filters.q && (
                <span dir="auto">
                  {t('discovery.catalog.for')} “{filters.q}”
                </span>
              )}
            </div>

            <div className="catalog-toolbar__controls">
              <label>
                <span>{t('discovery.catalog.sort')}</span>
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    apply({
                      ...filters,
                      sort: event.target.value,
                      page: 1
                    })
                  }
                >
                  {[
                    'TITLE_ASC',
                    'TITLE_DESC',
                    'YEAR_DESC',
                    'YEAR_ASC',
                    'NEWEST'
                  ].map((value) => (
                    <option key={value} value={value}>
                      {t(`discovery.sort.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="catalog-view" role="group" aria-label={t('discovery.catalog.view')}>
                {['grid', 'list'].map((mode) => (
                  <button type="button" key={mode} aria-pressed={view === mode}
                    aria-label={t(`discovery.catalog.${mode}`)} onClick={() => setView(mode)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      {mode === 'grid' ? <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /> : <path d="M4 5h4v4H4zM11 6h9M4 15h4v4H4zM11 16h9" />}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {searchError ? (
            <div className="catalog-error">
              <InlineAlert
                title={t('discovery.errors.searchTitle')}
                message={searchError.message}
                requestId={searchError.requestId}
              />
              <button type="button" onClick={() => {
                setRetryVersion((version) => version + 1);
                searchRef.current?.focus();
              }}>
                {t('discovery.catalog.retry')}
              </button>
            </div>
          ) : loading ? (
            <div className="catalog-state">
              <span className="catalog-spinner" aria-hidden="true" />
              <p>{t('discovery.catalog.loading')}</p>
            </div>
          ) : result.data.length === 0 ? (
            <div className="catalog-state">
              <h2>{t('discovery.empty.title')}</h2>
              <p>{t('discovery.empty.body')}</p>
              <button type="button" onClick={clearFilters}>
                {t('discovery.filters.clear')}
              </button>
            </div>
          ) : (
            <>
              <div className={`catalog-grid${view === 'list' ? ' catalog-grid--list' : ''}`}>
                {result.data.map((item) => (
                  <DiscoveryItemCard key={item.id} item={item}
                    catalogReturn={{ to: location.pathname + location.search, view }} />
                ))}
              </div>

              <nav
                className="catalog-pagination"
                aria-label={t('discovery.pagination.label')}
              >
                <button
                  type="button"
                  disabled={!result.pagination.hasPreviousPage}
                  onClick={() => {
                    apply({
                      ...filters,
                      page: filters.page - 1
                    });
                    showResults();
                  }}
                >
                  <span className="catalog-pagination__arrow" aria-hidden="true">←</span> {t('discovery.pagination.previous')}
                </button>

                <span>
                  {t('discovery.pagination.page')}{' '}
                  <strong>{result.pagination.page}</strong>
                  {' '}{t('discovery.pagination.of')}{' '}
                  <strong>{Math.max(result.pagination.totalPages, 1)}</strong>
                </span>

                <button
                  type="button"
                  disabled={!result.pagination.hasNextPage}
                  onClick={() => {
                    apply({
                      ...filters,
                      page: filters.page + 1
                    });
                    showResults();
                  }}
                >
                  {t('discovery.pagination.next')} <span className="catalog-pagination__arrow" aria-hidden="true">→</span>
                </button>
              </nav>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
