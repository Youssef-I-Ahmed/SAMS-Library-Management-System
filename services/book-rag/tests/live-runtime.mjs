// Explicit opt-in, local Docker/PostgreSQL/models and real Express/browser only.
// All fixture writes go to a separate tmpfs Postgres container, never sams_library.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareResources, attachPostgres, startContainer, stopContainer, repoRoot, serviceRoot } from '../run-container.mjs';

const evidence = resolve(process.env.BOOK_RAG_EVIDENCE_DIR || '');
assert.ok(process.env.BOOK_RAG_EVIDENCE_DIR && !evidence.startsWith(repoRoot), 'External evidence directory required');
mkdirSync(evidence, { recursive: true });
const checks = [], resources = [], servers = [];
const processes = new Map();
const fixtureStore = 'sams_book_rag_fixture_store_10d3_'+Date.now();
let phase = 'bootstrap', browser, prisma;
const save = (name, value) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2)+'\n');
function passed(name, data = {}) { checks.push({ name, ...data }); save('live-results.json', checks); console.log('PASS '+name); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 8*1024*1024 });
const key = randomBytes(32).toString('hex');
const headers = { 'X-Service-Key': key, 'X-User-Id': 'local-verification', 'X-User-Role': 'STUDENT', 'Content-Type': 'application/json' };
async function raw(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers,
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: await response.json() };
}
async function until(fn, timeout = 60000) {
  const end = Date.now()+timeout;
  while (Date.now()<end) { try { const value = await fn(); if (value) return value; } catch {} await sleep(500); }
  throw new Error('Timed out: '+phase);
}
async function ready(port) {
  const end = Date.now()+900000;
  while (Date.now()<end) {
    const process = processes.get(port);
    if (process?.exitCode != null || process?.ingress?.exitCode != null) throw new Error('Runtime exited during startup');
    try { const r = await raw(port, '/api/health'); if (r.status === 200) return r.body; } catch {}
    await sleep(500);
  }
  throw new Error('Runtime startup deadline');
}
function start(options) {
  const fd = openSync(join(evidence, options.name+'.log'), 'a');
  const child = startContainer({ ...options, key, models: process.env.BOOK_RAG_MODELS_HOST_PATH, output: fd });
  processes.set(options.port || 18000, child);
  resources.push(options.name); child.on('exit', () => closeSync(fd));
  return child;
}
function stop(name) {
  stopContainer(name);
}
async function question(port, text, filters) {
  const started = Date.now();
  let response = await raw(port, '/api/ask', { question: text, ...(filters ? { filters } : {}) });
  assert.equal(response.status, 200, 'Live ask HTTP success');
  while (response.body.status === 'pending') {
    assert.ok(Date.now()-started<120000, 'Live job deadline');
    response = await raw(port, '/api/jobs/'+encodeURIComponent(response.body.job_id)+'?wait=1');
  }
  assert.equal(response.body.status, 'done', 'Live question completed');
  assert.ok(['extractive', 'help'].includes(response.body.result.provider), 'Local provider only');
  return { result: response.body.result, seconds: (Date.now()-started)/1000 };
}

try {
  let input = ''; for await (const chunk of process.stdin) { input += chunk; assert.ok(input.length<8192); }
  const { BOOK_RAG_PGPASSWORD: password } = JSON.parse(input); input = '';
  phase = 'main initial index';
  prepareResources(); attachPostgres('sams_book_rag_internal_10d3');
  const started = Date.now();
  start({ password, name: 'sams-book-rag-10d3' });
  let health = await ready(18000);
  assert.ok(health.engine.books > 2700 && health.engine.chunks >= health.engine.books);
  assert.equal(health.engine.reranker, true);
  assert.ok(health.engine.embedding_backend.startsWith('sentence-transformers:'));
  passed('main full index', { startup_seconds: (Date.now()-started)/1000, health });
  const role = JSON.parse(docker(['exec', '-i', 'sams-book-rag-10d3', 'python', '-'], readFileSync(join(serviceRoot, 'tests/provider_live.py'))));
  assert.equal(role.items, 2821); save('main-restricted-role.json', role); passed('main restricted role and six-table read');
  for (const [language, text] of [['ar', 'إدارة الموارد البشرية'], ['en', 'human resource management']]) {
    phase = 'main retrieval '+language;
    const response = await question(18000, text);
    assert.ok(response.result.sources.length>0, 'Actual retrieval must return sources');
    passed('main retrieval '+language, { seconds: response.seconds, sources: response.result.sources.length });
  }
  const card = await raw(18000, '/api/books/1687');
  assert.equal(card.status, 200); assert.match(card.body.card['Book code'], /1687/); assert.match(card.body.card['Book code'], /1896/);
  passed('live card retains both legacy codes');
  health = (await raw(18000, '/api/health')).body;
  assert.equal(health.runtime.network.denied_attempts, 0, 'No attempted outbound network during load/index/inference');
  passed('offline inference no attempted egress', { network: health.runtime.network });

  phase = 'main restart'; stop('sams-book-rag-10d3');
  const restarted = Date.now(); start({ password, name: 'sams-book-rag-10d3' });
  const restored = await ready(18000);
  assert.ok(restored.runtime.cache.restored_vectors>0); assert.equal(restored.runtime.cache.encoded_vectors, 0);
  passed('restart restores vectors without re-embedding', { seconds: (Date.now()-restarted)/1000, cache: restored.runtime.cache });

  phase = 'fixture database';
  prepareResources('sams_book_rag_fixture_internal_10d3', fixtureStore);
  docker(['run', '--detach', '--rm', '--name', 'sams-book-rag-fixture-db-10d3', '--label', 'sams.book-rag.sprint=10d3',
    '--network', 'sams_book_rag_fixture_internal_10d3', '--network-alias', 'postgres', '--tmpfs', '/var/lib/postgresql/data',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=book_rag_fixture_10d3', 'postgres:16']);
  resources.push('sams-book-rag-fixture-db-10d3');
  await until(() => { docker(['exec', 'sams-book-rag-fixture-db-10d3', 'pg_isready', '-U', 'postgres']); return true; });
  const sql = query => docker(['exec', '-i', 'sams-book-rag-fixture-db-10d3', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'book_rag_fixture_10d3'], query);
  const A = '4afd2005-c0c3-5889-911a-b3952b7ef670', B = 'fe19858e-1ab4-5a75-abe6-d90f07a09e6e', C = '00000000-0000-4000-8000-000000000010';
  sql(`CREATE TABLE library_items(id uuid PRIMARY KEY,title text,call_number text,language text,publication_year int,abstract_description text,dewey_code_raw text,category_id uuid,dewey_classification_id uuid,type text,is_active boolean);
CREATE TABLE book_details(item_id uuid PRIMARY KEY,isbn text,publisher text,edition text);
CREATE TABLE contributors(id uuid PRIMARY KEY,full_name text);
CREATE TABLE item_contributors(item_id uuid,contributor_id uuid,role text);
CREATE TABLE categories(id uuid PRIMARY KEY,name text,is_active boolean);
CREATE TABLE dewey_classifications(id uuid PRIMARY KEY,code text,name text);
CREATE ROLE sams_book_rag_ro LOGIN;
GRANT CONNECT ON DATABASE book_rag_fixture_10d3 TO sams_book_rag_ro;
GRANT USAGE ON SCHEMA public TO sams_book_rag_ro;
GRANT SELECT ON library_items,book_details,contributors,item_contributors,categories,dewey_classifications TO sams_book_rag_ro;
ALTER ROLE sams_book_rag_ro SET default_transaction_read_only=on;
INSERT INTO library_items(id,title,language,type,is_active,publication_year) VALUES ('${A}','Orbital Botany Reference','en','BOOK',true,2020),('${B}','Orbital Botany Reference','en','BOOK',true,2020);
INSERT INTO book_details(item_id) VALUES ('${A}'),('${B}');`);
  start({ password: 'isolated-fixture-only', name: 'sams-book-rag-fixture-10d3', network: 'sams_book_rag_fixture_internal_10d3',
    store: fixtureStore, port: 18001, database: 'book_rag_fixture_10d3' });
  await ready(18001);
  const initialPublications = (await raw(18001, '/api/health')).body.runtime.publications;
  phase = 'fixture insert refresh'; let changed = Date.now();
  sql(`INSERT INTO library_items(id,title,language,type,is_active,publication_year) VALUES ('${C}','Saffron Orbital Botany','en','BOOK',true,2021); INSERT INTO book_details(item_id,publisher) VALUES ('${C}','Fixture Original');`);
  const nativeCode = 'sams:'+C;
  await until(async () => (await raw(18001, '/api/books/'+nativeCode)).status === 200);
  const insertSeconds = (Date.now()-changed)/1000;
  const inserted = await question(18001, 'Saffron Orbital Botany', { title: 'Saffron Orbital Botany' });
  assert.ok(inserted.result.sources.some(s => s.book_codes.includes(nativeCode)));
  passed('isolated insert visible to retrieval without restart', { refresh_seconds: insertSeconds });
  phase = 'fixture update refresh'; changed = Date.now();
  sql(`UPDATE library_items SET title='Updated Saffron Orbital Botany' WHERE id='${C}'; UPDATE book_details SET publisher='Fixture Changed' WHERE item_id='${C}';`);
  await until(async () => { const c = await raw(18001, '/api/books/'+nativeCode); return c.status === 200 && JSON.stringify(c.body.card).includes('Fixture Changed'); });
  const updateSeconds = (Date.now()-changed)/1000;
  const updated = await question(18001, 'Updated Saffron Orbital Botany', { title: 'Updated Saffron Orbital Botany' });
  assert.ok(updated.result.sources.some(s => s.title.includes('Updated')));
  assert.ok((await raw(18001, '/api/health')).body.runtime.publications >= initialPublications+2);
  passed('isolated title and detail update without updatedAt or restart', { refresh_seconds: updateSeconds });
  phase = 'fixture contributor refresh'; changed = Date.now();
  sql(`INSERT INTO contributors(id,full_name) VALUES ('00000000-0000-4000-8000-000000000011','Fixture Curator'); INSERT INTO item_contributors(item_id,contributor_id,role) VALUES ('${C}','00000000-0000-4000-8000-000000000011','AUTHOR');`);
  await until(async () => { const c = await raw(18001, '/api/books/'+nativeCode); return c.status === 200 && JSON.stringify(c.body.card).includes('Fixture Curator'); });
  passed('isolated contributor relation visible without restart', { refresh_seconds: (Date.now()-changed)/1000 });
  const beforeRole = (await raw(18001, '/api/health')).body.runtime;
  phase = 'fixture role-only refresh'; changed = Date.now();
  sql(`UPDATE item_contributors SET role='EDITOR' WHERE item_id='${C}';`);
  await until(async () => (await raw(18001, '/api/health')).body.runtime?.publications > beforeRole.publications);
  const afterRole = (await raw(18001, '/api/health')).body.runtime;
  assert.equal(afterRole.cache.encoded_vectors, beforeRole.cache.encoded_vectors);
  passed('role-only change invalidates without re-embedding unchanged text', { refresh_seconds: (Date.now()-changed)/1000 });
  phase = 'fixture DB failure'; stop('sams-book-rag-fixture-db-10d3');
  await until(async () => (await raw(18001, '/api/health')).status === 503, 20000);
  assert.equal((await raw(18001, '/api/ask', { question: 'Saffron Botany' })).status, 503);
  passed('DB unavailable fails readiness and ask closed');
  stop('sams-book-rag-fixture-10d3');

  phase = 'corrupt cache';
  // Only the owned fixture store is corrupted; the main store is never changed.
  docker(['run', '--rm', '--network', 'none', '--mount', `type=volume,source=${fixtureStore},target=/store`,
    '--entrypoint', 'python', 'sams-book-rag:10d3', '-c', "from pathlib import Path; p=next(Path('/store').glob('*.npz')); p.write_bytes(b'corrupt-fixture-cache')"]);
  passed('isolated cache corruption prepared');
  // Recreate fixture DB from scratch in tmpfs; reuse its exact synthetic data only.
  // Cache validation is tested directly with an actual local model and store, no DB substitute.
  const corruptProbe = `import os\nfrom app.runtime_safety import install\ninstall()\nfrom app.local_models import encoder,passages\nm=encoder('/models/intfloat__multilingual-e5-small')\ntry: passages(m,['fixture'],64)\nexcept Exception: print('CORRUPT_CACHE_REJECTED')\nelse: raise SystemExit(1)\n`;
  const corruptResult = docker(['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:mode=1777',
    '--mount', `type=bind,source=${resolve(process.env.BOOK_RAG_MODELS_HOST_PATH)},target=/models,readonly`,
    '--mount', `type=volume,source=${fixtureStore},target=/store`, '--env', 'SAMS_MODELS_DIR=/models', '--env', 'SAMS_STORE_DIR=/store',
    '--entrypoint', 'python', 'sams-book-rag:10d3', '-c', corruptProbe]);
  assert.ok(corruptResult.includes('CORRUPT_CACHE_REJECTED')); passed('corrupt persistent cache fails closed');
  let missingCode = 0;
  try { docker(['run', '--rm', '--network', 'none', 'sams-book-rag:10d3'], '{}\n'); } catch (e) { missingCode = e.status; }
  assert.equal(missingCode, 78); passed('missing credentials rejected before startup');

  phase = 'real Express';
  const { default: dotenv } = await import('dotenv');
  const localEnv = dotenv.parse(readFileSync(join(repoRoot, '.env')));
  Object.assign(process.env, localEnv, { AI_ENABLED: 'true', RAG_URL: 'http://127.0.0.1:18000', RAG_SERVICE_KEY: key,
    AI_BOOK_CODE_MAP_PATH: join(repoRoot, 'data/demo/legacy-book-code-map.json'), AI_SERVICE_EPOCH: 'live-10d3-'+Date.now(), AI_BOOK_IDENTITY_MODE: 'postgres_uuid',
    REQUEST_LOGGING: 'false', WEB_ORIGIN: 'http://127.0.0.1:15173' });
  const mapBytes = readFileSync(process.env.AI_BOOK_CODE_MAP_PATH);
  process.env.AI_BOOK_CODE_MAP_SHA256 = createHash('sha256').update(mapBytes).digest('hex');
  process.env.AI_SOURCE_SHA256 = JSON.parse(mapBytes).sourceSha256;
  const dbUrl = new URL(process.env.DATABASE_URL); dbUrl.searchParams.set('options', '-c default_transaction_read_only=on'); process.env.DATABASE_URL = dbUrl.href;
  ({ prisma } = await import(pathToFileURL(join(repoRoot, 'apps/api/src/config/prisma.js'))));
  assert.equal((await prisma.$queryRawUnsafe('SHOW default_transaction_read_only'))[0].default_transaction_read_only, 'on');
  const { app } = await import(pathToFileURL(join(repoRoot, 'apps/api/src/app.js')));
  const api = await new Promise(r => { const s = app.listen(14000, '127.0.0.1', () => r(s)); }); servers.push(() => new Promise(r => api.close(r)));
  const user = await prisma.user.findFirst({ where: { isActive: true, userRoles: { some: { role: { name: 'STUDENT' } } } }, include: { userRoles: { include: { role: true } } } });
  assert.ok(user, 'Existing active Student required, no user is created');
  const { issueAccessToken } = await import(pathToFileURL(join(repoRoot, 'apps/api/src/modules/auth/token.service.js')));
  const token = issueAccessToken(user);
  const apiCall = async (path, body, recordFailure = true) => { const r = await fetch('http://127.0.0.1:14000/api/v1'+path, { headers: { Authorization: 'Bearer '+token, 'Content-Type': 'application/json' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    const result = { status: r.status, body: await r.json() };
    if (r.status >= 400 && recordFailure) save('http-failure.json', { phase, status: r.status,
      operation: path.startsWith('/ai/jobs/') ? '/ai/jobs/:jobId' : path.split('?')[0],
      code: /^[A-Z_]{1,64}$/.test(result.body.error?.code || '') ? result.body.error.code : 'UNKNOWN' });
    return result;
  };
  const gatewayHealth = await apiCall('/ai/health'); assert.deepEqual(gatewayHealth.body, { data: { status: 'ok' } });
  const gatewayCard = await apiCall('/ai/books/1687'); assert.equal(gatewayCard.status, 200);
  assert.deepEqual(gatewayCard.body.data.identity, { status: 'ambiguous', library_item_id: null });
  let gatewayAnswer = await apiCall('/ai/ask', { question: 'human resource management' });
  if (gatewayAnswer.body.data?.status === 'pending') {
    const id = gatewayAnswer.body.data.job_id;
    gatewayAnswer = await apiCall('/ai/jobs/'+id+'?wait=0');
    if (gatewayAnswer.body.data?.status === 'pending') {
      const early = await apiCall('/ai/jobs/'+id+'?wait=0', undefined, false);
      assert.equal(early.status, 409); assert.equal(early.body.error.code, 'AI_SESSION_BUSY');
      passed('live minimum poll spacing remains enforced', { status: early.status });
    }
  }
  const pollDeadline = Date.now()+120000;
  while (gatewayAnswer.body.data?.status === 'pending') {
    assert.ok(Date.now()<pollDeadline, 'Live gateway completion deadline');
    // The contract enforces a 500ms floor after a pending GET; never replay POST.
    await sleep(650);
    gatewayAnswer = await apiCall('/ai/jobs/'+gatewayAnswer.body.data.job_id+'?wait=10');
  }
  assert.equal(gatewayAnswer.status, 200); assert.equal(gatewayAnswer.body.data.status, 'done'); assert.ok(gatewayAnswer.body.data.result.sources.length);
  assert.ok(!JSON.stringify(gatewayAnswer.body).includes(key));
  passed('live Express sanitized health, ambiguous card and completed ask', { sources: gatewayAnswer.body.data.result.sources.length });

  phase = 'real Student browser';
  const { createServer } = await import('vite');
  const { chromium, expect } = await import('@playwright/test');
  const { translate } = await import(pathToFileURL(join(repoRoot, 'apps/web/src/i18n/index.js')));
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
  for (const [mode, flag] of [['absent', 'undefined'], ['false', '"false"'], ['true', '"true"']]) {
    const vite = await createServer({ root: join(repoRoot, 'apps/web'), configFile: join(repoRoot, 'apps/web/vite.config.js'), envFile: false,
      define: { 'import.meta.env.VITE_AI_ASSISTANT_ENABLED': flag, 'import.meta.env.VITE_API_URL': '"http://127.0.0.1:14000/api/v1"' },
      server: { host: '127.0.0.1', port: 15173, strictPort: true } });
    await vite.listen();
    try { for (const language of ['ar', 'en']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
      try {
        await context.addInitScript(({ token, language }) => { sessionStorage.setItem('sams.devAccessToken', token); localStorage.setItem('sams.language', language); }, { token, language });
        const calls = [], unexpected = [];
        await context.route('**/*', route => { const u = new URL(route.request().url());
          if (u.origin === 'http://127.0.0.1:15173' || u.origin === 'http://127.0.0.1:14000') return route.continue();
          unexpected.push(u.origin); return route.abort(); });
        context.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/v1/ai/')) calls.push(new URL(r.url()).pathname); });
        const page = await context.newPage(); await page.goto('http://127.0.0.1:15173/student/ai');
        if (mode !== 'true') { await expect(page).toHaveURL(/\/student$/); await expect(page.locator('h1')).toBeVisible(); assert.equal(calls.length, 0); }
        else {
          await expect(page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle', { timeout: 20000 });
          await page.getByLabel(translate(language, 'ai.composer'), { exact: true }).fill(language === 'ar' ? 'إدارة الموارد البشرية' : 'human resource management');
          await page.getByRole('button', { name: translate(language, 'ai.send'), exact: true }).click();
          await expect(page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'fallback', { timeout: 90000 });
          await expect(page.locator('.ai-answer')).not.toHaveText('');
          assert.ok(calls.some(p => p === '/api/v1/ai/ask'));
          await page.locator('.student-ai').screenshot({ path: join(evidence, `live-student-${language}-320.png`) });
        }
        assert.deepEqual(unexpected, []);
        passed(`live browser flag ${mode} ${language}`, { ai_requests: calls.length });
      } finally { await context.close(); }
    } } finally { await vite.close(); }
  }
  const finalRole = JSON.parse(docker(['exec', '-i', 'sams-book-rag-10d3', 'python', '-'], readFileSync(join(serviceRoot, 'tests/provider_live.py'))));
  assert.equal(finalRole.revision, role.revision); assert.deepEqual(finalRole.select_counts, role.select_counts);
  passed('main catalog content and six table counts unchanged');
  save('completion.json', { complete: true, live_checks: checks.length });
} catch (error) {
  save('live-failure.json', { phase, type: error.name, frames: (error.stack || '').split('\n').filter(l => /^\s+at /.test(l)) });
  console.error('FAIL '+phase+' ('+error.name+')'); process.exitCode = 1;
} finally {
  await browser?.close(); for (const close of servers.reverse()) await close(); await prisma?.$disconnect();
  for (const name of [...new Set(resources)].reverse()) { try { stop(name); } catch {} }
}
