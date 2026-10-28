// Production preview, exclusively local API fixtures. No API server/database.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const evidence = fileURLToPath(new URL('../../../docs/frontend/screenshots/sprint10b4b/', import.meta.url));
const metrics = [];
let server, browser, origin;
before(async () => {
  await mkdir(evidence, { recursive: true });
  server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, open: false } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await writeFile(`${evidence}/verification-metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

function record(language, mode, id = 'fixture-book', reserved = false) {
  const ar = language === 'ar';
  const minimal = mode === 'minimal';
  const branches = mode === 'noCopies' ? [] : [
    { branch: { id: 'branch-main', name: ar ? 'الفرع الرئيسي التجريبي' : 'Main fixture branch', location: ar ? 'موقع تجريبي' : 'Fixture location' }, totalCopies: 3, availableCopies: mode === 'unavailable' ? 0 : reserved ? 1 : 2 },
    { branch: { id: 'branch-second', name: ar ? 'الفرع الثاني التجريبي' : 'Second fixture branch' }, totalCopies: 2, availableCopies: mode === 'unavailable' ? 0 : 1 },
    { branch: { id: 'branch-unavailable', name: ar ? 'فرع بلا نسخ متاحة بالسجلات' : 'Fixture branch without available copies' }, totalCopies: 1, availableCopies: 0 }
  ].map((branch) => ({ ...branch, available: branch.availableCopies > 0 }));
  const availableCopies = branches.reduce((sum, branch) => sum + branch.availableCopies, 0);
  return {
    id, type: mode === 'academic' ? 'THESIS' : 'BOOK',
    title: mode === 'long'
      ? (ar ? 'دراسة تجريبية موسعة في الإدارة والاقتصاد والتحول الرقمي وتطوير المؤسسات والتخطيط الاستراتيجي في ظل المتغيرات العالمية المعاصرة' : 'An extended fixture title about management, economics, digital transformation, institutional development and strategic planning in a changing world')
      : (ar ? 'دراسات إدارية — سجل تجريبي' : 'Management Studies — fixture record'),
    ...(minimal ? { itemContributors: [] } : {
      publicationYear: 2024, language: ar ? 'ar' : 'en', callNumber: '658 FIX 2024',
      deweyClassification: { code: '658', name: ar ? 'الإدارة' : 'Management' },
      category: { name: ar ? 'العلوم الإدارية' : 'Management sciences' },
      itemContributors: [{ role: 'AUTHOR', contributor: { id: 'author', fullName: ar ? 'مؤلف الاختبار' : 'Test Contributor' } }],
      ...(mode === 'academic' ? { academicWorkDetails: { academicYear: '2023/2024', faculty: { name: 'Fixture faculty' }, department: { name: 'Fixture department' } } }
        : { bookDetails: { isbn: 'fixture-isbn', publisher: ar ? 'ناشر الاختبار' : 'Fixture publisher', edition: ar ? 'الطبعة التجريبية' : 'Fixture edition' } }),
      abstractDescription: mode === 'long'
        ? ((ar ? 'نص تجريبي طويل لاختبار القراءة وتدفق النص مع الحفاظ على البيانات كما وردت من الواجهة البرمجية. ' : 'Long fixture text tests reading flow while preserving the supplied API description. ').repeat(12) + '\n' + 'UnbrokenMetadata'.repeat(22))
        : (ar ? 'وصف تجريبي لاختبار عرض البيانات الببليوغرافية.\nهذا النص ليس وصفًا لكتاب حقيقي أو دليلًا على وجود مخزون فعلي.' : 'Fixture description for bibliographic presentation.\nThis text is not a real publication description or evidence of physical stock.')
    }),
    // Public contract has no cover, provenance, verification or raw copy fields.
    availability: { totalCopies: branches.reduce((sum, branch) => sum + branch.totalCopies, 0), availableCopies, available: availableCopies > 0, branches },
    reservationReadiness: { hasAvailableCopy: availableCopies > 0, candidateBranches: branches.filter((branch) => branch.available).map(({ branch, availableCopies }) => ({ branch, availableCopies })) }
  };
}

async function fixture(t, { language = 'en', theme = 'light', viewport = { width: 1440, height: 1000 }, reducedMotion = 'no-preference', role = 'STUDENT', authError = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const state = { mode: 'normal', existing: null, created: false, listError: false, postError: null, refreshError: false,
    holds: {}, waiters: {}, requests: [], posts: [], unexpected: [], errors: [] };
  state.release = (key) => { state.holds[key] = false; (state.waiters[key] || []).splice(0).forEach((resolve) => resolve()); };
  const pause = async (key) => { if (state.holds[key]) await new Promise((resolve) => (state.waiters[key] ||= []).push(resolve)); };
  t.after(async () => {
    Object.keys(state.waiters).forEach(state.release);
    await context.close();
    assert.deepEqual(state.unexpected, [], 'unexpected API/external traffic is blocked');
    assert.deepEqual(state.errors, [], 'no browser runtime exceptions');
  });
  await context.addInitScript(({ language, theme, role }) => {
    localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme);
    if (role) sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    window.__detailMetrics = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => { window.__detailMetrics.lcp = list.getEntries().at(-1)?.startTime || 0; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__detailMetrics.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
  }, { language, theme, role });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.replace('/api/v1', '');
      state.requests.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams) });
      if (path === '/auth/me') return authError ? json({ error: { code: 'UNAUTHORIZED', message: 'Fixture expired session' } }, 401)
        : json({ user: { id: 'fixture-user', roles: [role], displayName: language === 'ar' ? 'طالب الاختبار' : 'Test Student' } });
      if (path === '/discovery/facets') return json({ data: { types: [{ value: 'BOOK', count: 1 }] } });
      if (path === '/discovery/items') return json({ data: [record(language, 'normal')], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false } });
      if (path.startsWith('/discovery/items/')) {
        const id = path.split('/').at(-1);
        await pause('detail'); await pause(id);
        if (state.mode === 'missing') return json({ error: { code: 'NOT_FOUND', message: 'Fixture not found', requestId: 'fixture-missing-id' } }, 404);
        if (state.mode === 'error' || (state.refreshError && state.created)) return json({ error: { message: 'Fixture details read failure', requestId: 'fixture-read-id' } }, 500);
        return json({ data: state.mode === 'null' ? null : record(language, state.mode, id, state.created) });
      }
      if (path === '/reservations/me') {
        await pause('list');
        if (state.listError) return json({ error: { message: 'Fixture reservation check failure', requestId: 'fixture-check-id' } }, 500);
        return json({ data: state.existing ? [state.existing] : [], pagination: { page: 1, pageSize: 100, total: state.existing ? 1 : 0, totalPages: 1 } });
      }
      if (path === '/reservations' && request.method() === 'POST') {
        state.posts.push({ body: request.postDataJSON(), headers: request.headers() });
        await pause('post');
        if (state.postError) return json({ error: { code: state.postError, message: 'Fixture reservation rejected', requestId: 'fixture-policy-id' } }, 409);
        state.created = true;
        state.existing = { id: 'fixture-reservation', status: 'ACTIVE', item: record(language, 'normal'), expiresAt: '2026-10-27T09:00:00Z' };
        return json({ data: state.existing }, 201);
      }
      state.unexpected.push(`${request.method()} ${path}`); return route.abort('blockedbyclient');
    }
    if (url.origin === origin) return route.continue();
    state.unexpected.push(url.origin); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, tr: (key) => translate(language, key) };
}
async function audit(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
}
async function ready(page, tr) {
  await expect(page.locator('.item-detail-announcement')).toHaveText(tr('discovery.detail.loaded'));
  await expect(page.locator('.reservation-panel')).toBeVisible();
  await expect(page.locator('.reservation-panel__status')).not.toHaveText(tr('reservations.detail.checking'));
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
  assert.deepEqual(await page.locator('.item-detail-main, .availability-panel, .reservation-panel').evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.className)), [], 'content stays inside its surface');
}
async function capture(page, name) { await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); }

for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844 }]])
for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${device} ${language} ${theme}: premium Details, recorded inventory, AA and screenshot`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme, viewport });
    await page.goto(`${origin}/student/items/fixture-book`); await ready(page, tr);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(record(language, 'normal').title);
    await expect(page.getByRole('note')).toContainText(tr('discovery.inventoryNotice.body'));
    await expect(page.locator('.discovery-cover small')).toHaveText(tr('discovery.card.noCover'));
    await expect(page.locator('.item-detail-page img')).toHaveCount(0);
    await expect(page.locator('.availability-summary strong')).toHaveText(['3', '6']);
    assert.equal(await page.locator('.detail-grid dd').nth(1).evaluate((node) => getComputedStyle(node).textAlign), language === 'ar' ? 'right' : 'left', 'Latin/numeric values align with their UI labels while keeping automatic text direction');
    await expect(page.locator('.branch-list b .sr-only').last()).toContainText(`0 ${tr('discovery.detail.availableCopies')}`);
    await noOverflow(page);
    const violations = await audit(page);
    await capture(page, `${device}-${language}-${theme}`);
    if (device === 'mobile') await page.screenshot({ path: `${evidence}/${device}-${language}-${theme}-viewport.png` });
    const performance = await page.evaluate(() => window.__detailMetrics);
    metrics.push({ device, language, theme, ...performance, violations });
    assert.deepEqual(violations, [], 'whole-page WCAG A/AA including contrast, no exclusions');
    assert.ok(performance.cls < .1, `CLS ${performance.cls}`);
    assert.equal(await page.locator('.item-detail-back__arrow').evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a), language === 'ar' ? -1 : 1);
    assert.equal(state.requests.every(({ method }) => method === 'GET'), true);
    const requests = state.requests.length;
    await page.getByRole('navigation', { name: tr('discovery.detail.sections'), exact: true })
      .getByRole('link', { name: tr('discovery.detail.availabilityTitle'), exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: tr('discovery.detail.availabilityTitle'), exact: true })).toBeFocused();
    assert.equal(state.requests.length, requests, 'section navigation is local and keyboard accessible');
  });
}

for (const language of ['en', 'ar']) {
  test(`${language}: keyboard reservation, errors, disabled submission, success and refresh recovery`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme: 'dark', viewport: { width: 390, height: 844 } });
    state.holds.list = true;
    await page.goto(`${origin}/student/items/fixture-book`);
    await expect(page.locator('.reservation-panel__status')).toHaveText(tr('reservations.detail.checking'));
    assert.deepEqual(await audit(page), []);
    state.release('list'); await ready(page, tr);
    const start = page.getByRole('button', { name: tr('reservations.detail.start'), exact: true });
    await expect(start).toHaveAccessibleDescription(tr('discovery.inventoryNotice.body'));
    await start.press('Enter');
    const branch = page.locator('.reservation-confirmation select');
    await expect(branch).toBeFocused();
    assert.equal(await branch.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
    await page.getByRole('button', { name: tr('reservations.detail.keepBrowsing'), exact: true }).press('Enter');
    await expect(start).toBeFocused(); assert.equal(state.posts.length, 0);
    await start.press('Enter'); await branch.selectOption('branch-second');
    const confirm = page.getByRole('button', { name: tr('reservations.detail.confirm'), exact: true });
    for (const [code, key] of [['STUDENT_NOT_ELIGIBLE', 'notEligible'], ['STUDENT_ACCOUNT_INACTIVE', 'accountInactive'], ['RESERVATION_LIMIT_REACHED', 'limitReached'], ['ACTIVE_RESERVATION_EXISTS', 'activeExists']]) {
      state.postError = code; await confirm.press('Enter');
      await expect(page.getByRole('alert')).toContainText(tr(`reservations.errors.${key}`));
      await expect(page.getByRole('alert')).toContainText('fixture-policy-id');
      await expect(confirm).toBeEnabled(); assert.deepEqual(await audit(page), []);
    }
    await capture(page, `reservation-error-${language}-dark`);
    state.postError = null; state.holds.post = true; state.refreshError = true;
    await confirm.press('Enter');
    await expect(page.getByRole('button', { name: tr('reservations.detail.reserving'), exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: tr('reservations.detail.keepBrowsing'), exact: true })).toBeDisabled();
    await expect(page.locator('.reservation-panel__status')).toHaveText(tr('reservations.detail.reserving'));
    assert.deepEqual(await audit(page), []); await capture(page, `reservation-pending-${language}-dark`);
    state.release('post');
    await expect(page.locator('.reservation-panel__status')).toHaveText(tr('reservations.detail.successTitle'));
    const link = page.getByRole('link', { name: tr('reservations.detail.viewReservations'), exact: true });
    await expect(link).toBeFocused();
    await expect(page.getByRole('alert')).toContainText(tr('discovery.detail.refreshError'));
    assert.equal(state.posts.length, 5, 'no duplicate submission while pending');
    for (const post of state.posts) {
      assert.deepEqual(post.body, { itemId: 'fixture-book', branchId: 'branch-second' });
      assert.match(post.headers['idempotency-key'], /^sams-reserve-/);
    }
    assert.equal(new Set(state.posts.map((post) => post.headers['idempotency-key'])).size, 5);
    assert.deepEqual(await audit(page), []); await capture(page, `reservation-success-refresh-error-${language}-dark`);
    state.refreshError = false;
    await page.getByRole('button', { name: tr('discovery.catalog.retry'), exact: true }).press('Enter');
    await expect(page.locator('.item-detail-back')).toBeFocused();
    await expect(page.locator('.availability-summary strong')).toHaveText(['2', '6']);
    await expect(page.getByRole('alert')).toHaveCount(0);
    assert.equal(state.posts.length, 5); await expect(page.locator('.reservation-panel__status')).toHaveText(tr('reservations.detail.successTitle'));
    await capture(page, `reservation-success-${language}-dark`);
  });

  test(`${language}: long text, absent metadata, academic records, unavailable copies and existing hold`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
    for (const mode of ['long', 'minimal', 'academic', 'unavailable', 'noCopies']) {
      state.mode = mode;
      await page.goto(`${origin}/student/items/fixture-book`); await ready(page, tr);
      await noOverflow(page); assert.deepEqual(await audit(page), [], `${mode} passes AA`);
      if (mode === 'minimal') {
        await expect(page.locator('.item-detail-muted')).toHaveText(tr('discovery.card.noContributor'));
        await expect(page.locator('.detail-grid > div')).toHaveCount(1);
        await expect(page.getByRole('heading', { name: tr('discovery.detail.descriptionTitle'), exact: true })).toHaveCount(0);
      }
      if (mode === 'academic') await expect(page.locator('.detail-grid')).toContainText('Fixture faculty');
      if (['unavailable', 'noCopies'].includes(mode)) {
        await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toHaveCount(0);
        await expect(page.locator('.availability-badge')).toContainText(tr(`discovery.availability.${mode}`));
      }
      await capture(page, `${mode}-${language}-light`);
    }
    state.mode = 'normal'; state.existing = { id: 'existing', item: { id: 'fixture-book' }, status: 'ACTIVE', expiresAt: '2026-10-27T09:00:00Z' };
    await page.reload(); await ready(page, tr);
    await expect(page.getByText(tr('reservations.detail.alreadyReserved'), { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toHaveCount(0);
    assert.equal(state.posts.length, 0);
  });

  test(`${language}: failed reservation check remains visible without changing eligibility`, async (t) => {
    const { page, state, tr } = await fixture(t, { language });
    state.listError = true;
    for (const mode of ['normal', 'noCopies']) {
      state.mode = mode; await page.goto(`${origin}/student/items/fixture-book`); await ready(page, tr);
      await expect(page.getByRole('alert')).toContainText(tr('reservations.detail.checkError'));
      await expect(page.getByRole('alert')).toContainText('fixture-check-id');
      if (mode === 'normal') await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toBeEnabled();
      else await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toHaveCount(0);
      assert.deepEqual(await audit(page), []);
    }
    assert.equal(state.posts.length, 0);
  });

  for (const theme of ['light', 'dark']) test(`${language} ${theme}: loading, API failure/retry, missing record and Catalog navigation`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme, reducedMotion: 'reduce' });
    state.holds.detail = true;
    await page.goto(`${origin}/student/items/fixture-book`);
    await expect(page.locator('.item-detail-announcement')).toContainText(tr('discovery.detail.loading'));
    await expect(page.locator('.availability-summary')).toHaveCount(0);
    assert.equal(await page.locator('.catalog-spinner').evaluate((node) => getComputedStyle(node).animationName), 'none');
    assert.deepEqual(await audit(page), []); await capture(page, `loading-${language}-${theme}`);
    state.mode = 'error'; state.release('detail');
    await expect(page.getByRole('alert')).toContainText('fixture-read-id');
    assert.deepEqual(await audit(page), []); await capture(page, `error-${language}-${theme}`);
    state.mode = 'normal';
    await page.getByRole('button', { name: tr('discovery.catalog.retry'), exact: true }).press('Enter'); await ready(page, tr);
    await expect(page.locator('.item-detail-back')).toBeFocused();
    await page.locator('.item-detail-announcement').evaluate((node) => { window.__detailStatusNode = node; });
    const before = state.requests.length;
    await page.getByRole('button', { name: language === 'en' ? 'عربي' : 'EN', exact: true }).click();
    assert.equal(state.requests.length, before, 'language change does not refetch');
    assert.equal(await page.locator('.item-detail-announcement').evaluate((node) => node === window.__detailStatusNode), true);
    await page.getByRole('button', { name: language === 'en' ? 'EN' : 'عربي', exact: true }).click();
    for (const mode of ['missing', 'null']) {
      state.mode = mode; await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(tr('discovery.detail.missingTitle'));
      await expect(page.locator('.availability-summary')).toHaveCount(0);
      assert.deepEqual(await audit(page), []); await capture(page, `${mode}-${language}-${theme}`);
    }
    state.mode = 'normal';
    await page.locator('.item-detail-back').press('Enter'); await expect(page).toHaveURL(`${origin}/student/catalog`);
    await page.locator('.discovery-item-card__footer a').first().press('Enter'); await ready(page, tr);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(record(language, 'normal').title);
  });
}

test('item parameter transitions show loading, discard stale records and reset reservation state', async (t) => {
  const { page, state, tr } = await fixture(t);
  await page.goto(`${origin}/student/items/fixture-book`); await ready(page, tr);
  await page.getByRole('button', { name: tr('reservations.detail.start'), exact: true }).click();
  state.holds.detail = true;
  await page.evaluate(() => { history.pushState({}, '', '/student/items/fixture-second'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('.item-detail-announcement')).toContainText(tr('discovery.detail.loading'));
  await expect(page.locator('.reservation-confirmation')).toHaveCount(0);
  await expect(page.locator('.availability-summary')).toHaveCount(0);
  state.release('detail'); await ready(page, tr);
  await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toBeVisible();
  assert.equal(state.requests.filter(({ path }) => path.startsWith('/discovery/items/')).at(-1).path, '/discovery/items/fixture-second');
});

test('anonymous and expired sessions cannot reach Details or reservation APIs', async (t) => {
  for (const options of [{ role: null }, { authError: true }]) {
    const { page, state } = await fixture(t, options);
    await page.goto(`${origin}/student/items/fixture-book`);
    await expect(page).toHaveURL(/\/login/);
    assert.equal(state.requests.some(({ path }) => path.startsWith('/discovery') || path.startsWith('/reservations')), false);
  }
});
