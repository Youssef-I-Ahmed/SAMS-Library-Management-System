import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { API_URL } from '../../lib/api';
import { AI_ASSISTANT_ENABLED } from '../../features/ai/ai-config.js';
import { createAiClient } from '../../features/ai/ai-client.js';
import { createAiController, spiritState } from '../../features/ai/ai-controller.js';
import { getAiConversation } from '../../features/ai/ai-session.js';
import { KnowledgeSpirit } from '../../components/ai/KnowledgeSpirit';
import { AiBookRecords } from '../../components/ai/AiBookRecords';
import '../../styles/student-ai.css';

export function StudentAiPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const controller = useMemo(() => getAiConversation(auth.user.id, auth.token, () => createAiController({
    enabled: AI_ASSISTANT_ENABLED,
    client: createAiClient({ baseUrl: API_URL, token: auth.token, enabled: AI_ASSISTANT_ENABLED, onUnauthorized: auth.logout })
  })), [auth.user.id, auth.token, auth.logout]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [draft, setDraft] = useState('');
  const [clock, setClock] = useState(Date.now());
  const composer = useRef(null), heading = useRef(null);
  useEffect(() => {
    controller.activate(); heading.current?.focus({ preventScroll: true });
    return () => controller.deactivate();
  }, [controller]);
  useEffect(() => {
    if (!state.retryAt) return undefined;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const count = [...draft].length;
  const retrySeconds = Math.max(0, Math.ceil(((state.retryAt || 0) - clock) / 1000));
  const number = (n) => new Intl.NumberFormat(language).format(n);
  const canSend = !state.blocked && !retrySeconds && ['idle', 'done', 'help', 'refusal', 'fallback', 'failed', 'throttled'].includes(state.phase) && state.errorStatus !== 403;
  const resetEnabled = !!state.sessionId && !state.blocked && !state.jobId && !retrySeconds && !['submitting', 'resetting', 'checking'].includes(state.phase);
  function submit(event) {
    event.preventDefault();
    if (!canSend || !draft.trim() || count > 500) return;
    controller.send(draft); setDraft('');
    composer.current?.focus();
  }
  async function reset() { if (await controller.reset()) { setDraft(''); composer.current?.focus(); } }
  const phaseKey = state.phase === 'still-working' ? 'stillWorking' : state.phase;
  return <section className="student-ai" data-ai-state={state.phase}>
    <header className="ai-page-heading">
      <div><h1 ref={heading} tabIndex={-1}>{t('ai.title')}</h1><p>{t('ai.subtitle')}</p></div>
      <button type="button" className="ai-button ai-button--quiet" onClick={reset} disabled={!resetEnabled} aria-describedby={state.blocked ? 'ai-reset-hint' : undefined}>{t('ai.newConversation')}</button>
    </header>
    <div className="ai-workspace">
      <div className="ai-conversation">
        <div className="ai-status" role="status" aria-live="polite" aria-atomic="true">{t(`ai.${phaseKey}`)}</div>
        {state.errorStatus && <p className="ai-error">{t(`ai.error${[400, 401, 403, 404, 409, 429, 502, 503, 504].includes(state.errorStatus) ? state.errorStatus : 502}`)}</p>}
        {state.phase === 'throttled' && <p className="ai-secondary" aria-live="off">{state.retryAt && state.retryKnown
          ? t('ai.wait').replace('{seconds}', number(retrySeconds)) : t('ai.waitUnknown')}</p>}
        {(state.phase === 'unavailable' || state.phase === 'failed' && !state.blocked && !state.sessionId) &&
          <button type="button" className="ai-button ai-button--quiet" onClick={controller.check}>{t('ai.check')}</button>}
        {state.jobId && <div className="ai-actions">
          {state.phase === 'pending' ? <button type="button" className="ai-button ai-button--quiet" onClick={controller.stop}>{t('ai.stop')}</button>
            : <button type="button" className="ai-button ai-button--quiet" disabled={!!retrySeconds} onClick={controller.resume}>{t('ai.resume')}</button>}
        </div>}
        {!state.turns.length && <div className="ai-empty"><h2>{t('ai.startTitle')}</h2><p>{t('ai.startBody')}</p></div>}
        {state.turns.map((turn, index) => <article className="ai-turn" key={index}>
          <p className="ai-question"><span>{t('ai.yourQuestion')}</span><bdi>{turn.question}</bdi></p>
          {turn.result && <div className="ai-reply">
            <h2>{t('ai.reply')}</h2>
            {turn.result.notice && <p className="ai-notice" dir="auto">{turn.result.notice}</p>}
            <p className="ai-answer" dir="auto">{turn.result.answer}</p>
            {turn.result.hint && <p dir="auto">{turn.result.hint}</p>}
            {turn.result.coverage_note && <p className="ai-secondary" dir="auto">{turn.result.coverage_note}</p>}
            <AiBookRecords books={turn.result.sources} title={t('ai.sources')} />
            {turn.result.all_books && <details className="ai-all-books"><summary>{t(turn.result.all_books.complete ? 'ai.allMatches' : 'ai.moreMatches')}</summary>
              <AiBookRecords books={turn.result.all_books.items} title={t(turn.result.all_books.complete ? 'ai.allMatches' : 'ai.moreMatches')} />
            </details>}
          </div>}
        </article>)}
        {state.preview?.books.length > 0 && <AiBookRecords key={state.jobId} books={state.preview.books} title={t('ai.previewLabel')} preview />}
        <form className="ai-composer" onSubmit={submit}>
          <label htmlFor="ai-question">{t('ai.composer')}</label>
          <textarea id="ai-question" ref={composer} value={draft} rows={3} maxLength={1000} dir="auto" readOnly={state.phase === 'resetting'}
            placeholder={t('ai.placeholder')} onChange={(event) => setDraft(event.target.value)} aria-invalid={count > 500}
            aria-describedby={`ai-keyboard ai-count${count > 500 ? ' ai-question-error' : ''}`}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
          {count > 500 && <p id="ai-question-error" className="ai-error">{t('ai.tooLong')}</p>}
          <div className="ai-composer__footer"><div><small id="ai-keyboard">{t('ai.keyboard')}</small><small id="ai-count">{t('ai.count').replace('{count}', number(count))}</small></div>
            <button className="ai-button" type="submit" disabled={!canSend || !draft.trim() || count > 500}>{t('ai.send')} <span aria-hidden="true">↗</span></button></div>
        </form>
        {state.blocked && <p id="ai-reset-hint" className="ai-secondary">{t('ai.resetHint')}</p>}
        <p className="ai-memory">{t('ai.memory')}</p>
      </div>
      <aside className="ai-companion" aria-labelledby="ai-spirit-title">
        <KnowledgeSpirit state={spiritState(state)} />
        <h2 id="ai-spirit-title">{t('ai.spirit')}</h2><p>{t('ai.spiritIntro')}</p>
        <div className="ai-suggestions"><h3>{t('ai.suggestions')}</h3>
          {['sampleTopic', 'sampleAuthor', 'sampleHelp'].map((key) => <button type="button" key={key} disabled={state.blocked || state.phase === 'resetting'}
            onClick={() => { setDraft(t(`ai.${key}`)); composer.current?.focus(); }}>{t(`ai.${key}`)} <span aria-hidden="true">↗</span></button>)}
        </div>
        <p className="ai-scope">{t('ai.scope')}</p><Link to="/student/catalog">{t('ai.catalogue')}</Link>
      </aside>
    </div>
  </section>;
}
