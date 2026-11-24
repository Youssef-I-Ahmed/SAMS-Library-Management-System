import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { suggestCluster, suggestSubject } from '../../features/admin/admin-api';

const percent = (value) => `${Math.round(Number(value) * 100)}%`;

/**
 * Cataloguing helper: asks the subject classifier and the book-clustering model
 * (through the API) for suggestions on the current title. Nothing is saved;
 * the librarian decides. A matching subject can be selected with one click.
 */
export function AiCatalogSuggestions({ token, title, subjects, onSelectSubject }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ phase: 'idle' });
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { setState({ phase: 'idle' }); }, [title]);

  async function run() {
    const text = title.trim();
    if (!text) { setState({ phase: 'error', message: t('admin.aiSuggest.needTitle') }); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ phase: 'loading' });
    const [subject, cluster] = await Promise.allSettled([
      suggestSubject(token, text, controller.signal), suggestCluster(token, text, controller.signal)
    ]);
    if (controller.signal.aborted) return;
    const value = (result) => (result.status === 'fulfilled' ? result.value?.data : null);
    const data = { subject: value(subject), cluster: value(cluster)?.cluster ? value(cluster) : null };
    setState(data.subject || data.cluster ? { phase: 'done', ...data }
      : { phase: 'error', message: t('admin.aiSuggest.unavailable') });
  }

  const match = state.subject && subjects?.find(({ name }) => name.trim() === String(state.subject.subject).trim());
  return <div className="admin-form-grid__wide ai-catalog-suggest" aria-live="polite">
    <button type="button" className="admin-secondary-button" onClick={run} disabled={state.phase === 'loading'}>
      {t(state.phase === 'loading' ? 'admin.aiSuggest.loading' : 'admin.aiSuggest.button')}
    </button>
    {state.phase === 'error' && <p className="ai-catalog-suggest__note">{state.message}</p>}
    {state.phase === 'done' && <dl className="ai-catalog-suggest__result">
      {state.subject && <div><dt>{t('admin.aiSuggest.subject')}</dt>
        <dd dir="auto">{state.subject.subject} <small>({t('admin.aiSuggest.confidence')} {percent(state.subject.confidence)})</small>
          {match && onSelectSubject && <button type="button" className="admin-secondary-button" onClick={() => onSelectSubject(match.id)}>{t('admin.aiSuggest.select')}</button>}
        </dd></div>}
      {state.cluster && <div><dt>{t('admin.aiSuggest.cluster')}</dt>
        <dd dir="auto">{state.cluster.cluster_label || state.cluster.cluster}</dd></div>}
      <p className="ai-catalog-suggest__note">{t('admin.aiSuggest.hint')}</p>
    </dl>}
  </div>;
}
