// All Express calls are fulfilled in Playwright; external/provider traffic is blocked.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { createServer, preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = process.env.SAMS_TEST_EVIDENCE_DIR || join(tmpdir(), 'sams-ai-ui-evidence');
const servers = new Map(); let browser;
const S = 'a'.repeat(32), J = 'b'.repeat(32), NEXT = 'c'.repeat(32), UUID = '4afd2005-c0c3-5889-911a-b3952b7ef670';
const navigationKeys = ['nav.home', 'nav.catalog', 'nav.myReservations', 'nav.myBorrowings', 'ai.nav'];
const mobileNavigationKeys = ['home', 'catalog', 'holds', 'loans', 'assistant'];
const book = (identity = 'mapped', title = 'Fixture book') => ({ tag: 'S1', book_codes: ['1687'], title, author: 'Fixture Author', year: 2007, call_number: '123.45',
  identity: { status: identity, library_item_id: identity === 'mapped' ? UUID : null }, copies: 987654, card: { 'Number of copies': '987654' } });
const done = (patch = {}) => ({ status: 'done', session_id: S, result: { answer: 'A catalogue reply [S1].', provider: 'gemini', is_refusal: false,
  notice: null, hint: null, coverage_note: null, sources: [book()], all_books: null, ...patch } });
const pending = (populated = false) => ({ status: 'pending', session_id: S, job_id: J, message: 'Technical upstream message is not rendered',
  preview: populated ? { search_query: 'fixture', filters_applied: {}, books: [book('mapped', 'Preliminary fixture book')] } : null });

before(async () => {
  await mkdir(evidence, { recursive: true });
  for (const [mode, flag] of [['absent', 'undefined'], ['off', '"false"'], ['on', '"true"']]) {
    const server = await createServer({ root, configFile: join(root, 'vite.config.js'), envFile: false,
      define: { 'import.meta.env.VITE_AI_ASSISTANT_ENABLED': flag }, server: { host: '127.0.0.1', port: 0, open: false } });
    await server.listen(); servers.set(mode, server);
  }
  for (const [mode, outDir] of [['production-off', process.env.SAMS_AI_DISABLED_BUILD_DIR || join(root, 'dist')], ['production-absent', process.env.SAMS_AI_ABSENT_BUILD_DIR], ['production-on', process.env.SAMS_AI_ENABLED_BUILD_DIR]]) {
    if (!outDir) continue;
    const server = await preview({ root, configFile: join(root, 'vite.config.js'), build: { outDir }, preview: { host: '127.0.0.1', port: 0, open: false } });
    servers.set(mode, server);
  }
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await browser?.close();
  for (const [mode, server] of servers) {
    if (mode.startsWith('production')) await new Promise((resolve) => server.httpServer.close(resolve));
    else await server.close();
  }
});

async function fixture(t, { mode = 'on', language = 'en', theme = 'light', width = 1440, role = 'STUDENT', authStatus = 200, holdAuth = false, motion = 'reduce', scenario = 'done' } = {}) {
  const server = servers.get(mode); assert.ok(server, `build available: ${mode}`);
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const context = await browser.newContext({ viewport: { width, height: width < 650 ? 844 : 1000 }, reducedMotion: motion });
  const state = { scenario, pollMode: 'done', requests: [], unexpected: [], errors: [], held: [], activePolls: new Set(), maxPolls: 0 };
  state.release = () => state.held.splice(0).forEach((release) => release());
  t.after(async () => {
    state.release(); await context.close();
    assert.deepEqual(state.unexpected, [], 'zero external/unexpected API calls'); assert.deepEqual(state.errors, [], 'no browser exceptions');
  });
  await context.addInitScript(({ language, theme, role }) => {
    localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme);
    if (role) sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
  }, { language, theme, role });
  context.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/ai/jobs/')) { state.activePolls.add(request); state.maxPolls = Math.max(state.maxPolls, state.activePolls.size); }
  });
  const settled = (request) => state.activePolls.delete(request);
  context.on('requestfinished', settled); context.on('requestfailed', settled);
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body, status = 200, headers = {}) => route.fulfill({ json: body, status, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After', ...headers } }).catch(() => {});
    if (path.startsWith('/api/v1/')) {
      state.requests.push({ path, method: request.method(), body: request.postDataJSON() });
      if (path === '/api/v1/auth/me') {
        if (holdAuth) await new Promise((resolve) => state.held.push(resolve));
        if (authStatus !== 200) return json({ error: { code: 'INVALID_TOKEN' } }, authStatus);
        return json({ user: { id: 'fixture-user', roles: [role], displayName: 'Library Student', universityEmail: 'fixture@example.invalid' } });
      }
      if (path === '/api/v1/ai/health') {
        if (state.scenario === 'unavailable') return json({ error: { code: 'AI_SERVICE_UNAVAILABLE' } }, 503);
        if (state.scenario === 'checking') await new Promise((resolve) => state.held.push(resolve));
        return json({ data: { status: 'ok' } });
      }
      if (path === '/api/v1/ai/research/ask') {
        if (state.scenario === 'hold-research') await new Promise((resolve) => state.held.push(resolve));
        if (state.scenario === 'research-empty') return json({ data: { status: 'no-results', results: [] } });
        if (state.scenario === 'research-error') return json({ error: { code: 'AI_SERVICE_UNAVAILABLE' } }, 503);
        return json({ data: { status: 'success', results: [{
          id: UUID, title: 'Applied network design', legacy_code: 'PR-402', language: 'en',
          publication_year: 2024, call_number: '004.6', subjects: ['Computing'],
          researchers: ['Maya Adel'], supervisors: ['Omar Amin'], available: true
        }] } });
      }
      if (path === '/api/v1/ai/ask') {
        if (typeof state.scenario === 'number') return json({ error: { code: state.scenario === 404 ? 'AI_SESSION_NOT_FOUND' : `AI_ERROR_${state.scenario}` } }, state.scenario, state.scenario === 429 ? { 'Retry-After': '3' } : {});
        if (state.scenario === 'hold-ask') await new Promise((resolve) => state.held.push(resolve));
        if (state.scenario === 'null') return json({ data: pending() });
        if (state.scenario === 'preview') return json({ data: pending(true) });
        const payload = done();
        if (state.scenario === 'no-sources') {
          payload.result.sources = [];
          payload.result.answer = 'No supporting book records were found for this question.';
        }
        if (state.scenario === 'long') {
          payload.result.answer = ('A long academic reply with selectable text and a source citation [S1]. ' + 'كلمات عربية ضمن الإجابة. ').repeat(100);
          payload.result.sources[0].title = 'Long catalogue title '.repeat(30) + 'x'.repeat(160);
        }
        if (state.scenario === 'cached') payload.cached = true;
        if (state.scenario === 'help') payload.result = { ...payload.result, provider: 'help', sources: [], all_books: null, answer: 'I can help you find books.' };
        if (state.scenario === 'refusal') payload.result = { ...payload.result, is_refusal: true, sources: [], hint: 'Try a book subject.', answer: 'No supporting records.' };
        if (state.scenario === 'extractive') payload.result.provider = 'extractive';
        if (state.scenario === 'fallback') payload.result = { ...payload.result, provider: 'extractive', notice: 'Using catalogue records.' };
        if (state.scenario === 'identities') payload.result.sources = ['mapped', 'unmapped', 'ambiguous', 'unavailable'].map((status) => book(status, status + ' fixture'));
        if (state.scenario === 'unsafe-text') payload.result.answer = '<img src="https://bad.invalid/x" onerror="alert(1)"> https://bad.invalid/reserve';
        return json({ data: payload });
      }
      if (path === `/api/v1/ai/jobs/${J}`) {
        if (state.pollMode === 'hold') await new Promise((resolve) => state.held.push(resolve));
        if (state.pollMode === 'expired') return json({ error: { code: 'AI_JOB_NOT_FOUND' } }, 404);
        return json({ data: state.pollMode === 'pending' ? pending(true) : state.pollMode === 'refusal' ? done({ is_refusal: true, sources: [], hint: 'Try another subject.' }) : done() });
      }
      if (path === '/api/v1/ai/session/reset') return json({ data: { status: 'ok', session_id: NEXT } });
      if (path === '/api/v1/discovery/facets') return json({ data: { types: [{ value: 'BOOK', count: 0 }], categories: [], deweyClassifications: [], languages: [], publicationYears: [], branches: [], sortOptions: [], defaults: { sort: 'TITLE_ASC' } } });
      if (path === `/api/v1/discovery/items/${UUID}`) return json({ data: {
        id: UUID, type: 'ACADEMIC_WORK', title: 'Applied network design', language: 'en',
        itemContributors: [], legacyIdentities: [{ legacyCode: 'PR-402' }], itemSubjects: [{ subject: { name: 'Computing' } }],
        availability: { availableCopies: 1, totalCopies: 1, available: true, branches: [] }
      } });
      if (['/api/v1/discovery/items', '/api/v1/reservations/me', '/api/v1/borrowings/me',
        '/api/v1/students', '/api/v1/visits'].includes(path)) return json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }, meta: { sort: 'TITLE_ASC', appliedFilters: {} } });
      state.unexpected.push(path); return route.abort();
    }
    if (url.origin === origin) return route.continue();
    state.unexpected.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  const tr = (key) => translate(language, key);
  return { page, context, state, tr, goto: (path = '/student/ai') => page.goto(origin + path),
    aiCalls: () => state.requests.filter((call) => call.path.startsWith('/api/v1/ai/')),
    submit: async (question = 'Fixture question') => {
      await page.getByLabel(tr('ai.composer'), { exact: true }).fill(question);
      await page.getByRole('button', { name: tr('ai.send'), exact: true }).click();
    } };
}

for (const mode of ['absent', 'off', 'production-off', ...(process.env.SAMS_AI_ABSENT_BUILD_DIR ? ['production-absent'] : [])]) for (const language of ['en', 'ar']) test(`${mode}/${language}: hidden nav and direct route make zero AI requests`, async (t) => {
  const f = await fixture(t, { mode, language }); await f.goto();
  await expect(f.page).toHaveURL(/\/student$/); await expect(f.page.locator('h1')).toBeVisible();
  assert.equal(await f.page.getByRole('link', { name: f.tr('ai.nav'), exact: true }).count(), 0);
  assert.equal(await f.page.locator('.knowledge-spirit').count(), 0); assert.deepEqual(f.aiCalls(), []);
  await expect(f.page.locator('.student-shell__nav a')).toHaveText(navigationKeys.slice(0, 4).map(f.tr));
  await f.page.setViewportSize({ width: 320, height: 844 });
  await expect(f.page.locator('.student-mobile-nav a')).toHaveText(navigationKeys.slice(0, 4).map(f.tr));
  await expect(f.page.locator('.student-mobile-nav a[aria-label], .student-mobile-nav__label')).toHaveCount(0);
  assert.deepEqual(f.aiCalls(), []);
});
for (const mode of ['on', 'production-on']) test(`${mode}: protected page and navigation enabled`, async (t) => {
  const f = await fixture(t, { mode }); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await expect(f.page.locator('h1')).toHaveText(f.tr('ai.title'));
  await expect(f.page.getByRole('link', { name: f.tr('ai.nav'), exact: true }).first()).toBeVisible();
  assert.equal(f.aiCalls().filter((call) => call.path.endsWith('/health')).length >= 1, true);
  await f.submit(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.locator('.ai-record h4')).toContainText('[S1]');
  await expect(f.page.locator('.ai-record dl > div').filter({ has: f.page.getByText(f.tr('ai.year'), { exact: true }) }).locator('dd')).toHaveText('2007');
  await expect(f.page.locator('.student-shell__nav a')).toHaveText(navigationKeys.map(f.tr));
  await expect(f.page.locator('.student-shell__nav a[aria-label], .student-shell__nav .student-mobile-nav__label')).toHaveCount(0);
});

for (const mode of ['on', 'production-on']) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) test(`${mode}/${language}/${theme}/320: mobile navigation text never overlaps and full accessible names survive`, async (t) => {
  const f = await fixture(t, { mode, language, theme, width: 320 }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const nav = f.page.locator('.student-mobile-nav'); await expect(nav).toBeVisible();
  const metrics = await nav.evaluate((element) => {
    const rect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
    const links = [...element.querySelectorAll('a')].map((link) => {
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT); const textRects = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        textRects.push(...[...range.getClientRects()].filter((r) => r.width && r.height).map(rect));
      }
      return { text: link.textContent.trim(), target: rect(link.getBoundingClientRect()), textRects };
    });
    const overlaps = [];
    links.forEach((a, i) => links.slice(i + 1).forEach((b) => {
      if (a.textRects.some((r) => b.textRects.some((s) => Math.min(r.right, s.right) - Math.max(r.left, s.left) > 0.1 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 0.1))) overlaps.push([a.text, b.text]);
    }));
    return { links, overlaps, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, navWidth: element.scrollWidth, navClientWidth: element.clientWidth };
  });
  const name = `navigation-${mode}-${language}-${theme}-320`;
  await writeFile(join(evidence, `${name}.json`), JSON.stringify(metrics, null, 2) + '\n');
  await f.page.screenshot({ path: join(evidence, `${name}.png`) });
  assert.deepEqual(metrics.overlaps, [], 'actual text ranges from different links must not intersect');
  assert.ok(metrics.documentWidth <= metrics.viewport && metrics.navWidth <= metrics.navClientWidth, 'no horizontal document/navigation overflow');
  assert.equal(metrics.links.length, 5);
  for (const link of metrics.links) {
    assert.ok(link.target.height >= 44, `${link.text}: touch target is at least 44px high`);
    assert.ok(link.textRects.length > 0, `${link.text}: visible text measured`);
    assert.ok(link.textRects.every((r) => r.left >= link.target.left - 0.5 && r.right <= link.target.right + 0.5), `${link.text}: text stays inside its own target`);
  }
  await expect(nav.locator('a')).toHaveText(mobileNavigationKeys.map((key) => f.tr(`ai.mobileNav.${key}`)));
  for (let i = 0; i < navigationKeys.length; i++) await expect(nav.locator('a').nth(i)).toHaveAccessibleName(f.tr(navigationKeys[i]));
});
test('auth loading, anonymous/expired session and wrong-role guards do not start AI', async (t) => {
  const loading = await fixture(t, { holdAuth: true }); await loading.goto();
  await expect(loading.page.locator('.student-ai')).toHaveCount(0); assert.deepEqual(loading.aiCalls(), []);
  loading.state.release(); await expect(loading.page.locator('.student-ai')).toBeVisible();
  for (const options of [{ role: null }, { authStatus: 401 }, { role: 'LIBRARIAN' }, { role: 'MANAGEMENT' }]) {
    const f = await fixture(t, options); await f.goto();
    await expect(f.page).toHaveURL(options.role === 'LIBRARIAN' || options.role === 'MANAGEMENT' ? /\/forbidden$/ : /\/login$/);
    assert.deepEqual(f.aiCalls(), []);
  }
  const anonymous = await fixture(t, { role: null });
  for (const path of ['/librarian/ai', '/management/ai', `/management/ai/items/${UUID}`]) {
    await anonymous.goto(path);
    await expect(anonymous.page).toHaveURL(/\/login$/);
    assert.deepEqual(anonymous.aiCalls(), []);
  }
});
for (const [role, workspace, adminPage] of [
  ['LIBRARIAN', 'librarian', 'students'], ['MANAGEMENT', 'management', 'visits']
]) test(`${role} opens the shared assistant from administration and sees read-only details`, async (t) => {
  const f = await fixture(t, { role, width: 390, language: 'ar', theme: 'dark' });
  await f.goto(`/${workspace}/${adminPage}`);
  await expect(f.page.locator('.admin-page h1')).toBeVisible();
  assert.deepEqual(f.aiCalls(), []);
  await f.page.getByRole('link', { name: f.tr('ai.nav'), exact: true }).click();
  await expect(f.page).toHaveURL(new RegExp(`/${workspace}/ai$`));
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.page.getByRole('button', { name: f.tr('ai.guide'), exact: true }).click();
  await expect(f.page.locator('.knowledge-spirit')).toBeVisible();
  const scope = f.page.getByLabel(f.tr('ai.scopeLabel'));
  await expect(scope.locator('option')).toHaveCount(3);
  await scope.selectOption('all');
  await f.submit('Network design');
  await expect(f.page.getByText('Fixture book', { exact: false })).toBeVisible();
  const research = f.page.locator('.ai-research');
  await expect(research.getByText('PR-402')).toBeVisible();
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', 'success');
  const resultLink = research.getByRole('link', { name: f.tr('ai.details') });
  await expect(resultLink).toHaveAttribute('href', `/${workspace}/ai/items/${UUID}`);
  await resultLink.click();
  await expect(f.page.getByRole('heading', { name: 'Applied network design', exact: true })).toBeVisible();
  await expect(f.page.locator('.reservation-panel')).toHaveCount(0);
  await expect(f.page.locator('.knowledge-spirit')).toHaveCount(0);
  await expect(f.page.getByRole('link', { name: f.tr('ai.backToAssistant') })).toHaveAttribute('href', `/${workspace}/ai`);
  assert.deepEqual(f.aiCalls().filter((call) => call.method === 'POST').map((call) => call.path).sort(),
    ['/api/v1/ai/ask', '/api/v1/ai/research/ask']);
});
for (const scenario of ['done', 'cached', 'extractive', 'help', 'refusal', 'fallback']) test(`render ${scenario} safely with controller-driven Spirit`, async (t) => {
  const f = await fixture(t, { scenario }); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.submit(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', ['cached', 'extractive'].includes(scenario) ? 'done' : scenario);
  const spirit = scenario === 'help' ? 'idle' : scenario === 'refusal' ? 'no-results' : 'success';
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', spirit);
  assert.equal(f.aiCalls().filter((call) => call.method === 'POST').length, 1);
  assert.equal(await f.page.locator('.student-ai').getByText('987654').count(), 0);
  if (scenario === 'extractive') {
    await expect(f.page.locator('.ai-answer')).toHaveText('A catalogue reply [S1].');
    await expect(f.page.locator('.ai-record').getByText('1687', { exact: true })).toBeVisible();
    await expect(f.page.locator('.ai-notice')).toHaveCount(0);
  }
});
test('checking/unavailable readiness is explicit and never sends an ask', async (t) => {
  const f = await fixture(t, { scenario: 'checking' }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'checking');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.release(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const g = await fixture(t, { scenario: 'unavailable' }); await g.goto();
  await expect(g.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'unavailable');
  await expect(g.page.getByRole('button', { name: g.tr('ai.send'), exact: true })).toBeDisabled();
  assert.equal(g.aiCalls().every((call) => call.method === 'GET'), true);
});
test('Research and All scopes render approved records and use only their selected Express routes', async (t) => {
  const f = await fixture(t, { scenario: 'hold-research' });
  await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.page.getByLabel(f.tr('ai.scopeLabel')).selectOption('research');
  await f.submit('Network design');
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', 'searching');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.release();
  await expect(f.page.getByText('PR-402')).toBeVisible();
  await expect(f.page.locator('.ai-research .ai-answer')).toContainText('Applied network design');
  await expect(f.page.locator('.student-ai')).not.toContainText(UUID);
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', 'success');
  assert.deepEqual(f.aiCalls().filter((call) => call.method === 'POST').map((call) => call.path),
    ['/api/v1/ai/research/ask']);
  f.state.scenario = 'done';
  await f.page.getByLabel(f.tr('ai.scopeLabel')).selectOption('all');
  await f.submit('Networking');
  await expect(f.page.getByText('Fixture book', { exact: false })).toBeVisible();
  await expect(f.page.locator('.ai-book-transcript .ai-answer')).not.toBeEmpty();
  await expect(f.page.locator('.ai-research .ai-answer')).toHaveCount(2);
  await expect(f.page.getByText('Applied network design', { exact: true })).toHaveCount(2);
  assert.deepEqual(f.aiCalls().filter((call) => call.method === 'POST').slice(1).map((call) => call.path).sort(),
    ['/api/v1/ai/ask', '/api/v1/ai/research/ask']);
});
test('Knowledge Spirit uses seven distinct visible glyphs and captions with motion reduced', async (t) => {
  const f = await fixture(t, { holdAuth: true, width: 390, scenario: 'hold-ask' });
  const companion = f.page.locator('.ai-companion');
  const glyph = companion.locator('.spirit-signal path');
  const seen = new Set();
  async function check(phase) {
    await expect(companion.locator('.ai-companion__state')).toHaveText(f.tr(`ai.spiritState.${phase}`));
    await expect(companion.locator('.spirit-signal')).toBeVisible();
    assert.ok(await glyph.evaluate((path) => Number.parseFloat(getComputedStyle(path).strokeWidth) > 0));
    const drawing = await glyph.getAttribute('d');
    assert.ok(drawing && !seen.has(drawing), `${phase} has its own visible symbol`);
    seen.add(drawing);
    await companion.screenshot({ path: join(evidence, `spirit-${phase}.png`), animations: 'disabled' });
  }

  await f.goto();
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.release();
  await f.page.getByRole('button', { name: f.tr('ai.guide'), exact: true }).click();
  await check('greeting');
  await check('idle');
  await f.submit('Network design');
  await check('searching');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.scenario = 'preview';
  f.state.pollMode = 'hold';
  f.state.release();
  await check('thinking');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.release();
  await check('success');

  await f.page.getByLabel(f.tr('ai.scopeLabel')).selectOption('research');
  f.state.scenario = 'research-empty';
  await f.submit('Unknown title');
  await check('no-results');
  f.state.scenario = 'research-error';
  await f.submit('Try again');
  await check('error');
  assert.equal(seen.size, 7);
});
for (const scenario of ['null', 'preview']) test(`${scenario} pending has optional preview, no fake phases and final replacement`, async (t) => {
  const f = await fixture(t, { scenario }); f.state.pollMode = 'hold'; await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'pending');
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', scenario === 'null' ? 'searching' : 'thinking');
  await expect(f.page.locator('.ai-record h4').filter({ hasText: 'Preliminary fixture book' })).toHaveCount(scenario === 'preview' ? 1 : 0);
  await expect(f.page.locator('#ai-question')).toBeFocused();
  await expect(f.page.getByRole('button', { name: f.tr('ai.newConversation'), exact: true })).toBeDisabled();
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0); f.state.release();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.locator('.ai-record h4').filter({ hasText: 'Preliminary fixture book' })).toHaveCount(0);
  assert.ok(f.state.maxPolls <= 1);
});
test('pending → refusal clears every stale preliminary card', async (t) => {
  const f = await fixture(t, { scenario: 'preview' }); f.state.pollMode = 'refusal'; await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'refusal');
  await expect(f.page.locator('.ai-record')).toHaveCount(0);
});
for (const status of [400, 401, 403, 404, 409, 429, 502, 503, 504]) test(`HTTP ${status}: truthful error and zero automatic ask replay`, async (t) => {
  const f = await fixture(t); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  f.state.scenario = status; await f.submit();
  if (status === 401) await expect(f.page).toHaveURL(/\/login$/);
  else await expect(f.page.locator('.ai-error')).toContainText(f.tr(`ai.error${status}`));
  if (status === 429) {
    await expect(f.page.locator('.ai-secondary').first()).toContainText('seconds');
    await expect(f.page.getByRole('button', { name: f.tr('ai.send'), exact: true })).toBeDisabled();
  }
  await f.page.waitForTimeout(150); assert.equal(f.aiCalls().filter((call) => call.path.endsWith('/ask')).length, 1);
});
test('Stop/navigation cleanup, tab-memory recovery, stale polls and expired jobs never replay POST', async (t) => {
  const f = await fixture(t, { scenario: 'preview' }); f.state.pollMode = 'hold'; await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit();
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  await f.page.getByRole('button', { name: f.tr('ai.stop'), exact: true }).click();
  f.state.release(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'stopped');
  await f.page.getByRole('link', { name: f.tr('nav.home'), exact: true }).first().click();
  await expect(f.page).toHaveURL(/\/student$/); await expect(f.page.locator('.knowledge-spirit')).toHaveCount(0);
  const count = f.aiCalls().length; await f.page.waitForTimeout(600); assert.equal(f.aiCalls().length, count);
  await f.page.getByRole('link', { name: f.tr('ai.nav'), exact: true }).first().click();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'stopped');
  f.state.pollMode = 'expired'; await f.page.getByRole('button', { name: f.tr('ai.resume'), exact: true }).click();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'expired');
  assert.equal(f.aiCalls().filter((call) => call.path.endsWith('/ask')).length, 1);
});
test('patience window pauses checking; a manual GET resumes without a new question', async (t) => {
  const f = await fixture(t, { scenario: 'null' }); await f.page.clock.install(); f.state.pollMode = 'pending';
  await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'pending'); await f.page.clock.fastForward(240001);
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'still-working');
  f.state.pollMode = 'done'; await f.page.getByRole('button', { name: f.tr('ai.resume'), exact: true }).click();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  assert.equal(f.aiCalls().filter((call) => call.path.endsWith('/ask')).length, 1);
});
test('idle reset rotates session, restores composer focus and logout clears volatile history', async (t) => {
  const f = await fixture(t); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit('Private fixture question');
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await f.page.getByRole('button', { name: f.tr('ai.newConversation'), exact: true }).click();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await expect(f.page.locator('#ai-question')).toBeFocused();
  await expect(f.page.getByText('Private fixture question', { exact: true })).toHaveCount(0);
  assert.equal(f.state.requests.find((call) => call.path.endsWith('/reset')).body.session_id, S);
  const storage = await f.page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  assert.equal(storage.includes('Private fixture'), false); assert.equal(storage.includes(S), false); assert.equal(storage.includes(NEXT), false);
  await f.page.getByRole('button', { name: f.tr('auth.accountMenu'), exact: true }).click();
  await f.page.getByRole('menuitem', { name: f.tr('auth.signOut'), exact: true }).click(); await expect(f.page).toHaveURL(/\/login$/);
});
test('mapped-only detail links; arbitrary HTML/operational links and RAG copy counts are never rendered as actions', async (t) => {
  const f = await fixture(t, { scenario: 'identities' }); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await f.submit();
  await expect(f.page.locator('.ai-record')).toHaveCount(4);
  const links = f.page.locator('.ai-record a'); await expect(links).toHaveCount(1); await expect(links).toHaveAttribute('href', `/student/items/${UUID}`);
  assert.equal((await f.page.locator('.student-ai').innerText()).includes('987654'), false);
  const g = await fixture(t, { scenario: 'unsafe-text' }); await g.goto(); await expect(g.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle'); await g.submit();
  await expect(g.page.locator('.ai-answer')).toContainText('<img'); await expect(g.page.locator('.ai-answer img, .ai-answer a')).toHaveCount(0);
});
for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const width of [1440, 1024, 768, 390, 320]) test(`${language}/${theme}/${width}: accessible, responsive and reduced-motion Spirit`, async (t) => {
  const f = await fixture(t, { language, theme, width }); await f.goto(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  assert.equal(await f.page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
  assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const animation = await f.page.locator('.knowledge-spirit__body').evaluate((el) => getComputedStyle(el).animationName); assert.equal(animation, 'none');
  const calls = f.aiCalls().length; await f.page.waitForTimeout(100); assert.equal(f.aiCalls().length, calls, 'Spirit sends no independent requests');
  await f.page.getByLabel(f.tr('ai.composer'), { exact: true }).fill('Keyboard question');
  await f.page.keyboard.press('Control+Enter'); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.locator('#ai-question')).toBeFocused();
  await f.page.locator('#ai-question').scrollIntoViewIfNeeded();
  const geometry = await f.page.locator('#ai-question').evaluate((el) => { const r = el.getBoundingClientRect(); const nav = document.querySelector('.student-mobile-nav'); const n = nav.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, navTop: getComputedStyle(nav).display === 'none' ? innerHeight : n.top }; });
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.navTop, 'composer is not covered by bottom navigation');
  await f.page.evaluate(axe.source);
  const violations = await f.page.evaluate(async () => (await axe.run(document.querySelector('.student-ai'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })));
  assert.deepEqual(violations, []);
  await f.page.screenshot({ path: join(evidence, `ai-${language}-${theme}-${width}-composer.png`) });
  await f.page.evaluate(() => window.scrollTo(0, 0));
  await f.page.screenshot({ path: join(evidence, `ai-${language}-${theme}-${width}.png`), fullPage: true });
});
test('Home, Catalog, reservations, borrowings and Staff stay outside the AI experience', async (t) => {
  const f = await fixture(t);
  for (const path of ['/student', '/student/catalog', '/student/reservations', '/student/borrowings']) {
    await f.goto(path); await expect(f.page.locator('h1').first()).toBeVisible();
    await expect(f.page.locator('.knowledge-spirit')).toHaveCount(0);
  }
  assert.deepEqual(f.aiCalls(), []);
  const staff = await fixture(t, { role: 'LIBRARIAN' }); await staff.goto('/librarian');
  await expect(staff.page.locator('h1').first()).toBeVisible(); await expect(staff.page.locator('.knowledge-spirit')).toHaveCount(0); assert.deepEqual(staff.aiCalls(), []);
});

for (const role of ['STUDENT', 'LIBRARIAN', 'MANAGEMENT']) test(`${role}: long replies use one reading scroller and composer survives a short viewport`, async (t) => {
  const f = await fixture(t, { role, width: 390, language: 'ar', theme: 'dark', scenario: 'long' });
  await f.goto(`/${role.toLowerCase()}/ai`);
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await expect(f.page.locator('#ai-companion')).toBeHidden();
  const guide = f.page.getByRole('button', { name: f.tr('ai.guide'), exact: true });
  await guide.click();
  await expect(f.page.locator('.knowledge-spirit')).toBeVisible();
  await expect(f.page.locator('.knowledge-spirit')).toHaveCount(1);
  await guide.click();
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-motion', 'paused');
  await f.submit('A long question ' + 'سؤال '.repeat(70));
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  async function geometry() {
    return f.page.evaluate(() => {
      const rect = document.querySelector('.ai-composer').getBoundingClientRect();
      const nav = document.querySelector('.student-mobile-nav');
      const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : visualViewport.height;
      const transcript = document.querySelector('.ai-transcript');
      return { top: rect.top, bottom: rect.bottom, navTop, height: visualViewport.height,
        outerHeight: document.documentElement.scrollHeight, outerWidth: document.documentElement.scrollWidth,
        width: innerWidth, transcriptHeight: transcript.clientHeight,
        inputSize: parseFloat(getComputedStyle(document.querySelector('#ai-question')).fontSize) };
    });
  }
  const initial = await geometry();
  assert.ok(initial.outerHeight <= initial.height + 1 && initial.outerWidth <= initial.width, JSON.stringify(initial));
  assert.ok(initial.bottom <= initial.navTop && initial.top >= 0 && initial.transcriptHeight > 80, JSON.stringify(initial));
  assert.ok(initial.inputSize >= 16);
  await f.page.setViewportSize({ width: 390, height: 460 });
  await expect.poll(async () => (await geometry()).outerHeight).toBeLessThanOrEqual(461);
  const short = await geometry();
  assert.ok(short.bottom <= short.navTop && short.top >= 0 && short.transcriptHeight > 24, JSON.stringify(short));
  await f.page.locator('#ai-question').focus();
  await expect(f.page.locator('#ai-question')).toBeFocused();
  await f.page.screenshot({ path: join(evidence, `ai-${role.toLowerCase()}-short-viewport.png`) });
});

test('Enter sends once, Shift+Enter expands, composition does not send, and copying has feedback', async (t) => {
  const f = await fixture(t); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const input = f.page.locator('#ai-question');
  const height = await input.evaluate((element) => element.clientHeight);
  await input.fill('First line'); await input.press('Shift+Enter');
  await input.press('Shift+Enter'); await input.press('Shift+Enter');
  await input.type('Second line');
  assert.ok(await input.evaluate((element) => element.clientHeight) > height);
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
  assert.equal(f.aiCalls().filter((call) => call.method === 'POST').length, 0);
  await input.press('Enter');
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  assert.equal(f.aiCalls().filter((call) => call.method === 'POST').length, 1);
  await expect(input).toHaveValue(''); await expect(input).toBeFocused();
  await f.page.evaluate(() => { window.copiedReply = ''; Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async (text) => { window.copiedReply = text; } }
  }); });
  await f.page.getByRole('button', { name: f.tr('ai.copy'), exact: true }).click();
  await expect(f.page.getByText(f.tr('ai.copied'), { exact: true })).toBeVisible();
  assert.equal(await f.page.evaluate(() => window.copiedReply), 'A catalogue reply [S1].');
  await input.fill('x'.repeat(501)); await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(f.page.getByRole('button', { name: f.tr('ai.send'), exact: true })).toBeDisabled();
});

test('late replies respect reading position and Latest reply explicitly returns to the bottom', async (t) => {
  const f = await fixture(t, { scenario: 'long', width: 390 }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.submit(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  f.state.scenario = 'hold-ask'; await f.submit('Follow-up');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  const scroller = f.page.locator('.ai-transcript');
  await scroller.evaluate((element) => { element.scrollTop = 120; element.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(120);
  f.state.scenario = 'long'; f.state.release();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.getByRole('button', { name: f.tr('ai.latest'), exact: true })).toBeVisible();
  assert.equal(await scroller.evaluate((element) => element.scrollTop), 120);
  await f.page.getByRole('button', { name: f.tr('ai.latest'), exact: true }).click();
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(2);
});

test('All scope cannot silently send only research when books are unavailable; research errors override a book success', async (t) => {
  const unavailable = await fixture(t, { scenario: 'unavailable' }); await unavailable.goto();
  await expect(unavailable.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'unavailable');
  await unavailable.page.locator('#ai-scope').selectOption('all');
  await unavailable.page.locator('#ai-question').fill('Accounting');
  await expect(unavailable.page.getByRole('button', { name: unavailable.tr('ai.send'), exact: true })).toBeDisabled();
  assert.equal(unavailable.aiCalls().filter((call) => call.method === 'POST').length, 0);
  const f = await fixture(t, { scenario: 'research-error' }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.page.locator('#ai-scope').selectOption('all'); await f.submit();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.locator('.ai-research .ai-error')).toHaveText(f.tr('ai.researchState.error'));
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-spirit-state', 'error');
});

for (const role of ['LIBRARIAN', 'MANAGEMENT']) test(`${role}: assistant geometry across desktop, tablet and mobile in both languages`, async (t) => {
  for (const [language, theme] of [['en', 'light'], ['ar', 'dark']]) for (const width of [1440, 1024, 768, 390, 320]) {
    const f = await fixture(t, { role, language, theme, width });
    await f.goto(`/${role.toLowerCase()}/ai`);
    await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
    const metrics = await f.page.evaluate(() => {
      const composer = document.querySelector('.ai-composer').getBoundingClientRect();
      return { documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
        width: innerWidth, height: innerHeight, composerTop: composer.top, composerBottom: composer.bottom,
        transcriptHeight: document.querySelector('.ai-transcript').clientHeight };
    });
    assert.ok(metrics.documentWidth <= width && metrics.documentHeight <= metrics.height + 1 &&
      metrics.composerTop > 0 && metrics.composerBottom <= metrics.height && metrics.transcriptHeight > 80,
      `${role}/${language}/${width}: ${JSON.stringify(metrics)}`);
    if (width === 1440 || width === 320) await f.page.screenshot({ path: join(evidence, `ai-${role.toLowerCase()}-${language}-${width}-empty.png`) });
  }
});

test('visible-viewport keyboard sizing and optional Spirit motion', async (t) => {
  const f = await fixture(t, { width: 390, motion: 'no-preference', scenario: 'hold-ask' }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.page.screenshot({ path: join(evidence, 'ai-student-en-390-empty.png') });
  const guide = f.page.getByRole('button', { name: f.tr('ai.guide'), exact: true });
  await guide.click();
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-motion', 'playing');
  await f.page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await f.page.locator('.knowledge-spirit__body').evaluate((element) => getComputedStyle(element).animationName), 'none');
  await guide.click();
  await expect(f.page.locator('.knowledge-spirit')).toHaveAttribute('data-motion', 'paused');
  // Exercise the resize event used by visual-only keyboards, with layout viewport unchanged.
  await f.page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 460 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => f.page.locator('.student-shell--assistant').evaluate((element) => element.clientHeight)).toBe(460);
  const box = await f.page.locator('.ai-composer').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height < 460);
  await f.page.evaluate(() => {
    delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'));
  });
  await f.submit(); await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  await f.page.screenshot({ path: join(evidence, 'ai-student-en-390-loading.png') });
  f.state.release(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
});

test('nonzero device safe-area inset keeps navigation inside the viewport', async (t) => {
  const f = await fixture(t, { width: 390 }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const cdp = await f.context.newCDPSession(f.page);
  try {
    await cdp.send('Emulation.setSafeAreaInsets', { insets: { top: 0, right: 0, bottom: 34, left: 0 } });
  } catch (error) {
    if (!error.message.includes("wasn't found")) throw error;
    t.skip('Installed browser cannot emulate nonzero device insets; real-device validation remains.');
    return;
  }
  const bottomMargin = await f.page.locator('.student-mobile-nav').evaluate((element) => parseFloat(getComputedStyle(element).marginBottom));
  assert.ok(bottomMargin >= 34, `safe-area bottom gap: ${bottomMargin}`);
});

for (const [language, theme, width] of [['en', 'light', 390], ['ar', 'dark', 320]]) test(`${language}/${width}: pending reset guidance stays with its action; compact source metadata remains complete`, async (t) => {
  const f = await fixture(t, { language, theme, width, scenario: 'hold-ask' }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const reset = f.page.getByRole('button', { name: f.tr('ai.newConversation'), exact: true });
  await expect(reset).not.toHaveAttribute('aria-describedby', 'ai-reset-hint');
  await f.submit(); await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  await expect(reset).toBeDisabled();
  await expect(reset).toHaveAccessibleDescription(f.tr('ai.resetHint'));
  assert.equal(await f.page.locator('.ai-transcript #ai-reset-hint').count(), 0);
  assert.equal((await f.page.locator('.ai-transcript').innerText()).includes(f.tr('ai.resetHint')), false);
  await f.page.screenshot({ path: join(evidence, `polish-${language}-${width}-pending.png`) });
  f.state.release(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(reset).not.toHaveAttribute('aria-describedby', 'ai-reset-hint');
  const card = f.page.locator('.ai-record').first();
  await expect(card.locator('.ai-record__byline')).toContainText('Fixture Author');
  for (const value of ['2007', '123.45', '1687']) await expect(card.getByText(value, { exact: true })).toBeVisible();
  await expect(card.locator('h4')).toContainText('[S1]');
  const box = await card.boundingBox(); assert.ok(box.height < 290, `compact book card: ${box.height}px`);
  await f.page.screenshot({ path: join(evidence, `polish-${language}-${width}-books.png`) });
  await f.page.locator('#ai-scope').selectOption('research'); await f.submit('Network design');
  await expect(f.page.locator('.ai-research .ai-record')).toHaveCount(1);
  const research = f.page.locator('.ai-research .ai-record');
  for (const value of ['PR-402', 'Maya Adel', 'Omar Amin', 'Computing', '004.6']) await expect(research.getByText(value, { exact: true })).toBeVisible();
  await expect(research.getByRole('link', { name: f.tr('ai.details'), exact: true })).toHaveAttribute('href', `/student/items/${UUID}`);
  await f.page.screenshot({ path: join(evidence, `polish-${language}-${width}-research.png`) });
});

for (const [language, width] of [['en', 390], ['ar', 320]]) test(`${language}/${width}: a long draft remains usable in a visual-only keyboard viewport`, async (t) => {
  const f = await fixture(t, { language, theme: language === 'ar' ? 'dark' : 'light', width }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  const input = f.page.locator('#ai-question');
  await input.fill(('A multiline draft\n').repeat(12));
  await f.page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 390 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => f.page.locator('.student-shell--assistant').evaluate((element) => element.clientHeight)).toBe(390);
  const metrics = await f.page.evaluate(() => {
    const rect = document.querySelector('.ai-composer').getBoundingClientRect();
    const nav = document.querySelector('.student-mobile-nav').getBoundingClientRect();
    const input = document.querySelector('#ai-question'), composer = document.querySelector('.ai-composer');
    return { top: rect.top, bottom: rect.bottom, navTop: nav.top, navBottom: nav.bottom,
      transcriptHeight: document.querySelector('.ai-transcript').clientHeight, width: document.documentElement.scrollWidth,
      inputHeight: input.clientHeight, inputShadow: getComputedStyle(input).boxShadow,
      inputOutline: getComputedStyle(input).outlineStyle, composerOutline: getComputedStyle(composer).outlineWidth };
  });
  assert.ok(metrics.top >= 0 && metrics.bottom <= metrics.navTop && metrics.navBottom <= 390 && metrics.width <= width && metrics.transcriptHeight > 24, JSON.stringify(metrics));
  assert.ok(metrics.inputHeight >= 44 && metrics.inputHeight <= 80);
  assert.equal(metrics.inputShadow, 'none'); assert.equal(metrics.inputOutline, 'none'); assert.equal(metrics.composerOutline, '2px');
  await expect(f.page.getByRole('button', { name: f.tr('ai.send'), exact: true })).toBeEnabled();
  await expect(f.page.getByRole('button', { name: f.tr('ai.latest'), exact: true })).toHaveCount(0);
  await f.page.screenshot({ path: join(evidence, `polish-${language}-${width}-keyboard.png`), clip: { x: 0, y: 0, width, height: 390 } });
});

test('confirmed no-results remain visible and distinct from a real service error', async (t) => {
  const f = await fixture(t, { width: 390, scenario: 'no-sources' }); await f.goto();
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'idle');
  await f.submit(); await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'done');
  await expect(f.page.locator('.ai-book-transcript .ai-status')).toHaveText(f.tr('ai.noResults'));
  await expect(f.page.locator('.ai-book-transcript .ai-status')).toBeVisible();
  await expect(f.page.locator('.ai-record')).toHaveCount(0);
  await f.page.screenshot({ path: join(evidence, 'polish-en-390-no-results.png') });
  f.state.scenario = 503; await f.submit('Another question');
  await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state', 'uncertain');
  await expect(f.page.locator('.ai-error')).toHaveText(f.tr('ai.error503'));
  await expect(f.page.locator('.ai-book-transcript .ai-status')).toHaveText(f.tr('ai.uncertain'));
  await expect(f.page.locator('.ai-book-transcript .ai-status')).toBeVisible();
  await f.page.evaluate(axe.source);
  const violations = await f.page.evaluate(async () => (await axe.run(document.querySelector('.student-ai'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id }) => id));
  assert.deepEqual(violations, []);
  await f.page.screenshot({ path: join(evidence, 'polish-en-390-error.png') });
});

for (const mode of ['on', 'production-on']) test(`V3: ${mode} real GLB clips follow controller, load once, pause and dispose`, async (t) => {
  const f = await fixture(t, { mode, motion: 'no-preference', scenario: 'hold-ask' });
  const loads = []; f.page.on('request', r => { if (r.url().includes('.glb')) loads.push(r.url()); });
  await f.goto();
  const canvas = f.page.locator('.ai-spirit-frame canvas');
  async function animatedClip(name) {
    await expect(canvas).toHaveAttribute('data-clip', name);
    const before = await canvas.screenshot(); await f.page.waitForTimeout(220);
    assert.notDeepEqual(await canvas.screenshot(), before, `${name} changes rendered pixels`);
  }
  await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer', '3d');
  await animatedClip('idle');
  await expect.poll(() => canvas.getAttribute('data-frame')).not.toBe('1');
  await f.submit('Network design');
  await animatedClip('searching');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.scenario = 'preview'; f.state.pollMode = 'hold'; f.state.release();
  await animatedClip('thinking');
  await expect.poll(() => f.state.held.length).toBeGreaterThan(0);
  f.state.pollMode = 'done'; f.state.release();
  await animatedClip('success');
  f.state.scenario = 'no-sources';
  await f.submit('Another search');
  await animatedClip('no_results');
  f.state.scenario = 503; await f.submit('Unavailable search');
  await animatedClip('error');
  assert.equal(loads.length, 1);
  await f.page.screenshot({ path: join(evidence, 'v3-desktop.png') });
  await f.page.getByRole('button', {name:f.tr('ai.guide'),exact:true}).click();
  const frame = await canvas.getAttribute('data-frame');
  await f.page.waitForTimeout(180); assert.equal(await canvas.getAttribute('data-frame'), frame);
  await f.page.getByRole('button', {name:f.tr('ai.guide'),exact:true}).click();
  await expect.poll(() => canvas.getAttribute('data-frame')).not.toBe(frame);
  assert.equal(loads.length,1);
  await f.page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const paused = await canvas.getAttribute('data-frame'); await f.page.waitForTimeout(180); assert.equal(await canvas.getAttribute('data-frame'),paused);
  await f.page.evaluate(() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const context = await canvas.evaluateHandle(el => el.getContext('webgl2'));
  await f.page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveCount(0); await expect(f.page.locator('.knowledge-spirit')).toBeVisible();
  await expect.poll(() => context.evaluate(gl => gl.isContextLost())).toBe(true);
});

for (const role of ['STUDENT','LIBRARIAN','MANAGEMENT']) test(`V3: ${role} mobile opts in; reduced motion restores SVG`, async(t)=> {
  const f=await fixture(t,{role,width:390,language:'ar',theme:'dark',motion:'no-preference'});
  const loads=[];f.page.on('request',r=>{if(r.url().includes('.glb'))loads.push(r.url());});
  const rendererRequests=[];f.page.on('request',r=>{if(/knowledge-spirit-viewer|three/.test(r.url()))rendererRequests.push(r.url());});
  await f.goto(`/${role.toLowerCase()}/ai`);
  await f.page.getByRole('button',{name:f.tr('ai.guide'),exact:true}).click();
  await expect(f.page.locator('.knowledge-spirit')).toBeVisible(); assert.equal(loads.length,0); assert.equal(rendererRequests.length,0);
  await f.page.getByRole('button',{name:f.tr('ai.show3d'),exact:true}).click();
  await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');
  assert.equal(await f.page.locator('canvas').count(),1);
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await f.submit('Network design'); await expect(f.page.getByText('Fixture book',{exact:false})).toBeVisible();
  await f.page.screenshot({path:join(evidence,`v3-mobile-${role.toLowerCase()}.png`)});
  await f.page.emulateMedia({reducedMotion:'reduce'});
  await expect(f.page.locator('canvas')).toHaveCount(0);
  await expect(f.page.locator('.knowledge-spirit')).toBeVisible();
});

for (const failure of ['load','context','init','playback']) test(`V3: ${failure} failure leaves SVG and conversation working`,async(t)=>{
  const f=await fixture(t,{motion:'no-preference'});
  if(failure==='load')await f.page.route('**/*.glb',route=>route.abort());
  if(failure==='init')await f.page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};
  });
  await f.goto();
  if(failure==='context'){
    await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');
    await f.page.locator('canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  }
  if(failure==='playback'){
    await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');
    await f.page.evaluate(()=>{WebGL2RenderingContext.prototype.drawElements=()=>{throw new Error('Simulated draw failure');};});
  }
  await expect(f.page.getByRole('status').filter({hasText:f.tr('ai.spiritFallback')})).toBeAttached();
  await expect(f.page.locator('.knowledge-spirit')).toBeVisible();
  await f.submit();await expect(f.page.getByText('Fixture book',{exact:false})).toBeVisible();
});

for (const [language,theme,width] of [['en','light',1440],['ar','dark',1440],['ar','light',320],['en','dark',320],['en','light',768],['ar','dark',1024]]) test(`V3: responsive ${language}/${theme}/${width}`,async(t)=>{
  const f=await fixture(t,{language,theme,width,motion:'no-preference'});
  await f.goto();
  if(width<1100)await f.page.getByRole('button',{name:f.tr('ai.guide'),exact:true}).click();
  const enable=f.page.getByRole('button',{name:f.tr('ai.show3d'),exact:true});
  if(await enable.count()){await enable.focus();await enable.press('Enter');}
  await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await expect(f.page.getByLabel(f.tr('ai.composer'),{exact:true})).toBeInViewport();
  await f.page.screenshot({path:join(evidence,`v3-${language}-${theme}-${width}.png`)});
});

test('V3: offscreen pause and route unmount release the WebGL context',async(t)=>{
  const f=await fixture(t,{motion:'no-preference'});await f.goto();
  const canvas=f.page.locator('.ai-spirit-frame canvas');
  await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');
  await f.page.locator('.ai-spirit-frame').evaluate(el=>el.style.transform='translateX(-5000px)');
  await f.page.waitForTimeout(150);const before=await canvas.getAttribute('data-frame');
  await f.page.waitForTimeout(180);assert.equal(await canvas.getAttribute('data-frame'),before);
  await f.page.locator('.ai-spirit-frame').evaluate(el=>el.style.transform='');
  await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(before);
  const context=await canvas.evaluateHandle(el=>el.getContext('webgl2'));
  await f.page.locator('.student-shell__nav a').first().click();
  await expect(canvas).toHaveCount(0);await expect.poll(()=>context.evaluate(gl=>gl.isContextLost())).toBe(true);
});

for (const width of [320,390,768,1024,1440]) for(const language of ['en','ar']) for(const theme of ['light','dark']) test(`Companion polish: ${width}/${language}/${theme}`,async(t)=>{
 const f=await fixture(t,{width,language,theme,motion:'no-preference'});
 const loads=[];f.page.on('request',r=>{if(r.url().includes('.glb'))loads.push(r.url());});
 await f.goto();if(width<1100)await f.page.getByRole('button',{name:f.tr('ai.guide'),exact:true}).click();
 const panel=f.page.locator('.ai-companion'),stage=f.page.locator('.ai-spirit-frame'),presenter=f.page.locator('.ai-spirit-presenter');
 await expect(panel).toBeVisible();
 const bounds=()=>f.page.evaluate(()=>{const p=document.querySelector('.ai-companion').getBoundingClientRect(),c=document.querySelector('.ai-conversation').getBoundingClientRect();return{panelWidth:p.width,panelHeight:p.height,chatHeight:c.height};});
 const before=await bounds();
 if(width<1100){
   await expect(presenter).toHaveAttribute('data-viewer','svg');assert.equal(loads.length,0);
   await expect(f.page.locator('#ai-spirit-view-mode')).toHaveText(f.tr('ai.view2dActive'));
   const enable=f.page.getByRole('button',{name:f.tr('ai.show3d'),exact:true});await enable.focus();await enable.press('Enter');
 }
 await expect(presenter).toHaveAttribute('data-viewer','3d');
 await expect(f.page.locator('#ai-spirit-view-mode')).toHaveText(f.tr('ai.view3dActive'));
 const button=f.page.getByRole('button',{name:f.tr('ai.showSvg'),exact:true});
 await expect(button).toHaveAttribute('aria-describedby','ai-spirit-view-mode');await expect(button).toBeVisible();
 assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const after=await bounds(),rect=await stage.boundingBox();
 assert.equal(after.panelWidth,before.panelWidth);
 if(width<1100){assert.ok(rect.width>=111);assert.ok(after.chatHeight>=before.chatHeight-4,`${before.chatHeight} -> ${after.chatHeight}`);assert.ok(after.panelHeight<=180);}
 else {assert.equal(after.panelWidth,220);assert.ok(rect.width>=187);}
 const visibleControl=await button.evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('.ai-companion').getBoundingClientRect();return b.bottom<=p.bottom+1&&b.top>=p.top&&b.left>=p.left&&b.right<=p.right;});assert.ok(visibleControl,'switch stays within companion');
 await expect(f.page.getByLabel(f.tr('ai.composer'),{exact:true})).toBeInViewport();
 const canvas=f.page.locator('.ai-spirit-frame canvas'),image=await canvas.screenshot();await f.page.waitForTimeout(180);assert.notDeepEqual(await canvas.screenshot(),image);
 await f.page.screenshot({path:join(evidence,`companion-final-${width}-${language}-${theme}.png`)});
 await button.focus();await button.press('Enter');
 await expect(presenter).toHaveAttribute('data-viewer','svg');await expect(f.page.locator('#ai-spirit-view-mode')).toHaveText(f.tr('ai.view2dActive'));
 await expect(f.page.locator('.knowledge-spirit')).toBeVisible();await expect(canvas).toHaveCount(0);
});

for (const width of [320,390,768]) for (const language of ['ar','en']) for (const theme of ['light','dark']) test(`Empty heading regression: ${width}/${language}/${theme}`,async(t)=>{
 const f=await fixture(t,{width,language,theme,motion:'no-preference'});await f.goto();
 await expect(f.page.locator('.student-ai')).toHaveAttribute('data-ai-state','idle');
 await expect(f.page.locator('.ai-empty h2')).toBeAttached();
 const metrics=()=>f.page.evaluate(()=>{const s=document.querySelector('.ai-transcript'),h=document.querySelector('.ai-empty h2'),bar=document.querySelector('.ai-workspace-toolbar');return{scrollTop:s.scrollTop,clientHeight:s.clientHeight,scrollHeight:s.scrollHeight,headingTop:h.getBoundingClientRect().top,headingBottom:h.getBoundingClientRect().bottom,viewportTop:s.getBoundingClientRect().top,viewportBottom:s.getBoundingClientRect().bottom,toolbarBottom:bar.getBoundingClientRect().bottom,toolbarPosition:getComputedStyle(bar).position,focus:document.activeElement?.id,windowScroll:window.scrollY};});
 await f.page.waitForTimeout(100);
 async function check(label){const m=await metrics();assert.equal(m.scrollTop,0,label+JSON.stringify(m));assert.ok(m.headingTop>=m.toolbarBottom-1,label);assert.ok(m.headingBottom<=m.viewportBottom+1,label);assert.equal(m.windowScroll,0);await expect(f.page.getByLabel(f.tr('ai.composer'),{exact:true})).toBeInViewport();}
 await check('initial');
 await f.page.getByRole('button',{name:f.tr('ai.guide'),exact:true}).click();await check('SVG companion');
 await f.page.getByRole('button',{name:f.tr('ai.show3d'),exact:true}).click();
 await expect(f.page.locator('.ai-spirit-presenter')).toHaveAttribute('data-viewer','3d');await f.page.waitForTimeout(100);await check('3D companion');
 await f.page.screenshot({path:join(evidence,`empty-heading-${width}-${language}-${theme}.png`)});
 await f.page.getByRole('button',{name:f.tr('ai.showSvg'),exact:true}).click();await check('back to SVG');
 await f.page.getByRole('button',{name:f.tr('ai.guide'),exact:true}).click();await check('closed companion');
 const textarea=f.page.getByLabel(f.tr('ai.composer'),{exact:true});await textarea.focus();await check('composer focus');
 const region=f.page.getByRole('region',{name:f.tr('ai.conversation'),exact:true});await region.focus();await expect(region).toBeFocused();await check('transcript focus');
});
