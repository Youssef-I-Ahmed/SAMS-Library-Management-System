import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { DiscoveryFilters } from '../../components/discovery/DiscoveryFilters';
import { DiscoveryItemCard } from '../../components/discovery/DiscoveryItemCard';
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
        setFacets(response?.data || EMPTY_FACETS);
        setFacetsError(null);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setFacetsError(error);
        }
      });

    return () => controller.abort();
  }, [auth.token]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setSearchError(null);

    searchDiscoveryItems(auth.token, filters, controller.signal)
      .then((response) => setResult(response))
      .catch((error) => {
        if (error.name !== 'AbortError') {
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
    filters.pageSize
  ]);

  function apply(next) {
    setSearchParams(buildDiscoverySearchParams(next));
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

  return (
    <section className="catalog-page">
      <header className="catalog-header">
        <span>{t('discovery.catalog.eyebrow')}</span>
        <h1>{t('discovery.catalog.title')}</h1>
        <p>{t('discovery.catalog.subtitle')}</p>
      </header>

      <form className="catalog-search" onSubmit={submit}>
        <input
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

      {facetsError && (
        <InlineAlert
          title={t('discovery.errors.facetsTitle')}
          message={facetsError.message}
          requestId={facetsError.requestId}
        />
      )}

      <div className="catalog-layout">
        <DiscoveryFilters
          facets={facets}
          filters={filters}
          onChange={apply}
          onClear={clearFilters}
        />

        <div className="catalog-results">
          <div className="catalog-toolbar">
            <div>
              <strong>
                {loading
                  ? t('discovery.catalog.loading')
                  : `${result.pagination.total} ${t('discovery.catalog.results')}`}
              </strong>

              {filters.q && (
                <span dir="auto">
                  {t('discovery.catalog.for')} “{filters.q}”
                </span>
              )}
            </div>

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
          </div>

          {searchError ? (
            <InlineAlert
              title={t('discovery.errors.searchTitle')}
              message={searchError.message}
              requestId={searchError.requestId}
            />
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
              <div className="catalog-grid">
                {result.data.map((item) => (
                  <DiscoveryItemCard key={item.id} item={item} />
                ))}
              </div>

              <nav
                className="catalog-pagination"
                aria-label={t('discovery.pagination.label')}
              >
                <button
                  type="button"
                  disabled={!result.pagination.hasPreviousPage}
                  onClick={() =>
                    apply({
                      ...filters,
                      page: filters.page - 1
                    })
                  }
                >
                  ← {t('discovery.pagination.previous')}
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
                  onClick={() =>
                    apply({
                      ...filters,
                      page: filters.page + 1
                    })
                  }
                >
                  {t('discovery.pagination.next')} →
                </button>
              </nav>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
