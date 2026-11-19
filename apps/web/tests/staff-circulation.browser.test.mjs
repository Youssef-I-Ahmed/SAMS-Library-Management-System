// All API traffic is intercepted. No staff operation can reach a real server.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import axe from 'axe-core';
import { translate } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(tmpdir(), 'sams-ui5b-evidence');
let server, browser, origin;
before(async () => {
  await mkdir(evidence, { recursive: true });
  server = process.env.SAMS_TEST_PRODUCTION
    ? await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
    : await createServer({ root, envFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
  if (!process.env.SAMS_TEST_PRODUCTION) await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await browser?.close();
  if (server?.close) await server.close();
  else if (server) await new Promise((done) => server.httpServer.close(done));
});

const branch = { id: 'branch1', name: 'Main library — المكتبة الرئيسية' };
const student = { id: 'student1', studentId: 'S-2026-001', user: { displayName: 'Academic Reader — قارئ أكاديمي' } };
const item = { id: 'item1', title: 'Knowledge and academic research — المعرفة والبحث العلمي' };
const copy = { id: 'copy1', copyCode: 'CP-001', barcode: 'LIB-2026-001', shelfLocation: 'A-12', item, branch };
const reservation = { id: 'r1', status: 'ACTIVE', student, item, branch, allocatedCopy: copy, isHoldOverdue: false,
  reservedAt: '2026-11-17T09:00:00Z', expiresAt: '2026-11-20T09:00:00Z' };
const borrowing = { id: 'b1', status: 'ACTIVE', student, item, branch, copy, isOverdue: false, overdueDays: 0, dueAt: '2026-11-27T09:00:00Z' };
const visit = { id: 'v1', student, branch, isOpen: true, source: 'MANUAL', checkedInAt: '2026-11-17T09:00:00Z', durationMinutes: 12 };
const kinds = { borrow: 'reservations', return: 'borrowings', reservations: 'reservations', visits: 'visits' };

async function fixture(t, { width = 390, language = 'en', theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const state = { calls: [], posts: [], errors: [], unexpected: [], fail: {}, empty: {}, holds: {}, waiters: {}, postStatus: 200,
    cancelStatus: 'CANCELLED', long: false, paged: false, records: { reservations: [reservation], borrowings: [borrowing], visits: [visit] } };
  state.release = (key) => { state.holds[key] = false; (state.waiters[key] || []).splice(0).forEach((done) => done()); };
  const pause = async (key) => { if (state.holds[key]) await new Promise((done) => (state.waiters[key] ||= []).push(done)); };
  t.after(async () => {
    Object.keys(state.waiters).forEach(state.release); await context.close();
    assert.deepEqual(state.errors, [], 'no browser exceptions');
    assert.deepEqual(state.unexpected, [], 'no unmocked network requests or mutations');
  });
  await context.addInitScript(({ language, theme }) => {
    localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme);
    sessionStorage.setItem('sams.devAccessToken', 'fixture-staff-token');
  }, { language, theme });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status }).catch(() => {});
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.slice('/api/v1'.length), q = Object.fromEntries(url.searchParams);
      state.calls.push({ path, method: request.method(), q });
      if (path === '/auth/me') return json({ user: { id: 'librarian1', roles: ['LIBRARIAN'], displayName: 'Library desk' } });
      if (request.method() === 'POST') {
        const allowed = ['/borrowings/checkout', '/borrowings/b1/return', '/reservations/r1/cancel', '/visits/check-in', '/visits/v1/check-out'];
        if (!allowed.includes(path)) { state.unexpected.push(path); return route.abort(); }
        state.posts.push({ path, body: request.postDataJSON() }); await pause('post');
        if (state.postStatus === 'network') return route.abort('connectionfailed');
        if (state.postStatus !== 200) return json({ error: { message: 'Fixture operation failed', requestId: 'operation-123' } }, state.postStatus);
        let data;
        if (path === '/reservations/r1/cancel') {
          data = { ...reservation, status: state.cancelStatus }; state.records.reservations = [data];
        } else if (path === '/borrowings/checkout') {
          data = { ...borrowing, id: 'new-loan' }; state.records.reservations = [];
        } else if (path.endsWith('/return')) {
          data = { ...borrowing, status: request.postDataJSON().outcome === 'LOST' ? 'LOST' : 'RETURNED' }; state.records.borrowings = [];
        } else {
          data = { ...visit, isOpen: path.endsWith('/check-in') }; state.records.visits = [data];
        }
        return json({ data });
      }
      if (path === '/master-data/branches') {
        if (state.fail.branches) return json({ error: { message: 'Branch lookup failed' } }, 503);
        return json({ data: [branch] });
      }
      if (path === '/inventory/copies') {
        await pause('copies');
        if (state.fail.copies) return json({ error: { message: 'Copy search failed' } }, 503);
        return json({ data: state.empty.copies ? [] : [copy] });
      }
      const kind = path.slice(1);
      if (['reservations', 'borrowings', 'visits'].includes(kind)) {
        const failure = state.fail[kind];
        let data = structuredClone(state.empty[kind] ? [] : state.records[kind]);
        if (q.status) data = data.filter((row) => row.status === q.status);
        if (q.openOnly) data = data.filter((row) => row.isOpen);
        if (state.long) data = data.map((row) => ({ ...row, student: { ...row.student, studentId: 'ID'.repeat(100), user: { displayName: 'اسمطويل'.repeat(40) } }, ...(row.item && { item: { ...row.item, title: 'LongUnbrokenTitle'.repeat(40) } }) }));
        if (q.q === 'new') data = data.map((row) => ({ ...row, student: { ...row.student, user: { displayName: 'Newest matching record' } } }));
        const page = Number(q.page || 1), pageSize = Number(q.pageSize || 20), total = state.paged ? 75 : data.length;
        const result = { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasPreviousPage: page > 1, hasNextPage: page < Math.ceil(total / pageSize) } };
        await pause(kind); await pause(`${kind}:${q.q || ''}`); await pause(`${kind}:page${page}`);
        return failure ? json({ error: { message: 'Fixture read failed', requestId: 'read-123' } }, 503) : json(result);
      }
      state.unexpected.push(`${request.method()} ${path}`); return route.abort();
    }
    if (url.origin === origin) return route.continue();
    state.unexpected.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, tr: (key) => translate(language, key), goto: (workflow) => page.goto(`${origin}/librarian/${workflow}`) };
}
const rows = (page) => page.locator('.staff-operation-row');
const queueState = (page) => page.locator('.staff-workflow-card').last().locator('.staff-read-state');
async function loaded(page) { await expect(page.locator('.staff-read-state button:disabled')).toHaveCount(0); }
async function refresh(page) { await page.locator('.staff-read-state button').last().click(); await loaded(page); }
async function audit(page) {
  await page.evaluate(axe.source);
  return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })));
}

for (const width of [320, 390, 768, 1024, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${width} ${language} ${theme}: four operational layouts, wrapping, reachability and navigation`, async (t) => {
    const { page, state, goto, tr } = await fixture(t, { width, language, theme }); state.long = true;
    for (const workflow of Object.keys(kinds)) {
      await goto(workflow); await loaded(page); await expect(rows(page)).toHaveCount(1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${workflow}: no page overflow`);
      assert.equal(await rows(page).evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)), true);
      await expect(page.locator('.staff-sidebar__nav a[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('.staff-sidebar__nav a[aria-current="page"]')).toBeInViewport();
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const lastAction = rows(page).last().locator('button').last();
      await lastAction.focus(); await expect(lastAction).toBeInViewport();
      assert.equal(await lastAction.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
      if (width === 390) assert.deepEqual(await audit(page), [], `${workflow}: focused axe checks`);
      if ((width === 390 || width === 1440) && theme === 'light' && workflow === 'visits') {
        state.long = false; await refresh(page);
        await page.screenshot({ path: `${evidence}/visits-${width}-${language}.png`, fullPage: true });
        state.long = true;
      }
      await page.locator('.staff-skip-link').focus(); await page.locator('.staff-skip-link').press('Enter');
      await expect(page.locator('#staff-main')).toBeFocused();
      assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
      if (workflow === 'visits') {
        assert.equal(await page.locator('.staff-checkbox input').evaluate((node) => node.getBoundingClientRect().width), 20);
        await expect(page.locator('.staff-visit-filters select')).toHaveAccessibleName(tr('staff.common.branch'));
      }
    }
  });
}

for (const workflow of Object.keys(kinds)) for (const language of ['en', 'ar']) {
  test(`${workflow} ${language}: loading, failure, retry, stale refresh and genuine empty result`, async (t) => {
    const { page, state, goto, tr } = await fixture(t, { language, width: 320, theme: 'dark' }); const kind = kinds[workflow];
    state.holds[kind] = true; state.fail[kind] = true; await goto(workflow);
    await expect(queueState(page).getByText(tr('staff.ux.loading'), { exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    assert.equal(await page.locator('.staff-results-count').count(), 0);
    state.release(kind); await loaded(page);
    await expect(page.getByRole('alert')).toContainText('read-123');
    await expect(page.locator('.staff-empty-state')).toHaveCount(0);
    state.fail[kind] = false; await refresh(page); await expect(rows(page)).toHaveCount(1);
    const readsBefore = state.calls.filter((entry) => entry.path === `/${kind}`).length;
    state.fail[kind] = true; await refresh(page);
    assert.equal(state.calls.filter((entry) => entry.path === `/${kind}`).length, readsBefore + 1, 'one request per refresh');
    await expect(rows(page)).toHaveCount(1); await expect(page.getByText(tr('staff.ux.stale'), { exact: true })).toBeVisible();
    await expect(rows(page).first().locator('button').first()).toBeDisabled();
    await expect(page.locator('.staff-results-count')).toHaveCount(0);
    state.fail[kind] = false; state.empty[kind] = true; await refresh(page);
    await expect(rows(page)).toHaveCount(0); await expect(page.locator('.staff-empty-state')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

for (const workflow of Object.keys(kinds)) {
  test(`${workflow}: delayed search cannot overwrite newer results`, async (t) => {
    const { page, state, goto } = await fixture(t); await goto(workflow); await loaded(page);
    const search = page.locator(workflow === 'visits' ? '.staff-visit-filters input:not([type=checkbox])' : 'input[placeholder]').first(); const form = search.locator('..').locator('xpath=ancestor-or-self::form').first();
    const kind = kinds[workflow]; state.holds[`${kind}:old`] = true;
    await search.fill('old'); await form.evaluate((node) => node.requestSubmit());
    await expect.poll(() => state.calls.some((entry) => entry.q.q === 'old')).toBe(true);
    await search.fill('new'); await form.evaluate((node) => node.requestSubmit()); await loaded(page);
    await expect(rows(page).first()).toContainText('Newest matching record');
    state.release(`${kind}:old`);
    await expect(rows(page).first()).toContainText('Newest matching record');
  });
}

test('Reservations: search from page two makes one page-one request and preserves filters', async (t) => {
  const { page, state, goto, tr } = await fixture(t); state.paged = true;
  await goto('reservations'); await loaded(page);
  await page.getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click(); await loaded(page);
  await expect(page.locator('.staff-pagination span')).toContainText('2');
  const before = state.calls.length;
  await page.locator('.staff-filter-bar input').fill('new');
  await page.locator('.staff-filter-bar').evaluate((node) => node.requestSubmit()); await loaded(page);
  const calls = state.calls.slice(before).filter((entry) => entry.path === '/reservations');
  assert.deepEqual(calls.map((entry) => [entry.q.page, entry.q.q]), [['1', 'new']]);
  await expect(rows(page).first()).toContainText('Newest matching record');
});

for (const language of ['en', 'ar']) {
  test(`Return ${language}: focus, trapped pending dialog, duplicate guard, failure and server-confirmed return`, async (t) => {
    const { page, state, goto, tr } = await fixture(t, { language, width: 320, theme: 'dark' });
    await goto('return'); await loaded(page);
    const opener = page.getByRole('button', { name: tr('staff.return.process'), exact: true });
    await opener.click(); const dialog = page.getByRole('dialog');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
    await opener.click(); state.holds.post = true; state.postStatus = 409;
    const confirm = dialog.getByRole('button', { name: tr('staff.return.confirm'), exact: true });
    await confirm.evaluate((node) => { node.click(); node.click(); });
    await expect.poll(() => state.posts.length).toBe(1);
    await expect(dialog.getByRole('radio').first()).toBeDisabled();
    await page.keyboard.press('Escape'); await page.locator('.admin-modal-backdrop').click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true);
    state.release('post'); await loaded(page);
    await expect(dialog.getByRole('alert')).toContainText('operation-123');
    await expect(confirm).toBeEnabled(); assert.deepEqual(await audit(page), []);
    await page.screenshot({ path: `${evidence}/return-error-320-${language}.png`, fullPage: true });
    state.postStatus = 200; await confirm.click(); await expect(dialog).toHaveCount(0); await loaded(page);
    await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.borrowingStatus.RETURNED'));
    assert.equal(state.posts.length, 2); await expect(rows(page)).toHaveCount(0);
  });

  test(`Reservations ${language}: cancellation confirms EXPIRED, not CANCELLED; pending prevents dismissal`, async (t) => {
    const { page, state, goto, tr } = await fixture(t, { language }); await goto('reservations'); await loaded(page);
    await rows(page).first().getByRole('button', { name: tr('staff.reservations.cancel'), exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); assert.equal(state.posts.length, 0);
    state.cancelStatus = 'EXPIRED'; state.holds.post = true;
    await dialog.getByRole('button', { name: tr('staff.ux.confirmCancel'), exact: true }).evaluate((node) => { node.click(); node.click(); });
    await expect.poll(() => state.posts.length).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    state.release('post'); await expect(dialog).toHaveCount(0); await loaded(page);
    await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.reservationStatus.EXPIRED'));
    await expect(page.locator('.staff-operation-notice')).not.toContainText(tr('staff.reservations.cancelSuccess'));
    await expect(rows(page).first().locator('.staff-status')).toHaveText(tr('staff.reservationStatus.EXPIRED'));
    await expect(rows(page).first().locator('button')).toHaveCount(0);
  });
}

test('Borrow: direct copy selection is explicit; confirmation locks both modes and submits once', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('borrow'); await loaded(page);
  await page.getByRole('button', { name: tr('staff.borrow.direct'), exact: true }).click();
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001');
  await page.getByLabel(tr('staff.borrow.copySearch'), { exact: true }).fill('LIB-2026-001');
  await page.getByRole('button', { name: tr('staff.borrow.findCopy'), exact: true }).click(); await loaded(page);
  await expect(page.getByRole('radio')).not.toBeChecked(); await page.getByRole('radio').check();
  await page.getByRole('button', { name: tr('staff.borrow.checkout'), exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('S-2026-001'); await expect(dialog).toContainText('LIB-2026-001');
  state.holds.post = true;
  await dialog.getByRole('button', { name: tr('staff.ux.confirmCheckout'), exact: true }).evaluate((node) => { node.click(); node.click(); });
  await expect.poll(() => state.posts.length).toBe(1);
  await expect(page.getByRole('button', { name: tr('staff.borrow.fromReservation'), exact: true })).toBeDisabled();
  await expect(page.getByLabel(tr('staff.common.studentNumber'), { exact: true })).toBeDisabled();
  state.release('post'); await expect(dialog).toHaveCount(0); await loaded(page);
  assert.deepEqual(state.posts[0].body, { studentNumber: 'S-2026-001', copyId: 'copy1' });
  await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.borrowingStatus.ACTIVE'));
});

test('Borrow: uncertain outcome blocks replay until refreshed and explicitly verified', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('borrow'); await loaded(page);
  await rows(page).first().getByRole('button').click(); const dialog = page.getByRole('dialog'); state.postStatus = 'network';
  const confirm = dialog.getByRole('button', { name: tr('staff.ux.confirmCheckout'), exact: true });
  await confirm.click(); await loaded(page);
  await expect(dialog.locator('.staff-uncertain')).toBeVisible(); await expect(confirm).toBeDisabled();
  await dialog.locator('.staff-read-state button').click(); await loaded(page); await expect(confirm).toBeDisabled();
  assert.equal(state.posts.length, 1);
  await dialog.getByRole('button', { name: tr('staff.ux.verified'), exact: true }).click(); await expect(confirm).toBeEnabled();
  state.postStatus = 200; await confirm.click(); await expect(dialog).toHaveCount(0); assert.equal(state.posts.length, 2);
});

test('Visits: synchronous cross-action lock and failed-refresh protection', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('visits'); await loaded(page);
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001'); state.holds.post = true;
  await page.locator('.staff-form').evaluate((node) => { node.requestSubmit(); node.requestSubmit(); });
  await expect.poll(() => state.posts.length).toBe(1);
  await expect(rows(page).first().getByRole('button')).toBeDisabled();
  state.fail.visits = true; state.release('post'); await loaded(page);
  await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.visits.open'));
  await expect(page.getByText(tr('staff.ux.stale'), { exact: true })).toBeVisible();
  await expect(rows(page).first().getByRole('button')).toBeDisabled();
  state.fail.visits = false; await refresh(page);
  await rows(page).first().getByRole('button').click(); await loaded(page);
  await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.visits.closed'));
  assert.equal(state.posts.length, 2); await expect(rows(page)).toHaveCount(0);
});

test('A pending operation remains locked across circulation route changes and reconciles the new route', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('visits'); await loaded(page);
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001');
  state.holds.post = true;
  await page.locator('.staff-form').evaluate((node) => node.requestSubmit());
  await expect.poll(() => state.posts.length).toBe(1);
  await page.locator('.staff-sidebar__nav a[href="/librarian/return"]').click();
  await expect(rows(page)).toHaveCount(1); await loaded(page);
  await expect(rows(page).getByRole('button')).toBeDisabled();
  const before = state.calls.filter((entry) => entry.path === '/borrowings').length;
  state.release('post');
  await expect.poll(() => state.calls.filter((entry) => entry.path === '/borrowings').length).toBe(before + 1);
  await loaded(page); await expect(rows(page).getByRole('button')).toBeEnabled();
  assert.equal(state.posts.length, 1);
});

test('Reservation conflict remains inside the dialog and refreshes actual server status', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('reservations'); await loaded(page);
  await rows(page).getByRole('button', { name: tr('staff.reservations.cancel'), exact: true }).click();
  state.postStatus = 409; state.records.reservations = [{ ...reservation, status: 'EXPIRED' }];
  const dialog = page.getByRole('dialog'), confirm = dialog.getByRole('button', { name: tr('staff.ux.confirmCancel'), exact: true });
  await confirm.click(); await loaded(page);
  await expect(dialog.getByRole('alert')).toContainText('operation-123'); await expect(confirm).toBeDisabled();
  await expect(page.locator('.staff-operation-notice')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(rows(page).locator('.staff-status')).toHaveText(tr('staff.reservationStatus.EXPIRED'));
});

test('Direct checkout: failed and empty copy lookups never leave an actionable old selection', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('borrow'); await loaded(page);
  await page.getByRole('button', { name: tr('staff.borrow.direct'), exact: true }).click();
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001');
  const search = page.getByLabel(tr('staff.borrow.copySearch'), { exact: true }); await search.fill('LIB-2026-001');
  const find = page.getByRole('button', { name: tr('staff.borrow.findCopy'), exact: true });
  await find.click(); await loaded(page); await page.getByRole('radio').check();
  state.fail.copies = true; await find.click(); await loaded(page);
  await expect(page.getByRole('alert')).toContainText('Copy search failed');
  await expect(page.getByRole('radio')).toBeDisabled();
  await expect(page.getByRole('button', { name: tr('staff.borrow.checkout'), exact: true })).toHaveCount(0);
  state.fail.copies = false; state.empty.copies = true; await refresh(page);
  await expect(page.getByText(tr('staff.ux.noCopies'), { exact: true })).toBeVisible(); assert.equal(state.posts.length, 0);
});

test('Visits: failed branch lookup has a retry and prevents check-in without fabricating a branch', async (t) => {
  const { page, state, goto, tr } = await fixture(t); state.fail.branches = true;
  await goto('visits'); await loaded(page);
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001');
  await expect(page.getByRole('button', { name: tr('staff.visits.checkIn'), exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Branch lookup failed');
  state.fail.branches = false; await page.getByRole('button', { name: tr('staff.ux.retry'), exact: true }).click();
  await loaded(page); await expect(page.getByRole('button', { name: tr('staff.visits.checkIn'), exact: true })).toBeEnabled();
  assert.equal(state.posts.length, 0);
});

test('Borrow queue: visible scope is capped at 50, without fabricated pagination', async (t) => {
  const { page, state, goto, tr } = await fixture(t, { width: 1440 }); state.paged = true;
  await goto('borrow'); await loaded(page);
  await expect(page.locator('.staff-read-state small')).toHaveText(tr('staff.ux.scope').replace('{count}', '1').replace('{limit}', '50'));
  await expect(page.locator('.staff-pagination')).toHaveCount(0);
  assert.equal(state.calls.find((entry) => entry.path === '/reservations').q.pageSize, '50');
  await page.screenshot({ path: `${evidence}/borrow-1440-en.png`, fullPage: true });
});

test('Visits: pending feedback replaces the previous success, and a failed checkout remains retryable', async (t) => {
  const { page, state, goto, tr } = await fixture(t); await goto('visits'); await loaded(page);
  await page.getByLabel(tr('staff.common.studentNumber'), { exact: true }).fill('S-2026-001');
  await page.getByRole('button', { name: tr('staff.visits.checkIn'), exact: true }).click(); await loaded(page);
  await expect(page.locator('.staff-operation-notice')).toBeVisible();
  state.postStatus = 409; state.holds.post = true;
  await rows(page).getByRole('button').click(); await expect(page.locator('.staff-operation-notice')).toHaveCount(0);
  await expect(page.getByText(tr('staff.ux.pending'), { exact: true })).toBeVisible();
  state.release('post'); await loaded(page);
  await expect(page.getByRole('alert')).toContainText('operation-123'); await expect(rows(page).getByRole('button')).toBeEnabled();
  state.postStatus = 200; await rows(page).getByRole('button').click(); await loaded(page);
  await expect(page.locator('.staff-operation-notice')).toContainText(tr('staff.visits.closed')); assert.equal(state.posts.length, 3);
});

test('Navigation keeps the current workflow visible through resize and language changes', async (t) => {
  const { page, goto } = await fixture(t, { width: 1440 }); await goto('visits'); await loaded(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator('.staff-sidebar__nav a[aria-current="page"]')).toBeInViewport();
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.staff-sidebar__nav a[aria-current="page"]')).toBeInViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('Borrow mode controls: natural desktop width and narrow-screen sizing in both languages and themes', async (t) => {
  for (const width of [320, 390, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
    const { page, goto, tr } = await fixture(t, { width, language, theme });
    await goto('borrow'); await loaded(page);
    const modes = page.locator('.staff-mode-tabs');
    assert.equal(await modes.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width === 1440) assert.equal(await modes.locator('button').first().evaluate((node) => node.clientHeight <= 44), true, 'desktop labels stay on one line');
    await expect(modes.getByRole('button', { name: tr('staff.borrow.fromReservation'), exact: true })).toHaveAttribute('aria-pressed', 'true');
    await modes.getByRole('button', { name: tr('staff.borrow.direct'), exact: true }).click();
    await expect(modes.getByRole('button', { name: tr('staff.borrow.direct'), exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.close();
  }
});
