// Isolated fixture APIs: every write and every external request is intercepted.
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
const evidence = resolve(tmpdir(), 'sams-ui5c-evidence');
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
const branch = { id: 'branch1', name: 'Library branch — فرع المكتبة' };
const item = { id: 'item1', version: 3, type: 'BOOK', title: 'Academic knowledge — المعرفة الأكاديمية', isActive: true, callNumber: '658-2026',
  category: { id: 'category1', name: 'Management' }, bookDetails: { isbn: '9780000000001', publisher: 'Fixture publisher', edition: '1' }, itemSubjects: [] };
const copy = { id: 'copy1', version: 4, item, branch, status: 'AVAILABLE', condition: 'GOOD', barcode: 'LIB-001', copyCode: 'CP-001', shelfLocation: 'A-12' };
const student = { studentId: 'S-2026-001', user: { id: 'student1', displayName: 'Academic Reader — قارئ أكاديمي', universityEmail: 'reader@fixture.invalid', isActive: true },
  academicStatus: 'ACTIVE', faculty: { id: 'faculty1', name: 'Management — الإدارة' }, department: null };
async function fixture(t, { language = 'en', theme = 'light', width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const state = { calls: [], writes: [], errors: [], unexpected: [], fail: {}, empty: {}, holds: {}, waiters: {}, long: false, paged: false,
    failStage: null, writeStatus: 400, commitUnknown: false, copyStatus: 'AVAILABLE', itemType: 'BOOK',
    items: new Map([['item1', structuredClone(item)]]), copies: new Map([['copy1', structuredClone(copy)]]), created: 0 };
  state.release = key => { state.holds[key] = false; (state.waiters[key] || []).splice(0).forEach(done => done()); };
  const pause = async key => { if (state.holds[key]) await new Promise(done => (state.waiters[key] ||= []).push(done)); };
  t.after(async () => { Object.keys(state.waiters).forEach(state.release); await context.close(); assert.deepEqual(state.errors, []); assert.deepEqual(state.unexpected, []); });
  await context.addInitScript(({ language, theme }) => {
    localStorage.setItem('sams.language', language); localStorage.setItem('sams.theme', theme); sessionStorage.setItem('sams.devAccessToken', 'fixture-catalog-token');
  }, { language, theme });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status }).catch(() => {});
    if (url.pathname.startsWith('/api/v1/')) {
      const path = url.pathname.slice('/api/v1'.length), query = Object.fromEntries(url.searchParams), method = request.method();
      state.calls.push({ path, query, method });
      if (path === '/auth/me') return json({ user: { id: 'librarian1', roles: ['LIBRARIAN'], displayName: 'Fixture library desk' } });
      if (method !== 'GET') {
        const match = path.match(/^\/catalog\/items(?:\/([^/]+))?(?:\/(book-details|academic-work-details))?$/);
        const copyMatch = path.match(/^\/inventory\/copies(?:\/([^/]+))?$/);
        if (!match && !copyMatch) { state.unexpected.push(`${method} ${path}`); return route.abort(); }
        const body = request.postDataJSON(), stage = copyMatch ? 'copy' : match[2] ? 'details' : body.title ? 'base' : 'toggle';
        state.writes.push({ path, body, method, stage }); await pause('write'); await pause(stage);
        const failure = state.failStage === stage;
        if (failure && !state.commitUnknown) return state.writeStatus === 'network' ? route.abort('connectionfailed') : json({ error: { message: `Fixture ${stage} failed`, requestId: `${stage}-request-123` } }, state.writeStatus);
        let data;
        if (copyMatch) {
          const current = state.copies.get(copyMatch[1]);
          if (current && current.version !== body.version) return json({ error: { message: 'Copy version conflict' } }, 409);
          const id = copyMatch[1] || `new-copy-${++state.created}`;
          data = { ...(current || copy), ...body, id, version: current ? current.version + 1 : 1, item: state.items.get(body.itemId) || current?.item || item, branch };
          state.copies.set(id, data);
        } else {
          const current = state.items.get(match[1]);
          if (current && current.version !== body.version) return json({ error: { message: 'Item version conflict' } }, 409);
          const id = match[1] || `new-item-${++state.created}`;
          data = { ...(current || { ...item, bookDetails: null, type: body.type }), ...(!match[2] ? body : {}), id, version: current ? current.version + 1 : 1 };
          if (match[2] === 'book-details') data.bookDetails = body;
          if (match[2] === 'academic-work-details') { data.academicWorkDetails = { academicYear: body.academicYear, faculty: body.facultyId ? { id: body.facultyId } : null, department: null }; if (body.subjectIds) data.itemSubjects = body.subjectIds.map(subjectId => ({ subjectId })); }
          state.items.set(id, data);
        }
        if (failure) return state.writeStatus === 'network' ? route.abort('connectionfailed') : json({ error: { message: 'Uncertain server outcome' } }, state.writeStatus);
        return json({ data }, method === 'POST' ? 201 : 200);
      }
      const lookups = { '/catalog-master/categories': [{ id: 'category1', name: 'Management' }], '/catalog-master/dewey': [{ id: 'dewey1', code: '658', name: 'Management' }],
        '/catalog-master/subjects': [{ id: 'subject1', name: 'Research methods' }], '/master-data/faculties': [{ id: 'faculty1', name: 'Management' }], '/master-data/departments': [], '/master-data/branches': [branch] };
      if (lookups[path]) return state.fail.options ? json({ error: { message: 'Options failed' } }, 503) : json({ data: lookups[path] });
      if (/^\/catalog\/items\/[^/]+$/.test(path)) {
        await pause('item-detail');
        return state.fail.reconcile ? json({ error: { message: 'Reconciliation failed' } }, 503) : json({ data: { ...state.items.get(path.split('/').at(-1)), ...(state.itemType !== 'BOOK' ? { type: state.itemType } : {}) } });
      }
      if (/^\/inventory\/copies\/[^/]+$/.test(path)) return state.fail.reconcile ? json({ error: { message: 'Reconciliation failed' } }, 503) : json({ data: state.copies.get(path.split('/').at(-1)) });
      if (['/catalog/items', '/inventory/copies', '/students'].includes(path)) {
        const kind = path === '/students' ? 'students' : path.includes('/copies') ? 'copies' : query.includeInactive === 'true' ? 'items' : 'lookup';
        const failed = state.fail[kind];
        let data = kind === 'students' ? [structuredClone(student)] : kind === 'copies' ? [...state.copies.values()].map(row => ({ ...row, status: state.copyStatus })) : [...state.items.values()];
        if (state.empty[kind] || query.search === 'absent') data = [];
        if (query.type) data = data.filter(row => row.type === query.type);
        if (kind === 'lookup') data = data.filter(row => row.isActive);
        if (state.long) data = data.map(row => ({ ...row, title: 'LongUnbrokenTitle'.repeat(30), callNumber: 'IDENTIFIER'.repeat(30), ...(row.item && { item: { ...row.item, title: 'LongUnbrokenTitle'.repeat(30) }, barcode: 'BARCODE'.repeat(40) }), ...(row.user && { studentId: 'STUDENTID'.repeat(30), user: { ...row.user, displayName: 'اسمعربيطويل'.repeat(30), universityEmail: 'email'.repeat(50) + '@fixture.invalid' } }) }));
        if (query.search === 'new') data = data.map(row => kind === 'students' ? { ...row, user: { ...row.user, displayName: 'Newest query record' } } : { ...row, title: 'Newest query record' });
        if (state.paged && data.length) data = Array.from({ length: 43 }, (_, index) => ({ ...data[0], id: index ? `item-${index}` : data[0].id, ...(kind === 'students' ? { studentId: `STUDENT-${index}`, user: { ...data[0].user, displayName: `Page record ${index}` } } : {}) }));
        const page = Number(query.page || 1), pageSize = Number(query.pageSize || 20), total = data.length;
        const result = { data: data.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
        await pause(kind); await pause(`${kind}:${query.search || ''}`); await pause(`${kind}:page${page}`);
        return failed ? json({ error: { message: `Fixture ${kind} read failed`, requestId: 'read-123' } }, 503) : json(result);
      }
      state.unexpected.push(`${method} ${path}`); return route.abort();
    }
    if (url.origin === origin) return route.continue(); state.unexpected.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => state.errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  return { page, state, tr: key => translate(language, key), goto: path => page.goto(`${origin}/librarian/${path}`) };
}
const rows = page => page.locator('.admin-table tbody tr');
const readPanel = page => page.locator('.admin-card > .admin-read-state');
const ready = async page => { await expect(readPanel(page).locator('button')).toBeEnabled(); };
const refresh = async page => { await readPanel(page).locator('button').click(); await ready(page); };
async function audit(page) { await page.evaluate(axe.source); return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))); }
async function newItem(page, tr, type = 'BOOK') {
  await page.getByRole('button', { name: `+ ${tr('admin.catalog.addItem')}`, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.locator('.admin-read-state')).toContainText(tr('admin.workflows.loaded'));
  await dialog.getByRole('combobox', { name: tr('admin.catalog.type'), exact: true }).selectOption(type);
  await dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true }).fill('A new academic fixture');
  await expect(dialog.getByRole('button', { name: tr('admin.common.save'), exact: true })).toBeEnabled(); return dialog;
}

for (const width of [320, 390, 768, 1024, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${width} ${language} ${theme}: Catalog, Copies, Directory, accessible table scrolling and long text`, async t => {
    const { page, state, goto, tr } = await fixture(t, { width, language, theme }); state.long = true;
    for (const kind of ['items', 'copies', 'students']) {
      await goto(kind === 'students' ? 'students' : 'catalog');
      if (kind === 'copies') await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click();
      await ready(page); await expect(rows(page)).toHaveCount(1);
      await expect(page.locator('.staff-sidebar__nav a[aria-current=page]')).toBeInViewport();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${kind}: no page overflow`);
      const table = page.locator('.admin-table-wrap'); await page.keyboard.press('Tab'); await table.focus(); await expect(table).toBeFocused();
      assert.equal(await table.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      if (width < 1024) {
        await table.press(language === 'ar' ? 'ArrowLeft' : 'ArrowRight');
        await expect.poll(() => table.evaluate(node => Math.abs(node.scrollLeft))).toBeGreaterThan(0);
      }
      await rows(page).last().getByRole('button').last().focus(); await expect(rows(page).last().getByRole('button').last()).toBeInViewport();
      if (width === 390) assert.deepEqual(await audit(page), []);
      if ((width === 390 || width === 1440) && theme === 'light' && kind !== 'copies') {
        state.long = false; await refresh(page); await page.locator('.admin-table-wrap').evaluate(node => node.scrollTo({left:0,behavior:'instant'})); await page.evaluate(() => scrollTo(0,0)); await page.screenshot({ path: `${evidence}/${kind}-${width}-${language}.png`, fullPage: true }); state.long = true;
      }
      if (kind === 'students') {
        await rows(page).first().getByRole('button').click(); const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible(); if (width === 390) assert.deepEqual(await audit(page), []);
        await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
      }
      assert.equal(state.writes.length, 0, 'read-only layout checks');
    }
  });
}

for (const kind of ['items', 'copies', 'students']) for (const language of ['en', 'ar']) {
  test(`${kind} ${language}: initial failure, retry, retained stale data, actual empty results`, async t => {
    const { page, state, goto, tr } = await fixture(t, { width: 320, language, theme: 'dark' }); state.fail[kind] = true; state.holds[kind] = true;
    await goto(kind === 'students' ? 'students' : 'catalog');
    if (kind === 'copies') await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click();
    await expect(readPanel(page).getByRole('status')).toContainText(tr('admin.common.loading')); await expect(rows(page)).toHaveCount(0);
    state.release(kind); await ready(page); await expect(readPanel(page).getByRole('alert')).toContainText('read-123');
    await expect(page.locator('.admin-empty')).toHaveCount(0); await expect(readPanel(page)).not.toContainText(tr('admin.workflows.total'));
    state.fail[kind] = false; await refresh(page); await expect(rows(page)).toHaveCount(1);
    state.fail[kind] = true; await refresh(page); await expect(rows(page)).toHaveCount(1);
    await expect(readPanel(page)).toContainText(tr('admin.workflows.stale')); await expect(readPanel(page)).not.toContainText(tr('admin.workflows.total'));
    if (kind !== 'students') await expect(rows(page).getByRole('button').first()).toBeDisabled();
    state.fail[kind] = false; state.empty[kind] = true; await refresh(page); await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('.admin-empty')).toHaveCount(1); await expect(readPanel(page)).toContainText(`${tr('admin.workflows.total')}: 0`);
  });
}

test('Directory: page-two search uses a single page-one query; delayed older search cannot overwrite it', async t => {
  const { page, state, goto, tr } = await fixture(t); state.paged = true; await goto('students'); await ready(page);
  await page.getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click(); await ready(page);
  const search = page.getByRole('textbox', { name: tr('studentDirectory.search'), exact: true });
  state.holds['students:old'] = true; const before = state.calls.length;
  await search.fill('old'); await search.press('Enter'); await expect.poll(() => state.calls.some(row => row.query.search === 'old')).toBe(true);
  assert.deepEqual(state.calls.slice(before).filter(row => row.path === '/students').map(row => row.query.page), ['1']);
  state.paged = false; await search.fill('new'); await search.press('Enter'); await ready(page);
  await expect(rows(page)).toContainText('Newest query record'); await expect(page.locator('.admin-pagination span')).toContainText('1');
  state.release('students:old'); await expect(rows(page)).toContainText('Newest query record');
});

for (const type of ['BOOK', 'PROJECT', 'THESIS', 'ACADEMIC_WORK']) {
  test(`${type}: two-step creation, current versions, duplicate-submit protection and no pending dismissal`, async t => {
    const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
    const dialog = await newItem(page, tr, type); state.holds.base = true;
    if (type === 'ACADEMIC_WORK') await dialog.getByRole('listbox', { name: tr('discovery.detail.subjects'), exact: true }).selectOption('subject1');
    await page.locator('#item-form').evaluate(node => { node.requestSubmit(); node.requestSubmit(); });
    await expect.poll(() => state.writes.length).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    await page.locator('.admin-modal-backdrop').click({ position: { x: 1, y: 1 } }); await expect(dialog).toBeVisible();
    state.release('base'); await expect(dialog).toHaveCount(0); await ready(page);
    assert.deepEqual(state.writes.map(row => row.stage), ['base', 'details']); assert.equal(state.writes[0].body.type, type);
    assert.equal(state.writes[1].body.version, 1); assert.equal(state.items.get('new-item-1').version, 2);
    if (type === 'ACADEMIC_WORK') assert.deepEqual(state.writes[1].body.subjectIds, ['subject1']);
    await expect(page.locator('.admin-notice')).toContainText('new-item-1');
  });
}

for (const language of ['en', 'ar']) test(`Partial save ${language}: confirmed base ID/version survives close, retry skips base`, async t => {
  const { page, state, goto, tr } = await fixture(t, { language, width: 390, theme: 'dark' }); await goto('catalog'); await ready(page);
  const dialog = await newItem(page, tr); state.failStage = 'details';
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('details-request-123');
  await expect(dialog).toContainText(tr('admin.workflows.partial')); await expect(dialog).toContainText('new-item-1');
  await expect(dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true })).toBeDisabled();
  await expect(page.locator('.admin-notice')).toHaveCount(0); assert.equal(state.writes.length, 2);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: tr('admin.workflows.resume'), exact: true }).click();
  await expect(dialog).toContainText('new-item-1'); await expect(dialog.getByRole('alert')).toContainText('details-request-123');
  if (language === 'ar') await page.screenshot({ path: `${evidence}/partial-save-390-ar-dark.png`, fullPage: true });
  state.failStage = null; await dialog.getByLabel(tr('admin.catalog.publisher'), { exact: true }).fill('Corrected publisher');
  await dialog.getByRole('button', { name: tr('admin.workflows.saveRemaining'), exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.deepEqual(state.writes.map(row => row.stage), ['base', 'details', 'details']); assert.equal(state.writes[2].body.version, 1);
});

test('Editing: partial PATCH saves retain the returned version; conflict requires explicit server review', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  await rows(page).first().getByRole('button', { name: tr('admin.common.edit'), exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true })).toHaveValue(item.title);
  state.failStage = 'details'; state.writeStatus = 409;
  await dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true }).fill('Updated base title');
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('details-request-123');
  assert.equal(state.writes[0].body.version, 3); assert.equal(state.writes[1].body.version, 4);
  await expect(dialog.getByRole('button', { name: tr('admin.workflows.saveRemaining'), exact: true })).toBeDisabled();
  state.fail.reconcile = true; await dialog.getByRole('button', { name: tr('admin.workflows.reconcile'), exact: true }).click();
  await expect(dialog.getByRole('alert').last()).toContainText('Reconciliation failed');
  await expect(dialog.getByRole('alert').first()).toContainText('details-request-123');
  state.fail.reconcile = false; await dialog.getByRole('button', { name: tr('admin.workflows.reconcile'), exact: true }).click();
  await dialog.getByRole('button', { name: tr('admin.workflows.useServer'), exact: true }).click();
  await expect(dialog.getByLabel(tr('admin.catalog.titleField'), { exact: true })).toHaveValue('Updated base title');
  state.failStage = null; await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.equal(state.writes[2].body.version, 4); assert.equal(state.writes[3].body.version, 5);
});

test('Uncertain create: no automatic replay on refresh; recovery is retained without inventing an ID', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  const dialog = await newItem(page, tr); state.failStage = 'base'; state.writeStatus = 'network'; state.commitUnknown = true;
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toContainText(tr('admin.workflows.uncertain'));
  await expect(dialog.getByRole('button', { name: tr('admin.common.save'), exact: true })).toBeDisabled();
  await page.reload(); await ready(page); await page.getByRole('button', { name: tr('admin.workflows.resume'), exact: true }).click();
  await expect(dialog).toContainText(tr('admin.workflows.uncertain')); assert.equal(state.writes.length, 1); assert.equal(state.items.has('new-item-1'), true);
  await expect(dialog.getByRole('button', { name: tr('admin.workflows.reconcile'), exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: tr('admin.common.save'), exact: true })).toBeDisabled();
});

test('Add Copy: independent lookup after empty table search, bounded pages, explicit selection and one create', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  await page.getByRole('textbox', { name: tr('admin.catalog.searchItems'), exact: true }).fill('absent');
  await page.getByRole('textbox', { name: tr('admin.catalog.searchItems'), exact: true }).press('Enter'); await ready(page); await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: `+ ${tr('admin.copies.add')}`, exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio')).toHaveCount(1); await expect(dialog.getByRole('radio')).not.toBeChecked(); await dialog.getByRole('radio').check();
  const lookupRequest = state.calls.find(row => row.path === '/catalog/items' && row.query.includeInactive !== 'true');
  assert.equal(lookupRequest.query.pageSize, '20'); assert.equal(lookupRequest.query.search, undefined);
  await dialog.getByRole('combobox', { name: tr('admin.common.branch'), exact: true }).selectOption('branch1');
  await dialog.getByLabel(tr('admin.copies.barcode'), { exact: true }).fill('NEW-COPY-001');
  state.holds.copy = true; await page.locator('#copy-form').evaluate(node => { node.requestSubmit(); node.requestSubmit(); });
  await expect.poll(() => state.writes.length).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  state.release('copy'); await expect(dialog).toHaveCount(0); await ready(page);
  assert.equal(state.writes[0].body.itemId, 'item1'); assert.equal(state.writes[0].body.branchId, 'branch1');
  await expect(page.locator('.admin-notice')).toContainText('new-copy-1');
});

for (const managed of [false, true]) test(`Copy editing ${managed ? 'BORROWED' : 'AVAILABLE'}: preserve version and circulation ownership`, async t => {
  const { page, state, goto, tr } = await fixture(t); state.copyStatus = managed ? 'BORROWED' : 'AVAILABLE'; state.copies.get('copy1').status = state.copyStatus;
  await goto('catalog'); await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click(); await ready(page);
  await rows(page).getByRole('button').click(); const dialog = page.getByRole('dialog');
  if (managed) { await expect(dialog.getByRole('combobox', { name: tr('admin.common.branch'), exact: true })).toBeDisabled(); await expect(dialog.getByRole('combobox', { name: tr('admin.copies.status'), exact: true })).toBeDisabled(); }
  await dialog.getByLabel(tr('admin.copies.shelf'), { exact: true }).fill('B-20');
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.equal(state.writes[0].method, 'PATCH'); assert.equal(state.writes[0].body.version, 4);
  assert.equal(state.writes[0].body.branchId, undefined); assert.equal(state.writes[0].body.status, undefined);
});

test('Independent item lookup: failed and empty searches clear selection and disable copy creation', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: `+ ${tr('admin.copies.add')}`, exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio').check(); await dialog.getByRole('combobox', { name: tr('admin.common.branch'), exact: true }).selectOption('branch1');
  const save = dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }); await expect(save).toBeEnabled();
  state.fail.lookup = true; await dialog.getByRole('textbox', { name: tr('admin.workflows.findItem'), exact: true }).fill('changed');
  await dialog.locator('.admin-lookup-search').evaluate(node => node.requestSubmit());
  await expect(dialog.getByRole('alert')).toContainText('lookup read failed'); await expect(save).toBeDisabled();
  state.fail.lookup = false; state.empty.lookup = true;
  await dialog.getByRole('button', { name: tr('admin.workflows.retry'), exact: true }).click();
  await expect(dialog).toContainText(tr('admin.workflows.emptyItems')); await expect(save).toBeDisabled(); assert.equal(state.writes.length, 0);
});

test('Copy creation conflict preserves values and permits a corrected request, never an automatic retry', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: `+ ${tr('admin.copies.add')}`, exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio').check(); await dialog.getByRole('combobox', { name: tr('admin.common.branch'), exact: true }).selectOption('branch1');
  await dialog.getByLabel(tr('admin.copies.barcode'), { exact: true }).fill('DUPLICATE'); state.failStage = 'copy'; state.writeStatus = 409;
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('copy-request-123');
  await expect(dialog.getByLabel(tr('admin.copies.barcode'), { exact: true })).toHaveValue('DUPLICATE'); assert.equal(state.writes.length, 1);
  state.failStage = null; await dialog.getByLabel(tr('admin.copies.barcode'), { exact: true }).fill('CORRECTED');
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.equal(state.writes.length, 2); assert.equal(state.writes[1].body.barcode, 'CORRECTED');
});

test('Uncertain details survive reload with the confirmed base ID; reconciliation does not write', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  const dialog = await newItem(page, tr); state.failStage = 'details'; state.writeStatus = 'network'; state.commitUnknown = true;
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toContainText(tr('admin.workflows.uncertainHelp'));
  await page.reload(); await ready(page); await page.getByRole('button', { name: tr('admin.workflows.resume'), exact: true }).click();
  await expect(dialog).toContainText('new-item-1'); await expect(dialog.getByRole('button', { name: tr('admin.workflows.saveRemaining'), exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: tr('admin.workflows.reconcile'), exact: true }).click();
  await expect(dialog.locator('.catalog-server-record')).toContainText('2'); assert.equal(state.writes.length, 2);
  await dialog.getByRole('button', { name: tr('admin.workflows.useServer'), exact: true }).click(); await expect(dialog.getByRole('button', { name: tr('admin.common.save'), exact: true })).toBeEnabled();
  assert.equal(state.writes.length, 2, 'reading and accepting the current snapshot do not resubmit either step');
});

test('Archive confirmation uses the row version and reports the server result', async t => {
  const { page, state, goto, tr } = await fixture(t); await goto('catalog'); await ready(page);
  const opener = rows(page).first().getByRole('button', { name: tr('admin.common.archive'), exact: true });
  await opener.click(); const dialog = page.getByRole('dialog'); await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await opener.click(); state.holds.toggle = true;
  await dialog.getByRole('button', { name: tr('admin.common.archive'), exact: true }).evaluate(node => { node.click(); node.click(); });
  await expect.poll(() => state.writes.length).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  state.release('toggle'); await expect(dialog).toHaveCount(0); await ready(page);
  assert.deepEqual(state.writes[0].body, { version: 3, isActive: false });
  await expect(page.locator('.admin-notice')).toContainText(tr('admin.common.archived')); await expect(rows(page).locator('.admin-status')).toContainText(tr('admin.common.archived'));
});

for (const type of ['PROJECT', 'THESIS', 'ACADEMIC_WORK']) test(`${type}: editing retains classification and academic metadata`, async t => {
  const { page, state, goto, tr } = await fixture(t); state.itemType = type;
  state.items.set('item1', { ...item, type, bookDetails: null, academicWorkDetails: { faculty: { id: 'faculty1' }, department: null, academicYear: '2025/2026' }, itemSubjects: type === 'ACADEMIC_WORK' ? [{ subjectId: 'subject1' }] : [] });
  await goto('catalog'); await ready(page); await rows(page).getByRole('button', { name: tr('admin.common.edit'), exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: tr('admin.catalog.type'), exact: true })).toBeDisabled();
  await expect(dialog.getByLabel(tr('admin.catalog.academicYear'), { exact: true })).toHaveValue('2025/2026');
  if (type === 'ACADEMIC_WORK') { await expect(dialog.getByRole('option', { name: tr('admin.workflows.academicWork'), exact: true })).toBeAttached(); await expect(dialog.getByRole('listbox')).toHaveValues(['subject1']); }
  await dialog.getByLabel(tr('admin.catalog.academicYear'), { exact: true }).fill('2026/2027');
  await dialog.getByRole('button', { name: tr('admin.common.save'), exact: true }).click(); await expect(dialog).toHaveCount(0);
  assert.equal(state.writes[0].body.type, undefined); assert.equal(state.writes[1].body.academicYear, '2026/2027');
  if (type === 'ACADEMIC_WORK') assert.deepEqual(state.writes[1].body.subjectIds, ['subject1']);
});

test('Narrow Arabic dialog: named fields, focus trap/restoration, keyboard access and no overflow', async t => {
  const { page, state, goto, tr } = await fixture(t, { width: 320, language: 'ar', theme: 'dark' });
  await goto('catalog'); await ready(page);
  const opener = page.getByRole('button', { name: `+ ${tr('admin.catalog.addItem')}`, exact: true });
  await opener.click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: tr('admin.common.save'), exact: true })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: tr('admin.catalog.type'), exact: true })).toBeVisible();
  for (let index = 0; index < 22; index++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true); }
  assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true);
  assert.deepEqual(await audit(page), []); await page.keyboard.press('Escape'); await expect(opener).toBeFocused(); assert.equal(state.writes.length, 0);
});

test('Catalog, Copies and independent lookup use actual server pagination and retain submitted searches', async t => {
  const { page, state, goto, tr } = await fixture(t); state.paged = true; await goto('catalog'); await ready(page);
  const search = page.getByRole('textbox', { name: tr('admin.catalog.searchItems'), exact: true });
  await search.fill('academic'); await search.press('Enter'); await ready(page);
  await page.locator('.admin-card > .admin-pagination').getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click(); await ready(page);
  assert.equal(state.calls.filter(row => row.path === '/catalog/items').at(-1).query.search, 'academic');
  assert.equal(state.calls.filter(row => row.path === '/catalog/items').at(-1).query.page, '2');
  await page.getByRole('button', { name: tr('admin.catalog.copies'), exact: true }).click(); await ready(page);
  await page.locator('.admin-card > .admin-pagination').getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click(); await ready(page);
  assert.equal(state.calls.filter(row => row.path === '/inventory/copies').at(-1).query.page, '2');
  await page.getByRole('button', { name: `+ ${tr('admin.copies.add')}`, exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio')).toHaveCount(20);
  await dialog.locator('.admin-pagination').getByRole('button', { name: tr('discovery.pagination.next'), exact: true }).click();
  await expect(dialog.locator('.admin-pagination span')).toContainText('2');
  assert.equal(state.calls.filter(row => row.path === '/catalog/items').at(-1).query.search, undefined);
  assert.equal(state.calls.filter(row => row.path === '/catalog/items').at(-1).query.page, '2'); assert.equal(state.writes.length, 0);
});
