import { InlineAlert } from '../ui/InlineAlert';
import { useLanguage } from '../../hooks/useLanguage';

export function StaffReadState({ read, limit }) {
  const { t } = useLanguage();
  return <div className="staff-read-state">
    <p role="status">{read.loading ? t('staff.ux.loading') : read.error ? t('staff.ux.unavailable') : read.result ? t('staff.ux.loaded') : ''}</p>
    {read.error && <>
      <InlineAlert title={t('staff.ux.readFailed')} message={read.error.message} requestId={read.error.requestId} />
      {read.result && <p>{t('staff.ux.stale')}</p>}
    </>}
    <button type="button" className="staff-secondary-action" disabled={read.loading} onClick={(event) => {
      const target = event.currentTarget.closest('[role="dialog"]') || document.querySelector('.staff-circulation h1');
      target?.focus({ preventScroll: true }); read.reload();
    }}>{t(read.error ? 'staff.ux.retry' : 'staff.ux.refresh')}</button>
    {limit && read.result && !read.error && <small>{t('staff.ux.scope').replace('{count}', read.result.data.length).replace('{limit}', limit)}</small>}
  </div>;
}

export function StaffMutationFeedback({ action, canVerify = false }) {
  const { t } = useLanguage();
  return <div className="staff-mutation-feedback">
    <p role="status">{action.pending ? t('staff.ux.pending') : ''}</p>
    {action.error && <InlineAlert title={t('staff.common.operationFailed')} message={action.error.message} requestId={action.error.requestId} />}
    {action.uncertain && <div className="staff-uncertain">
      <p>{t('staff.ux.uncertain')}</p>
      <button type="button" className="staff-secondary-action" disabled={!canVerify} onClick={action.acknowledge}>{t('staff.ux.verified')}</button>
    </div>}
  </div>;
}
