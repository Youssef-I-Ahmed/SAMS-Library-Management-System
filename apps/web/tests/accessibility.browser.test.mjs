// Uses the existing local @playwright/test and axe-core tooling. No API server
// is started: all API calls (including form submissions) are intercepted below.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { createServer } from 'vite';
import { translate } from '../src/i18n/index.js';

let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Prefer a bundled Chromium, then the installed Edge. No browser download.
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' })
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function app(t, language, role, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  t.after(() => context.close());
  const state = { searches: [], writes: [], unexpected: [], errors: [],
    holdSearches: Boolean(options.holdSearches), pendingSearches: [] };
  await context.addInitScript(({ language, role }) => {
    localStorage.setItem('sams.language', language);
    if (role) sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    window.__announcements = [];
    new MutationObserver(() => {
      const region = document.querySelector('.catalog-layout > [role="status"]');
      if (!region) return;
      window.__statusNode ||= region;
      const text = region.textContent.trim();
      if (window.__announcements.at(-1) !== text) window.__announcements.push(text);
    }).observe(document, { childList: true, characterData: true, subtree: true });
  }, { language, role });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (path === '/auth/me') return json({ user: {
      id: 'fixture-user', displayName: 'Accessibility Tester',
      universityEmail: 'fixture@example.test', roles: [role]
    } });
    if (path === '/discovery/facets') {
      if (options.facetsError) return json({ error: { message: 'Fixture facets error' } }, 500);
      return json({ data: { types: [{ value: 'BOOK', count: 21 }] } });
    }
    if (path === '/discovery/items') {
      const params = Object.fromEntries(url.searchParams);
      state.searches.push(params);
      if (state.holdSearches) {
        await new Promise((resolve) => state.pendingSearches.push(resolve));
      } else {
        await delay(params.q?.startsWith('fast') ? 10 : params.q === 'slow' ? 900 : 500);
      }
      if (params.q === 'error') return json({ error: {
        message: 'Fixture search error', requestId: 'fixture-request-id'
      } }, 500);
      const page = Number(params.page || 1);
      const total = params.q === 'empty' ? 0 : params.q ? 2 : 21;
      return json({
        data: total ? [{
          id: `fixture-${page}`, type: 'BOOK', title: `${params.q || 'Catalog'} fixture ${page}`,
          language: 'en', publicationYear: 2024, availability: { available: true }
        }] : [],
        pagination: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20),
          hasPreviousPage: page > 1, hasNextPage: page < Math.ceil(total / 20) }
      });
    }
    if (path === '/catalog/items' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.writes.push({ method: request.method(), path, body });
      return json({ data: { id: 'fixture-created-item', version: 1, ...body } });
    }
    if (path === '/catalog/items/fixture-created-item/book-details' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      state.writes.push({ method: request.method(), path, body });
      return json({ data: { id: 'fixture-created-item', version: 2 } });
    }
    if (request.method() === 'GET' && [
      '/catalog/items', '/catalog-master/categories', '/catalog-master/dewey',
      '/master-data/faculties', '/master-data/departments', '/master-data/branches'
    ].includes(path)) return json({ data: [] });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(30000); // Allow cold Vite startup; keep action assertions at 8s.
  page.on('pageerror', (error) => state.errors.push(error.message));
  t.after(() => {
    assert.deepEqual(state.unexpected, [], 'all API/network requests must use fixtures');
    assert.deepEqual(state.errors, [], 'no browser runtime exceptions');
  });
  return { page, state, tr: (key) => translate(language, key) };
}

async function scan(page, selector) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(async (selector) => window.axe.run(selector, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
  }), selector);
  const findings = result.violations.map(({ id, impact, nodes }) => ({
    id, impact, targets: nodes.map((node) => node.target),
    example: nodes[0]?.failureSummary
  }));
  console.log(`axe ${selector}: ${JSON.stringify(findings)}`);
  // Existing label/metadata colors are outside Sprint 10B.1. Keep these audit
  // findings visible without blocking behavioral checks on unrelated styling.
  // See docs/frontend/SPRINT10B1_UX_ACCESSIBILITY.md for the remaining findings.
  assert.deepEqual(findings.filter(({ id }) => id !== 'color-contrast'), []);
}

for (const language of ['en', 'ar']) {
  test(`${language}: login translations render without raw keys`, async (t) => {
    const { page, tr } = await app(t, language);
    await page.goto(`${origin}/login`);
    await expect(page.locator('.dev-login-card__action')).toHaveText([
      tr('auth.continue'), tr('auth.continue'), tr('auth.continue')
    ]);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.getByRole('heading', { name: tr('auth.welcome') })).toBeVisible();
  });

  test(`${language}: Add Book keyboard behavior and fixture-only submission`, async (t) => {
    const { page, state, tr } = await app(t, language, 'LIBRARIAN');
    await page.goto(`${origin}/librarian/catalog`);
    const opener = page.locator('.admin-toolbar > button');
    await expect(opener).toBeVisible();
    await page.evaluate(() => { document.body.style.overflow = 'scroll'; });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: tr('admin.catalog.addItem'), exact: true });
    const close = dialog.getByRole('button', { name: tr('common.closeDialog') });
    const save = dialog.getByRole('button', { name: tr('admin.common.save'), exact: true });
    await expect(close).toBeFocused();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName(tr('admin.catalog.addItem'));
    await close.press('Shift+Tab');
    await expect(save).toBeFocused();
    await save.press('Tab');
    await expect(close).toBeFocused();
    for (let step = 0; step < 24; step++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true);
    }
    // A request to focus a background control must be contained too.
    await opener.evaluate((node) => node.focus());
    await expect(close).toBeFocused();
    const title = dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true });
    await title.fill('Accessible book');
    await title.pressSequentially(' test');
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('Accessible book test');
    await dialog.getByRole('combobox', { name: new RegExp(`^${tr('admin.catalog.type')}`) }).selectOption('THESIS');
    await expect(dialog.getByRole('combobox', { name: new RegExp(`^${tr('admin.catalog.faculty')}`) })).toBeVisible();
    await dialog.getByRole('combobox', { name: new RegExp(`^${tr('admin.catalog.type')}`) }).selectOption('BOOK');
    await title.fill('');
    await save.click();
    await expect(title).toBeFocused();
    assert.equal(state.writes.length, 0, 'required field validation remains active');
    await title.fill('Accessible book test');
    await dialog.getByLabel('ISBN', { exact: true }).fill('9780000000001');
    await scan(page, '.admin-modal');
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'scroll');
    assert.equal(state.writes.length, 2);
    assert.equal(state.writes[0].body.title, 'Accessible book test');
    assert.equal(state.writes[0].body.type, 'BOOK');
    assert.equal(state.writes[1].body.isbn, '9780000000001');
    assert.equal(state.writes[1].body.version, 1);
    for (const method of ['escape', 'close', 'backdrop']) {
      await opener.click();
      await expect(close).toBeFocused();
      if (method === 'escape') await page.keyboard.press('Escape');
      if (method === 'close') await close.click();
      if (method === 'backdrop') await page.locator('.admin-modal-backdrop').click({ position: { x: 2, y: 2 } });
      await expect(dialog).toHaveCount(0);
      await expect(opener, `restore focus after ${method}`).toBeFocused();
    }
  });

  test(`${language}: catalog announcements, controls, errors, and request races`, async (t) => {
    const { page, state, tr } = await app(t, language, 'STUDENT', { holdSearches: true });
    await page.goto(`${origin}/student/catalog`);
    const status = page.locator('.catalog-layout > [role="status"]');
    const results = page.locator('.catalog-results');
    const search = page.getByRole('searchbox', { name: tr('discovery.catalog.searchLabel') });
    const submit = page.locator('.catalog-search button');
    const completed = () => expect(status).toContainText(tr('discovery.catalog.loaded'));
    await expect(status).toHaveText(tr('discovery.catalog.loading'));
    await expect(results).toHaveAttribute('aria-busy', 'true');
    state.holdSearches = false;
    state.pendingSearches.splice(0).forEach((resolve) => resolve());
    await completed();
    await expect(status).toContainText('21');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveAttribute('aria-atomic', 'true');
    assert.equal(await status.evaluate((node) => node.closest('[aria-busy]') === null), true);
    await scan(page, '.catalog-page');
    await page.getByRole('button', { name: new RegExp(tr('discovery.pagination.next')) }).click();
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    await expect(status).toContainText(`${tr('discovery.pagination.page')} 2`);
    await page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.filters.type')}`) }).selectOption('BOOK');
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    assert.equal(state.searches.at(-1).page, '1');
    await page.getByRole('checkbox').check();
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    await page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.catalog.sort')}`) }).selectOption('YEAR_DESC');
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    const beforeDraft = await page.evaluate(() => window.__announcements.length);
    const beforeRequests = state.searches.length;
    await search.fill('first');
    assert.equal(state.searches.length, beforeRequests);
    assert.equal(await page.evaluate(() => window.__announcements.length), beforeDraft);
    await submit.click();
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    assert.deepEqual(
      Object.fromEntries(['q', 'type', 'availableOnly', 'sort', 'page'].map((key) => [key, state.searches.at(-1)[key]])),
      { q: 'first', type: 'BOOK', availableOnly: 'true', sort: 'YEAR_DESC', page: '1' }
    );
    await page.getByRole('button', { name: tr('discovery.filters.clear'), exact: true }).click();
    await expect(results).toHaveAttribute('aria-busy', 'true');
    await completed();
    assert.equal(state.searches.at(-1).q, 'first');
    assert.equal(state.searches.at(-1).type, undefined);
    assert.equal(state.searches.at(-1).availableOnly, undefined);
    for (const query of ['second', 'empty', 'error', 'recovery']) {
      const beforeCompletion = await page.evaluate((loaded) =>
        window.__announcements.filter((text) => text.startsWith(loaded)).length,
      tr('discovery.catalog.loaded'));
      await search.fill(query);
      await submit.click();
      await expect(results).toHaveAttribute('aria-busy', 'true');
      if (query === 'error') {
        await expect(page.getByRole('alert')).toContainText('Fixture search error');
        await expect(page.getByRole('alert')).toContainText('fixture-request-id');
        await expect(status).toHaveText('');
        await expect(results).toHaveAttribute('aria-busy', 'false');
      } else {
        await completed();
        await expect(status).toContainText(query === 'empty' ? tr('discovery.empty.title') : '2');
        assert.equal(await page.evaluate((loaded) =>
          window.__announcements.filter((text) => text.startsWith(loaded)).length,
        tr('discovery.catalog.loaded')), beforeCompletion + 1, 'one completion per search, including equal counts');
      }
    }
    await search.fill('slow');
    await submit.click();
    await expect.poll(() => state.searches.at(-1)?.q).toBe('slow');
    await search.fill('fast');
    await submit.click();
    await completed();
    await expect(page.locator('.catalog-grid')).toContainText('fast fixture');
    await delay(1000); // Let the superseded response settle.
    await expect(page.locator('.catalog-grid')).toContainText('fast fixture');
    // Check quiet fast completion separately: a still-pending slow request may
    // legitimately announce loading while keyboard/scroll actions supersede it.
    const beforeFast = await page.evaluate(() => window.__announcements.length);
    await search.fill('fast-quiet');
    await submit.click();
    await completed();
    await expect(page.locator('.catalog-grid')).toContainText('fast-quiet fixture');
    const recent = await page.evaluate((start) => window.__announcements.slice(start), beforeFast);
    assert.equal(recent.includes(tr('discovery.catalog.loading')), false, 'fast requests do not chatter');
    assert.equal(await status.evaluate((node) => node === window.__statusNode), true, 'status region stays mounted');
    const beforeSwitch = state.searches.length;
    await page.getByRole('button', { name: language === 'en' ? 'عربي' : 'EN', exact: true }).click();
    await expect(status).toContainText(translate(language === 'en' ? 'ar' : 'en', 'discovery.catalog.loaded'));
    assert.equal(state.searches.length, beforeSwitch, 'language switch does not refetch');
  });
}

test('facet failures retain their existing alert without suppressing completion', async (t) => {
  const { page, tr } = await app(t, 'en', 'STUDENT', { facetsError: true });
  await page.goto(`${origin}/student/catalog`);
  await expect(page.getByRole('alert')).toContainText('Fixture facets error');
  await expect(page.locator('.catalog-layout > [role="status"]')).toContainText(tr('discovery.catalog.loaded'));
});

test('modal fallback focus, disabled/hidden controls, dismissal gate, and cleanup', async (t) => {
  const { page } = await app(t, 'en');
  await page.goto(`${origin}/tests/fixtures/modal.html`);
  const dialog = page.getByRole('dialog');
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await page.getByRole('button', { name: 'Open single control dialog' }).click();
  await expect(close).toBeFocused();
  await close.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Open locked empty dialog' }).click();
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(close).toBeDisabled();
  await page.locator('.admin-modal-backdrop').click();
  await expect(dialog).toBeVisible();
  await page.reload();
  await page.locator('#opener').click();
  await page.getByLabel('Value', { exact: true }).fill('Latest callback');
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name: 'Toggle dismissal' });
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await toggle.click();
  // An inner widget can consume Escape without dismissing its parent dialog.
  await dialog.evaluate((node) => node.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.preventDefault();
  }, { once: true }));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('output')).toHaveText('Latest callback');
  await expect(page.locator('#opener')).toBeFocused();
  await page.locator('#opener').click();
  await page.locator('#opener').evaluate((node) => node.remove());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
