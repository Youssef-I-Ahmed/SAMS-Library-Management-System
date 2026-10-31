import { AiState } from './ai-state.js';
import { createTransport } from './ai-transport.js';
import { createIdentityResolver, loadBookCodeMap } from './ai-identity.js';
import { aiError, protocolError, unavailable } from './ai-errors.js';
import { askResponse, cardResponse, resetResponse, healthResponse, projectUpstream } from './ai-schemas.js';

export function createAiGateway({ config, db, now = Date.now, transportOptions, identityTimeoutMs }) {
  const state = new AiState(config.AI_SERVICE_EPOCH, now);
  let enrich;
  let transport;
  if (config.AI_ENABLED) {
    // Invalid provenance disables every enabled route, not an implicit empty map.
    try {
      enrich = createIdentityResolver({ mapping: loadBookCodeMap(config), db, timeoutMs: identityTimeoutMs });
      transport = createTransport(config, transportOptions);
    } catch { /* readiness reports only a sanitized service error */ }
  }
  function ready() {
    if (!config.AI_ENABLED || !transport || !enrich) throw unavailable();
  }
  function publicOutput(data, extraPrivate = []) {
    const json = JSON.stringify({ data });
    if (Buffer.byteLength(json) > config.AI_RESPONSE_MAX_BYTES) throw aiError(502, 'AI_RESPONSE_TOO_LARGE');
    // Allowlist projection is primary. Also reject echoes of known configuration
    // and internal IDs in a permitted string field; never redact into false success.
    const privateValues = [config.RAG_SERVICE_KEY, config.RAG_URL, config.AI_BOOK_CODE_MAP_PATH,
      config.AI_BOOK_CODE_MAP_SHA256, config.AI_SOURCE_SHA256, ...state.privateIds(), ...extraPrivate];
    if (privateValues.some((value) => value && json.includes(JSON.stringify(value).slice(1, -1)))) throw protocolError();
    return data;
  }
  const call = (context, operation, method, path, body, timeoutMs, signal) => transport({
    ...context, operation, method, path, body, signal
  }, timeoutMs);
  function checkResponse(raw, session) {
    const data = projectUpstream(askResponse, raw);
    if (data.session_id !== session.internal) throw protocolError();
    return data;
  }
  function terminal(job, response) {
    state.finish(job.work);
    if (response.status === 'error') job.error = aiError(502, 'AI_UPSTREAM_ERROR');
    else job.response = response;
  }
  function safeSessionError(error, session) {
    // Handle is owned and public. No upstream message or arbitrary error properties.
    error.sessionId = session.id;
    return error;
  }

  return {
    state, ready,
    async ask(context, request) {
      ready();
      const work = state.admit(context.user.id, request.session_id, context.requestId);
      const session = work.session;
      let response;
      try {
        response = checkResponse(await call(context, 'ask', 'POST', '/api/ask', {
          question: request.question, session_id: session.internal,
          ...(request.filters != null ? { filters: request.filters } : {})
        }, config.AI_ASK_TIMEOUT_MS), session);
        state.assertEpoch(work.epoch);
      } catch (error) {
        // These explicit statuses prove the new question was not admitted.
        if ([401, 422, 429].includes(error.upstreamStatus)) state.finish(work);
        else state.uncertain(work);
        throw safeSessionError(error, session);
      }
      let publicJob;
      if (response.status === 'pending') {
        publicJob = state.pending(work, response.job_id);
        if (!publicJob) { state.uncertain(work); throw safeSessionError(protocolError(), session); }
      } else state.finish(work);
      if (response.status === 'error') throw safeSessionError(aiError(502, 'AI_UPSTREAM_ERROR'), session);
      const data = { ...response, session_id: session.id };
      if (publicJob) data.job_id = publicJob.id;
      try {
        const enriched = await enrich(data);
        state.assertEpoch(work.epoch);
        return publicOutput(enriched);
      }
      catch (error) { throw safeSessionError(error, session); }
    },

    async poll(context, jobId, wait, signal) {
      ready();
      const job = state.job(jobId, context.user.id);
      state.throttle(context.user.id, 'poll', 60);
      if (job.polling || now() < job.nextPoll) throw aiError(409, 'AI_SESSION_BUSY');
      job.polling = true;
      try {
        if (job.error) throw job.error;
        let response = job.response;
        if (!response) {
          try {
            response = checkResponse(await call(context, 'poll', 'GET',
              `/api/jobs/${encodeURIComponent(job.internal)}?wait=${wait}`, undefined,
              wait * 1000 + config.AI_POLL_TIMEOUT_MARGIN_MS, signal), job.session);
          } catch (error) {
            if (error.upstreamStatus === 404) {
              state.jobs.delete(job.id);
              state.uncertain(job.work); // expired ID does not prove a worker stopped
            }
            throw error;
          }
          state.assertEpoch(job.work.epoch);
          if (response.status === 'pending' && response.job_id !== job.internal) throw protocolError();
          if (response.status !== 'pending') terminal(job, response);
          else job.nextPoll = now() + 500;
        }
        if (job.error) throw job.error;
        // Clone: enrichment must be recomputed, never cached as live catalog state.
        const data = structuredClone({ ...response, session_id: job.session.id, job_id: job.id });
        const enriched = await enrich(data);
        state.assertEpoch(job.work.epoch);
        return publicOutput(enriched);
      } finally { job.polling = false; }
    },

    async book(context, code, signal) {
      ready(); state.throttle(context.user.id, 'card', 60);
      const data = projectUpstream(cardResponse, await call(context, 'card', 'GET',
        `/api/books/${encodeURIComponent(code)}`, undefined, config.AI_CARD_TIMEOUT_MS, signal));
      if (data.book_code !== code) throw protocolError();
      return publicOutput(await enrich(data));
    },

    async reset(context, id) {
      ready();
      const session = state.session(id, context.user.id);
      state.throttle(context.user.id, 'reset', 10);
      state.lockReset(session);
      try {
        const data = projectUpstream(resetResponse, await call(context, 'reset', 'POST',
          '/api/session/reset', { session_id: session.internal }, config.AI_RESET_TIMEOUT_MS));
        if (data.session_id !== session.internal) throw protocolError();
        state.assertEpoch(session.epoch);
        const next = state.rotate(session);
        return publicOutput({ status: 'ok', session_id: next.id }, [session.internal]);
      } catch (error) {
        session.state = 'uncertain';
        throw safeSessionError(error, session);
      }
    },

    async health(context, signal) {
      ready(); state.throttle(context.user.id, 'health', 30);
      try {
        projectUpstream(healthResponse, await call(context, 'health', 'GET', '/api/health',
          undefined, config.AI_HEALTH_TIMEOUT_MS, signal));
        return publicOutput({ status: 'ok' });
      } catch { throw unavailable(); }
    }
  };
}
