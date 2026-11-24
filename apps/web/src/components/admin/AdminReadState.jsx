import { InlineAlert } from '../ui/InlineAlert';
import { useLanguage } from '../../hooks/useLanguage';

export function AdminReadState({ read, label, compact = false, hintId }) {
  const { t } = useLanguage();
  return <div className="admin-read-state">
    <p role="status" className={read.loading || read.error ? undefined : 'sr-only'}>{label && `${label}: `}{read.loading ? t('admin.common.loading') : read.error ? t('admin.workflows.unavailable') : t('admin.workflows.loaded')}</p>
    {read.error && <><InlineAlert title={t('admin.workflows.readFailed')} message={read.error.message} requestId={read.error.requestId} />
      {read.result && <p>{t('admin.workflows.stale')}</p>}</>}
    {(!compact || read.error) && <button type="button" className="admin-secondary-button" disabled={read.loading} onClick={(event) => {
      const target = event.currentTarget.closest('[role="dialog"]') || document.querySelector('.admin-operations h1');
      target?.focus({ preventScroll: true }); read.reload();
    }}>{t(read.error ? 'admin.workflows.retry' : 'admin.workflows.refresh')}</button>}
    {!compact && read.result && !read.error && !read.loading && Number.isFinite(read.result.pagination?.total) && <span>{t('admin.workflows.total')}: <bdi>{read.result.pagination.total}</bdi></span>}
    {hintId && Boolean(read.result?.data.length) && <small id={hintId} className="admin-table-hint">{t('admin.workflows.tableHint')}</small>}
  </div>;
}

export function AdminPagination({ read, onPage, disabled = false }) {
  const { t } = useLanguage();
  const pagination = read.result?.pagination;
  if (read.loading || read.error || !pagination || !Number.isFinite(pagination.totalPages)) return null;
  return <nav className="admin-pagination" aria-label={t('admin.workflows.pagination')}>
    <button type="button" disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>{t('discovery.pagination.previous')}</button>
    <span>{t('discovery.pagination.page')} <bdi>{pagination.page}</bdi> {t('discovery.pagination.of')} <bdi>{Math.max(1, pagination.totalPages)}</bdi></span>
    <button type="button" disabled={disabled || pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>{t('discovery.pagination.next')}</button>
  </nav>;
}
