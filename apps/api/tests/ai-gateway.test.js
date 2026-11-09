import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import express from 'express';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_TOKEN_SECRET = 'gateway-test-auth-secret-which-is-only-a-local-fixture';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
  process.env.AI_ENABLED = 'false';
});
vi.mock('../src/config/prisma.js', () => ({ prisma: {
  user: { findUnique: vi.fn() }, libraryItem: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  branch: { findMany: vi.fn() }, physicalCopy: { groupBy: vi.fn() }, $transaction: vi.fn()
} }));

import { prisma } from '../src/config/prisma.js';
import { readAiConfig } from '../src/config/ai.js';
import { issueAccessToken } from '../src/modules/auth/token.service.js';
import { requestContext } from '../src/middleware/request-context.js';
import { createAiGateway } from '../src/modules/ai/ai-gateway.js';
import { createAiRouter } from '../src/modules/ai/ai.routes.js';
import { loadBookCodeMap } from '../src/modules/ai/ai-identity.js';
import { AiState } from '../src/modules/ai/ai-state.js';
import { CARD_FIELDS } from '../src/modules/ai/ai-schemas.js';
import { app as ordinaryApp } from '../src/app.js';

const A = '4afd2005-c0c3-5889-911a-b3952b7ef670';
const B = 'fe19858e-1ab4-5a75-abe6-d90f07a09e6e';
const C = '8173602e-fbeb-557f-ad55-43913db8487e';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const KEY = 'fake-service-key-for-local-gateway-tests-only';
const sourceHash = 'a'.repeat(64);
const artifact = JSON.stringify({ sourceSha256: sourceHash, map: { '2': A, '1687': A, '1896': B, '0002': B, stale: C } });
const fixtureDir = mkdtempSync(join(tmpdir(), 'sams-ai-gateway-test-'));
const mapPath = join(fixtureDir, 'map.json');
writeFileSync(mapPath, artifact);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const makeUser = (id, roles = ['STUDENT']) => ({ id, isActive: true, universityEmail: 'fixture@example.invalid',
  displayName: 'Fixture', userRoles: roles.map((name) => ({ role: { name } })), student: null });
const card = (code = '2') => ({ ...Object.fromEntries(CARD_FIELDS.map((key) => [key, 'NA'])), 'Book code': code, 'Number of copies': '4' });
const book = (codes = ['2']) => ({ tag: 'S1', book_codes: codes, title: 'Fixture book', author: 'Fixture author', year: 2007, call_number: '123' });
const result = (overrides = {}) => ({ answer: 'Fixture answer', is_refusal: false, hint: null, coverage_note: null,
  search_query: null, filters_applied: {}, provider: 'help', model: null, latency_s: 0,
  citations: { cited: [], inferred: [], invalid: [] }, sources: [], all_books: null, notice: null, ...overrides });
const done = (session, overrides) => ({ status: 'done', session_id: session, result: result(overrides) });
const pending = (session, preview = null) => ({ status: 'pending', session_id: session, job_id: 'upstream_job_123',
  message: 'Still working', preview });
const health = () => ({ status: 'ok', engine: { books: 2821, chunks: 3000, embedding_backend: 'fixture',
  embedding_loaded_from: '/private/models', reranker: true, reranker_loaded_from: '/private/other',
  near_duplicate_pairs: 19, language_changes: 0 }, settings: { wait_s: 10, gemini_budget_s: 90, rate_limit_per_min: 20 } });
const send = (res, payload, status = 200, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
};

let upstream, upstreamUrl, handler, calls, gateway, app, users, records, tokens, clock;
let logSpy, errorSpy;
let sessionForJob;
const config = (overrides = {}) => ({
  AI_ENABLED: true, RAG_URL: upstreamUrl, RAG_SERVICE_KEY: KEY,
  AI_BOOK_CODE_MAP_PATH: mapPath, AI_BOOK_CODE_MAP_SHA256: sha(artifact), AI_SOURCE_SHA256: sourceHash,
  AI_SERVICE_EPOCH: 'fixture-epoch-1', AI_ASK_TIMEOUT_MS: 15000, AI_CARD_TIMEOUT_MS: 5000,
  AI_RESET_TIMEOUT_MS: 5000, AI_HEALTH_TIMEOUT_MS: 2000, AI_POLL_TIMEOUT_MARGIN_MS: 5000,
  AI_REQUEST_MAX_BYTES: 8192, AI_RESPONSE_MAX_BYTES: 2097152, AI_POLL_WINDOW_MS: 240000, ...overrides
});
function setup(overrides = {}, options = {}) {
  const cfg = config(overrides);
  const { research, ...gatewayOptions } = options;
  gateway = createAiGateway({ config: cfg, db: prisma, now: () => clock,
    transportOptions: { jitter: () => 0 }, ...gatewayOptions });
  app = express(); app.use(requestContext);
  app.use('/api/v1/ai', createAiRouter({ config: cfg, gateway, research, logging: true }));
  return gateway;
}
const get = (path, who = USER) => request(app).get(`/api/v1/ai${path}`).set('Authorization', `Bearer ${tokens[who]}`);
const post = (path, body = { question: 'help' }, who = USER) => request(app).post(`/api/v1/ai${path}`)
  .set('Authorization', `Bearer ${tokens[who]}`).send(body);
const waitUntil = async (predicate) => {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Fixture event did not arrive');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

beforeAll(async () => {
  upstream = http.createServer(async (req, res) => {
    const buffers = []; for await (const chunk of req) buffers.push(chunk);
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : undefined;
    calls.push({ path: req.url, headers: req.headers, body, method: req.method });
    try { await handler(req, res, body); }
    catch { if (!res.destroyed) res.destroy(); }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
});
afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  // Delete only the generated OS-temp fixture directory, never repository paths.
  if (dirname(resolve(fixtureDir)) !== resolve(tmpdir()) || !fixtureDir.includes('sams-ai-gateway-test-')) throw new Error('Unsafe fixture path');
  rmSync(fixtureDir, { recursive: true });
});
beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  calls = []; clock = Date.now(); sessionForJob = null;
  users = new Map([[USER, makeUser(USER)], [OTHER, makeUser(OTHER)]]);
  tokens = Object.fromEntries([...users].map(([id, user]) => [id, issueAccessToken(user)]));
  records = [{ id: A, type: 'BOOK', isActive: true, bookDetails: { itemId: A } },
    { id: B, type: 'BOOK', isActive: true, bookDetails: { itemId: B } }];
  prisma.user.findUnique.mockImplementation(async ({ where }) => users.get(where.id));
  prisma.libraryItem.findMany.mockImplementation(async ({ where }) => records.filter((r) => where.id.in.includes(r.id)));
  handler = async (req, res, body) => {
    if (req.url === '/api/ask') send(res, done(body.session_id));
    else if (req.url.startsWith('/api/jobs/')) send(res, done(sessionForJob));
    else if (req.url.startsWith('/api/books/')) {
      const code = decodeURIComponent(req.url.split('/').at(-1)); send(res, { book_code: code, card: card(code) });
    } else if (req.url === '/api/session/reset') send(res, { status: 'ok', session_id: body.session_id });
    else if (req.url === '/api/health') send(res, health());
    else send(res, {}, 404);
  };
  setup();
});
afterEach(() => { logSpy.mockRestore(); errorSpy.mockRestore(); });

describe('conditional configuration and disabled app', () => {
  it('does not validate unused AI settings or read a map when disabled', async () => {
    expect(readAiConfig({ RAG_URL: 'invalid', AI_BOOK_CODE_MAP_PATH: 'missing' })).toEqual({ AI_ENABLED: false });
    setup({ AI_ENABLED: false, AI_BOOK_CODE_MAP_PATH: 'missing' });
    expect((await post('/ask')).status).toBe(503);
    expect(calls).toHaveLength(0);
    expect((await request(ordinaryApp).get('/')).status).toBe(200);
    expect((await request(ordinaryApp).get('/api/v1/health/live')).status).toBe(200);
  });
  it('parses enabled defaults and validates all configuration without printing values', () => {
    const input = { ...config(), AI_ENABLED: 'true' };
    const parsed = readAiConfig(input);
    expect(parsed.AI_ENABLED).toBe(true);
    expect(parsed.AI_REQUEST_MAX_BYTES).toBe(8192);
    for (const patch of [{ RAG_SERVICE_KEY: '' }, { RAG_URL: 'https://u:password@host' },
      { RAG_URL: 'http://host/api' }, { RAG_URL: 'file:///tmp' }, { AI_SOURCE_SHA256: 'bad' },
      { AI_ASK_TIMEOUT_MS: 20000 }, { AI_HEALTH_TIMEOUT_MS: 9000 }, { AI_REQUEST_MAX_BYTES: 100000 },
      { AI_POLL_TIMEOUT_MARGIN_MS: 6000 }, { AI_SERVICE_EPOCH: '' }, { AI_ENABLED: 'yes' }]) {
      expect(() => readAiConfig({ ...input, ...patch })).toThrow('Invalid AI configuration:');
    }
    expect(() => readAiConfig({ AI_ENABLED: 'true', RAG_SERVICE_KEY: KEY })).not.toThrow(KEY);
  });
  it.each(['ask', 'jobs/' + 'f'.repeat(32), 'books/2', 'session/reset', 'health'])('disabled %s never dispatches', async (path) => {
    setup({ AI_ENABLED: false });
    const res = ['ask', 'session/reset'].includes(path) ? await post('/' + path) : await get('/' + path);
    expect(res.status).toBe(503); expect(calls).toHaveLength(0);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('authentication and trusted outbound identity', () => {
  it.each(['/ask', '/jobs/' + 'f'.repeat(32), '/books/2', '/session/reset', '/health', '/research/ask', '/research/health'])('requires auth on %s', async (path) => {
    const res = ['/ask', '/session/reset', '/research/ask'].includes(path) ? await request(app).post('/api/v1/ai' + path).send({})
      : await request(app).get('/api/v1/ai' + path);
    expect(res.status).toBe(401); expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['x-request-id']).toBeTruthy(); expect(calls).toHaveLength(0);
  });
  it('rejects expired/invalid JWT and an inactive or removed current user', async () => {
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign({}, process.env.AUTH_TOKEN_SECRET, {
      subject: USER, issuer: 'sams-library-api', audience: 'sams-library-web', expiresIn: -1 });
    expect((await request(app).get('/api/v1/ai/health').set('Authorization', `Bearer ${token}`)).body.error.code).toBe('INVALID_TOKEN');
    expect((await request(app).get('/api/v1/ai/health').set('Authorization', 'Bearer invalid')).status).toBe(401);
    users.get(USER).isActive = false;
    expect((await post('/ask')).status).toBe(401);
    users.delete(USER); expect((await get('/health')).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it.each(['STUDENT', 'LIBRARIAN', 'MANAGEMENT'])('gives %s the shared assistant contract using current DB roles', async (role) => {
    const metadata = { status: 'success', results: [{ id: A, title: 'Fixture academic work' }] };
    const research = { ask: vi.fn().mockResolvedValue(metadata) };
    setup({}, { research });
    users.set(USER, makeUser(USER, [role])); // The issued JWT still claims STUDENT.
    const defaultHandler = handler;
    handler = async (req, res, body) => {
      if (req.url !== '/api/ask') return defaultHandler(req, res, body);
      sessionForJob = body.session_id;
      send(res, pending(body.session_id));
    };

    const ask = await post('/ask');
    expect(ask.status).toBe(200);
    expect(ask.body.data.status).toBe('pending');
    const { job_id: jobId, session_id: sessionId } = ask.body.data;
    const poll = await get('/jobs/' + jobId);
    expect(poll.status).toBe(200);
    expect(poll.body.data).toMatchObject({ status: 'done', session_id: sessionId });
    const record = await get('/books/2');
    expect(record.status).toBe(200);
    expect(record.body.data).toMatchObject({ book_code: '2', card: card('2') });
    const reset = await post('/session/reset', { session_id: sessionId });
    expect(reset.status).toBe(200);
    expect(reset.body.data.session_id).not.toBe(sessionId);
    expect((await get('/health')).body).toEqual({ data: { status: 'ok' } });
    const search = await post('/research/ask', { question: 'Fixture academic work' });
    expect(search.status).toBe(200);
    expect(search.body.data).toEqual(metadata);
    expect(research.ask).toHaveBeenCalledTimes(1);
    expect(research.ask).toHaveBeenCalledWith('Fixture academic work');
    expect(calls).toHaveLength(5);
    expect(calls.every(({ headers }) => headers['x-user-role'] === role)).toBe(true);
  });
  it('does not invent ADMIN permissions or trust a JWT-only student role', async () => {
    users.set(USER, makeUser(USER, ['ADMIN']));
    expect((await get('/health')).status).toBe(403);
    expect((await post('/ask')).status).toBe(403);
    expect((await post('/research/ask')).status).toBe(403);
  });
  it('fails closed when the current-user database lookup fails, without logging its exception', async () => {
    prisma.user.findUnique.mockRejectedValue(new Error(KEY));
    const res = await get('/health'); expect(res.status).toBe(503); expect(calls).toHaveLength(0);
    expect(JSON.stringify([res.body, logSpy.mock.calls, errorSpy.mock.calls])).not.toContain(KEY);
  });
  it('constructs fresh trusted headers and reconstructs JSON', async () => {
    users.set(USER, makeUser(USER, ['STUDENT', 'LIBRARIAN', 'STUDENT']));
    const res = await post('/ask', { question: '  help  ', filters: { language: 'ar', topics_mode: 'all' } })
      .set('X-Service-Key', 'browser-forgery').set('X-User-Id', 'intruder').set('X-User-Role', 'MANAGEMENT')
      .set('Cookie', 'secret-browser-cookie').set('X-Arbitrary', 'not-forwarded').set('X-Request-Id', 'trusted-test-request');
    expect(res.status).toBe(200);
    const call = calls[0];
    expect(call.headers['x-service-key'] === KEY).toBe(true);
    expect(call.headers['x-user-id']).toBe(USER); expect(call.headers['x-user-role']).toBe('LIBRARIAN,STUDENT');
    expect(call.headers['x-request-id']).toBe('trusted-test-request');
    expect(call.headers.authorization).toBeUndefined(); expect(call.headers.cookie).toBeUndefined();
    expect(call.headers['x-arbitrary']).toBeUndefined();
    expect(call.body.question).toBe('help'); expect(call.body.session_id).not.toBe(res.body.data.session_id);
    expect(res.headers['x-request-id']).toBe('trusted-test-request');
    expect(JSON.stringify(res.body)).not.toContain(call.body.session_id);
  });
});

describe('strict browser validation before dispatch', () => {
  it.each([
    {}, { question: '' }, { question: '  ' }, { question: '\u0085\u001c' }, { question: '😀'.repeat(501) }, { question: '\ud800' },
    { question: 'help', userId: USER }, { question: 'help', session_id: '' }, { question: 'help', session_id: 'f'.repeat(65) },
    { question: 'help', filters: { unknown: true } }, { question: 'help', filters: { topics_mode: 'ANY' } },
    { question: 'help', filters: { topics_mode: null } }, { question: 'help', filters: { language: 'fr' } },
    { question: 'help', filters: { author: [] } }, { question: 'help', filters: { author: ['x'.repeat(201)] } },
    { question: 'help', filters: { author: Array(11).fill('x') } },
    { question: 'help', filters: { topics: [] } }, { question: 'help', filters: { topics: ['  '] } },
    { question: 'help', filters: { title: 'x'.repeat(201) } }, { question: 'help', filters: { publisher: '' } },
    { question: 'help', filters: { year_from: 1899 } }, { question: 'help', filters: { year_to: 2031 } },
    { question: 'help', filters: { year_from: '2000' } }, { question: 'help', filters: { year_to: 2000.5 } },
    { question: 'help', filters: { year_from: 2020, year_to: 2010 } }
  ])('rejects invalid input %#', async (body) => {
    expect((await post('/ask', body)).status).toBe(400); expect(calls).toHaveLength(0);
  });
  it('counts code points and accepts all bounded filters/null optional fields', async () => {
    const res = await post('/ask', { question: '😀'.repeat(500), session_id: null, filters: {
      author: ['😀'.repeat(200)], title: null, topics: ['topic'], topics_mode: 'all',
      language: 'ar', year_from: 1900, year_to: 2030, publisher: 'publisher' } });
    expect(res.status).toBe(200); expect([...calls[0].body.question]).toHaveLength(500);
  });
  it('rejects unsupported media, malformed/duplicate JSON and excessive decoded bodies', async () => {
    expect((await post('/ask', 'text').type('text')).status).toBe(415);
    expect((await post('/ask', '{').type('json')).body.error.code).toBe('INVALID_JSON');
    expect((await post('/ask', '{"question":"help","question":"other"}').type('json')).status).toBe(400);
    expect((await post('/ask', { question: 'x'.repeat(9000) })).status).toBe(413);
    expect(calls).toHaveLength(0);
  });
  it('enforces the 8 KiB budget after gzip inflation', async () => {
    const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/ai/ask`, {
        method: 'POST', headers: { Authorization: `Bearer ${tokens[USER]}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: gzipSync(JSON.stringify({ question: 'x'.repeat(9000) })) });
      expect(response.status).toBe(413); expect(calls).toHaveLength(0);
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
  it.each(['NaN', 'Infinity', '-1', '26', '', '1e1', '10&wait=10', '10&user=x', '10&wait[]=1'])('rejects wait=%s', async (value) => {
    const res = await get('/jobs/' + 'f'.repeat(32) + '?wait=' + value);
    expect(res.status).toBe(400); expect(calls).toHaveLength(0);
  });
  it.each(['a%20b', '%3B', '%2F', '%5C', '%00', '%E0%A4%A', 'x'.repeat(65), 'x..y'])('rejects book token %s', async (code) => {
    expect((await get('/books/' + code)).status).toBe(400); expect(calls).toHaveLength(0);
  });
  it('rejects unknown query keys on non-poll endpoints and HEAD does not dispatch', async () => {
    expect((await get('/books/2?wait=0')).status).toBe(400);
    expect((await get('/health?user=x')).status).toBe(400);
    expect((await post('/ask?x=1')).status).toBe(400);
    expect((await request(app).head('/api/v1/ai/health').set('Authorization', `Bearer ${tokens[USER]}`)).status).toBe(405);
    expect(calls).toHaveLength(0);
  });
  it('accepts quoted UTF-8 charset, rejects unsupported encodings and GET bodies', async () => {
    expect((await post('/ask').set('Content-Type', 'application/json; charset="utf-8"')).status).toBe(200);
    const before = calls.length;
    expect((await post('/ask').set('Content-Type', 'application/json; charset=latin1')).status).toBe(415);
    expect((await post('/ask').set('Content-Encoding', 'unrecognized')).status).toBe(415);
    expect((await get('/books/2').set('Content-Type', 'application/json').send('{}')).status).toBe(400);
    expect(calls).toHaveLength(before);
  });
  it('treats an empty JSON body as malformed, and preserves no-store on early CORS rejection', async () => {
    const empty = await request(app).post('/api/v1/ai/ask').set('Authorization', `Bearer ${tokens[USER]}`)
      .set('Content-Type', 'application/json').set('Content-Length', '0');
    expect(empty.status).toBe(400); expect(empty.body.error.code).toBe('INVALID_JSON');
    const denied = await request(ordinaryApp).get('/api/v1/ai/health').set('Origin', 'https://untrusted.invalid');
    expect(denied.status).toBe(403); expect(denied.headers['cache-control']).toBe('no-store');
    expect(denied.headers['x-request-id']).toBeTruthy();
  });
});

describe('state union, projection and HTTP mapping', () => {
  it.each(['help', 'gemini', 'refusal', 'extractive', 'cached'])('preserves %s done', async (mode) => {
    handler = async (_req, res, body) => send(res, { ...done(body.session_id, {
      provider: mode === 'help' ? 'help' : mode === 'extractive' ? 'extractive' : 'gemini',
      is_refusal: mode === 'refusal', hint: mode === 'refusal' ? 'Try a book topic' : null,
      notice: mode === 'extractive' ? 'Assistant is busy' : null }), ...(mode === 'cached' ? { cached: true } : {}) });
    const res = await post('/ask'); expect(res.status).toBe(200); expect(res.body.data.status).toBe('done');
    expect(res.body.data.result.is_refusal).toBe(mode === 'refusal');
    expect(res.body.data.cached).toBe(mode === 'cached' ? true : undefined);
    expect(gateway.state.work.size).toBe(0);
  });
  it.each([null, { search_query: 'books', filters_applied: {}, books: [book()] }])('handles pending preview %# then done and cached polling without regeneration', async (preview) => {
    handler = async (req, res, body) => {
      if (req.url === '/api/ask') { sessionForJob = body.session_id; send(res, pending(body.session_id, preview)); }
      else send(res, done(sessionForJob));
    };
    const first = await post('/ask'); const data = first.body.data;
    expect(first.status).toBe(200); expect(data.status).toBe('pending');
    expect(data.preview === null).toBe(preview === null);
    expect(data.job_id).not.toBe('upstream_job_123'); expect(gateway.state.work.size).toBe(1);
    if (preview) expect(data.preview.books[0].identity).toEqual({ status: 'mapped', library_item_id: A });
    const next = await get(`/jobs/${data.job_id}?wait=0`);
    expect(next.status).toBe(200); expect(next.body.data.status).toBe('done');
    expect(next.body.data.job_id).toBe(data.job_id); expect(gateway.state.work.size).toBe(0);
    expect((await get(`/jobs/${data.job_id}`)).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
  it('maps worker body error to terminal 502 without leaking message', async () => {
    handler = async (_req, res, body) => send(res, { status: 'error', session_id: body.session_id, message: KEY });
    const res = await post('/ask'); expect(res.status).toBe(502); expect(res.body.error.code).toBe('AI_UPSTREAM_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(KEY); expect(gateway.state.work.size).toBe(0);
  });
  it.each([[401, 503, 'AI_SERVICE_UNAVAILABLE'], [409, 409, 'AI_SESSION_BUSY'], [429, 429, 'AI_RATE_LIMITED'],
    [422, 502, 'AI_UPSTREAM_CONTRACT_MISMATCH'], [500, 503, 'AI_SERVICE_UNAVAILABLE']])('maps upstream %i without POST retries', async (code, expected, name) => {
    handler = async (_req, res) => send(res, { detail: KEY }, code);
    const res = await post('/ask'); expect(res.status).toBe(expected); expect(res.body.error.code).toBe(name);
    expect(calls).toHaveLength(1); expect(JSON.stringify(res.body)).not.toContain(KEY);
    if (code === 429) expect(res.headers['retry-after']).toBe('60');
  });
  it.each(['non-json', 'wrong-state', 'wrong-session', 'missing-field'])('rejects malformed upstream %s and holds uncertain work', async (mode) => {
    handler = async (_req, res, body) => {
      if (mode === 'non-json') send(res, '<html>bad</html>', 200, { 'Content-Type': 'text/html' });
      else if (mode === 'wrong-state') send(res, { status: 'new', session_id: body.session_id });
      else if (mode === 'wrong-session') send(res, done('wrong'));
      else { const payload = done(body.session_id); delete payload.result.notice; send(res, payload); }
    };
    const res = await post('/ask'); expect(res.status).toBe(502); expect(res.body.error.code).toBe('AI_UPSTREAM_PROTOCOL_ERROR');
    expect(gateway.state.work.size).toBe(1); expect(calls).toHaveLength(1);
  });
  it('strips unexpected fields recursively and rejects known-field private echoes', async () => {
    handler = async (_req, res, body) => send(res, { ...done(body.session_id, { sources: [{ ...book(), card: card(), identity: { status: 'forged' }, cover: KEY }], secret: KEY }), internal: KEY });
    const res = await post('/ask'); expect(res.status).toBe(200); expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect(res.body.data.result.sources[0].cover).toBeUndefined();
    handler = async (_req, res, body) => send(res, done(body.session_id, { answer: body.session_id }));
    expect((await post('/ask')).body.error.code).toBe('AI_UPSTREAM_PROTOCOL_ERROR');
    handler = async (_req, res, body) => send(res, done(body.session_id, { answer: KEY }));
    expect((await post('/ask')).status).toBe(502);
  });
  it('enforces streamed response size including gzip inflation', async () => {
    setup({ AI_RESPONSE_MAX_BYTES: 1024 });
    handler = async (_req, res, body) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
      res.end(gzipSync(JSON.stringify(done(body.session_id, { answer: 'x'.repeat(5000) }))));
    };
    const res = await post('/ask'); expect(res.status).toBe(502); expect(res.body.error.code).toBe('AI_RESPONSE_TOO_LARGE');
    expect(gateway.state.work.size).toBe(1);
  });
  it('enforces final serialized response budget after enrichment', async () => {
    const payload = { book_code: '2', card: card() };
    setup({ AI_RESPONSE_MAX_BYTES: Buffer.byteLength(JSON.stringify(payload)) + 8 });
    const res = await get('/books/2'); expect(res.status).toBe(502); expect(res.body.error.code).toBe('AI_RESPONSE_TOO_LARGE');
  });
  it('uses one bounded GET retry and no retries for service auth or not-found', async () => {
    handler = async (_req, res) => calls.length === 1 ? send(res, {}, 503) : send(res, { book_code: '2', card: card() });
    expect((await get('/books/2')).status).toBe(200); expect(calls).toHaveLength(2);
    calls.length = 0; handler = async (_req, res) => send(res, {}, 401);
    expect((await get('/books/2')).status).toBe(503); expect(calls).toHaveLength(1);
    calls.length = 0; handler = async (_req, res) => send(res, {}, 404);
    expect((await get('/books/2')).body.error.code).toBe('AI_BOOK_NOT_FOUND'); expect(calls).toHaveLength(1);
  });
  it('never exceeds one GET retry and honors upstream 429 without replay', async () => {
    handler = async (_req, res) => send(res, {}, 503);
    expect((await get('/books/2')).status).toBe(503); expect(calls).toHaveLength(2);
    calls.length = 0; handler = async (_req, res) => send(res, {}, 429);
    expect((await get('/books/2')).headers['retry-after']).toBe('60'); expect(calls).toHaveLength(1);
  });
  it('does not follow redirects or treat non-JSON 5xx as a successful response', async () => {
    handler = async (_req, res) => send(res, '', 302, { Location: 'https://example.invalid/never-follow' });
    expect((await get('/books/2')).status).toBe(502); expect(calls).toHaveLength(1);
    calls.length = 0; handler = async (_req, res) => send(res, '<html>unavailable</html>', 500, { 'Content-Type': 'text/html' });
    expect((await get('/books/2')).status).toBe(503); expect(calls).toHaveLength(1);
  });
  it('returns 504 on a total deadline and does not replay ask', async () => {
    setup({ AI_ASK_TIMEOUT_MS: 30 }); handler = async () => {};
    const res = await post('/ask'); expect(res.status).toBe(504); expect(calls).toHaveLength(1);
    expect(gateway.state.work.size).toBe(1); expect(gateway.state.sessions.get(res.body.session_id).state).toBe('uncertain');
    expect((await post('/ask', { question: 'help', session_id: res.body.session_id })).status).toBe(409);
    expect((await post('/session/reset', { session_id: res.body.session_id })).status).toBe(409);
    expect(calls).toHaveLength(1);
  });
  it('keeps the total deadline active after headers arrive while a JSON body stalls', async () => {
    setup({ AI_ASK_TIMEOUT_MS: 30 });
    handler = async (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"status":'); };
    const res = await post('/ask'); expect(res.status).toBe(504); expect(calls).toHaveLength(1);
    expect(gateway.state.work.size).toBe(1);
  });
  it('exposes sanitized health only for a valid ready engine, never settings/paths', async () => {
    const res = await get('/health'); expect(res.body).toEqual({ data: { status: 'ok' } });
    handler = async (_req, response) => send(response, { status: 'ok' });
    expect((await get('/health')).status).toBe(503);
    handler = async (_req, response) => { const payload = health(); payload.settings.wait_s = 25; send(response, payload); };
    expect((await get('/health')).status).toBe(503);
    setup({ AI_HEALTH_TIMEOUT_MS: 30 }); handler = async () => {};
    expect((await get('/health')).status).toBe(503);
  });
});

describe('owned sessions, jobs, reset and admission', () => {
  async function startPending() {
    handler = async (_req, res, body) => { sessionForJob = body.session_id; send(res, pending(body.session_id)); };
    return (await post('/ask')).body.data;
  }
  it.each(['STUDENT', 'LIBRARIAN', 'MANAGEMENT'])('rejects foreign sessions, jobs and resets for %s before upstream', async (role) => {
    users.set(OTHER, makeUser(OTHER, [role]));
    const data = await startPending();
    for (const id of [data.session_id, 'f'.repeat(32)]) {
      const res = await post('/ask', { question: 'help', session_id: id }, OTHER);
      expect(res.status).toBe(404); expect(res.body.error.code).toBe('AI_SESSION_NOT_FOUND');
      expect((await post('/session/reset', { session_id: id }, OTHER)).body.error.code).toBe('AI_SESSION_NOT_FOUND');
    }
    for (const id of [data.job_id, 'f'.repeat(32)]) expect((await get('/jobs/' + id, OTHER)).body.error.code).toBe('AI_JOB_NOT_FOUND');
    expect(calls).toHaveLength(1);
  });
  it('locks active ask/reset and retains capacity across job expiry', async () => {
    const data = await startPending();
    expect((await post('/ask', { question: 'next', session_id: data.session_id })).status).toBe(409);
    expect((await post('/session/reset', { session_id: data.session_id })).status).toBe(409);
    expect((await post('/ask')).status).toBe(503);
    clock += 60 * 60 * 1000;
    expect((await get('/jobs/' + data.job_id)).status).toBe(404);
    expect(gateway.state.work.size).toBe(1); expect(calls).toHaveLength(1);
  });
  it('maps missing or failed jobs without releasing unknown work or resubmitting a question', async () => {
    const data = await startPending();
    handler = async (_req, res) => send(res, {}, 404);
    const missing = await get('/jobs/' + data.job_id);
    expect(missing.body.error.code).toBe('AI_JOB_NOT_FOUND');
    expect((await get('/jobs/' + data.job_id)).status).toBe(404);
    expect(gateway.state.work.size).toBe(1); expect(calls).toHaveLength(2);
    setup();
    const second = await startPending();
    handler = async (_req, res) => send(res, { status: 'error', session_id: sessionForJob, message: KEY });
    expect((await get('/jobs/' + second.job_id)).body.error.code).toBe('AI_UPSTREAM_ERROR');
    const count = calls.length;
    expect((await get('/jobs/' + second.job_id)).status).toBe(502);
    expect(calls).toHaveLength(count); expect(gateway.state.work.size).toBe(0);
  });
  it('locks concurrent long polls and enforces the 500ms pending gap', async () => {
    const data = await startPending(); let release;
    handler = async (_req, res) => { await new Promise((resolve) => { release = resolve; }); send(res, pending(sessionForJob)); };
    const first = get('/jobs/' + data.job_id + '?wait=0').then((r) => r);
    await waitUntil(() => release);
    expect((await get('/jobs/' + data.job_id)).status).toBe(409);
    release(); expect((await first).status).toBe(200);
    expect((await get('/jobs/' + data.job_id)).status).toBe(409);
    clock += 500;
    handler = async (_req, res) => send(res, done(sessionForJob));
    expect((await get('/jobs/' + data.job_id)).status).toBe(200);
  });
  it('rotates an idle owned conversation and invalidates its old handle', async () => {
    const initial = await post('/ask'); const id = initial.body.data.session_id;
    const res = await post('/session/reset', { session_id: id });
    expect(res.status).toBe(200); expect(res.body.data.session_id).not.toBe(id);
    expect(calls[1].body.session_id).toBe(calls[0].body.session_id);
    expect((await post('/ask', { question: 'help', session_id: id })).status).toBe(404);
    expect((await post('/ask', { question: 'help', session_id: res.body.data.session_id })).status).toBe(200);
    expect(calls[2].body.session_id).not.toBe(calls[0].body.session_id);
  });
  it('locks a concurrent reset and never reports cleanup failure as success or retries it', async () => {
    const id = (await post('/ask')).body.data.session_id; let release;
    handler = async (_req, res) => { await new Promise((resolve) => { release = resolve; }); send(res, {}, 503); };
    const first = post('/session/reset', { session_id: id }).then((r) => r);
    await waitUntil(() => release);
    expect((await post('/session/reset', { session_id: id })).status).toBe(409);
    expect((await post('/ask', { question: 'help', session_id: id })).status).toBe(409);
    release(); expect((await first).status).toBe(503); expect(calls).toHaveLength(2);
  });
  it('expires idle handles without polling renewal and rejects previous service epochs', async () => {
    const id = (await post('/ask')).body.data.session_id;
    clock += 2 * 60 * 60 * 1000;
    expect((await post('/session/reset', { session_id: id })).status).toBe(404);
    const data = await startPending();
    gateway.state.replaceEpoch('fixture-epoch-2');
    expect((await get('/jobs/' + data.job_id)).status).toBe(404);
    expect((await post('/ask', { question: 'help', session_id: data.session_id })).status).toBe(404);
    expect(gateway.state.work.size).toBe(0);
  });
  it('caps asks across sessions including cached responses and mixed roles', async () => {
    users.set(USER, makeUser(USER, ['STUDENT', 'LIBRARIAN']));
    handler = async (_req, res, body) => send(res, { ...done(body.session_id), cached: true });
    for (let n = 0; n < 20; n++) expect((await post('/ask')).status).toBe(200);
    const limited = await post('/ask'); expect(limited.status).toBe(429); expect(limited.headers['retry-after']).toBe('60');
    expect(calls).toHaveLength(20);
    clock += 60000; expect((await post('/ask')).status).toBe(200);
  });
  it('caps globally active/uncertain work at four across distinct users', () => {
    const state = new AiState('epoch', () => clock);
    for (let n = 0; n < 4; n++) state.admit('user' + n, null, 'request');
    expect(() => state.admit('fifth', null, 'request')).toThrow();
    clock += 3 * 60 * 60 * 1000; state.cleanup();
    expect(state.sessions.size).toBe(0); expect(state.work.size).toBe(4);
    expect(() => state.admit('sixth', null, 'request')).toThrow();
  });
  it.each([['poll', 60], ['card', 60], ['reset', 10], ['health', 30]])('throttles %s by user across handles', (operation, limit) => {
    const state = new AiState('epoch', () => clock);
    for (let n = 0; n < limit; n++) state.throttle(USER, operation, limit);
    try { state.throttle(USER, operation, limit); throw new Error('Not throttled'); }
    catch (error) { expect(error.code).toBe('AI_RATE_LIMITED'); expect(error.retryAfter).toBe(60); }
    expect(() => state.throttle(OTHER, operation, limit)).not.toThrow();
  });
  it('disconnecting a poll leaves its job active and recoverable by GET', async () => {
    const data = await startPending(); let release;
    handler = async (_req, res) => { await new Promise((resolve) => { release = resolve; }); send(res, done(sessionForJob)); };
    const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    try {
      const req = http.get(`http://127.0.0.1:${server.address().port}/api/v1/ai/jobs/${data.job_id}`, {
        headers: { Authorization: `Bearer ${tokens[USER]}` } });
      req.on('error', () => {}); await waitUntil(() => release); req.destroy();
      await waitUntil(() => !gateway.state.jobs.get(data.job_id).polling);
      expect(gateway.state.work.size).toBe(1); release();
      handler = async (_req, res) => send(res, done(sessionForJob));
      expect((await get('/jobs/' + data.job_id)).status).toBe(200); expect(gateway.state.work.size).toBe(0);
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
  it('retains post-disconnect dispatch until the pending response is recorded; never replays POST', async () => {
    let release;
    handler = async (_req, res, body) => { await new Promise((resolve) => { release = resolve; }); send(res, pending(body.session_id)); };
    const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    try {
      const req = http.request(`http://127.0.0.1:${server.address().port}/api/v1/ai/ask`, {
        method: 'POST', headers: { Authorization: `Bearer ${tokens[USER]}`, 'Content-Type': 'application/json' } });
      req.on('error', () => {}); req.end(JSON.stringify({ question: 'help' }));
      await waitUntil(() => release); req.destroy(); release();
      await waitUntil(() => gateway.state.jobs.size === 1);
      expect(gateway.state.work.size).toBe(1); expect(calls).toHaveLength(1);
      expect((await post('/ask')).status).toBe(503);
      await waitUntil(() => logSpy.mock.calls.some(([line]) => line.includes('ai_client_disconnect')));
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
});

describe('exact book identity, provenance and explicit catalog failures', () => {
  it.each([['2', 'mapped', A], ['missing', 'unmapped', null], ['2; missing', 'unmapped', null],
    ['1687; 1896', 'ambiguous', null], ['stale', 'unavailable', null], ['0002', 'mapped', B], ['NA', 'unmapped', null]])(
    'resolves complete card group %s without title/ISBN/stock inference', async (codes, status, id) => {
      handler = async (_req, res) => send(res, { book_code: '2', card: card(codes) });
      const res = await get('/books/2'); expect(res.status).toBe(200);
      expect(res.body.data.identity).toEqual({ status, library_item_id: id });
      expect(Object.keys(res.body.data.card)).toHaveLength(22);
      expect(res.body.data.availability).toBeUndefined(); expect(res.body.data.cover).toBeUndefined();
      if (status === 'ambiguous') expect(JSON.stringify(res.body)).not.toContain(A);
    });
  it('preserves leading zero path and sends its exact code upstream', async () => {
    const res = await get('/books/0002'); expect(res.body.data.identity.library_item_id).toBe(B);
    expect(calls[0].path).toBe('/api/books/0002');
  });
  it('batch resolves sources and all_books in one read and never trusts supplied identity', async () => {
    handler = async (_req, res, body) => send(res, done(body.session_id, { provider: 'gemini',
      sources: [{ ...book(['1687', '1896']), card: card('1687; 1896') }, { ...book(['2']), card: card() }],
      all_books: { complete: true, items: [{ ...book(['0002']), n: 1, copies: 999, in_answer: true }] } }));
    const res = await post('/ask'); expect(res.status).toBe(200);
    expect(res.body.data.result.sources[0].identity.status).toBe('ambiguous');
    expect(res.body.data.result.sources[1].identity.library_item_id).toBe(A);
    expect(res.body.data.result.all_books.items[0].identity.library_item_id).toBe(B);
    expect(prisma.libraryItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.libraryItem.findMany.mock.calls[0][0].where).toEqual({ id: { in: [A, B] }, isActive: true, type: 'BOOK', bookDetails: { isNot: null } });
  });
  it('also resolves codes present only in a source full card', async () => {
    handler = async (_req, res, body) => send(res, done(body.session_id, {
      provider: 'gemini', sources: [{ ...book(['1687']), card: card('1687; 1896') }] }));
    const res = await post('/ask'); expect(res.body.data.result.sources[0].identity.status).toBe('ambiguous');
  });
  it('revalidates catalog targets on a retained completed job without another upstream request', async () => {
    handler = async (req, res, body) => {
      if (req.url === '/api/ask') { sessionForJob = body.session_id; send(res, pending(body.session_id)); }
      else send(res, done(sessionForJob, { provider: 'gemini', sources: [{ ...book(), card: card() }] }));
    };
    const data = (await post('/ask')).body.data;
    expect((await get('/jobs/' + data.job_id)).body.data.result.sources[0].identity.status).toBe('mapped');
    records = [];
    expect((await get('/jobs/' + data.job_id)).body.data.result.sources[0].identity.status).toBe('unavailable');
    expect(calls).toHaveLength(2); expect(prisma.libraryItem.findMany).toHaveBeenCalledTimes(2);
  });
  it.each(['inactive', 'wrong-type', 'no-details', 'missing'])('marks %s target unavailable', async (mode) => {
    records = mode === 'missing' ? [] : [{ id: A, isActive: mode !== 'inactive', type: mode === 'wrong-type' ? 'PROJECT' : 'BOOK',
      bookDetails: mode === 'no-details' ? null : { itemId: A } }];
    expect((await get('/books/2')).body.data.identity).toEqual({ status: 'unavailable', library_item_id: null });
  });
  it('fails explicitly on DB errors/timeouts with no error/secret leak', async () => {
    prisma.libraryItem.findMany.mockRejectedValue(new Error(KEY));
    const res = await get('/books/2'); expect(res.status).toBe(503); expect(res.body.error.code).toBe('AI_CATALOG_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    prisma.libraryItem.findMany.mockImplementation(() => new Promise(() => {}));
    setup({}, { identityTimeoutMs: 10 });
    expect((await get('/books/2')).body.error.code).toBe('AI_CATALOG_UNAVAILABLE');
  });
  it('does not expose known secrets/configuration or internal IDs in error responses or logs', async () => {
    handler = async (_req, res, body) => send(res, done(body.session_id, { answer: KEY }));
    const res = await post('/ask'); expect(res.status).toBe(502);
    const internal = calls[0].body.session_id;
    const outputs = JSON.stringify([res.body, logSpy.mock.calls, errorSpy.mock.calls]);
    for (const value of [KEY, internal, mapPath, sha(artifact), sourceHash, upstreamUrl]) expect(outputs.includes(value)).toBe(false);
  });
  it.each(['fingerprint', 'source', 'duplicate', 'escaped-duplicate', 'invalid-uuid', 'array-target', 'empty', 'extra'])('rejects %s mapping and all routes fail closed', async (mode) => {
    let bytes = artifact;
    if (mode === 'source') bytes = JSON.stringify({ sourceSha256: 'b'.repeat(64), map: { '2': A } });
    if (mode === 'duplicate') bytes = `{"sourceSha256":"${sourceHash}","map":{"2":"${A}","2":"${B}"}}`;
    if (mode === 'escaped-duplicate') bytes = `{"sourceSha256":"${sourceHash}","map":{"2":"${A}","\\u0032":"${B}"}}`;
    if (mode === 'invalid-uuid') bytes = JSON.stringify({ sourceSha256: sourceHash, map: { '2': 'not-a-uuid' } });
    if (mode === 'array-target') bytes = JSON.stringify({ sourceSha256: sourceHash, map: { '2': [A, B] } });
    if (mode === 'empty') bytes = JSON.stringify({ sourceSha256: sourceHash, map: {} });
    if (mode === 'extra') bytes = JSON.stringify({ sourceSha256: sourceHash, map: { '2': A }, secret: KEY });
    const path = join(fixtureDir, 'invalid-map-' + mode + '.json'); writeFileSync(path, bytes);
    const cfg = { AI_BOOK_CODE_MAP_PATH: path, AI_BOOK_CODE_MAP_SHA256: mode === 'fingerprint' ? '0'.repeat(64) : sha(bytes) };
    expect(() => loadBookCodeMap(config(cfg))).toThrow(); setup(cfg);
    expect((await get('/health')).status).toBe(503); expect((await post('/ask')).status).toBe(503);
    expect(calls).toHaveLength(0); expect(prisma.libraryItem.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(path);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(KEY);
  });
});

describe('existing auth/discovery/availability routes with read-only mocked Prisma', () => {
  const ordinary = (path) => request(ordinaryApp).get(path).set('Authorization', `Bearer ${tokens[USER]}`);
  it('preserves development login and current-user auth on ordinary SAMS routes', async () => {
    prisma.user.findUnique.mockImplementation(async ({ where }) => where.id ? users.get(where.id) : users.get(USER));
    const login = await request(ordinaryApp).post('/api/v1/auth/dev-login').send({ universityEmail: 'fixture@example.invalid' });
    expect(login.status).toBe(200); expect(login.body.user.roles).toEqual(['STUDENT']);
    const me = await request(ordinaryApp).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.body.user.id).toBe(USER); expect(calls).toHaveLength(0);
  });
  it('preserves discovery detail and zero-stock semantics', async () => {
    prisma.libraryItem.findFirst.mockResolvedValue({ id: A, type: 'BOOK', isActive: true, title: 'Fixture', bookDetails: { isbn: null } });
    prisma.branch.findMany.mockResolvedValue([]);
    const res = await ordinary('/api/v1/discovery/items/' + A);
    expect(res.status).toBe(200); expect(res.body.data.id).toBe(A);
    expect(res.body.data.availability.available).toBe(false);
    expect(res.body.data.reservationReadiness.hasAvailableCopy).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('preserves SAMS availability counts and ignores non-available copy statuses', async () => {
    prisma.libraryItem.findFirst.mockResolvedValue({ id: A, type: 'BOOK', title: 'Fixture' });
    prisma.branch.findMany.mockResolvedValue([{ id: 'branch', code: 'MAIN', name: 'Fixture' }]);
    prisma.physicalCopy.groupBy.mockResolvedValue([{ branchId: 'branch', status: 'AVAILABLE', _count: { _all: 2 } },
      { branchId: 'branch', status: 'RESERVED', _count: { _all: 4 } }]);
    const res = await ordinary('/api/v1/catalog/items/' + A + '/availability');
    expect(res.status).toBe(200); expect(res.body.data.totalCopies).toBe(6);
    expect(res.body.data.availableCopies).toBe(2); expect(calls).toHaveLength(0);
  });
  it.each(['/api/v1/discovery/items', '/api/v1/catalog/items', '/api/v1/catalog/items/' + A + '/availability'])(
    'still requires auth on ordinary route %s', async (path) => {
      expect((await request(ordinaryApp).get(path)).status).toBe(401);
      expect(prisma.libraryItem.findMany).not.toHaveBeenCalled();
    });
  it('leaves the ordinary JSON parser budget larger than the AI budget', async () => {
    const res = await request(ordinaryApp).post('/api/v1/auth/dev-login').send({ question: 'x'.repeat(9000) });
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
