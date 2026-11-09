import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiClientError, createAiClient, normalizeQuestion, retryDeadline, validateAiReply } from '../src/features/ai/ai-client.js';
import { createAiController, spiritState } from '../src/features/ai/ai-controller.js';
import { clearAiConversation, getAiConversation } from '../src/features/ai/ai-session.js';
import { AI_ASSISTANT_ENABLED } from '../src/features/ai/ai-config.js';

const S = 'a'.repeat(32), J = 'b'.repeat(32), NEXT = 'c'.repeat(32), UUID = '4afd2005-c0c3-5889-911a-b3952b7ef670';
const record = { book_codes: ['0002'], title: 'Fixture', author: 'Author', year: 2007, call_number: '123', identity: { status: 'mapped', library_item_id: UUID } };
const result = (patch = {}) => ({ answer: 'Fixture answer', provider: 'gemini', is_refusal: false, hint: null, coverage_note: null, notice: null, sources: [], all_books: null, ...patch });
const done = (patch = {}) => ({ status: 'done', session_id: S, result: result(patch) });
const pending = (books = null) => ({ status: 'pending', session_id: S, job_id: J, message: 'Pending', preview: books === null ? null : { books } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(setImmediate);
function clock() {
  let now = 0, counter = 0; const tasks = new Map();
  return { now: () => now, setTimer: (fn, delay) => { const id = ++counter; tasks.set(id, { fn, at: now + delay }); return id; },
    clearTimer: (id) => tasks.delete(id), async advance(ms) {
      const end = now + ms;
      for (;;) { const next = [...tasks.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break; now = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush(); }
      now = end; await flush();
    } };
}
async function setup(patch = {}, options = {}) {
  const calls = { ask: 0, poll: 0, reset: 0, health: 0 }, time = clock();
  const client = Object.fromEntries(Object.entries({ health: () => ({ status: 'ok' }), ask: () => done(), poll: () => done(), reset: () => ({ session_id: NEXT }) })
    .map(([key, fn]) => [key, async (...args) => { calls[key]++; return (patch[key] || fn)(...args); }]));
  const controller = createAiController({ client, ...time, ...options });
  controller.activate(); await flush();
  return { controller, client, calls, time, state: controller.getSnapshot };
}

test('absent frontend flag is false and disabled controller/client never fetch', async () => {
  assert.equal(AI_ASSISTANT_ENABLED, false);
  let calls = 0;
  const client = createAiClient({ baseUrl: '/api/v1', token: 'fixture', enabled: false, fetchImpl: () => { calls++; } });
  const controller = createAiController({ client, enabled: false }); controller.activate();
  await controller.send('help'); await controller.check();
  assert.equal(controller.getSnapshot().phase, 'disabled'); assert.equal(calls, 0);
  await assert.rejects(client.health(), { code: 'AI_DISABLED' }); assert.equal(calls, 0);
});

test('client restricts the Express base, paths, headers, methods and projected fields', async () => {
  const calls = [];
  const client = createAiClient({ baseUrl: 'http://127.0.0.1:4000/api/v1', token: 'fixture-token', enabled: true,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ data: { ...done({ sources: [{ ...record, copies: 900, cover: 'https://bad.invalid' }], model: 'hidden' }), secret: 'hidden' } }); } });
  const reply = await client.ask('  help  ');
  assert.equal(calls[0].url, 'http://127.0.0.1:4000/api/v1/ai/ask');
  assert.deepEqual(calls[0].options.headers, { Accept: 'application/json', Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' });
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), { question: 'help' });
  assert.equal(reply.secret, undefined); assert.equal(reply.result.model, undefined);
  assert.equal(reply.result.sources[0].copies, undefined); assert.equal(reply.result.sources[0].cover, undefined);
  for (const baseUrl of ['http://host/api', 'http://u:p@host/api/v1', 'file:///api/v1', 'http://host/api/v1?x=1']) assert.throws(() => createAiClient({ baseUrl }));
});

for (const q of ['', '\u0085\u001c', 'x'.repeat(501), '😀'.repeat(501), '\ud800', null]) test(`question validation before dispatch ${JSON.stringify(q)?.slice(0, 25)}`, () => {
  assert.throws(() => normalizeQuestion(q), { status: 400 });
});
test('Unicode code points and Python whitespace are counted correctly', () => {
  assert.equal(normalizeQuestion(' \u0085' + '😀'.repeat(500) + '\u001c '), '😀'.repeat(500));
});
for (const bad of [{}, { ...pending(), preview: undefined }, { ...done(), session_id: 'internal-id' },
  done({ sources: [{ ...record, identity: { status: 'mapped', library_item_id: null } }] }), done({ all_books: {} })]) {
  test(`reject malformed gateway response ${JSON.stringify(bad).slice(0, 60)}`, () => assert.throws(() => validateAiReply(bad), { status: 502 }));
}
test('help/refusal clear all source books even if an invalid combination is supplied', () => {
  for (const patch of [{ provider: 'help' }, { is_refusal: true }]) {
    const reply = validateAiReply(done({ ...patch, sources: [record], all_books: { complete: true, items: [record] } }));
    assert.deepEqual(reply.result.sources, []); assert.equal(reply.result.all_books, null);
  }
});
for (const status of [400, 401, 403, 404, 409, 429, 502, 503, 504]) test(`HTTP ${status} envelope stays sanitized and is not replayed`, async () => {
  let calls = 0, unauthorized = 0;
  const client = createAiClient({ baseUrl: '/api/v1', token: 'fixture', enabled: true, now: () => 1000,
    onUnauthorized: () => unauthorized++, fetchImpl: async () => { calls++; return Response.json({ error: { code: `ERROR_${status}`, message: '<script>ignored</script>' }, session_id: S }, { status, headers: { 'Retry-After': '7' } }); } });
  await assert.rejects(client.ask('help'), (error) => error.status === status && error.message === 'AI request failed' && error.sessionId === S && (status !== 429 || error.retryAt === 8000));
  assert.equal(calls, 1); assert.equal(unauthorized, status === 401 ? 1 : 0);
});
test('Retry-After supports integer seconds and HTTP dates without automatic calls', () => {
  assert.equal(retryDeadline('12', 1000), 13000); assert.equal(retryDeadline('invalid', 1000), null);
  assert.equal(retryDeadline(new Date(10000).toUTCString(), 1000), 10000);
});

test('unreadable Retry-After uses a conservative local wait without an invented countdown', async () => {
  let calls = 0;
  const client = createAiClient({ baseUrl: '/api/v1', token: 'fixture', enabled: true, now: () => 1000,
    fetchImpl: async () => { calls++; return Response.json({ error: { code: 'AI_RATE_LIMITED' } }, { status: 429 }); } });
  await assert.rejects(client.ask('help'), (error) => error.retryAt === 61000 && error.retryKnown === false);
  assert.equal(calls, 1);
});
test('poll/reset/book/health use only the intended Express paths and public handles', async () => {
  const calls = [];
  const client = createAiClient({ baseUrl: '/api/v1', enabled: true, token: 'fixture', fetchImpl: async (url, options) => {
    calls.push([url, options.method]);
    const data = url.includes('/jobs/') ? done() : url.includes('/reset') ? { status: 'ok', session_id: NEXT }
      : url.includes('/books/') ? { book_code: '0002', card: { Title: 'Fixture' }, identity: record.identity } : { status: 'ok', engine: 'not exposed' };
    return Response.json({ data });
  } });
  await client.poll(J); await client.reset(S); await client.book('0002'); assert.deepEqual(await client.health(), { status: 'ok' });
  assert.deepEqual(calls, [[`/api/v1/ai/jobs/${J}?wait=10`, 'GET'], ['/api/v1/ai/session/reset', 'POST'], ['/api/v1/ai/books/0002', 'GET'], ['/api/v1/ai/health', 'GET']]);
  assert.throws(() => client.book('1/2')); assert.throws(() => client.poll('guessed'));
});
test('non-JSON, malformed success and a lost POST response fail closed without retries', async () => {
  for (const fetchImpl of [async () => new Response('html'), async () => Response.json({}), async () => { throw new Error('lost'); }]) {
    let calls = 0;
    const client = createAiClient({ baseUrl: '/api/v1', token: 'fixture', enabled: true, fetchImpl: (...args) => { calls++; return fetchImpl(...args); } });
    await assert.rejects(client.ask('help'), (error) => error.uncertain === true); assert.equal(calls, 1);
  }
});

for (const [patch, phase] of [[{}, 'done'], [{ provider: 'extractive' }, 'done'], [{ provider: 'help' }, 'help'],
  [{ is_refusal: true }, 'refusal'], [{ provider: 'extractive', notice: 'Busy' }, 'fallback']]) {
  test(`controller direct completion ${phase}`, async () => {
    const f = await setup({ ask: () => validateAiReply({ ...done(patch), cached: true }) });
    await f.controller.send('help'); assert.equal(f.state().phase, phase); assert.equal(f.calls.ask, 1);
    assert.equal(f.state().sessionId, S); assert.equal(f.state().preview, null); f.controller.destroy();
  });
}
for (const books of [null, [record]]) test(`pending ${books === null ? 'null' : 'populated'} preview replaces with final refusal`, async () => {
  const f = await setup({ ask: () => validateAiReply(pending(books)), poll: () => validateAiReply(done({ is_refusal: true })) });
  await f.controller.send('help'); assert.equal(f.state().phase, 'pending');
  assert.equal(f.state().preview === null, books === null);
  await f.time.advance(500); assert.equal(f.state().phase, 'refusal'); assert.equal(f.state().preview, null);
  assert.equal(f.calls.poll, 1); f.controller.destroy();
});
test('one outstanding poll, stop aborts its browser wait and ignores late responses', async () => {
  const waiting = deferred(); let signal;
  const f = await setup({ ask: () => validateAiReply(pending([record])), poll: (_id, s) => { signal = s; return waiting.promise; } });
  await f.controller.send('question'); await f.time.advance(500); await f.time.advance(3000);
  assert.equal(f.calls.poll, 1); f.controller.stop(); assert.equal(signal.aborted, true);
  waiting.resolve(validateAiReply(done())); await flush(); assert.equal(f.state().phase, 'stopped');
  await f.time.advance(10000); assert.equal(f.calls.ask, 1); assert.equal(f.calls.poll, 1); f.controller.destroy();
});
test('unmount stops polling but a bounded ask can preserve its delivered public handles', async () => {
  const waiting = deferred(); const f = await setup({ ask: () => waiting.promise });
  const request = f.controller.send('question'); f.controller.deactivate(); waiting.resolve(validateAiReply(pending())); await request;
  assert.equal(f.state().phase, 'stopped'); assert.equal(f.state().jobId, J);
  await f.time.advance(1000); assert.equal(f.calls.poll, 0);
  f.controller.activate(); await f.controller.resume(); assert.equal(f.state().phase, 'done'); f.controller.destroy();
});
test('patience pauses automatic polling and manual GET can finish without replaying ask', async () => {
  const waiting = deferred(); const f = await setup({ ask: () => validateAiReply(pending()), poll: () => waiting.promise }, { patienceMs: 2000 });
  await f.controller.send('question'); await f.time.advance(2100);
  assert.equal(f.state().phase, 'still-working'); assert.equal(spiritState(f.state()), 'thinking');
  waiting.resolve(validateAiReply(done())); await flush(); assert.equal(f.state().phase, 'still-working');
  await f.controller.resume(); assert.equal(f.state().phase, 'done'); assert.equal(f.calls.ask, 1); f.controller.destroy();
});
test('unknown/expired job clears handles and never resubmits the question', async () => {
  const f = await setup({ ask: () => validateAiReply(pending([record])), poll: () => { throw new AiClientError(404, 'AI_JOB_NOT_FOUND'); } });
  await f.controller.send('question'); await f.time.advance(500);
  assert.equal(f.state().phase, 'expired'); assert.equal(f.state().preview, null); assert.equal(f.state().jobId, null);
  await f.controller.send('question'); await f.time.advance(10000); assert.equal(f.calls.ask, 1); f.controller.destroy();
});
test('uncertain POST remains blocked, but terminal body errors do not claim an active job', async () => {
  const f = await setup({ ask: () => { throw new AiClientError(504, 'AI_UPSTREAM_TIMEOUT', { uncertain: true, sessionId: S }); } });
  await f.controller.send('question'); assert.equal(f.state().phase, 'uncertain');
  await f.controller.send('question'); assert.equal(await f.controller.reset(), false); assert.equal(f.calls.ask, 1); f.controller.destroy();
  const terminal = await setup({ ask: () => { throw new AiClientError(502, 'AI_UPSTREAM_ERROR'); } });
  await terminal.controller.send('question'); assert.equal(terminal.state().phase, 'failed');
  assert.equal(terminal.state().blocked, false); assert.equal(terminal.calls.ask, 1); terminal.controller.destroy();
});

test('follow-ups reuse only the public session; full-list records retain identity without stock fields', async () => {
  const bodies = [];
  const client = createAiClient({ baseUrl: '/api/v1', enabled: true, token: 'fixture', fetchImpl: async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({ data: done({ all_books: { complete: true, items: [{ ...record, copies: 900, in_answer: true }] } }) });
  } });
  const f = await setup({ ask: (...args) => client.ask(...args) });
  for (let n = 0; n < 5; n++) await f.controller.send(`question ${n}`);
  assert.deepEqual(bodies[0], { question: 'question 0' });
  assert.deepEqual(bodies[4], { question: 'question 4', session_id: S });
  assert.equal(f.state().turns.length, 4);
  const item = f.state().turns.at(-1).result.all_books.items[0];
  assert.deepEqual(item.identity, record.identity); assert.deepEqual(item.book_codes, ['0002']);
  assert.equal(item.copies, undefined); assert.equal(item.in_answer, undefined); f.controller.destroy();
});
test('429 Retry-After blocks manual replay until elapsed and never schedules a POST', async () => {
  let first = true;
  const f = await setup({ ask: () => { if (first) { first = false; throw new AiClientError(429, 'AI_RATE_LIMITED', { retryAt: 2000 }); } return validateAiReply(done()); } });
  await f.controller.send('question'); assert.equal(f.state().phase, 'throttled');
  await f.controller.send('question'); await f.time.advance(3000); assert.equal(f.calls.ask, 1);
  await f.controller.send('question'); assert.equal(f.calls.ask, 2); f.controller.destroy();
});
test('idle reset rotates handle, clears content and locks sending while in flight', async () => {
  const waiting = deferred(); const f = await setup({ reset: () => waiting.promise });
  await f.controller.send('question'); const reset = f.controller.reset();
  assert.equal(f.state().phase, 'resetting'); assert.equal(await f.controller.send('another'), false);
  waiting.resolve({ session_id: NEXT }); assert.equal(await reset, true);
  assert.equal(f.state().sessionId, NEXT); assert.deepEqual(f.state().turns, []); f.controller.destroy();
});
test('active reset is rejected locally, failed polling clears preview, logout ignores stale completion', async () => {
  const f = await setup({ ask: () => validateAiReply(pending([record])), poll: () => { throw new AiClientError(503, 'AI_SERVICE_UNAVAILABLE'); } });
  await f.controller.send('question'); assert.equal(await f.controller.reset(), false);
  await f.time.advance(500); assert.equal(f.state().preview, null); assert.equal(f.state().phase, 'failed');
  assert.equal(f.calls.reset, 0); f.controller.destroy();
  const waiting = deferred(), g = await setup({ ask: () => waiting.promise });
  const send = g.controller.send('private question'); g.controller.destroy(); waiting.resolve(validateAiReply(done())); await send;
  assert.deepEqual(g.state().turns, []); assert.equal(g.state().sessionId, null);
});
test('tab-memory controller belongs to one authenticated owner/session and is cleared on logout', () => {
  let destroyed = 0; const factory = () => ({ destroy: () => destroyed++ });
  const first = getAiConversation('owner', 'auth-session', factory);
  assert.equal(getAiConversation('owner', 'auth-session', factory), first);
  assert.notEqual(getAiConversation('other', 'auth-session', factory), first); assert.equal(destroyed, 1);
  clearAiConversation(); assert.equal(destroyed, 2);
});
