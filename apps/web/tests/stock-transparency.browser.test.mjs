// Fixture-only stock transparency checks. No API server or database is used.
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
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' })
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const itemId = '00000000-0000-4000-8000-000000000001';
const branches = [
  { id: '00000000-0000-4000-8000-000000000010', name: 'Main fixture branch', code: 'MAIN' },
  { id: '00000000-0000-4000-8000-000000000011', name: 'Second fixture branch', code: 'SECOND' }
];

// These are the existing public fields only. There is intentionally no demo,
// verification, or source property to guess from, for either catalog entry.
function item(id = itemId, mode = 'available', reserved = false) {
  const available = mode === 'available';
  const branchRecords = mode === 'noCopies' ? [] : branches.map((branch, index) => ({
    branch, totalCopies: 2, availableCopies: available && !(reserved && index === 1) ? 1 : 0,
    available: available && !(reserved && index === 1)
  }));
  const availableCopies = branchRecords.reduce((sum, entry) => sum + entry.availableCopies, 0);
  return {
    id, type: 'BOOK', title: id === itemId ? 'Catalog book fixture' : 'Another catalog book',
    publicationYear: 2024, language: 'en', callNumber: '001 FIX',
    bookDetails: { isbn: '9780000000001' }, itemContributors: [],
    availability: {
      totalCopies: mode === 'noCopies' ? 0 : 4, availableCopies,
      available: availableCopies > 0, branches: branchRecords
    },
    reservationReadiness: {
      hasAvailableCopy: availableCopies > 0,
      candidateBranches: branchRecords.filter((entry) => entry.available).map(({ branch, availableCopies }) => ({ branch, availableCopies }))
    }
  };
}

function pagination(data) {
  return { data, pagination: {
    page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0,
    hasPreviousPage: false, hasNextPage: false
  } };
}

async function fixture(t, language) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const state = {
    mode: 'available', existing: null, reservationError: null,
    detailError: false, listError: false, holdSearch: false, holdDetail: false,
    holdList: false, holdPost: false, waiters: {}, requests: [], posts: [], unexpected: [], errors: []
  };
  function release(key) {
    state[key] = false;
    (state.waiters[key] || []).splice(0).forEach((resolve) => resolve());
  }
  async function pause(key) {
    if (state[key]) await new Promise((resolve) => (state.waiters[key] ||= []).push(resolve));
  }
  t.after(async () => {
    Object.keys(state.waiters).forEach(release);
    await context.close();
    assert.deepEqual(state.unexpected, [], 'unexpected API or external requests are blocked');
    assert.deepEqual(state.errors, [], 'no browser runtime errors');
  });
  await context.addInitScript((language) => {
    localStorage.setItem('sams.language', language);
    sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
  }, language);
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const json = (data, status = 200) => route.fulfill({ json: data, status });
    state.requests.push({ method: request.method(), path, query: Object.fromEntries(url.searchParams) });
    if (path === '/auth/me') return json({ user: {
      id: 'fixture-student', roles: ['STUDENT'], displayName: 'Stock Tester'
    } });
    if (path === '/discovery/facets') return json({ data: { types: [{ value: 'BOOK', count: 3 }] } });
    if (path === '/discovery/items') {
      await pause('holdSearch');
      if (url.searchParams.get('q') === 'error') return json({ error: { message: 'Fixture catalog error' } }, 500);
      let data = url.searchParams.get('q') === 'empty' ? [] : [
        item(), item('other-item', 'unavailable'), item('no-copies-item', 'noCopies')
      ];
      if (url.searchParams.get('availableOnly') === 'true') data = data.filter((entry) => entry.availability.available);
      return json(pagination(data));
    }
    if (path === `/discovery/items/${itemId}`) {
      await pause('holdDetail');
      if (state.detailError) return json({ error: { message: 'Fixture details error' } }, 500);
      return json({ data: item(itemId, state.mode, Boolean(state.existing)) });
    }
    if (path === '/reservations/me') {
      await pause('holdList');
      if (state.listError) return json({ error: { message: 'Fixture reservations error' } }, 500);
      return json(pagination(state.existing ? [state.existing] : []));
    }
    if (path === '/reservations' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.posts.push({ path, body, headers: request.headers() });
      await pause('holdPost');
      if (state.reservationError) return json({ error: {
        code: state.reservationError, message: 'Fixture reservation error', requestId: 'stock-fixture-id'
      } }, 409);
      state.existing = {
        id: 'fixture-reservation', status: 'ACTIVE',
        item: { id: itemId, type: 'BOOK', title: 'Catalog book fixture', callNumber: '001 FIX' },
        branch: branches.find((branch) => branch.id === body.branchId),
        reservedAt: '2026-10-24T09:00:00Z', expiresAt: '2026-10-26T09:00:00Z'
      };
      return json({ data: state.existing }, 201);
    }
    if (path === '/reservations/fixture-reservation/cancel' && request.method() === 'POST') {
      state.posts.push({ path, body: request.postData() });
      state.existing = { ...state.existing, status: 'CANCELLED' };
      return json({ data: state.existing });
    }
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, release, tr: (key) => translate(language, key) };
}

async function notice(page, tr) {
  const note = page.getByRole('note', { name: tr('discovery.inventoryNotice.title'), exact: true });
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  await expect(note).toContainText(tr('discovery.inventoryNotice.body'));
  assert.equal(await note.getAttribute('aria-live'), null, 'static notice avoids repeated announcements');
  return note;
}

async function scanNotice(page, includeDetails = false) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(() => window.axe.run('[role="note"]', {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
  }));
  assert.deepEqual(result.violations.map(({ id }) => id), [], 'new notice passes scoped axe checks, including contrast');
  if (includeDetails) {
    const details = await page.evaluate(() => window.axe.run('.item-detail-page', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
    }));
    const rules = details.violations.map(({ id }) => id);
    console.log(`axe item details: ${JSON.stringify(rules)}`);
    assert.deepEqual(rules.filter((id) => id !== 'color-contrast'), [],
      'details semantics pass; existing contrast findings remain visible');
  }
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const language of ['en', 'ar']) {
  test(`${language}: catalog qualifies available, unavailable, empty, loading and error records`, async (t) => {
    const { page, state, release, tr } = await fixture(t, language);
    state.holdSearch = true;
    await page.goto(`${origin}/student/catalog`);
    const note = await notice(page, tr);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.catalog-layout > [role="status"]')).toHaveText(tr('discovery.catalog.loading'));
    release('holdSearch');
    const badges = page.locator('.availability-badge');
    await expect(badges).toHaveText([
      `${tr('discovery.availability.available')} · 2`,
      tr('discovery.availability.unavailable'), tr('discovery.availability.noCopies')
    ]);
    await scanNotice(page);
    await page.getByRole('checkbox').check();
    await expect(badges).toHaveCount(1);
    assert.equal(state.requests.filter((request) => request.path === '/discovery/items').at(-1).query.availableOnly, 'true');
    await page.getByRole('checkbox').uncheck();
    await expect(badges).toHaveCount(3);
    await note.evaluate((node) => { window.__inventoryNote = node; });
    for (const query of ['empty', 'error', 'recovery']) {
      await page.getByRole('searchbox').fill(query);
      await page.locator('.catalog-search button').click();
      if (query === 'empty') await expect(page.getByRole('heading', { name: tr('discovery.empty.title') })).toBeVisible();
      if (query === 'error') await expect(page.getByRole('alert')).toContainText('Fixture catalog error');
      if (query === 'recovery') await expect(badges).toHaveCount(3);
      await notice(page, tr);
      assert.equal(await note.evaluate((node) => node === window.__inventoryNote), true);
    }
    assert.equal(state.posts.length, 0);
    const requestsBeforeSwitch = state.requests.filter((request) => request.path === '/discovery/items').length;
    await page.getByRole('button', { name: language === 'en' ? 'عربي' : 'EN', exact: true }).click();
    await notice(page, (key) => translate(language === 'en' ? 'ar' : 'en', key));
    assert.equal(state.requests.filter((request) => request.path === '/discovery/items').length, requestsBeforeSwitch);
  });

  test(`${language}: details and reservation create/cancel retain policy, payload and accessible qualification`, async (t) => {
    const { page, state, release, tr } = await fixture(t, language);
    state.holdList = true;
    await page.goto(`${origin}/student/items/${itemId}`);
    const note = await notice(page, tr);
    const noteId = await note.locator('span').getAttribute('id');
    await expect(page.getByText(tr('reservations.detail.checking'), { exact: true })).toBeVisible();
    release('holdList');
    await expect(page.locator('.availability-summary strong')).toHaveText(['2', '4']);
    await expect(page.locator('.branch-list b .sr-only').first()).toHaveText(
      `1 ${tr('discovery.detail.availableCopies')}, 2 ${tr('discovery.detail.totalCopies')}`);
    await expect(page.locator('.availability-badge')).toHaveText(`${tr('discovery.availability.available')} · 2`);
    await scanNotice(page, true);
    const start = page.getByRole('button', { name: tr('reservations.detail.start'), exact: true });
    await expect(start).toBeEnabled();
    await expect(start).toHaveAttribute('aria-describedby', noteId);
    await expect(start).toHaveAccessibleDescription(new RegExp(escapeRegex(tr('discovery.inventoryNotice.body'))));
    await start.focus();
    await page.keyboard.press('Enter');
    const select = page.locator('.reservation-confirmation select');
    await expect(select.locator('option')).toHaveText(branches.map((branch) =>
      `${branch.name} · 1 ${tr('reservations.detail.available')}`));
    await page.getByRole('button', { name: tr('reservations.detail.keepBrowsing'), exact: true }).click();
    assert.equal(state.posts.length, 0, 'canceling confirmation does not submit');
    await start.click();
    await select.selectOption(branches[1].id);
    const confirm = page.getByRole('button', { name: tr('reservations.detail.confirm'), exact: true });
    await expect(confirm).toHaveAccessibleDescription(new RegExp(escapeRegex(tr('discovery.inventoryNotice.body'))));
    for (const [code, key] of [
      ['NO_AVAILABLE_COPY', 'reservations.errors.noAvailableCopy'],
      ['NO_CIRCULATION_POLICY', 'reservations.errors.noPolicy']
    ]) {
      state.reservationError = code;
      await confirm.click();
      await expect(page.getByRole('alert')).toContainText(tr(key));
      await expect(page.getByRole('alert')).toContainText('stock-fixture-id');
      await expect(confirm).toBeEnabled();
      await notice(page, tr);
    }
    state.reservationError = null;
    state.holdPost = true;
    await confirm.click();
    await expect(page.getByRole('button', { name: tr('reservations.detail.reserving'), exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: tr('reservations.detail.keepBrowsing'), exact: true })).toBeDisabled();
    release('holdPost');
    await expect(page.getByText(tr('reservations.detail.successTitle'), { exact: true })).toBeVisible();
    await notice(page, tr);
    await expect(page.locator('.availability-summary strong')).toHaveText(['1', '4']);
    await expect(start).toHaveCount(0);
    assert.equal(state.posts.length, 3);
    for (const post of state.posts) {
      assert.deepEqual(post.body, { itemId, branchId: branches[1].id });
      assert.match(post.headers['idempotency-key'], /^sams-reserve-/);
    }
    assert.equal(new Set(state.posts.map((post) => post.headers['idempotency-key'])).size, 3);
    await page.getByRole('link', { name: new RegExp(escapeRegex(tr('reservations.detail.viewReservations'))) }).click();
    await notice(page, tr);
    await expect(page.locator('.reservation-list')).toContainText(tr('reservations.status.ACTIVE'));
    await page.getByRole('button', { name: tr('reservations.cancel.action'), exact: true }).click();
    await page.getByRole('button', { name: tr('reservations.cancel.confirm'), exact: true }).click();
    await expect(page.locator('.reservation-list')).toContainText(tr('reservations.status.CANCELLED'));
    assert.equal(state.posts.at(-1).path, '/reservations/fixture-reservation/cancel');
    await notice(page, tr);
  });

  test(`${language}: unavailable/no-copy details, existing holds and failure/empty pages remain truthful`, async (t) => {
    const { page, state, release, tr } = await fixture(t, language);
    for (const mode of ['unavailable', 'noCopies']) {
      state.mode = mode;
      await page.goto(`${origin}/student/items/${itemId}`);
      await notice(page, tr);
      await expect(page.locator('.availability-badge')).toHaveText(tr(`discovery.availability.${mode}`));
      await expect(page.getByText(tr('reservations.detail.unavailableTitle'), { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: tr('reservations.detail.start'), exact: true })).toHaveCount(0);
    }
    state.mode = 'available';
    state.existing = { id: 'existing', status: 'ACTIVE', item: { id: itemId }, expiresAt: '2026-10-26T09:00:00Z' };
    await page.goto(`${origin}/student/items/${itemId}`);
    await expect(page.getByText(tr('reservations.detail.alreadyReserved'), { exact: true })).toBeVisible();
    await notice(page, tr);
    state.existing = null;
    state.holdDetail = true;
    state.detailError = true;
    await page.goto(`${origin}/student/items/${itemId}`);
    await expect(page.getByText(tr('discovery.detail.loading'), { exact: true })).toBeVisible();
    await expect(page.locator('.availability-badge')).toHaveCount(0);
    release('holdDetail');
    await expect(page.getByRole('alert')).toContainText('Fixture details error');
    await expect(page.getByRole('link', { name: tr('discovery.detail.back'), exact: true })).toBeVisible();
    await expect(page.locator('.availability-summary')).toHaveCount(0);
    state.holdList = true;
    await page.goto(`${origin}/student/reservations`);
    await notice(page, tr);
    await expect(page.getByText(tr('reservations.page.loading'), { exact: true })).toBeVisible();
    release('holdList');
    await expect(page.getByRole('heading', { name: tr('reservations.page.emptyTitle'), exact: true })).toBeVisible();
    await notice(page, tr);
    state.listError = true;
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Fixture reservations error');
    await notice(page, tr);
    assert.equal(state.posts.length, 0);
  });
}
