// Isolated component checks: image responses are intercepted; no API or DB calls.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

let server, browser, origin, previousFlag;
const books = [
  { id: 'e60bd2bb-1066-52fd-90ac-7dac28b4582b', type: 'BOOK',
    title: 'Writing academic english', publicationYear: 2006, language: 'en',
    bookDetails: { isbn: '0131523597', edition: '4', publisher: 'Pearson longman' },
    itemContributors: ['Alice Oshima', 'Ann Hogue'].map(fullName => ({ contributor: { fullName } })) },
  { id: '51a5a672-a505-51c2-8cd8-5be9f0039720', type: 'BOOK',
    title: 'Effective organisational communication', publicationYear: 2008, language: 'en',
    bookDetails: { isbn: '9780273713753', edition: '3', publisher: 'Pearson prentice Hall' },
    itemContributors: ['Richard Blundel', 'Kate Ippolito'].map(fullName => ({ contributor: { fullName } })) }
];
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Book cover pilot harness</title><link rel="icon" href="data:,"></head><body>
<div id="root"></div><script type="module">
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookCover } from '/src/components/discovery/BookCover.jsx';
import { LanguageContext } from '/src/app/providers/LanguageProvider.jsx';
import { translate } from '/src/i18n/index.js';
function Harness() {
  const [item, setItem] = useState(null);
  const language = new URLSearchParams(location.search).get('lang') || 'en';
  window.pilotEnvironment = { dev: import.meta.env.DEV, flag: import.meta.env.VITE_BOOK_COVER_PILOT };
  window.setPilotItem = setItem;
  return React.createElement(LanguageContext.Provider,
    { value: { language, t: key => translate(language, key) } },
    item ? React.createElement(BookCover, { item }) : null);
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`;

before(async () => {
  previousFlag = process.env.VITE_BOOK_COVER_PILOT;
  process.env.VITE_BOOK_COVER_PILOT = 'true';
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    // configureServer runs before Vite's SPA fallback/index HTML middleware.
    // Appending middleware after createServer serves the app's index instead.
    plugins: [{ name: 'book-cover-pilot-harness', configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url.split('?')[0] !== '/__cover-pilot-test.html') return next();
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__cover-pilot-test.html', html));
        } catch (error) { next(error); }
      });
    } }],
    server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => {
  await browser?.close(); await server?.close();
  if (previousFlag === undefined) delete process.env.VITE_BOOK_COVER_PILOT;
  else process.env.VITE_BOOK_COVER_PILOT = previousFlag;
});

async function openHarness(page, language, name, t) {
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], failedModules: [] };
  let rejectInitialization;
  const failure = new Promise((_, reject) => { rejectInitialization = reject; });
  // The navigation itself may fail before Promise.race starts observing failure.
  failure.catch(() => {});
  let initializing = true;
  const fail = (message) => { if (initializing) rejectInitialization(new Error(message)); };
  page.on('pageerror', error => {
    diagnostics.pageErrors.push(error.message);
    fail(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
      fail(message.text());
    }
  });
  page.on('requestfailed', request => {
    diagnostics.failedRequests.push({ url: request.url(), error: request.failure() });
    fail(`Request failed: ${request.url()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(response.request().resourceType())) {
      diagnostics.failedModules.push({ url: response.url(), status: response.status() });
      fail(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  t.after(async () => {
    if (process.env.SAMS_TEST_EVIDENCE_DIR) {
      await mkdir(process.env.SAMS_TEST_EVIDENCE_DIR, { recursive: true });
      await writeFile(join(process.env.SAMS_TEST_EVIDENCE_DIR, `${language}-${name}.json`), JSON.stringify(diagnostics, null, 2));
    }
    assert.deepEqual(diagnostics.pageErrors, [], 'no browser runtime errors');
  });
  try {
    const response = await page.goto(`${origin}/__cover-pilot-test.html?lang=${language}`);
    const body = await response.text();
    diagnostics.http = { status: response.status(), contentType: response.headers()['content-type'], body };
    assert.equal(response.status(), 200);
    assert.match(body, /<title>Book cover pilot harness<\/title>/, 'Vite must serve the harness, not the SPA fallback');
    assert.match(body, /\/@react-refresh/, 'React plugin preamble must be injected');
    assert.match(body, /html-proxy/, 'Vite must transform inline module imports');
    await Promise.race([page.waitForFunction(() => typeof window.setPilotItem === 'function'), failure]);
    diagnostics.environment = await page.evaluate(() => window.pilotEnvironment);
    assert.deepEqual(diagnostics.environment, { dev: true, flag: 'true' });
  } catch (error) {
    throw new Error(`Cover harness initialization failed: ${error.message}\n${JSON.stringify(diagnostics, null, 2)}`, { cause: error });
  } finally { initializing = false; }
}

for (const language of ['en', 'ar']) {
  test(`${language}: both reviewed candidates, metadata drift and source credit`, async t => {
    const context = await browser.newContext(); t.after(() => context.close());
    const page = await context.newPage(); const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://covers.openlibrary.org/**', route => {
      requests.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    });
    await openHarness(page, language, 'matching', t);
    for (const item of books) {
      await page.evaluate(item => window.setPilotItem(item), item);
      const image = page.locator('.discovery-cover--pilot img');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
      await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      const link = page.getByRole('link');
      await expect(link).toHaveText(language === 'ar' ? 'الغلاف: Open Library' : 'Cover: Open Library');
      await expect(link).toHaveAttribute('href', /https:\/\/openlibrary.org\/books\/OL/);
      await link.focus(); await expect(link).toBeFocused();
      const count = requests.length;
      await page.evaluate(item => window.setPilotItem({ ...item, publicationYear: 2099 }), item);
      await expect(page.locator('.discovery-cover__book')).toBeVisible();
      await expect(page.locator('.discovery-cover--pilot')).toHaveCount(0);
      assert.equal(requests.length, count, 'changed edition metadata makes no new cover request');
    }
    assert.deepEqual(errors, []);
  });
  test(`${language}: unavailable image falls back and next item can load`, async t => {
    const context = await browser.newContext(); t.after(() => context.close());
    const page = await context.newPage();
    await page.route('https://covers.openlibrary.org/**', route => {
      if (route.request().url().includes('/1108898-')) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    });
    await openHarness(page, language, 'fallback', t);
    const failedImage = page.waitForResponse(response => response.url().includes('/1108898-') && response.status() === 404);
    await page.evaluate(item => window.setPilotItem(item), books[0]);
    await failedImage;
    await expect(page.locator('.discovery-cover__book')).toBeVisible();
    await expect(page.locator('.discovery-cover--pilot')).toHaveCount(0);
    await expect(page.getByRole('link')).toHaveCount(0);
    await page.evaluate(item => window.setPilotItem(item), books[1]);
    const image = page.locator('.discovery-cover--pilot img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  });
}
