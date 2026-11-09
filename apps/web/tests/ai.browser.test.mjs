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
  for (const [mode, outDir] of [['production-off', join(root, 'dist')], ['production-absent', process.env.SAMS_AI_ABSENT_BUILD_DIR], ['production-on', process.env.SAMS_AI_ENABLED_BUILD_DIR]]) {
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
  await expect(f.page.locator('.ai-record dd').nth(1)).toHaveText('2007');
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
for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const width of [1440, 768, 320]) test(`${language}/${theme}/${width}: accessible, responsive and reduced-motion Spirit`, async (t) => {
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
