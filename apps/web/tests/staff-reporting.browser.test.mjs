// No API server: all requests are intercepted and all writes are blocked.
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
const evidence = resolve(tmpdir(), 'sams-ui5d-evidence');
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
after(async () => { await browser?.close(); if (server?.close) await server.close(); else if (server) await new Promise(done => server.httpServer.close(done)); });
const branches = [{ id: 'branch1', name: 'Main library — المكتبة الرئيسية' }, { id: 'branch2', name: 'Research library — مكتبة البحث' }];
const student = { studentId: 'S-2026-001', user: { displayName: 'Academic Reader — قارئ أكاديمي' } };
const borrowing = { id: 'borrowing1', status: 'ACTIVE', isOverdue: false, student, item: { id: 'item1', title: 'Academic knowledge — المعرفة الأكاديمية' }, branch: branches[0], dueAt: '2020-01-03T09:00:00Z' };
// Intentionally old due date with authoritative isOverdue=false. No client overdue rule.
const visit = { id: 'visit1', student, branch: branches[0], isOpen: true, durationMinutes: 0, checkedInAt: '2026-11-17T09:00:00Z' };
const endpoints = ['overview', 'trends', 'branches', 'top-items'];
const branchActivity = { branch1: 5, branch2: 7 };
async function fixture(t, { width = 390, language = 'en', theme = 'light', role = 'MANAGEMENT' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Africa/Cairo' });
  const state = { role, calls: [], writes: [], errors: [], unexpected: [], fail: {}, holds: {}, waiters: {}, empty: {}, zero: false, missing: false, long: false, paged: false, malformed: false };
  state.release = key => { state.holds[key] = false; (state.waiters[key] || []).splice(0).forEach(done => done()); };
  const pause = async key => { if (state.holds[key]) await new Promise(done => (state.waiters[key] ||= []).push(done)); };
  t.after(async () => { Object.keys(state.waiters).forEach(state.release); await context.close(); assert.deepEqual(state.errors, []); assert.deepEqual(state.unexpected, []); assert.deepEqual(state.writes, []); });
  await context.addInitScript(({ language, theme }) => { localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme); sessionStorage.setItem('sams.devAccessToken', 'fixture-report-token'); }, { language, theme });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status }).catch(() => {});
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.slice('/api/v1'.length), query = Object.fromEntries(url.searchParams);
      state.calls.push({ path, query, method: request.method() });
      if (request.method() !== 'GET') { state.writes.push(path); return route.abort(); }
      if (path === '/auth/me') return json({ user: { id: 'report-user', roles: [state.role], displayName: 'Fixture library reviewer', universityEmail: 'reviewer@fixture.invalid' } });
      if (path === '/master-data/branches') return state.fail.lookups ? json({ error: { message: 'Branch lookup failed' } }, 503) : json({ data: branches });
      const endpoint = path.replace('/analytics/', '');
      if (endpoints.includes(endpoint)) {
        const selected = query.branchId === 'branch2' ? branches[1] : query.branchId ? branches[0] : null;
        const scope = { branch: selected, from: query.from, to: query.to, generatedAt: '2026-11-17T12:34:00Z', periodSemantics: '[from, to)', bucket: query.bucket || 'DAY', bucketTimezone: 'UTC', metric: query.metric || 'BORROWINGS', limit: 10 };
        const value = state.zero ? 0 : selected ? branchActivity[selected.id] : Object.values(branchActivity).reduce((sum, count) => sum + count, 0);
        let data;
        if (endpoint === 'overview') data = { scope, catalog: { activeItems: value, availableCopies: state.missing ? null : value, physicalCopies: value * 3, availabilityRatePercent: state.zero ? 0 : 33.33 },
          circulation: { activeLoans: value, overdueLoans: 0, overdueLoanRatePercent: state.missing ? undefined : 0, borrowingsStartedInPeriod: value, returnsInPeriod: value }, reservations: { activeHolds: value }, visits: { visitsInPeriod: value } };
        if (endpoint === 'trends') data = { scope, data: state.empty.analytics ? [] : [{ bucketStart: query.from, reservationsCreated: value, borrowingsStarted: value, returns: state.missing ? null : value, visits: value }] };
        if (endpoint === 'trends' && state.manyTrends) data.data = Array.from({ length: Math.ceil((new Date(query.to) - new Date(query.from)) / 86400000) }, (_, index) => ({ bucketStart: new Date(new Date(query.from).getTime() + index * 86400000).toISOString(), reservationsCreated: index < value ? 1 : 0, borrowingsStarted: index < value ? 1 : 0, returns: index < value ? 1 : 0, visits: index < value ? 1 : 0 }));
        if (endpoint === 'branches') data = { scope: { ...scope, branch: undefined }, data: state.empty.analytics ? [] : branches.map(branch => { const branchValue = state.zero ? 0 : branchActivity[branch.id]; return ({ branch: { ...branch, name: state.long ? branch.name + 'LongBranch'.repeat(20) : branch.name }, catalog: { availableCopies: branchValue, physicalCopies: branchValue * 3 }, circulation: { activeLoans: branchValue, overdueLoans: 0, borrowingsStartedInPeriod: branchValue }, visits: { visitsInPeriod: branchValue } }); }) };
        if (endpoint === 'top-items') data = { scope, data: state.empty.analytics ? [] : [{ rank: 1, item: { id: 'item1', title: state.long ? 'LongAcademicTitle'.repeat(30) : borrowing.item.title, callNumber: state.long ? 'IDENTIFIER'.repeat(25) : '658-2026' }, count: value }] };
        const failure = state.fail.analytics || state.fail[endpoint];
        await pause(endpoint); await pause(`${endpoint}:${query.branchId || 'all'}`);
        return failure ? json({ error: { message: `Fixture ${endpoint} failed`, requestId: 'report-read-123' } }, 503) : json({ data: state.malformed && endpoint === 'trends' ? {} : data });
      }
      if (path === '/borrowings' || path === '/visits') {
        const kind = path.slice(1), failure = state.fail[kind];
        let data = state.empty[kind] ? [] : [structuredClone(kind === 'borrowings' ? borrowing : visit)];
        if (state.long) data = data.map(row => ({ ...row, student: { studentId: 'LONGID'.repeat(30), user: { displayName: 'قارئطويل'.repeat(35) } }, ...(row.item && { item: { ...row.item, title: 'LongAcademicTitle'.repeat(30) } }) }));
        if (query.q === 'new') data = data.map(row => ({ ...row, student: { ...row.student, user: { displayName: 'Newest matching reader' } } }));
        if (query.status) data = data.filter(row => row.status === query.status);
        if (query.overdueOnly) data = data.filter(row => row.isOverdue);
        if (query.openOnly) data = data.filter(row => row.isOpen);
        if (state.missing && kind === 'visits') data = data.map(row => ({ ...row, durationMinutes: null, isOpen: undefined }));
        if (state.paged && data.length) data = Array.from({ length: 45 }, (_, index) => ({ ...data[0], id: `record-${index}` }));
        const page = Number(query.page || 1), pageSize = Number(query.pageSize || 20), total = data.length;
        const result = { data: data.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasPreviousPage: page > 1, hasNextPage: page < Math.ceil(total / pageSize) } };
        await pause(kind); await pause(`${kind}:${query.q || ''}`);
        return failure ? json({ error: { message: `Fixture ${kind} failed`, requestId: 'list-read-123' } }, 503) : json(result);
      }
      state.unexpected.push(path); return route.abort();
    }
    if (url.origin === origin) return route.continue(); state.unexpected.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => state.errors.push(error.message));
  return { page, state, tr: key => translate(language, key), goto: path => page.goto(origin + path), num: value => new Intl.NumberFormat(language).format(value) };
}
const reportReady = async (page, tr) => expect(page.locator('.report-read-state [role=status]')).toHaveText(tr('admin.workflows.loaded'));
const listReady = async page => expect(page.locator('.admin-card > .admin-read-state button')).toBeEnabled();
const rows = page => page.locator('.management-records tbody tr');
async function audit(page) { await page.evaluate(axe.source); return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))); }
async function applyBranch(page, tr, branchId) {
  await page.getByRole('combobox', { name: tr('admin.common.branch'), exact: true }).selectOption(branchId);
  await page.getByRole('button', { name: tr('admin.reporting.apply'), exact: true }).click();
}

for (const width of [320, 390, 768, 1024, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${width} ${language} ${theme}: Management layouts, aliases, tables, final scroll and Librarian orientation`, async t => {
    const { page, state, goto, tr } = await fixture(t, { width, language, theme }); state.long = true;
    for (const path of ['/management', '/management/analytics', '/management/borrowings', '/management/visits']) {
      await goto(path);
      if (path === '/management' || path.endsWith('/analytics')) await reportReady(page, tr); else await listReady(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
      const current = page.locator('.staff-sidebar__nav a[aria-current=page]'); await expect(current).toHaveCount(1); await expect(current).toBeInViewport();
      await expect(page.locator('.staff-sidebar__nav a[href="/management/analytics"]')).toHaveCount(0);
      const region = page.locator('.admin-table-wrap').last(); await page.keyboard.press('Tab'); await region.focus(); await expect(region).toBeFocused();
      assert.equal(await region.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      if (width <= 1024) { await region.press(language === 'ar' ? 'ArrowLeft' : 'ArrowRight'); await expect.poll(() => region.evaluate(node => Math.abs(node.scrollLeft))).toBeGreaterThan(0); }
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const last = page.locator('.admin-pagination button').last();
      if (await last.count()) { await last.scrollIntoViewIfNeeded(); await expect(last).toBeInViewport(); }
      else { const cell = page.locator('.admin-table tr').last().locator('td').last(); await cell.scrollIntoViewIfNeeded(); await expect(cell).toBeInViewport(); }
      if (width === 390 && path !== '/management/analytics') assert.deepEqual(await audit(page), [], path);
      if ((width === 390 || width === 1440) && path === '/management' && theme === 'light') {
        state.long = false; await page.locator('.report-filters button[type=submit]').click(); await reportReady(page, tr);
        await page.locator('.admin-table-wrap').evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' })); await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `${evidence}/management-${width}-${language}.png`, fullPage: true }); state.long = true;
      }
      await page.locator('.staff-skip-link').focus(); await page.locator('.staff-skip-link').press('Enter'); await expect(page.locator('#staff-main')).toBeFocused();
    }
    state.role = 'LIBRARIAN'; await goto('/librarian'); await expect(page.locator('.librarian-task-grid a')).toHaveCount(7);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const lastTask = page.locator('.librarian-task-grid a').last(); await lastTask.focus(); await expect(lastTask).toBeInViewport();
    assert.equal(await lastTask.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
    if (width === 390) assert.deepEqual(await audit(page), []);
    if (width === 1440 && language === 'en' && theme === 'light') { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${evidence}/librarian-overview-1440-en.png`, fullPage: true }); }
  });
}

for (const language of ['en', 'ar']) {
  test(`${language}: analytics initial failure, valid zeros, missing values and empty subsections`, async t => {
    const { page, state, goto, tr, num } = await fixture(t, { language, width: 320, theme: 'dark' }); state.fail.trends = true; state.holds.trends = true;
    await goto('/management'); await expect(page.locator('.report-read-state [role=status]')).toHaveText(tr('admin.common.loading'));
    await expect(page.locator('.metric-card')).toHaveCount(0); state.release('trends');
    await expect(page.getByRole('alert')).toContainText('report-read-123'); await expect(page.locator('.metric-card')).toHaveCount(0);
    state.fail.trends = false; state.zero = true; await page.getByRole('button', { name: tr('admin.workflows.retry'), exact: true }).click(); await reportReady(page, tr);
    assert.equal(await page.locator('.metric-card > strong').evaluateAll((nodes, zero) => nodes.every(node => node.textContent.trim() === zero), num(0)), true);
    assert.equal(await page.locator('.trend-bars b').evaluateAll(nodes => nodes.every(node => node.style.width === '0%')), true);
    await expect(page.locator('.metric-card').first()).toContainText(`${num(0)}%`);
    state.missing = true; state.empty.analytics = true; await page.locator('.report-filters button[type=submit]').click(); await reportReady(page, tr);
    await expect(page.getByText(tr('admin.reporting.noTrends'), { exact: true })).toBeVisible(); await expect(page.getByText(tr('admin.reporting.noTop'), { exact: true })).toBeVisible();
    await expect(page.getByText(tr('admin.reporting.noBranches'), { exact: true })).toBeVisible();
    await expect(page.locator('.metric-card').first()).toContainText(`—/${num(0)}`); await expect(page.locator('.metric-card').nth(1)).toContainText('—');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test(`${language}: failed filter refresh labels previous values with their own scope, then retries correctly`, async t => {
    const { page, state, goto, tr, num } = await fixture(t, { language }); await goto('/management'); await reportReady(page, tr);
    await expect(page.locator('.metric-card > strong').first()).toHaveText(num(12));
    state.fail['top-items'] = true; state.holds['top-items:branch2'] = true;
    await applyBranch(page, tr, 'branch2'); await expect(page.locator('.report-scope--stale')).toContainText(tr('admin.reporting.updating'));
    state.release('top-items:branch2'); await expect(page.getByRole('alert')).toContainText('report-read-123');
    await expect(page.locator('.report-scope--stale')).toContainText(tr('admin.reporting.stale'));
    await expect(page.locator('.report-scope')).toContainText(tr('admin.common.allBranches'));
    await expect(page.locator('.metric-card > strong').first()).toHaveText(num(12));
    if (language === 'ar') await page.screenshot({ path: `${evidence}/stale-report-390-ar.png`, fullPage: true });
    state.fail['top-items'] = false; await page.getByRole('button', { name: tr('admin.workflows.retry'), exact: true }).click(); await reportReady(page, tr);
    await expect(page.locator('.metric-card > strong').first()).toHaveText(num(7)); await expect(page.locator('.report-scope--stale')).toHaveCount(0);
    await expect(page.locator('.report-scope')).toContainText(branches[1].name);
    await expect(page.locator('.admin-table tbody')).toContainText(branches[0].name); await expect(page.locator('.admin-table tbody')).toContainText(branches[1].name);
    await expect(page.getByText(tr('admin.reporting.comparisonScope'), { exact: true })).toBeVisible();
  });
}

test('Analytics ignores delayed older groups; filters are explicit, UTC-inclusive days and snapshots publish together', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('/management'); await reportReady(page, tr);
  state.holds['overview:branch2'] = true; await applyBranch(page, tr, 'branch2');
  await expect.poll(() => state.calls.some(row => row.path === '/analytics/overview' && row.query.branchId === 'branch2')).toBe(true);
  await applyBranch(page, tr, 'branch1'); await reportReady(page, tr);
  state.release('overview:branch2'); await expect(page.locator('.report-scope')).toContainText(branches[0].name); await expect(page.locator('.metric-card > strong').first()).toHaveText('5');
  const before = state.calls.length;
  await page.getByLabel(tr('admin.analytics.from'), { exact: true }).fill('2026-04-01');
  await page.getByLabel(tr('admin.reporting.through'), { exact: true }).fill('2026-04-03');
  await page.getByRole('combobox', { name: tr('admin.analytics.topItems'), exact: true }).selectOption('RESERVATIONS');
  await expect(page.getByText(tr('admin.reporting.unapplied'), { exact: true })).toBeVisible();
  assert.equal(state.calls.length, before, 'draft input does not issue requests');
  await page.getByRole('button', { name: tr('admin.reporting.apply'), exact: true }).click(); await reportReady(page, tr);
  const calls = state.calls.slice(before).filter(row => row.path.startsWith('/analytics/'));
  assert.equal(calls.length, 4);
  for (const call of calls) { assert.equal(call.query.from, '2026-04-01T00:00:00.000Z'); assert.equal(call.query.to, '2026-04-04T00:00:00.000Z'); }
  assert.equal(calls.find(row => row.path.endsWith('/branches')).query.branchId, undefined);
  assert.equal(calls.find(row => row.path.endsWith('/top-items')).query.metric, 'RESERVATIONS');
  await expect(page.locator('.report-scope')).toContainText('1 Apr 2026, 00:00'); await expect(page.locator('.report-scope')).toContainText('4 Apr 2026, 00:00');
});

test('Malformed analytics responses fail instead of publishing an empty report; failed same-filter refresh remains stale', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('/management'); await reportReady(page, tr);
  state.malformed = true; await page.locator('.report-filters button[type=submit]').click(); await expect(page.getByRole('alert')).toContainText(tr('admin.reporting.incomplete'));
  await expect(page.locator('.report-scope--stale')).toBeVisible(); await expect(page.locator('.metric-card > strong').first()).toHaveText('12');
});

for (const kind of ['borrowings', 'visits']) for (const language of ['en', 'ar']) test(`${kind} ${language}: loading/failure/empty separation, stale reads, retry and server paging`, async t => {
  const { page, state, goto, tr } = await fixture(t, { language, width: 320, theme: 'dark' }); state.holds[kind] = true; state.fail[kind] = true;
  await goto(`/management/${kind}`); await expect(page.locator('.admin-read-state [role=status]')).toHaveText(tr('admin.common.loading')); await expect(rows(page)).toHaveCount(0);
  state.release(kind); await listReady(page); await expect(page.getByRole('alert')).toContainText('list-read-123'); await expect(page.locator('.admin-empty')).toHaveCount(0);
  await expect(page.locator('.admin-read-state')).not.toContainText(tr('admin.workflows.total'));
  state.fail[kind] = false; await page.locator('.admin-read-state button').click(); await listReady(page); await expect(rows(page)).toHaveCount(1);
  state.fail[kind] = true; await page.locator('.admin-read-state button').click(); await listReady(page); await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('.admin-read-state')).toContainText(tr('admin.workflows.stale'));
  state.fail[kind] = false; state.paged = true; await page.locator('.admin-read-state button').click(); await listReady(page); await expect(rows(page)).toHaveCount(20);
  await page.getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click(); await listReady(page);
  const request = state.calls.filter(row => row.path === `/${kind}`).at(-1); assert.equal(request.query.page, '2'); assert.equal(request.query.pageSize, '20');
  state.empty[kind] = true; await page.locator('.admin-read-state button').click(); await listReady(page); await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.admin-empty')).toHaveText(tr(kind === 'borrowings' ? 'admin.reporting.noBorrowings' : 'admin.reporting.noVisits'));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const kind of ['borrowings', 'visits']) test(`${kind}: delayed searches cannot replace newer queries; authoritative status and missing data`, async t => {
  const { page, state, goto, tr } = await fixture(t); await goto(`/management/${kind}`); await listReady(page);
  if (kind === 'borrowings') { await expect(rows(page).locator('.staff-status')).toHaveText(tr('staff.borrowingStatus.ACTIVE')); }
  state.holds[`${kind}:old`] = true; const search = page.getByRole('textbox', { name: tr('admin.common.search'), exact: true });
  await search.fill('old'); await search.press('Enter'); await expect.poll(() => state.calls.some(row => row.query.q === 'old')).toBe(true);
  await search.fill('new'); await search.press('Enter'); await listReady(page); state.release(`${kind}:old`); await expect(rows(page)).toContainText('Newest matching reader');
  if (kind === 'visits') { state.missing = true; await page.locator('.admin-read-state button').click(); await listReady(page); await expect(rows(page).locator('.staff-status')).toHaveText('—'); await expect(rows(page).locator('td').nth(3)).toHaveText('—'); }
});

for (const role of ['STUDENT', 'LIBRARIAN', 'MANAGEMENT']) test(`${role}: existing route guards preserve role boundaries`, async t => {
  const { page, state, goto, tr } = await fixture(t, { role });
  const denied = role === 'MANAGEMENT' ? ['/librarian', '/librarian/analytics', '/librarian/catalog'] : role === 'LIBRARIAN' ? ['/management', '/management/analytics', '/management/visits'] : ['/management', '/management/analytics', '/librarian/analytics'];
  for (const path of denied) { await goto(path); await expect(page).toHaveURL(/\/forbidden$/); }
  assert.equal(state.calls.filter(row => row.path !== '/auth/me').length, 0, 'denied routes do not load reporting APIs');
  if (role === 'LIBRARIAN') { await goto('/librarian/analytics'); await reportReady(page, tr); await expect(page.locator('.metric-card')).toHaveCount(6); }
  if (role === 'MANAGEMENT') { await goto('/management/analytics'); await reportReady(page, tr); }
});

test('Narrow reporting: native trend keyboard scrolling and simulated safe-area final clearance', async t => {
  const { page, state, goto, tr } = await fixture(t, { width: 320, language: 'ar', theme: 'dark' }); state.manyTrends = true;
  await goto('/management'); await reportReady(page, tr);
  const trend = page.getByRole('region', { name: tr('admin.analytics.trends'), exact: true });
  await trend.focus(); await trend.press('PageDown'); await expect.poll(() => trend.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  // Layout simulation only, not a claim about physical-device inset reporting.
  await goto('/management/visits'); await listReady(page); state.paged = true; await page.locator('.admin-read-state button').click(); await listReady(page);
  await page.locator('.staff-reports').evaluate(node => { node.style.paddingBlockEnd = '34px'; });
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 1)).toBe(true);
  const last = page.getByRole('button', { name: tr('discovery.pagination.next'), exact: true }); await last.focus(); await expect(last).toBeInViewport();
  const bounds = await last.evaluate(node => ({ bottom: node.getBoundingClientRect().bottom, height: innerHeight, scrollY, total: document.documentElement.scrollHeight }));
  assert.equal(bounds.bottom <= bounds.height - 34, true, JSON.stringify(bounds));
});
