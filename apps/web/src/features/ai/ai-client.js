/** @typedef {{status:'mapped'|'unmapped'|'ambiguous'|'unavailable', library_item_id:string|null}} Identity */
/** @typedef {{tag?:string,book_codes:string[],title:string|null,author:string|null,year:number|null,call_number:string|null,identity:Identity}} AiBook */
/** @typedef {{status:'done'|'pending',session_id:string,job_id?:string,result?:object,preview?:object|null,cached?:boolean}} AiReply */

export class AiClientError extends Error {
  constructor(status, code, { retryAt = null, retryKnown = true, sessionId = null, uncertain = false } = {}) {
    super('AI request failed');
    this.name = 'AiClientError';
    Object.assign(this, { status, code, retryAt, retryKnown, sessionId, uncertain });
  }
}
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string';
const nullableText = (value) => value === null || text(value);
const handle = (value) => text(value) && /^[a-f0-9]{32}$/.test(value);
const uuid = (value) => text(value) && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const protocol = () => new AiClientError(502, 'AI_UPSTREAM_PROTOCOL_ERROR');
function requireValue(condition) { if (!condition) throw protocol(); }
export function normalizeQuestion(value) {
  const q = typeof value === 'string' ? value.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu, '') : '';
  if (!q || [...q].length > 500 || /[\ud800-\udfff]/u.test(q)) throw new AiClientError(400, 'VALIDATION_ERROR');
  return q;
}
function identity(value) {
  requireValue(object(value) && ['mapped', 'unmapped', 'ambiguous', 'unavailable'].includes(value.status));
  requireValue(value.status === 'mapped' ? uuid(value.library_item_id) : value.library_item_id === null);
  return { status: value.status, library_item_id: value.library_item_id };
}
function book(value) {
  requireValue(object(value) && Array.isArray(value.book_codes) && value.book_codes.every(text) &&
    nullableText(value.title) && nullableText(value.author) && nullableText(value.call_number) &&
    (value.year === null || Number.isInteger(value.year)) && (value.tag === undefined || text(value.tag)));
  return { ...(value.tag ? { tag: value.tag } : {}), book_codes: value.book_codes, title: value.title, author: value.author,
    call_number: value.call_number, year: value.year, identity: identity(value.identity) };
}
export function validateAiReply(value) {
  requireValue(object(value) && handle(value.session_id));
  if (value.status === 'pending') {
    requireValue(handle(value.job_id) && text(value.message));
    let preview = null;
    if (value.preview !== null) {
      requireValue(object(value.preview) && Array.isArray(value.preview.books));
      preview = { books: value.preview.books.map(book) };
    }
    return { status: 'pending', session_id: value.session_id, job_id: value.job_id, preview };
  }
  requireValue(value.status === 'done' && object(value.result));
  const r = value.result;
  requireValue(text(r.answer) && typeof r.is_refusal === 'boolean' && nullableText(r.hint) &&
    nullableText(r.coverage_note) && nullableText(r.notice) && ['gemini', 'help', 'extractive'].includes(r.provider) && Array.isArray(r.sources));
  let allBooks = null;
  if (r.all_books !== null) {
    requireValue(object(r.all_books) && typeof r.all_books.complete === 'boolean' && Array.isArray(r.all_books.items));
    allBooks = { complete: r.all_books.complete, items: r.all_books.items.map(book) };
  }
  if (value.cached !== undefined) requireValue(value.cached === true);
  if (value.job_id !== undefined) requireValue(handle(value.job_id));
  return { status: 'done', session_id: value.session_id, ...(value.job_id ? { job_id: value.job_id } : {}),
    cached: value.cached === true, result: { answer: r.answer, is_refusal: r.is_refusal, hint: r.hint,
      coverage_note: r.coverage_note, notice: r.notice, provider: r.provider,
      sources: r.is_refusal || r.provider === 'help' ? [] : r.sources.map(book),
      all_books: r.is_refusal || r.provider === 'help' ? null : allBooks } };
}

function validateResearchReply(value) {
  requireValue(object(value) && ['success', 'no-results'].includes(value.status) &&
    Array.isArray(value.results) && value.results.length <= 5 &&
    (value.status === 'success') === (value.results.length > 0));
  return { status: value.status, results: value.results.map((record) => {
    requireValue(object(record) && uuid(record.id) && text(record.title) &&
      [record.legacy_code, record.language, record.call_number].every(nullableText) &&
      [record.subjects, record.researchers, record.supervisors].every((names) => Array.isArray(names) && names.every(text)) &&
      (record.publication_year === null || Number.isInteger(record.publication_year)) &&
      typeof record.available === 'boolean');
    const { id, title, legacy_code, language, call_number, subjects, researchers, supervisors,
      publication_year, available } = record;
    return { id, title, legacy_code, language, call_number, subjects, researchers, supervisors,
      publication_year, available };
  }) };
}

export function retryDeadline(value, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : null;
  const deadline = seconds !== null ? now + seconds * 1000 : Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(now, deadline) : null;
}

/** Express-only client. No retries, storage or arbitrary request paths/headers. */
export function createAiClient({ baseUrl, token, enabled, onUnauthorized, fetchImpl = globalThis.fetch, now = Date.now }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const url = new URL(base, 'http://local');
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/api/v1') {
    throw new Error('Expected the SAMS Express API base');
  }
  async function call(path, { body, signal, timeout = 10000, validate } = {}) {
    if (!enabled) throw new AiClientError(503, 'AI_DISABLED');
    const abort = new AbortController();
    const relay = () => abort.abort();
    signal?.addEventListener('abort', relay, { once: true });
    if (signal?.aborted) relay();
    const timer = setTimeout(() => abort.abort(), timeout);
    const method = body === undefined ? 'GET' : 'POST';
    try {
      const response = await fetchImpl(`${base}/ai${path}`, { method, signal: abort.signal, cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      let payload;
      try { payload = await response.json(); } catch { throw protocol(); }
      if (!response.ok) {
        requireValue(object(payload?.error) && text(payload.error.code));
        if (response.status === 401) onUnauthorized?.();
        const retryAt = response.status === 429 ? retryDeadline(response.headers.get('retry-after'), now()) : null;
        throw new AiClientError(response.status, payload.error.code, {
          // Cross-origin deployments may not expose this header. The gateway's
          // rolling window is 60s: wait conservatively, without inventing a countdown.
          retryAt: response.status === 429 ? retryAt ?? now() + 60000 : null,
          retryKnown: retryAt !== null,
          sessionId: handle(payload.session_id) ? payload.session_id : null,
          uncertain: method === 'POST' && !['AI_UPSTREAM_ERROR', 'AI_CAPACITY_BUSY'].includes(payload.error.code) && (response.status >= 500 || response.status === 409)
        });
      }
      requireValue(object(payload) && object(payload.data));
      return validate(payload.data);
    } catch (error) {
      if (error instanceof AiClientError) {
        if (method === 'POST' && error.code === 'AI_UPSTREAM_PROTOCOL_ERROR') error.uncertain = true;
        throw error;
      }
      if (signal?.aborted) throw error;
      throw new AiClientError(504, 'AI_UPSTREAM_TIMEOUT', { uncertain: method === 'POST' });
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
  }
  return {
    research: (question, signal) => call('/research/ask', {
      body: { question: normalizeQuestion(question) }, signal, validate: validateResearchReply
    }),
    ask: (question, sessionId, signal) => {
      const q = normalizeQuestion(question);
      if (sessionId != null && !handle(sessionId)) throw new AiClientError(400, 'VALIDATION_ERROR');
      return call('/ask', { body: { question: q, ...(sessionId ? { session_id: sessionId } : {}) }, signal, timeout: 20000, validate: validateAiReply });
    },
    poll: (jobId, signal) => {
      requireValue(handle(jobId));
      return call(`/jobs/${jobId}?wait=10`, { signal, timeout: 35000, validate: validateAiReply });
    },
    reset: (sessionId, signal) => {
      requireValue(handle(sessionId));
      return call('/session/reset', { body: { session_id: sessionId }, signal, validate: (data) => {
        requireValue(data.status === 'ok' && handle(data.session_id) && data.session_id !== sessionId);
        return { status: 'ok', session_id: data.session_id };
      } });
    },
    health: (signal) => call('/health', { signal, timeout: 5000, validate: (data) => {
      requireValue(data.status === 'ok'); return { status: 'ok' };
    } }),
    // Current page already has source metadata and links to authoritative SAMS
    // Details; it does not fetch full snapshot cards speculatively.
    book: (code, signal) => {
      requireValue(text(code) && [...code].length >= 1 && [...code].length <= 64 && !/[\s\p{Cc}\p{Cf};/\\]/u.test(code) && !code.includes('..'));
      return call(`/books/${encodeURIComponent(code)}`, { signal, validate: (data) => {
        requireValue(data.book_code === code && object(data.card) && Object.values(data.card).every(text));
        return { book_code: code, card: data.card, identity: identity(data.identity) };
      } });
    }
  };
}
