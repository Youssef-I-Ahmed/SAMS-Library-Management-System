import http from 'node:http';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createBookClustering, createResearchService, createSubjectClassifier, serviceOrigin
} from '../src/modules/ai/model-services.js';
import { buildResearchIndex, createResearchRag, rankByCodes } from '../src/modules/ai/research-rag.js';

const SECRET = 's'.repeat(40);
let server, url, handler, calls;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    calls.push({ path: req.url, method: req.method, headers: req.headers, body });
    const [status, payload] = await handler(req, body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
const reset = (fn) => { calls = []; handler = fn; };

const row = (id, title, legacy_code) => ({ id, title, legacy_code, publication_year: 2020, language: 'ar',
  call_number: null, subjects: [], researchers: [], supervisors: [], available: true });

describe('model service clients', () => {
  it('accepts only plain http(s) origins', () => {
    expect(serviceOrigin('http://127.0.0.1:8003')).toBe('http://127.0.0.1:8003');
    expect(serviceOrigin('http://127.0.0.1:8003/')).toBe('http://127.0.0.1:8003');
    for (const bad of [undefined, '', 'ftp://x', 'http://u:p@x', 'http://x/path', 'http://x/?q=1', 'nonsense']) {
      expect(serviceOrigin(bad)).toBeNull();
    }
  });

  it('calls the subject classifier with its service key and maps the reply', async () => {
    reset(async () => [200, { subject: 'Accounting', confidence: 0.8, top_k: [{ subject: 'Accounting', confidence: 0.8 }] }]);
    const classifier = createSubjectClassifier({ url, key: 'k'.repeat(32) });
    expect(await classifier.classify('Cost accounting')).toEqual({
      subject: 'Accounting', confidence: 0.8, topK: [{ subject: 'Accounting', confidence: 0.8 }]
    });
    expect(calls[0]).toMatchObject({ path: '/predict', method: 'POST', body: { title: 'Cost accounting' } });
    expect(calls[0].headers['x-service-key']).toBe('k'.repeat(32));
  });

  it('reports a disabled service and hides upstream errors behind fixed codes', async () => {
    await expect(createBookClustering({}).predict({ title: 'x' })).rejects.toMatchObject({ code: 'AI_SERVICE_UNAVAILABLE' });
    reset(async () => [500, 'Traceback: secret path']);
    const error = await createBookClustering({ url }).predict({ title: 'x' }).catch((e) => e);
    expect(error).toMatchObject({ code: 'AI_UPSTREAM_ERROR', statusCode: 502 });
    expect(error.message).not.toContain('secret');
    reset(async () => [200, 'not json']);
    await expect(createBookClustering({ url }).predict({ title: 'x' })).rejects.toMatchObject({ code: 'AI_UPSTREAM_PROTOCOL_ERROR' });
  });

  it('signs a short-lived read token for research-rag and returns cited project numbers in order', async () => {
    reset(async () => [200, { sources: [{ record_id: '0892' }, { record_id: '15' }], retrieved: [{ record_id: '0892' }, { record_id: '7' }] }]);
    const service = createResearchService({ url, secret: SECRET });
    expect(await service.rank('water treatment', { id: 'user-1', roles: ['STUDENT'] })).toEqual(['0892', '15', '7']);
    const claims = jwt.verify(calls[0].headers.authorization.slice(7), SECRET,
      { issuer: 'sadat-express', audience: 'sadat-rag' });
    expect(claims).toMatchObject({ sub: 'user-1', role: 'STUDENT', scope: 'rag:read' });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60);
    expect(createResearchService({ url, secret: 'short' }).configured).toBe(false);
  });
});

describe('research assistant with the research-rag service', () => {
  const rows = [row('a', 'Water treatment', '0892'), row('b', 'Network design', '15'), row('c', 'Banking', null)];

  it('maps cited project numbers back to catalog rows', () => {
    expect(rankByCodes(buildResearchIndex(rows), ['15', '٠٨٩٢', 'missing'])).toEqual([rows[1], rows[0]]);
  });

  it('uses the service ranking and falls back to local search when it fails or finds nothing', async () => {
    let rank = async () => ['15'];
    const provider = createResearchRag({ load: async () => rows, service: { configured: true, rank: (...a) => rank(...a) } });
    try {
      expect((await provider.ask('anything about networks')).results).toEqual([rows[1]]);
      rank = async () => { throw new Error('down'); };
      expect((await provider.ask('Water treatment')).results).toEqual([rows[0]]);
      rank = async () => [];
      expect((await provider.ask('Banking')).results).toEqual([rows[2]]);
    } finally { await provider.stop(); }
  });
});
