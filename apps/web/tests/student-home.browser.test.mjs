// Production-preview verification. All API traffic is fulfilled locally.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { createServer, preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const screenshots = fileURLToPath(new URL('../../../docs/frontend/screenshots/sprint10b3/', import.meta.url));
const metrics = [];
let server;
let browser;
let origin;

before(async () => {
  await mkdir(screenshots, { recursive: true });
  server = await preview({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, open: false }
  });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});

after(async () => {
  await writeFile(`${screenshots}/verification-metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function fixture(t, { language = 'en', theme = 'light', role = 'STUDENT', viewport,
  reducedMotion = 'no-preference', holdAuth = false, authError = false, imageError = false, appOrigin = origin } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, reducedMotion });
  const state = { api: [], unexpected: [], errors: [], releaseAuth: null };
  t.after(async () => {
    state.releaseAuth?.();
    await context.close();
    assert.deepEqual(state.unexpected, [], 'no unexpected API or external requests');
    assert.deepEqual(state.errors, [], 'no browser runtime exceptions');
  });
  await context.addInitScript(({ language, theme, role }) => {
    localStorage.setItem('sams.language', language);
    localStorage.setItem('sams.theme', theme);
    if (role) sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    window.__homeMetrics = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      window.__homeMetrics.lcp = list.getEntries().at(-1)?.startTime || 0;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__homeMetrics.cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  }, { language, theme, role });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (imageError && url.pathname.includes('living-library-concept')) return route.abort();
    if (url.pathname.startsWith('/api/v1/')) {
      state.api.push({ path: url.pathname, method: route.request().method(), query: Object.fromEntries(url.searchParams) });
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (url.pathname.endsWith('/auth/me')) {
        if (holdAuth) await new Promise((resolve) => { state.releaseAuth = resolve; });
        if (authError) return json({ error: { message: 'Fixture expired session' } }, 401);
        return json({ user: { id: 'fixture', displayName: language === 'ar' ? 'طالب المكتبة' : 'SAMS Student',
          roles: [role], universityEmail: 'student@example.test' } });
      }
      if (['/api/v1/discovery/facets', '/api/v1/discovery/items', '/api/v1/reservations/me',
        '/api/v1/borrowings/me', '/api/v1/visits'].includes(url.pathname)) {
        return json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      }
      state.unexpected.push(`${route.request().method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin === appOrigin) return route.continue();
    state.unexpected.push(url.origin);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, tr: (key) => translate(language, key) };
}

async function audit(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
  }));
  return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
}

for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 390, height: 844 }]
]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${device} ${language} ${theme}: responsive Home, contrast, landmarks and screenshot`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme, viewport });
    await page.goto(`${origin}/student`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tr('studentHome.titleLead'));
    await page.locator('.student-home__copy').evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.evaluate(() => Promise.all(Array.from(document.images).map((image) => image.decode())));
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('figcaption')).toHaveText(tr('studentHome.imageCaption'));
    await expect(page.getByRole('note')).toContainText(tr('discovery.inventoryNotice.body'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
    assert.equal(await page.locator('.student-search').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    assert.equal(state.api.every((request) => request.path.endsWith('/auth/me')), true, 'Home fetches no invented statistics or featured inventory');
    await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}.png`, fullPage: device !== 'mobile' });
    if (device === 'mobile') await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}-full.png`, fullPage: true });
    const finding = await audit(page);
    const performance = await page.evaluate(() => ({ ...window.__homeMetrics,
      hero: document.querySelector('.student-home__media img').currentSrc,
      imageBytes: performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'img').reduce((sum, entry) => sum + entry.encodedBodySize, 0)
    }));
    metrics.push({ device, language, theme, ...performance, violations: finding });
    assert.deepEqual(finding, [], 'full Home WCAG A/AA scan, including contrast, has no exclusions');
    assert.ok(performance.cls < 0.1, `layout shift ${performance.cls}`);
  });
}

test('keyboard search, collection links, account menu, theme/language and stock transparency', async (t) => {
  const { page, state, tr } = await fixture(t);
  await page.goto(`${origin}/student`);
  await expect(page.locator('.student-home')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: tr('common.skipToContent') })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const account = page.getByRole('button', { name: tr('auth.accountMenu'), exact: true });
  await account.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  assert.deepEqual(await audit(page), [], 'open menu contrast and semantics');
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  assert.equal(await account.evaluate((node) => getComputedStyle(node).outlineStyle !== 'none'), true);
  await page.getByRole('button', { name: tr('common.switchToDark'), exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('h1')).toContainText(translate('ar', 'studentHome.titleLead'));
  const arabicAccount = page.getByRole('button', { name: translate('ar', 'auth.accountMenu'), exact: true });
  await arabicAccount.focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await audit(page), [], 'dark Arabic open menu also passes contrast');
  await page.keyboard.press('Escape');
  const search = page.getByRole('searchbox');
  await search.fill('  إدارة & البحث  ');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/student\/catalog\?q=/);
  assert.equal(new URL(page.url()).searchParams.get('q'), 'إدارة & البحث');
  await expect(page.getByRole('note')).toContainText(translate('ar', 'discovery.inventoryNotice.body'));
  for (const type of ['BOOK', 'THESIS', 'PROJECT']) {
    await page.goto(`${origin}/student`);
    await page.locator(`.collection-card[href$="type=${type}"]`).click();
    await expect(page).toHaveURL(new RegExp(`type=${type}`));
  }
  assert.equal(state.api.every((request) => request.method === 'GET'), true);
});

test('reduced motion and unavailable illustration retain a readable functional hero', async (t) => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', imageError: true, viewport: { width: 320, height: 760 } });
  await page.goto(`${origin}/student`);
  await expect(page.locator('h1')).toBeVisible();
  assert.equal(await page.locator('.student-home__copy').evaluate((node) => getComputedStyle(node).animationName), 'none');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await expect(page.getByRole('searchbox')).toBeEditable();
  assert.deepEqual(await audit(page), []);
});

test('authentication loading and expired sessions preserve existing guards', async (t) => {
  const { page, state, tr } = await fixture(t, { holdAuth: true, authError: true });
  await page.goto(`${origin}/student`);
  await expect(page.getByRole('status')).toContainText(tr('auth.restoringSession'));
  await expect(page.locator('.student-home')).toHaveCount(0);
  state.releaseAuth();
  await expect(page).toHaveURL(/\/login$/);
});

test('anonymous and other roles retain their existing protected routes', async (t) => {
  const anonymous = await fixture(t, { role: null });
  await anonymous.page.goto(`${origin}/student`);
  await expect(anonymous.page).toHaveURL(/\/login$/);
  const librarian = await fixture(t, { role: 'LIBRARIAN' });
  await librarian.page.goto(`${origin}/student`);
  await expect(librarian.page).toHaveURL(/\/forbidden$/);
  await librarian.page.goto(`${origin}/librarian`);
  await expect(librarian.page.locator('.staff-shell h1')).toBeVisible();
  const management = await fixture(t, { role: 'MANAGEMENT' });
  await management.page.goto(`${origin}/student`);
  await expect(management.page).toHaveURL(/\/forbidden$/);
  await management.page.goto(`${origin}/management/visits`);
  await expect(management.page.locator('.staff-shell h1')).toBeVisible();
});

test('React 18 development render uses native image priority without console errors', async (t) => {
  const development = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }
  });
  t.after(() => development.close());
  await development.listen();
  const appOrigin = `http://127.0.0.1:${development.httpServer.address().port}`;
  const { page } = await fixture(t, { appOrigin });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${appOrigin}/student`);
  await expect(page.locator('.student-home__media img')).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('h1')).toBeVisible();
  assert.deepEqual(errors, []);
});
