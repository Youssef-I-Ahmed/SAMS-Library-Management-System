// Production-preview Catalog checks. Every API response is a local fixture;
// unexpected API/external traffic is blocked. No database or API server is used.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const screenshots = fileURLToPath(new URL('../../../docs/frontend/screenshots/sprint10b4a/', import.meta.url));
const metrics = [];
let server, browser, origin;
before(async () => {
  await mkdir(screenshots, { recursive: true });
  server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, open: false } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await writeFile(`${screenshots}/verification-metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

const facets = {
  types: ['BOOK', 'THESIS', 'PROJECT'].map((value) => ({ value, count: 2 })),
  categories: [{ id: 'category', name: 'Management / الإدارة', count: 6 }],
  deweyClassifications: [{ id: 'dewey', code: '658', name: 'Management', count: 6 }],
  languages: [{ value: 'en', count: 4 }, { value: 'ar', count: 2 }],
  publicationYears: [{ value: 2024, count: 6 }],
  branches: [{ id: 'branch', name: 'Main branch / الفرع الرئيسي', availableItems: 3, totalItems: 6 }]
};
function items(language) {
  const titles = language === 'ar'
    ? ['مبادئ الإدارة الحديثة', 'مناهج البحث العلمي', 'نظم المعلومات الإدارية', 'التخطيط الاستراتيجي', 'دراسة في الإدارة والاقتصاد والتحول الرقمي وتطوير المؤسسات في ظل التغيرات العالمية المعاصرة', 'مصدر ببيانات محدودة']
    : ['Principles of Management', 'Research Methods', 'Management Information Systems', 'Strategic Planning', 'A very long title about management, economics, digital transformation and the development of institutions in a changing world', 'An item with minimal metadata'];
  return titles.map((title, index) => ({
    id: `fixture-${index}`, title, type: ['BOOK', 'BOOK', 'THESIS', 'PROJECT', 'BOOK', 'BOOK'][index],
    ...(index === 5 ? {} : { publicationYear: 2024, language: index === 2 ? 'ar' : 'en',
      callNumber: `658 SAM ${index}`, category: facets.categories[0], deweyClassification: { code: '658' },
      bookDetails: { isbn: '9780000000001', publisher: 'Fixture publisher' },
      itemContributors: [{ contributor: { fullName: language === 'ar' ? 'مؤلف تجريبي' : 'Fixture contributor' } }] }),
    // Public inventory fields intentionally carry no invented verification/source flag.
    availability: { available: index % 3 === 0, totalCopies: index % 3 === 2 ? 0 : 3,
      availableCopies: index % 3 === 0 ? 2 : 0, branches: index % 3 === 2 ? [] : [{ branch: { id: 'branch', name: 'Main branch' } }] }
  }));
}
async function fixture(t, { language = 'en', theme = 'light', viewport = { width: 1440, height: 1000 },
  reducedMotion = 'no-preference', hold = false, facetError = false, emptyCatalog = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const state = { api: [], errors: [], unexpected: [], hold, waiters: [], failSearch: true };
  state.release = () => { state.hold = false; state.waiters.splice(0).forEach((resolve) => resolve()); };
  t.after(async () => {
    state.release();
    await context.close();
    assert.deepEqual(state.unexpected, [], 'no unexpected API or external requests');
    assert.deepEqual(state.errors, [], 'no browser runtime errors');
  });
  await context.addInitScript(({ language, theme }) => {
    localStorage.setItem('sams.language', language);
    localStorage.setItem('sams.theme', theme);
    sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    window.__catalogMetrics = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => { window.__catalogMetrics.lcp = list.getEntries().at(-1)?.startTime || 0; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__catalogMetrics.cls += entry.value; })
      .observe({ type: 'layout-shift', buffered: true });
  }, { language, theme });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.replace('/api/v1', '');
      state.api.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams) });
      if (path === '/auth/me') return json({ user: { id: 'fixture', roles: ['STUDENT'], displayName: language === 'ar' ? 'طالب المكتبة' : 'SAMS Student' } });
      if (path === '/discovery/facets') return facetError
        ? json({ error: { message: 'Fixture facets failure' } }, 500) : json({ data: facets });
      if (path === '/discovery/items') {
        if (state.hold) await new Promise((resolve) => state.waiters.push(resolve));
        const q = url.searchParams.get('q');
        if (q === 'error' && state.failSearch) return json({ error: { message: 'Fixture catalog failure', requestId: 'catalog-fixture' } }, 500);
        let data = q === 'empty' || emptyCatalog ? [] : items(language);
        const type = url.searchParams.get('type');
        if (type) data = data.filter((item) => item.type === type);
        if (url.searchParams.get('availableOnly') === 'true') data = data.filter((item) => item.availability.available);
        const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 20);
        const total = data.length, totalPages = Math.ceil(total / pageSize);
        return json({ data: data.slice((page - 1) * pageSize, page * pageSize), pagination: {
          page, pageSize, total, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages } });
      }
      if (path === '/discovery/items/fixture-0') return json({ data: { ...items(language)[0],
        reservationReadiness: { hasAvailableCopy: false, candidateBranches: [] },
        availability: { available: true, totalCopies: 3, availableCopies: 2, branches: [] } } });
      if (path === '/reservations/me') return json({ data: [], pagination: { total: 0 } });
      state.unexpected.push(`${request.method()} ${path}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin === origin) return route.continue();
    state.unexpected.push(url.origin);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, tr: (key) => translate(language, key) };
}
async function audit(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
}
async function ready(page) {
  await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'false');
}
// Register before the action: an old idle DOM does not prove the next search
// has started or completed, especially when the fixture responds immediately.
async function changeQuery(page, action) {
  const response = page.waitForResponse((result) => new URL(result.url()).pathname.endsWith('/discovery/items'));
  await action();
  await response;
  await ready(page);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
  assert.deepEqual(await page.locator('.discovery-item-card').evaluateAll((cards) => cards.filter((card) => card.scrollWidth > card.clientWidth).map((card) => card.textContent)), [], 'metadata stays inside cards');
}

for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844 }]
]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${device} ${language} ${theme}: Catalog layout, stock qualification, AA and screenshot`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme, viewport });
    await page.goto(`${origin}/student/catalog`);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tr('discovery.catalog.title'));
    await expect(page.getByRole('note')).toContainText(tr('discovery.inventoryNotice.body'));
    await expect(page.locator('.discovery-cover small')).toHaveCount(6);
    await expect(page.locator('.discovery-item-card img')).toHaveCount(0);
    await expect(page.locator('.discovery-item-card').last()).toContainText(tr('discovery.card.noContributor'));
    for (const status of ['available', 'unavailable', 'noCopies']) await expect(page.locator(`.availability-badge--${status}`).first()).toContainText(tr(`discovery.availability.${status}`));
    await noOverflow(page);
    assert.equal(await page.locator('.catalog-pagination__arrow').first().evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a), language === 'ar' ? -1 : 1, 'pagination arrows follow reading direction');
    await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}.png`, fullPage: true });
    if (device === 'mobile') await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}-viewport.png` });
    const violations = await audit(page);
    const performance = await page.evaluate(() => ({ ...window.__catalogMetrics,
      imageBytes: performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'img').reduce((sum, entry) => sum + entry.encodedBodySize, 0) }));
    metrics.push({ device, language, theme, ...performance, violations });
    assert.deepEqual(violations, [], 'whole-page WCAG A/AA scan, including contrast, no exclusions');
    assert.ok(performance.cls < .1, `CLS ${performance.cls}`);
    assert.equal(state.api.every(({ method }) => method === 'GET'), true);
    if (device !== 'desktop') {
      const toggle = page.locator('.discovery-filters__toggle');
      await expect(toggle).toHaveText(`${tr('discovery.filters.show')}+`);
      await toggle.focus(); await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.filters.type')}`) })).toBeVisible();
      assert.deepEqual(await audit(page), [], 'expanded filters have no AA violations');
    }
    const searches = state.api.filter(({ path }) => path === '/discovery/items').length;
    await page.getByRole('button', { name: tr('discovery.catalog.list'), exact: true }).press('Enter');
    await expect(page.locator('.catalog-grid')).toHaveClass(/catalog-grid--list/);
    await noOverflow(page);
    assert.deepEqual(await audit(page), [], 'list layout passes AA too');
    assert.equal(state.api.filter(({ path }) => path === '/discovery/items').length, searches, 'layout is local, no contract change');
  });
}

for (const language of ['en', 'ar']) {
  test(`${language}: query contracts, all supported filters, sort, paging and Details link`, async (t) => {
    const { page, state, tr } = await fixture(t, { language });
    await page.goto(`${origin}/student/catalog?pageSize=2&page=2`); await ready(page);
    await expect(page.locator('.discovery-item-card')).toHaveCount(2);
    await changeQuery(page, () => page.getByRole('button', { name: new RegExp(tr('discovery.pagination.next')) }).click());
    assert.equal(state.api.at(-1).query.page, '3'); assert.equal(state.api.at(-1).query.pageSize, '2');
    const search = page.getByRole('searchbox');
    await search.fill('  إدارة & research  '); await changeQuery(page, () => search.press('Enter'));
    assert.equal(state.api.at(-1).query.q, 'إدارة & research'); assert.equal(state.api.at(-1).query.page, '1');
    for (const [key, label, value] of [
      ['type', 'type', 'BOOK'], ['categoryId', 'category', 'category'], ['deweyClassificationId', 'dewey', 'dewey'],
      ['language', 'language', 'ar'], ['publicationYear', 'year', '2024'], ['branchId', 'branch', 'branch']
    ]) {
      await changeQuery(page, () => page.getByRole('combobox', { name: new RegExp(`^${tr(`discovery.filters.${label}`)}`) }).selectOption(value));
      assert.equal(state.api.at(-1).query[key], value); assert.equal(state.api.at(-1).query.page, '1');
    }
    await changeQuery(page, () => page.getByRole('checkbox').check());
    assert.equal(state.api.at(-1).query.availableOnly, 'true');
    for (const sort of ['TITLE_DESC', 'YEAR_DESC', 'YEAR_ASC', 'NEWEST', 'TITLE_ASC']) {
      await changeQuery(page, () => page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.catalog.sort')}`) }).selectOption(sort));
      assert.equal(state.api.at(-1).query.sort, sort);
    }
    await changeQuery(page, () => page.getByRole('button', { name: tr('discovery.filters.clear'), exact: true }).click());
    assert.equal(state.api.at(-1).query.q, 'إدارة & research');
    assert.equal(state.api.at(-1).query.availableOnly, undefined);
    await changeQuery(page, () => page.getByRole('group', { name: tr('discovery.filters.type'), exact: true }).getByRole('button', { name: tr('itemTypes.THESIS'), exact: true }).click());
    assert.equal(state.api.at(-1).query.type, 'THESIS');
    await changeQuery(page, () => page.getByRole('button', { name: tr('discovery.catalog.allResources'), exact: true }).click());
    const beforeLanguage = state.api.length;
    await page.getByRole('button', { name: language === 'en' ? 'عربي' : 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'en' ? 'rtl' : 'ltr');
    assert.equal(state.api.length, beforeLanguage, 'language switch keeps results without refetch');
    await page.locator('.discovery-item-card__footer a').first().press('Enter');
    await expect(page).toHaveURL(/\/student\/items\/fixture-0$/);
    await expect(page.locator('.item-detail-page')).toBeVisible();
    await expect(page.getByRole('note')).toBeVisible();
  });

  test(`${language}: mobile keyboard filters, persistent loading, no-results, errors, recovery and reduced motion`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme: 'dark', viewport: { width: 320, height: 740 }, reducedMotion: 'reduce', hold: true });
    await page.goto(`${origin}/student/catalog`);
    const status = page.locator('.catalog-layout > [role="status"]');
    await expect(status).toHaveText(tr('discovery.catalog.loading'));
    assert.deepEqual(await audit(page), []);
    assert.equal(await page.locator('.catalog-spinner').evaluate((node) => getComputedStyle(node).animationName), 'none');
    await page.screenshot({ path: `${screenshots}/loading-${language}-dark.png`, fullPage: true });
    state.release(); await ready(page);
    await expect(status).toContainText(tr('discovery.catalog.loaded'));
    await status.evaluate((node) => { window.__statusNode = node; });
    const toggle = page.locator('.discovery-filters__toggle');
    await toggle.focus(); await toggle.press('Enter');
    await toggle.press('Tab');
    await expect(page.getByRole('button', { name: tr('discovery.filters.clear'), exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.filters.type')}`) })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await expect(toggle).toBeFocused();
    await toggle.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: new RegExp(`^${tr('discovery.catalog.sort')}`) })).toBeFocused();
    const search = page.getByRole('searchbox');
    await search.focus();
    assert.equal(await search.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
    for (const q of ['empty', 'error', 'recovered']) {
      await search.fill(q); await search.press('Enter'); await ready(page);
      if (q === 'empty') {
        await expect(page.getByRole('heading', { name: tr('discovery.empty.title'), exact: true })).toBeVisible();
        await expect(status).toContainText(tr('discovery.empty.title'));
      } else if (q === 'error') {
        await expect(page.getByRole('alert')).toContainText('Fixture catalog failure');
        await expect(status).toHaveText('');
      } else await expect(page.locator('.discovery-item-card')).toHaveCount(6);
      assert.deepEqual(await audit(page), [], `${q} state passes AA`);
      await noOverflow(page);
      await page.screenshot({ path: `${screenshots}/${q}-${language}-dark.png`, fullPage: true });
      if (q === 'error') {
        state.failSearch = false;
        const searches = state.api.filter(({ path }) => path === '/discovery/items').length;
        await page.getByRole('button', { name: tr('discovery.catalog.retry'), exact: true }).click(); await ready(page);
        await expect(search).toBeFocused();
        await expect(page.locator('.discovery-item-card')).toHaveCount(6);
        assert.equal(state.api.filter(({ path }) => path === '/discovery/items').length, searches + 1);
        assert.equal(state.api.at(-1).query.q, 'error', 'retry keeps the current query');
      }
    }
    assert.equal(await status.evaluate((node) => node === window.__statusNode), true, 'live region remains mounted');
  });
}

test('empty catalog and failed facets keep the stock notice, accessible errors and completion', async (t) => {
  const { page, tr } = await fixture(t, { emptyCatalog: true, facetError: true });
  await page.goto(`${origin}/student/catalog`); await ready(page);
  await expect(page.getByRole('alert')).toContainText('Fixture facets failure');
  await expect(page.getByRole('heading', { name: tr('discovery.empty.title'), exact: true })).toBeVisible();
  await expect(page.locator('.catalog-layout > [role="status"]')).toContainText(tr('discovery.catalog.loaded'));
  await expect(page.getByRole('note')).toBeVisible();
  assert.deepEqual(await audit(page), []);
});

test('desktop filter focus returns to disclosure when resizing to collapsed mobile filters', async (t) => {
  const { page, tr } = await fixture(t);
  await page.goto(`${origin}/student/catalog`); await ready(page);
  await page.getByRole('checkbox').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: tr('discovery.filters.show'), exact: true })).toBeFocused();
});

for (const language of ['en', 'ar']) {
  test(`${language}: availability control follows keyboard, history and Clear`, async (t) => {
    const { page, tr } = await fixture(t, { language });
    await page.goto(`${origin}/student/catalog`); await ready(page);
    const checkbox = page.getByRole('checkbox');
    await checkbox.focus();
    await changeQuery(page, () => checkbox.press('Space'));
    await expect(checkbox).toBeChecked();
    assert.equal(new URL(page.url()).searchParams.get('availableOnly'), 'true');
    await changeQuery(page, () => page.goBack());
    await expect(checkbox).not.toBeChecked();
    await changeQuery(page, () => page.goForward());
    await expect(checkbox).toBeChecked();
    await changeQuery(page, () => page.locator('.discovery-filters__heading')
      .getByRole('button', { name: tr('discovery.filters.clear'), exact: true }).click());
    await expect(checkbox).not.toBeChecked();
    assert.equal(new URL(page.url()).searchParams.has('availableOnly'), false);
  });
}

test('responsive filters preserve outside focus and explicitly opened fields', async (t) => {
  const { page, tr } = await fixture(t);
  await page.goto(`${origin}/student/catalog`); await ready(page);
  const search = page.getByRole('searchbox');
  await search.focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.discovery-filters__fields')).toBeHidden();
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: tr('discovery.filters.show'), exact: true }).click();
  await expect(page.getByRole('checkbox')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('checkbox').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('checkbox')).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeFocused();
});
