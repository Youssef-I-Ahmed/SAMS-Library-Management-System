import { InlineAlert } from '../ui/InlineAlert';
import { useLanguage } from '../../hooks/useLanguage';

export function CirculationListState({ read, loadingText, emptyTitle, emptyBody, errorTitle, totalLabel, headingRef, children }) {
  const { t } = useLanguage();
  const hasRecords = Boolean(read.result?.data.length);
  return (
    <>
      <div className="sr-only circulation-list-status" role="status" aria-live="polite" aria-atomic="true">
        {read.loading ? loadingText : read.error ? '' : read.result ? `${read.result.pagination.total} ${totalLabel}` : ''}
      </div>
      <section className="circulation-results" aria-busy={read.loading}>
        {read.error && <div className="circulation-read-error">
          <InlineAlert title={errorTitle} message={read.error.message} requestId={read.error.requestId} />
          <button type="button" className="circulation-secondary-button" onClick={() => {
            read.reload();
            headingRef.current?.focus();
          }}>{t('discovery.catalog.retry')}</button>
          {hasRecords && <p>{t('circulationUx.stale')}</p>}
        </div>}
        {read.loading && !hasRecords && <div className="catalog-state">
          <span className="catalog-spinner" aria-hidden="true" /><p>{loadingText}</p>
        </div>}
        {!read.loading && !read.error && read.result && !hasRecords && <div className="catalog-state">
          <h2>{emptyTitle}</h2><p>{emptyBody}</p>
        </div>}
        {hasRecords && children}
      </section>
    </>
  );
}

export function CirculationPagination({ page, totalPages, disabled, onChange }) {
  const { t } = useLanguage();
  return (
    <nav className="catalog-pagination" aria-label={t('circulationUx.pagination')}>
      <button type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
        <span className="circulation-pagination-arrow" aria-hidden="true">←</span> {t('discovery.pagination.previous')}
      </button>
      <span>{t('discovery.pagination.page')} <strong>{page}</strong> {t('discovery.pagination.of')} <strong>{totalPages}</strong></span>
      <button type="button" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
        {t('discovery.pagination.next')} <span className="circulation-pagination-arrow" aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
