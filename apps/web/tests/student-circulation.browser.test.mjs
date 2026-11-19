// Isolated fixtures only: no API server, database or real mutation traffic.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import axe from 'axe-core';
import { translate } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(process.env.SAMS_TEST_EVIDENCE_DIR || tmpdir(), 'student-circulation');
let server, featureServer, browser, origin, featureOrigin;
before(async () => {
  await mkdir(evidence, { recursive: true });
  server = await preview({ root, configFile: resolve(root, 'vite.config.js'), preview: { host: '127.0.0.1', port: 0, open: false } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Explicitly exercise the shared, read-only staff AI detail routes too.
  featureServer = await createServer({ root, configFile: resolve(root, 'vite.config.js'), envFile: false,
    define: { 'import.meta.env.VITE_AI_ASSISTANT_ENABLED': '"true"' }, server: { host: '127.0.0.1', port: 0, open: false } });
  await featureServer.listen(); featureOrigin = `http://127.0.0.1:${featureServer.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await browser?.close(); await featureServer?.close();
  if (server) await new Promise((done) => server.httpServer.close(done));
});

function records(kind, language) {
  const title = language === 'ar' ? 'دراسة في الإدارة والمعرفة — سجل اختبار' : 'Management and knowledge — fixture record';
  const item = { id: 'fixture-item', type: 'BOOK', title, callNumber: '658 SAM 2024' };
  const branch = { id: 'branch', name: language === 'ar' ? 'فرع الاختبار' : 'Fixture branch' };
  if (kind === 'reservations') return [
    { id: 'r1', item, branch, status: 'ACTIVE', reservedAt: '2026-11-01T09:00:00Z', expiresAt: '2026-11-20T09:00:00Z' },
    { id: 'r2', item: { ...item, id: 'thesis', type: 'ACADEMIC_WORK' }, branch, status: 'FULFILLED', reservedAt: '2026-10-01T09:00:00Z', expiresAt: '2026-10-07T09:00:00Z' },
    { id: 'r3', item: { title: language === 'ar' ? 'سجل ببيانات محدودة' : 'Record with limited metadata' }, status: 'CANCELLED' }
  ];
  return [
    { id: 'b1', item, branch, status: 'ACTIVE', isOverdue: true, overdueDays: 4, borrowedAt: '2026-10-01T09:00:00Z', dueAt: '2026-11-13T09:00:00Z' },
    // Intentional contract-authority fixture, not a chronological real-loan example.
    // Its old due date must not override the API's ACTIVE/isOverdue=false values.
    { id: 'b2', item, branch, status: 'ACTIVE', isOverdue: false, overdueDays: 0, borrowedAt: '2020-01-01T09:00:00Z', dueAt: '2020-01-03T09:00:00Z' },
    { id: 'b3', item: { title: language === 'ar' ? 'سجل ببيانات محدودة' : 'Record with limited metadata' }, status: 'RETURNED', returnCondition: 'GOOD', returnedAt: '2026-10-03T09:00:00Z' }
  ];
}
async function fixture(t, { language = 'en', theme = 'light', width = 390, role = 'STUDENT' } = {}) {
  const host = role === 'STUDENT' ? origin : featureOrigin;
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 1000 }, reducedMotion: 'reduce' });
  const state = { requests: [], errors: [], unexpected: [], fail: {}, empty: {}, holds: {}, waiters: {}, postError: false,
    cancelStatus: 'CANCELLED', cancelled: null, long: false, paged: false, posts: 0 };
  state.release = (key) => { state.holds[key] = false; (state.waiters[key] || []).splice(0).forEach((done) => done()); };
  const pause = async (key) => { if (state.holds[key]) await new Promise((done) => (state.waiters[key] ||= []).push(done)); };
  t.after(async () => {
    Object.keys(state.waiters).forEach(state.release); await context.close();
    assert.deepEqual(state.errors, [], 'no runtime exceptions'); assert.deepEqual(state.unexpected, [], 'all network traffic is local fixture traffic');
  });
  await context.addInitScript(({ language, theme }) => {
    localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme);
    sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
  }, { language, theme });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status }).catch(() => {});
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.slice('/api/v1'.length);
      state.requests.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams) });
      if (path === '/auth/me') return json({ user: { id: 'fixture-user', roles: [role], displayName: 'SAMS Student' } });
      if (path === '/discovery/facets') return json({ data: { types: [{ value: 'BOOK', count: 1 }], categories: [{ id: 'category', name: 'Management', count: 1 }] } });
      const item = { ...records('reservations', language)[0].item, itemContributors: [], availability: { available: false, totalCopies: 0, availableCopies: 0, branches: [] }, reservationReadiness: { hasAvailableCopy: false, candidateBranches: [] } };
      if (path === '/discovery/items') return json({ data: [item], pagination: { page: Number(url.searchParams.get('page') || 1), total: 45, totalPages: 3, pageSize: 20 } });
      if (path.startsWith('/discovery/items/')) return json({ data: { ...item, id: path.split('/').at(-1) } });
      if (path === '/reservations/r1/cancel' && request.method() === 'POST') {
        state.posts++; await pause('post');
        if (state.postError) return json({ error: { message: 'Fixture cancellation failed', requestId: 'cancel-id-123' } }, 409);
        state.cancelled = { ...records('reservations', language)[0], status: state.cancelStatus };
        return json({ data: state.cancelled });
      }
      for (const kind of ['reservations', 'borrowings']) if (path === `/${kind}/me`) {
        const failed = state.fail[kind];
        let data = state.empty[kind] ? [] : records(kind, language);
        if (kind === 'reservations' && state.cancelled) data = data.map((entry) => entry.id === 'r1' ? state.cancelled : entry);
        if (state.long) data = data.map((entry) => ({ ...entry, item: { ...entry.item, title: entry.item.title + 'UnbrokenLongTitle'.repeat(20), callNumber: '658-'.repeat(25) } }));
        if (state.paged) data = Array.from({ length: 41 }, (_, index) => ({ ...data[0], id: `${kind}-${index}` }));
        const status = url.searchParams.get('status');
        if (status) data = data.filter((entry) => entry.status === status);
        const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 20), total = data.length;
        const response = { data: data.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
        await pause(kind); await pause(`${kind}:${status}`);
        return failed ? json({ error: { message: 'Fixture read failed', requestId: 'read-id-123' } }, 503) : json(response);
      }
      state.unexpected.push(`${request.method()} ${path}`); return route.abort('blockedbyclient');
    }
    if (url.origin === host) return route.continue();
    state.unexpected.push(url.origin); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, host, tr: (key) => translate(language, key), goto: (path) => page.goto(host + path) };
}
const ready = (page) => expect(page.locator('.circulation-results')).toHaveAttribute('aria-busy', 'false');
async function audit(page) {
  await page.evaluate(axe.source);
  return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })));
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.circulation-card').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)), true);
}
async function changed(page, kind, action) {
  const response = page.waitForResponse((entry) => new URL(entry.url()).pathname === `/api/v1/${kind}/me`);
  await action(); await response; await ready(page);
}

for (const width of [320, 390, 768, 1024, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${width} ${language} ${theme}: circulation cards, links, status semantics, safe area and keyboard`, async (t) => {
    const { page, goto, tr } = await fixture(t, { width, language, theme });
    for (const kind of ['reservations', 'borrowings']) {
      await goto(`/student/${kind}`); await ready(page);
      await expect(page.locator('.circulation-card')).toHaveCount(3);
      await expect(page.locator('.circulation-card h2 a')).toHaveCount(2);
      await expect(page.locator('.circulation-toolbar > strong')).toHaveText(`3 ${tr(`${kind}.page.total`)}`);
      await noOverflow(page); assert.deepEqual(await audit(page), []);
      if (kind === 'borrowings') {
        await expect(page.locator('.overdue-banner')).toHaveCount(1);
        await expect(page.locator('.circulation-card').nth(1).locator('.status-badge')).toContainText(tr('borrowings.status.ACTIVE'));
      }
      if (width === 1440 || width === 390) await page.screenshot({ path: `${evidence}/${kind}-${width}-${language}-${theme}.png`, fullPage: true });
      if (width < 761) for (const safe of ['0px', '34px']) {
        await page.locator('.student-shell').evaluate((node, safe) => node.style.setProperty('--student-safe-bottom', safe), safe);
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        assert.equal(await page.locator('.catalog-pagination').evaluate((node) => node.getBoundingClientRect().bottom < document.querySelector('.student-mobile-nav').getBoundingClientRect().top), true);
      }
      const link = page.locator('.circulation-card h2 a').first(); await link.focus();
      assert.equal(await link.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
      await link.press('Enter'); await expect(page.locator('.item-detail-page')).toBeVisible();
    }
  });
}

for (const kind of ['reservations', 'borrowings']) for (const language of ['en', 'ar']) {
  test(`${kind} ${language}: loading, read failure, retry, failed refresh snapshot and real empty response`, async (t) => {
    const { page, state, tr, goto } = await fixture(t, { language, width: 320, theme: 'dark' });
    state.holds[kind] = true;
    await goto(`/student/${kind}`);
    await expect(page.locator('.circulation-toolbar > strong')).toHaveText(tr(`${kind}.page.loading`));
    await expect(page.locator('.circulation-list-status')).toHaveText(tr(`${kind}.page.loading`));
    assert.equal(await page.locator('.circulation-list-status').evaluate((node) => Boolean(node.closest('[aria-busy="true"]'))), false);
    await expect(page.getByRole('heading', { name: tr(`${kind}.page.emptyTitle`), exact: true })).toHaveCount(0);
    state.release(kind); await ready(page);
    state.fail[kind] = true;
    await changed(page, kind, () => page.getByRole('button', { name: tr('circulationUx.refresh'), exact: true }).click());
    await expect(page.getByRole('alert')).toContainText('read-id-123');
    await expect(page.getByRole('alert')).toContainText(tr('discovery.detail.requestId'));
    await expect(page.getByRole('alert').locator('bdi')).toHaveText('read-id-123');
    await expect(page.locator('.circulation-toolbar > strong')).toHaveText(tr('circulationUx.unavailable'));
    await expect(page.locator('.circulation-card')).toHaveCount(3);
    await expect(page.getByText(tr('circulationUx.stale'), { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: tr(`${kind}.page.emptyTitle`), exact: true })).toHaveCount(0);
    assert.deepEqual(await audit(page), []);
    state.fail[kind] = false;
    await changed(page, kind, () => page.getByRole('button', { name: tr('discovery.catalog.retry'), exact: true }).press('Enter'));
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
    state.empty[kind] = true;
    await changed(page, kind, () => page.getByRole('button', { name: tr('circulationUx.refresh'), exact: true }).click());
    await expect(page.getByRole('heading', { name: tr(`${kind}.page.emptyTitle`), exact: true })).toBeVisible();
    await expect(page.locator('.circulation-toolbar > strong')).toHaveText(`0 ${tr(`${kind}.page.total`)}`);
    state.fail[kind] = true;
    await page.reload(); await ready(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: tr(`${kind}.page.emptyTitle`), exact: true })).toHaveCount(0);
    await expect(page.locator('.circulation-card')).toHaveCount(0);
    await expect(page.locator('.circulation-toolbar > strong')).toHaveText(tr('circulationUx.unavailable'));
  });

  test(`${kind} ${language}: old responses cannot replace a newer status filter`, async (t) => {
    const { page, state, goto, tr } = await fixture(t, { language });
    await goto(`/student/${kind}`); await ready(page);
    state.holds[`${kind}:ACTIVE`] = true;
    await page.getByRole('combobox').selectOption('ACTIVE');
    await expect(page.locator('.circulation-results')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.circulation-card')).toHaveCount(0);
    const next = kind === 'reservations' ? 'CANCELLED' : 'RETURNED';
    await changed(page, kind, () => page.getByRole('combobox').selectOption(next));
    state.release(`${kind}:ACTIVE`);
    await page.waitForTimeout(120);
    await expect(page.getByRole('combobox')).toHaveValue(next);
    await expect(page.locator('.circulation-card')).toHaveCount(1);
    await expect(page.locator('.status-badge')).toContainText(tr(`${kind}.status.${next}`));
    assert.equal(state.requests.filter((request) => request.path === `/${kind}/me`).length, 3);
  });
}

for (const language of ['en', 'ar']) test(`${language}: cancellation dialog focus, pending guard, failure and confirmed status survive failed refresh`, async (t) => {
  const { page, state, goto, tr } = await fixture(t, { language, width: 320, theme: 'dark' });
  await goto('/student/reservations'); await ready(page);
  await page.locator('.student-shell').evaluate((node) => node.style.setProperty('--student-safe-bottom', '34px'));
  const opener = page.getByRole('button', { name: tr('reservations.cancel.action'), exact: true });
  await opener.press('Enter');
  const dialog = page.getByRole('dialog'), close = dialog.getByRole('button', { name: tr('common.closeDialog'), exact: true });
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: tr('reservations.cancel.confirm'), exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  assert.equal(state.posts, 0);
  await opener.press('Enter');
  const confirm = dialog.getByRole('button', { name: tr('reservations.cancel.confirm'), exact: true });
  state.postError = true; state.holds.post = true;
  await confirm.evaluate((node) => { node.click(); node.click(); });
  await expect(dialog.getByRole('button', { name: tr('reservations.cancel.cancelling'), exact: true })).toBeDisabled();
  await expect(close).toBeDisabled();
  await expect(dialog.getByRole('button', { name: tr('reservations.cancel.keep'), exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await page.locator('.admin-modal-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  assert.equal(state.posts, 1);
  assert.equal(await dialog.evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight - 34), true, 'dialog clears a simulated safe area');
  assert.deepEqual(await audit(page), []);
  await page.screenshot({ path: `${evidence}/cancel-pending-${language}-dark.png` });
  state.release('post');
  await expect(dialog.getByRole('alert')).toContainText('cancel-id-123');
  await expect(confirm).toBeFocused(); await expect(confirm).toBeEnabled();
  await expect(page.locator('.circulation-card')).toHaveCount(3);
  const reads = state.requests.filter((request) => request.path === '/reservations/me').length;
  state.postError = false; state.fail.reservations = true; state.cancelStatus = 'EXPIRED';
  await confirm.press('Enter'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Fixture read failed');
  await expect(page.locator('.circulation-card').first().locator('.status-badge')).toContainText(tr('reservations.status.EXPIRED'));
  await expect(page.getByText(tr('circulationUx.cancellationRecorded'), { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('button', { name: tr('reservations.cancel.action'), exact: true })).toHaveCount(0);
  assert.equal(state.posts, 2);
  assert.equal(state.requests.filter((request) => request.path === '/reservations/me').length, reads + 1);
});

for (const language of ['en', 'ar']) test(`${language}: Keep restores focus; confirmed cancellation refreshes exactly once`, async (t) => {
  const { page, state, goto, tr } = await fixture(t, { language, theme: 'light', width: 390 });
  await goto('/student/reservations'); await ready(page);
  const opener = page.getByRole('button', { name: tr('reservations.cancel.action'), exact: true });
  await opener.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: tr('reservations.cancel.keep'), exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(opener).toBeFocused();
  assert.equal(state.posts, 0);
  await opener.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: tr('reservations.cancel.confirm'), exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0); await ready(page);
  await expect(page.locator('.circulation-card').first().locator('.status-badge')).toContainText(tr('reservations.status.CANCELLED'));
  await expect(page.getByRole('alert')).toHaveCount(0);
  assert.equal(state.posts, 1);
  assert.equal(state.requests.filter((request) => request.path === '/reservations/me').length, 2);
});

test('a cancellation completing after navigation does not refresh or change the new page', async (t) => {
  const { page, state, goto, tr } = await fixture(t);
  await goto('/student/reservations'); await ready(page); state.holds.post = true;
  await page.getByRole('button', { name: tr('reservations.cancel.action'), exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: tr('reservations.cancel.confirm'), exact: true }).click();
  await expect(page.getByRole('button', { name: tr('reservations.cancel.cancelling'), exact: true })).toBeDisabled();
  const response = page.waitForResponse((entry) => new URL(entry.url()).pathname.endsWith('/r1/cancel'));
  await page.evaluate(() => {
    history.pushState({ ...history.state, usr: null, key: 'unmount-fixture' }, '', '/student/catalog');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  await expect(page.locator('.catalog-page')).toBeVisible();
  state.release('post'); await response;
  await expect(page.locator('.catalog-page')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(state.requests.filter((request) => request.path === '/reservations/me').length, 1);
});

for (const language of ['en', 'ar']) test(`${language}: Catalog return restores every parameter and view through links and history`, async (t) => {
  const { page, goto, tr, host } = await fixture(t, { language });
  const path = '/student/catalog?q=research&type=BOOK&categoryId=category&language=en&publicationYear=2024&branchId=branch&availableOnly=true&sort=YEAR_DESC&page=2&pageSize=20';
  await goto(path); await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: tr('discovery.catalog.list'), exact: true }).click();
  await page.locator('.discovery-item-card__footer a').first().press('Enter');
  await expect(page.locator('.item-detail-back')).toHaveAttribute('href', path);
  await page.goBack(); await expect(page).toHaveURL(host + path);
  await expect(page.locator('.catalog-grid')).toHaveClass(/catalog-grid--list/);
  await page.goForward(); await expect(page.locator('.item-detail-page')).toBeVisible();
  await page.locator('.item-detail-back').press('Enter');
  await expect(page).toHaveURL(host + path);
  await expect(page.locator('.catalog-grid')).toHaveClass(/catalog-grid--list/);
  await goto('/student/items/fixture-item');
  await expect(page.locator('.item-detail-back')).toHaveAttribute('href', '/student/catalog');
  await page.evaluate(() => {
    history.replaceState({ ...history.state, usr: { catalogReturn: { to: '//evil.test/path', view: 'list' } } }, '');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  await expect(page.locator('.item-detail-back')).toHaveAttribute('href', '/student/catalog');
});

for (const role of ['LIBRARIAN', 'MANAGEMENT']) test(`${role}: explicit AI return wins over Catalog state and details remain read-only`, async (t) => {
  const { page, state, goto } = await fixture(t, { role });
  const workspace = role === 'LIBRARIAN' ? '/librarian' : '/management';
  await goto(`${workspace}/ai/items/fixture-item`);
  await expect(page.locator('.item-detail-back')).toHaveAttribute('href', `${workspace}/ai`);
  await page.evaluate(() => {
    history.replaceState({ ...history.state, usr: { catalogReturn: { to: '/student/catalog?q=wrong', view: 'list' } } }, '');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  await expect(page.locator('.item-detail-back')).toHaveAttribute('href', `${workspace}/ai`);
  await expect(page.locator('.reservation-panel')).toHaveCount(0);
  assert.equal(state.requests.some((entry) => entry.path === '/reservations/me' || entry.method !== 'GET'), false);
});

test('long titles, missing identities and mixed-direction identifiers stay contained at all widths', async (t) => {
  const { page, state, goto } = await fixture(t, { language: 'ar', theme: 'dark' }); state.long = true;
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const kind of ['reservations', 'borrowings']) { await goto(`/student/${kind}`); await ready(page); await noOverflow(page); }
  }
});

test('pagination keeps its query contract and status changes reset to page one', async (t) => {
  const { page, state, goto, tr } = await fixture(t); state.paged = true;
  for (const kind of ['reservations', 'borrowings']) {
    await goto(`/student/${kind}`); await ready(page);
    await changed(page, kind, () => page.getByRole('button', { name: new RegExp(tr('discovery.pagination.next')) }).click());
    assert.equal(state.requests.at(-1).query.page, '2'); assert.equal(state.requests.at(-1).query.pageSize, '20');
    await changed(page, kind, () => page.getByRole('combobox').selectOption('ACTIVE'));
    assert.equal(state.requests.at(-1).query.page, '1'); assert.equal(state.requests.at(-1).query.status, 'ACTIVE');
  }
});

for (const language of ['en', 'ar']) test(`${language}: date/time groups preserve native locale order and remain readable at 320/390px`, async (t) => {
  const { page, goto } = await fixture(t, { language, theme: 'dark', width: 320 });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const kind of ['reservations', 'borrowings']) {
      await goto(`/student/${kind}`); await ready(page);
      const timestamp = kind === 'reservations' ? records(kind, language)[0].expiresAt : records(kind, language)[0].dueAt;
      const geometry = await page.locator('.circulation-card').first().locator('.circulation-card__meta dd bdi').first()
        .evaluate((node, { language, timestamp }) => {
          const formatter = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
          const parts = formatter.formatToParts(new Date(timestamp)), hour = parts.findIndex((part) => part.type === 'hour');
          const groups = [parts.slice(0, hour - 1), parts.slice(hour)].map((entries) => entries.map((part) => part.value).join(''));
          const cell = node.parentElement.getBoundingClientRect();
          return { actual: node.textContent, expected: formatter.format(new Date(timestamp)),
            groups: groups.map((group) => {
              const start = node.textContent.indexOf(group), range = document.createRange();
              range.setStart(node.firstChild, start); range.setEnd(node.firstChild, start + group.length);
              const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
              return { lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
                contained: rects.every((rect) => rect.left >= cell.left - 1 && rect.right <= cell.right + 1) };
            }) };
        }, { language, timestamp });
      assert.equal(geometry.actual, geometry.expected, 'retain Intl text, digits, punctuation and local time zone');
      assert.ok(geometry.groups.every((group) => group.lines === 1 && group.contained), JSON.stringify(geometry));
      if (language === 'ar' && width === 320) await page.locator('.circulation-card').first()
        .screenshot({ path: `${evidence}/${kind}-arabic-date-review.png` });
    }
  }
});
