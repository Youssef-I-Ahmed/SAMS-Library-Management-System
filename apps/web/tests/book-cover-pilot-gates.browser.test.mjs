// Real Catalog/Details routes with local API/image fixtures; no API server or DB.
// Run after a production build made with VITE_BOOK_COVER_PILOT=true.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const servers = new Map();
let browser, previousFlag;
const records = [
  { id: 'e60bd2bb-1066-52fd-90ac-7dac28b4582b', type: 'BOOK',
    title: 'Writing academic english', publicationYear: 2006, language: 'en',
    bookDetails: { isbn: '0131523597', edition: '4', publisher: 'Pearson longman' },
    itemContributors: ['Alice Oshima', 'Ann Hogue'].map(fullName => ({ contributor: { fullName } })) },
  { id: '51a5a672-a505-51c2-8cd8-5be9f0039720', type: 'BOOK',
    title: 'Effective organisational communication', publicationYear: 2008, language: 'en',
    bookDetails: { isbn: '9780273713753', edition: '3', publisher: 'Pearson prentice Hall' },
    itemContributors: ['Richard Blundel', 'Kate Ippolito'].map(fullName => ({ contributor: { fullName } })) }
].map(item => ({ ...item,
  availability: { available: false, totalCopies: 0, availableCopies: 0, branches: [] },
  reservationReadiness: { hasAvailableCopy: false, candidateBranches: [] }
}));

before(async () => {
  previousFlag = process.env.VITE_BOOK_COVER_PILOT;
  if (process.env.SAMS_TEST_EVIDENCE_DIR) await mkdir(process.env.SAMS_TEST_EVIDENCE_DIR, { recursive: true });
  for (const mode of ['default', 'enabled']) {
    if (mode === 'default') delete process.env.VITE_BOOK_COVER_PILOT;
    else process.env.VITE_BOOK_COVER_PILOT = 'true';
    const server = await createServer({ root, configFile: join(root, 'vite.config.js'),
      envFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
    servers.set(mode, server);
    assert.equal(server.config.env.DEV, true);
    assert.equal(server.config.env.VITE_BOOK_COVER_PILOT, mode === 'default' ? undefined : 'true');
    await server.listen();
  }
  // Preview serves the real dist bundle; setting a runtime env cannot enable it.
  process.env.VITE_BOOK_COVER_PILOT = 'true';
  servers.set('production', await preview({ root, configFile: join(root, 'vite.config.js'),
    preview: { host: '127.0.0.1', port: 0, open: false } }));
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});

after(async () => {
  await browser?.close();
  for (const [mode, server] of servers) {
    if (mode === 'production') await new Promise(resolve => server.httpServer.close(resolve));
    else await server.close();
  }
  if (previousFlag === undefined) delete process.env.VITE_BOOK_COVER_PILOT;
  else process.env.VITE_BOOK_COVER_PILOT = previousFlag;
});

for (const mode of ['default', 'enabled', 'production']) for (const language of ['en', 'ar']) {
  test(`${mode} ${language}: both allowlisted books in Catalog and Details respect the cover gate`, async t => {
    const origin = `http://127.0.0.1:${servers.get(mode).httpServer.address().port}`;
    const context = await browser.newContext();
    const state = { api: [], covers: [], unexpected: [], errors: [] };
    t.after(async () => {
      await context.close();
      if (process.env.SAMS_TEST_EVIDENCE_DIR) {
        await mkdir(process.env.SAMS_TEST_EVIDENCE_DIR, { recursive: true });
        await writeFile(join(process.env.SAMS_TEST_EVIDENCE_DIR, `${mode}-${language}-gates.json`), JSON.stringify(state, null, 2));
      }
      assert.deepEqual(state.unexpected, [], 'no unexpected API/provider traffic');
      assert.deepEqual(state.errors, [], 'no browser runtime errors');
      assert.ok(state.api.every(request => request.method === 'GET'), 'only fixture reads');
      if (mode !== 'enabled') assert.deepEqual(state.covers, [], 'disabled/production makes zero cover requests');
      else assert.equal(new Set(state.covers).size, 2, 'exactly the two reviewed cover URLs');
    });
    await context.addInitScript(language => {
      localStorage.setItem('sams.language', language);
      sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    }, language);
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const json = body => route.fulfill({ json: body });
      if (url.origin === 'https://covers.openlibrary.org') {
        state.covers.push(url.href);
        if (mode !== 'enabled') return route.abort('blockedbyclient');
        return route.fulfill({ contentType: 'image/png', body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const path = url.pathname.slice('/api/v1'.length);
        state.api.push({ path, method: request.method() });
        if (path === '/auth/me') return json({ user: { id: 'fixture', roles: ['STUDENT'], displayName: 'SAMS Student' } });
        if (path === '/discovery/facets') return json({ data: { types: [{ value: 'BOOK', count: 2 }] } });
        if (path === '/discovery/items') return json({ data: records, pagination: {
          page: 1, pageSize: 20, total: 2, totalPages: 1, hasPreviousPage: false, hasNextPage: false } });
        const item = records.find(item => path === `/discovery/items/${item.id}`);
        if (item) return json({ data: item });
        if (path === '/reservations/me') return json({ data: [], pagination: { total: 0 } });
      } else if (url.origin === origin) return route.continue();
      state.unexpected.push(`${request.method()} ${url.href}`);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => state.errors.push(error.message));
    async function checkCovers(scope, count, name) {
      await expect(scope.locator('.discovery-cover')).toHaveCount(count);
      await expect(scope.locator('.discovery-cover--pilot img')).toHaveCount(mode === 'enabled' ? count : 0);
      if (mode === 'enabled') {
        for (const image of await scope.locator('.discovery-cover--pilot img').all()) {
          await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
        }
        await expect(scope.locator('.discovery-cover--pilot a')).toHaveText(
          Array(count).fill(language === 'ar' ? 'الغلاف: Open Library' : 'Cover: Open Library'));
      } else await expect(scope.locator('.discovery-cover__book')).toHaveCount(count);
      if (process.env.SAMS_TEST_EVIDENCE_DIR) await page.screenshot({
        path: join(process.env.SAMS_TEST_EVIDENCE_DIR, `${mode}-${language}-${name}.png`), fullPage: true });
    }
    await page.goto(`${origin}/student/catalog`);
    await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'false');
    await checkCovers(page.locator('.catalog-grid'), 2, 'catalog');
    for (const item of records) {
      await page.goto(`${origin}/student/items/${item.id}`);
      await expect(page.locator('.item-detail-announcement')).toHaveText(translate(language, 'discovery.detail.loaded'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.title);
      await checkCovers(page.locator('.item-detail-hero'), 1, item.id);
    }
  });
}
