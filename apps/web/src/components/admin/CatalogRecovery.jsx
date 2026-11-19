import { InlineAlert } from '../ui/InlineAlert';
import { useLanguage } from '../../hooks/useLanguage';

export function CatalogRecovery({ flow, onAccept, onClear, canVerify }) {
  const { t } = useLanguage();
  const journal = flow.journal;
  if (!journal) return null;
  const id = journal.base?.id || journal.draft.id || journal.observedId;
  return <section className="catalog-recovery" aria-label={t('admin.workflows.recovery')}>
    <p role="status">{t(flow.checking ? 'admin.common.loading' : flow.busy ? 'admin.common.saving' : journal.base ? 'admin.workflows.partial' : journal.state === 'uncertain' ? 'admin.workflows.uncertain' : 'admin.workflows.notSaved')}</p>
    {id && <p>{t('admin.workflows.savedIdentity')}: <bdi>{id}</bdi> · {t('admin.workflows.version')}: <bdi>{journal.base?.version ?? journal.draft.version ?? '—'}</bdi></p>}
    {journal.base && <p>{t('admin.workflows.partialHelp')}</p>}
    {journal.error && <InlineAlert title={t('admin.common.operationFailed')} message={journal.error.message} requestId={journal.error.requestId} />}
    {['uncertain', 'conflict'].includes(journal.state) && <p>{t(journal.state === 'uncertain' ? 'admin.workflows.uncertainHelp' : 'admin.workflows.conflictHelp')}</p>}
    {id && !flow.busy && <button type="button" className="admin-secondary-button" onClick={flow.reconcile}>{t('admin.workflows.reconcile')}</button>}
    {journal.readError && <InlineAlert title={t('admin.workflows.readFailed')} message={journal.readError.message} requestId={journal.readError.requestId} />}
    {journal.serverRecord && <div className="catalog-server-record">
      <strong dir="auto">{journal.serverRecord.title || journal.serverRecord.item?.title}</strong>
      <span>{t('admin.workflows.version')}: <bdi>{journal.serverRecord.version}</bdi></span>
      <p>{t('admin.workflows.reviewHelp')}</p>
      <button type="button" className="admin-secondary-button" disabled={flow.busy} onClick={onAccept}>{t('admin.workflows.useServer')}</button>
    </div>}
    {!id && journal.state === 'uncertain' && <button type="button" className="admin-secondary-button" disabled={flow.busy || !canVerify} onClick={onClear}>{t('admin.workflows.verified')}</button>}
    {!journal.base && journal.state === 'failed' && <button type="button" className="admin-secondary-button" disabled={flow.busy} onClick={onClear}>{t('admin.workflows.discardRejected')}</button>}
    {!flow.storageAvailable && <p>{t('admin.workflows.storageUnavailable')}</p>}
  </section>;
}
