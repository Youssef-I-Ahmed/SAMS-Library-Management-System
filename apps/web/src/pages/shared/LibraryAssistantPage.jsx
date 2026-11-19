import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { API_URL } from '../../lib/api';
import { AI_ASSISTANT_ENABLED } from '../../features/ai/ai-config.js';
import { createAiClient } from '../../features/ai/ai-client.js';
import { createAiController, spiritState } from '../../features/ai/ai-controller.js';
import { getAiConversation } from '../../features/ai/ai-session.js';
import { KnowledgeSpiritCompanion } from '../../components/ai/KnowledgeSpiritCompanion';
import { AiBookRecords } from '../../components/ai/AiBookRecords';
import { AiResearchRecords } from '../../components/ai/AiResearchRecords';
import '../../styles/student-ai.css';

function CopyAnswer({ text }) {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('copied');
    } catch {
      setFeedback('copyFailed');
    }
  }
  return <div className="ai-reply-actions">
    <button type="button" className="ai-text-button" onClick={copy}>{t('ai.copy')}</button>
    <span role="status">{feedback && t(`ai.${feedback}`)}</span>
  </div>;
}

export function LibraryAssistantPage({ itemDetailsBase, catalogueTo }) {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const client = useMemo(() => createAiClient({ baseUrl: API_URL, token: auth.token,
    enabled: AI_ASSISTANT_ENABLED, onUnauthorized: auth.logout }), [auth.token, auth.logout]);
  const controller = useMemo(() => getAiConversation(auth.user.id, auth.token, () => createAiController({
    enabled: AI_ASSISTANT_ENABLED, client
  })), [auth.user.id, auth.token, client]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState('books');
  const [researchTurns, setResearchTurns] = useState([]);
  const [greeting, setGreeting] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [companionOpen, setCompanionOpen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [hasUpdates, setHasUpdates] = useState(false);
  const composer = useRef(null), heading = useRef(null);
  const page = useRef(null), transcript = useRef(null), messages = useRef(null);
  const followLatest = useRef(true);
  const researchRequest = useRef(null);
  // Let the real shells allocate header/navigation space. VisualViewport also
  // handles keyboards that resize only the visual viewport (e.g. iOS Safari).
  useEffect(() => {
    const shell = page.current.closest('.student-shell, .staff-shell');
    const viewport = window.visualViewport;
    const resize = () => shell.style.setProperty('--ai-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    const wide = window.matchMedia('(min-width: 1100px)');
    const change = (event) => setCompanionOpen(event.matches);
    wide.addEventListener('change', change);
    return () => {
      shell.style.removeProperty('--ai-viewport-height');
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
      wide.removeEventListener('change', change);
    };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const element = transcript.current;
      if (!element) return; // A queued resize may arrive during route unmount.
      // The welcome screen starts at the top when a companion/keyboard resizes
      // the reading area. Only an actual conversation follows its latest reply.
      if (followLatest.current) element.scrollTop = messages.current?.querySelector('.ai-empty') ? 0 : element.scrollHeight;
    });
    observer.observe(messages.current);
    observer.observe(transcript.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!followLatest.current && (state.turns.length || researchTurns.length)) setHasUpdates(true);
  }, [state.turns, state.preview, researchTurns]);
  useEffect(() => {
    const element = composer.current;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== element.clientWidth) {
        width = element.clientWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [draft, language]);
  useEffect(() => {
    controller.activate(); heading.current?.focus({ preventScroll: true });
    return () => controller.deactivate();
  }, [controller]);
  useEffect(() => {
    const timer = setTimeout(() => setGreeting(false), 1400);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    setResearchTurns([]);
    return () => {
      researchRequest.current?.abort();
      researchRequest.current = null;
    };
  }, [client]);
  useEffect(() => {
    if (!state.retryAt) return undefined;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const count = [...draft].length;
  const retrySeconds = Math.max(0, Math.ceil(((state.retryAt || 0) - clock) / 1000));
  const number = (n) => new Intl.NumberFormat(language).format(n);
  const showBooks = scope !== 'research';
  const showResearch = scope !== 'books';
  const suggestions = scope === 'research' ? ['sampleResearch'] :
    scope === 'all' ? ['sampleResearch', 'sampleTopic'] : ['sampleTopic', 'sampleAuthor', 'sampleHelp'];
  const lastResearch = researchTurns.at(-1);
  const researchPhase = lastResearch?.phase ?? 'idle';
  const bookCanSend = !state.blocked && !retrySeconds && ['idle', 'done', 'help', 'refusal', 'fallback', 'failed', 'throttled'].includes(state.phase) && state.errorStatus !== 403;
  const canSend = (!showResearch || researchPhase !== 'searching') &&
    (showResearch || bookCanSend) && (scope !== 'all' || bookCanSend);
  const resetEnabled = !!state.sessionId && !state.blocked && !state.jobId && !retrySeconds && !['submitting', 'resetting', 'checking'].includes(state.phase);
  const resetWaitsForRequest = showBooks && state.blocked;
  async function searchResearch(question) {
    if (researchRequest.current) return;
    const abort = new AbortController();
    researchRequest.current = abort;
    setResearchTurns((turns) => [...turns, { question, phase: 'searching' }].slice(-4));
    function complete(result) {
      if (!abort.signal.aborted) setResearchTurns((turns) =>
        [...turns.slice(0, -1), { question, ...result }]);
    }
    try {
      const result = await client.research(question, abort.signal);
      complete({ phase: result.status, records: result.results });
    } catch (error) {
      complete({ phase: 'error', throttled: error.status === 429 });
    } finally {
      if (researchRequest.current === abort) researchRequest.current = null;
    }
  }
  function submit(event) {
    event.preventDefault();
    if (!canSend || !draft.trim() || count > 500) return;
    followLatest.current = true;
    setHasUpdates(false);
    if (showResearch) void searchResearch(draft);
    if (showBooks && bookCanSend) void controller.send(draft);
    setGreeting(false);
    setDraft('');
    composer.current?.focus({ preventScroll: true });
  }
  async function reset() {
    if (showBooks && resetEnabled && !await controller.reset()) return;
    if (showResearch) setResearchTurns([]);
    followLatest.current = true;
    setHasUpdates(false);
    setDraft('');
    composer.current?.focus();
  }
  const phaseKey = state.phase === 'still-working' ? 'stillWorking' : state.phase;
  const bookSpirit = spiritState(state);
  const bookStatusKey = ['done', 'fallback'].includes(state.phase) && bookSpirit === 'no-results' ? 'noResults' : phaseKey;
  const scopeSpirit = scope === 'all'
    ? ['searching', 'thinking', 'error', 'success', 'no-results'].find((phase) =>
      phase === bookSpirit || phase === researchPhase) ?? 'idle'
    : showResearch ? researchPhase : bookSpirit;
  const avatar = greeting && scopeSpirit === 'idle' ? 'greeting' : scopeSpirit;
  const empty = !(showBooks && state.turns.length) && !(showResearch && researchTurns.length);
  function latest() {
    followLatest.current = true;
    setHasUpdates(false);
    transcript.current.scrollTop = transcript.current.scrollHeight;
  }
  return <section ref={page} className="student-ai" data-ai-state={state.phase} aria-labelledby="ai-title">
    <header className="ai-page-heading">
      <div><h1 id="ai-title" ref={heading} tabIndex={-1}>{t('ai.title')}</h1><p>{t('ai.subtitle')}</p></div>
      <div className="ai-heading-actions">
        <button type="button" className="ai-button ai-button--quiet" onClick={reset}
          disabled={showResearch && researchPhase === 'searching' || !((showBooks && resetEnabled) || (showResearch && researchTurns.length))}
          aria-label={t('ai.newConversation')} aria-describedby={resetWaitsForRequest ? 'ai-reset-hint' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 5H5v14h14v-7M11 13l1-4 7-7 3 3-7 7-4 1Z" /></svg>
          <span className="ai-action-label--full">{t('ai.newConversation')}</span><span className="ai-action-label--short">{t('ai.newShort')}</span>
        </button>
        {resetWaitsForRequest && <span id="ai-reset-hint" className="ai-visually-hidden">{t('ai.resetHint')}</span>}
        <button type="button" className="ai-button ai-button--quiet ai-guide-toggle" aria-expanded={companionOpen}
          aria-label={t('ai.guide')} aria-controls="ai-companion" onClick={() => setCompanionOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M17.5 8h1M17.5 12h1" /></svg>
          <span>{t('ai.guide')}</span>
        </button>
      </div>
    </header>
    <div className={`ai-workspace${companionOpen ? ' ai-workspace--companion' : ''}`}>
      <div className="ai-conversation">
        <div className="ai-workspace-toolbar">
          <div className="ai-scope-field">
            <label htmlFor="ai-scope">{t('ai.scopeLabel')}</label>
            <select id="ai-scope" value={scope} onChange={(event) => { followLatest.current = true; setHasUpdates(false); setScope(event.target.value); }}>
              <option value="books">{t('ai.scopeBooks')}</option>
              <option value="research">{t('ai.scopeResearch')}</option>
              <option value="all">{t('ai.scopeAll')}</option>
            </select>
          </div>
        </div>
        <div className="ai-transcript" ref={transcript} role="region" tabIndex={0} aria-label={t('ai.conversation')}
          onScroll={(event) => {
            const element = event.currentTarget;
            followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
            if (followLatest.current) setHasUpdates(false);
          }}>
          <div className="ai-messages" ref={messages}>
            {empty && <div className="ai-empty">
              <span className="ai-empty__mark" aria-hidden="true">SAMS</span>
              <h2>{t('ai.startTitle')}</h2>
              <p>{t(scope === 'research' ? 'ai.researchState.idle' : 'ai.startBody')}</p>
              <div className="ai-suggestions"><h3>{t('ai.suggestions')}</h3>
                {suggestions.map((key) => <button type="button" key={key}
                  disabled={showBooks && state.blocked || researchPhase === 'searching'}
                  onClick={() => { setDraft(t(`ai.${key}`)); composer.current?.focus({ preventScroll: true }); }}>{t(`ai.${key}`)} <span aria-hidden="true">↗</span></button>)}
              </div>
            </div>}
            {showBooks && <section className="ai-book-transcript" aria-label={t('ai.scopeBooks')}>
              {scope === 'all' && <h2 className="ai-section-title">{t('ai.scopeBooks')}</h2>}
              {state.turns.map((turn, index) => <article className="ai-turn" key={index}>
                <p className="ai-question"><span>{t('ai.yourQuestion')}</span><bdi>{turn.question}</bdi></p>
                {turn.result && <div className="ai-reply">
                  <h2>{t('ai.reply')}</h2>
                  {turn.result.notice && <p className="ai-notice" dir="auto">{turn.result.notice}</p>}
                  <p className="ai-answer" dir="auto">{turn.result.answer}</p>
                  {turn.result.hint && <p dir="auto">{turn.result.hint}</p>}
                  {turn.result.coverage_note && <p className="ai-secondary" dir="auto">{turn.result.coverage_note}</p>}
                  <AiBookRecords books={turn.result.sources} title={t('ai.sources')} itemDetailsBase={itemDetailsBase} />
                  {turn.result.all_books && <details className="ai-all-books"><summary>{t(turn.result.all_books.complete ? 'ai.allMatches' : 'ai.moreMatches')}</summary>
                    <AiBookRecords books={turn.result.all_books.items} title={t(turn.result.all_books.complete ? 'ai.allMatches' : 'ai.moreMatches')} itemDetailsBase={itemDetailsBase} />
                  </details>}
                  <CopyAnswer text={turn.result.answer} />
                </div>}
              </article>)}
              {state.preview?.books.length > 0 && <AiBookRecords key={state.jobId} books={state.preview.books} title={t('ai.previewLabel')} itemDetailsBase={itemDetailsBase} preview />}
              <div className="ai-feedback" data-status={bookSpirit}>
                <p className={`ai-status${['done', 'help', 'fallback'].includes(state.phase) && bookSpirit !== 'no-results' ? ' ai-visually-hidden' : ''}`} role="status" aria-live="polite" aria-atomic="true">{t(`ai.${bookStatusKey}`)}</p>
                {state.errorStatus && <p className="ai-error">{t(`ai.error${[400, 401, 403, 404, 409, 429, 502, 503, 504].includes(state.errorStatus) ? state.errorStatus : 502}`)}</p>}
                {state.phase === 'throttled' && <p className="ai-secondary" aria-live="off">{state.retryAt && state.retryKnown
                  ? t('ai.wait').replace('{seconds}', number(retrySeconds)) : t('ai.waitUnknown')}</p>}
                {(state.phase === 'unavailable' || state.phase === 'failed' && !state.blocked && !state.sessionId) &&
                  <button type="button" className="ai-button ai-button--quiet" onClick={controller.check}>{t('ai.check')}</button>}
                {state.jobId && <div className="ai-actions">
                  {state.phase === 'pending' ? <button type="button" className="ai-button ai-button--quiet" onClick={controller.stop}>{t('ai.stop')}</button>
                    : <button type="button" className="ai-button ai-button--quiet" disabled={!!retrySeconds} onClick={controller.resume}>{t('ai.resume')}</button>}
                </div>}
              </div>
            </section>}
            {showResearch && <section className="ai-research" aria-labelledby="ai-research-title">
              <h2 id="ai-research-title" className={scope === 'research' ? 'ai-visually-hidden' : 'ai-section-title'}>{t('ai.scopeResearch')}</h2>
              {researchTurns.map((turn, index) => <article className="ai-turn" key={index}>
                <p className="ai-question"><span>{t('ai.yourQuestion')}</span><bdi>{turn.question}</bdi></p>
                {turn.records?.length > 0 && <div className="ai-reply">
                  <h3>{t('ai.reply')}</h3>
                  <p className="ai-answer">{t('ai.researchAnswer').replace('{title}', () => turn.records[0].title)}{' '}
                    {t(turn.records[0].available ? 'ai.researchAvailable' : 'ai.researchUnavailable')}.
                  </p>
                  <AiResearchRecords records={turn.records} itemDetailsBase={itemDetailsBase} />
                </div>}
                {index < researchTurns.length - 1 && ['no-results', 'error'].includes(turn.phase) &&
                  <p className={turn.phase === 'error' ? 'ai-error' : 'ai-secondary'}>{t(turn.throttled ? 'ai.error429' : `ai.researchState.${turn.phase}`)}</p>}
              </article>)}
              <div className="ai-feedback" data-status={researchPhase}>
                <p className={`ai-status${researchPhase === 'error' ? ' ai-error' : researchPhase === 'success' ? ' ai-visually-hidden' : ''}`} role="status" aria-live="polite" aria-atomic="true">
                  {t(lastResearch?.throttled ? 'ai.error429' : `ai.researchState.${researchPhase}`)}
                </p>
              </div>
            </section>}
          </div>
        </div>
        {hasUpdates && <button type="button" className="ai-latest ai-button ai-button--quiet" onClick={latest}>{t('ai.latest')} <span aria-hidden="true">↓</span></button>}
        <form className="ai-composer" onSubmit={submit}>
          <label className="ai-visually-hidden" htmlFor="ai-question">{t('ai.composer')}</label>
          <textarea id="ai-question" ref={composer} value={draft} rows={1} maxLength={1000} dir="auto" readOnly={state.phase === 'resetting'}
            placeholder={t(scope === 'books' ? 'ai.placeholder' : 'ai.researchPlaceholder')} onChange={(event) => setDraft(event.target.value)} aria-invalid={count > 500}
            aria-describedby={`ai-keyboard ai-count${count > 500 ? ' ai-question-error' : ''}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault(); event.currentTarget.form.requestSubmit();
              }
            }} />
          {count > 500 && <p id="ai-question-error" className="ai-error">{t('ai.tooLong')}</p>}
          <div className="ai-composer__footer"><div><small id="ai-keyboard">{t('ai.keyboard')}</small><small id="ai-count">{t('ai.count').replace('{count}', number(count))}</small></div>
            <button className="ai-button ai-send" type="submit" aria-label={t('ai.send')} disabled={!canSend || !draft.trim() || count > 500}>
              <span>{t('ai.send')}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v15" /></svg>
            </button></div>
        </form>
      </div>
      <aside id="ai-companion" className="ai-companion" hidden={!companionOpen} aria-labelledby="ai-spirit-title" data-companion-state={avatar}>
        <KnowledgeSpiritCompanion state={avatar} visible={companionOpen} />
        <p className="ai-scope">{t('ai.scope')}</p>
        <p className="ai-memory">{t('ai.memory')}</p>
        {catalogueTo && <Link to={catalogueTo}>{t('ai.catalogue')} <span aria-hidden="true">↗</span></Link>}
      </aside>
    </div>
  </section>;
}
