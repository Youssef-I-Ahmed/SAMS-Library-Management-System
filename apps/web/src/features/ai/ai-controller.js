import { AI_PATIENCE_MS } from './ai-config.js';
import { normalizeQuestion } from './ai-client.js';

export function spiritState(state) {
  if (state.phase === 'still-working' || state.phase === 'pending' && state.preview?.books.length) return 'thinking';
  if (['submitting', 'pending', 'resetting', 'checking'].includes(state.phase)) return 'searching';
  if (['failed', 'expired', 'unavailable', 'throttled', 'uncertain'].includes(state.phase)) return 'error';
  if (state.phase === 'refusal') return 'no-results';
  if (['done', 'fallback'].includes(state.phase)) {
    const result = state.turns.at(-1)?.result;
    return result?.sources.length || result?.all_books?.items.length ? 'success' : 'no-results';
  }
  return 'idle';
}

export function createAiController({ client, enabled = true, now = Date.now, patienceMs = AI_PATIENCE_MS,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = { phase: enabled ? 'checking' : 'disabled', turns: [], preview: null, sessionId: null, jobId: null,
    blocked: false, retryAt: null, retryKnown: true, errorStatus: null, errorCode: null };
  const listeners = new Set();
  let destroyed = false, attached = false, operation = 0, pollVersion = 0;
  let pollTimer, patienceTimer, requestAbort, pollAbort, startedAt = 0;
  const emit = (patch) => {
    if (destroyed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const valid = (id) => !destroyed && id === operation;
  function haltPoll() {
    pollVersion++; clearTimer(pollTimer); clearTimer(patienceTimer); pollAbort?.abort();
  }
  function clearErrors() { return { errorStatus: null, errorCode: null, retryAt: null, retryKnown: true }; }
  function fail(error, { posting = false, polling = false } = {}) {
    haltPoll();
    if (error.status === 404) {
      emit({ phase: 'expired', sessionId: null, jobId: null, blocked: polling || state.blocked, preview: null,
        errorStatus: 404, errorCode: error.code, retryAt: null });
      return;
    }
    const blocked = posting && error.uncertain || state.blocked;
    const phase = error.status === 429 ? 'throttled' : blocked && !state.jobId ? 'uncertain' : error.status === 503 && !posting && !polling ? 'unavailable' : 'failed';
    emit({ phase, preview: null, blocked, sessionId: error.sessionId || state.sessionId,
      errorStatus: error.status || 502, errorCode: error.code || 'AI_UPSTREAM_ERROR', retryAt: error.retryAt, retryKnown: error.retryKnown !== false });
  }
  function apply(reply, id, allowAuto = true) {
    if (!valid(id)) return;
    if (state.sessionId && state.sessionId !== reply.session_id) {
      fail({ status: 502, code: 'AI_UPSTREAM_PROTOCOL_ERROR', uncertain: true }, { posting: true }); return;
    }
    if (reply.status === 'pending') {
      emit({ sessionId: reply.session_id, jobId: reply.job_id, preview: reply.preview, blocked: true,
        phase: !attached ? 'stopped' : now() - startedAt >= patienceMs ? 'still-working' : !allowAuto ? 'stopped' : 'pending', ...clearErrors() });
      if (attached && allowAuto) schedulePoll(id);
      return;
    }
    haltPoll();
    const result = reply.result;
    const phase = result.is_refusal ? 'refusal' : result.provider === 'help' ? 'help' :
      result.provider === 'extractive' && result.notice ? 'fallback' : 'done';
    const turns = state.turns.slice();
    if (turns.length) turns[turns.length - 1] = { ...turns.at(-1), result, phase };
    emit({ sessionId: reply.session_id, jobId: null, preview: null, turns, phase, blocked: false, ...clearErrors() });
  }
  function schedulePoll(id) {
    const remaining = patienceMs - (now() - startedAt);
    if (remaining <= 0) { haltPoll(); emit({ phase: 'still-working' }); return; }
    clearTimer(pollTimer); clearTimer(patienceTimer);
    patienceTimer = setTimer(() => { haltPoll(); emit({ phase: 'still-working' }); }, remaining);
    pollTimer = setTimer(() => poll(id, false), Math.min(500, remaining));
  }
  async function poll(id, manual) {
    if (!valid(id) || !attached || !state.jobId || pollAbort) return;
    const version = pollVersion;
    const jobId = state.jobId;
    const abort = new AbortController(); pollAbort = abort;
    emit({ phase: manual && now() - startedAt >= patienceMs ? 'still-working' : 'pending', ...clearErrors() });
    try {
      const reply = await client.poll(jobId, abort.signal);
      if (!valid(id) || version !== pollVersion || abort.signal.aborted) return;
      pollAbort = null;
      if (reply.job_id && reply.job_id !== jobId) throw { status: 502, code: 'AI_UPSTREAM_PROTOCOL_ERROR' };
      apply(reply, id, !manual || now() - startedAt < patienceMs);
      if (reply.status === 'pending' && manual && now() - startedAt >= patienceMs) emit({ phase: 'still-working' });
    } catch (error) {
      if (valid(id) && version === pollVersion && !abort.signal.aborted) fail(error, { polling: true });
    } finally { if (pollAbort === abort) pollAbort = null; }
  }
  async function check() {
    if (!enabled || destroyed || state.blocked || ['submitting', 'resetting'].includes(state.phase)) return;
    const id = ++operation;
    requestAbort?.abort(); requestAbort = new AbortController();
    emit({ phase: 'checking', preview: null, ...clearErrors() });
    try { await client.health(requestAbort.signal); if (valid(id)) emit({ phase: 'idle' }); }
    catch (error) { if (valid(id) && !requestAbort.signal.aborted) fail(error); }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    activate() { attached = true; if (state.phase === 'checking') check(); },
    deactivate() {
      attached = false; haltPoll();
      if (state.phase === 'checking') { operation++; requestAbort?.abort(); }
      if (state.jobId) emit({ phase: 'stopped' });
      // An ask/reset continues its bounded response read in volatile tab memory.
      // Losing its public handles by aborting it is less safe than finishing it.
    },
    check,
    async send(question) {
      if (!enabled || destroyed || !attached || state.blocked || !['idle', 'done', 'help', 'refusal', 'fallback', 'failed', 'throttled'].includes(state.phase) ||
        state.retryAt > now()) return false;
      let q;
      try { q = normalizeQuestion(question); } catch (error) { fail(error); return false; }
      haltPoll(); const id = ++operation; startedAt = now();
      requestAbort = new AbortController();
      emit({ phase: 'submitting', turns: [...state.turns, { question: q, result: null }].slice(-4), preview: null, jobId: null, blocked: true, ...clearErrors() });
      try { apply(await client.ask(q, state.sessionId, requestAbort.signal), id); }
      catch (error) {
        if (valid(id)) { emit({ blocked: false }); fail(error, { posting: true }); }
      }
      return true;
    },
    stop() { if (!state.jobId) return; haltPoll(); emit({ phase: 'stopped' }); },
    resume() {
      if (!state.jobId || pollAbort || !attached || state.retryAt > now() || ['submitting', 'resetting'].includes(state.phase)) return;
      haltPoll(); return poll(operation, true);
    },
    async reset() {
      if (!state.sessionId || state.blocked || state.jobId || destroyed || !attached || state.retryAt > now() || ['checking', 'resetting', 'submitting'].includes(state.phase)) return false;
      const id = ++operation; haltPoll(); requestAbort = new AbortController();
      emit({ phase: 'resetting', preview: null, ...clearErrors() });
      try {
        const reply = await client.reset(state.sessionId, requestAbort.signal);
        if (valid(id)) emit({ phase: 'idle', sessionId: reply.session_id, jobId: null, turns: [], preview: null, blocked: false, ...clearErrors() });
        return valid(id);
      } catch (error) { if (valid(id)) fail(error, { posting: true }); return false; }
    },
    destroy() { destroyed = true; operation++; haltPoll(); requestAbort?.abort(); listeners.clear(); state = { ...state, turns: [], preview: null, sessionId: null, jobId: null }; }
  };
}
