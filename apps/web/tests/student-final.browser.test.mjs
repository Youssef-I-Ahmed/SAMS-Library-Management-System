// Final Student review: isolated production build with existing read-only fixtures.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { translate } from '../src/i18n/index.js';
import { createAuditServer } from '../../../docs/frontend/qa/sprint10b5/serve.mjs';

const evidence = resolve(process.env.SAMS_TEST_EVIDENCE_DIR || tmpdir(), 'student-final');
let browser, server, origin, baseFixtures;
before(async () => {
  await mkdir(evidence, { recursive: true });
  baseFixtures = await readFile(new URL('../../../docs/frontend/qa/sprint10b5/fixtures.js', import.meta.url), 'utf8');
  server = createAuditServer(); await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});
after(async () => { await browser?.close(); if (server) await new Promise((done) => server.close(done)); });

function user(language, mode) {
  const account = { id: 'profile-fixture', roles: ['STUDENT'],
    displayName: language === 'ar' ? 'طالب المكتبة — عينة اختبار' : 'Library Student — test fixture',
    universityEmail: 'student@university.example', student: { studentId: 'SAMS-2026-001', academicStatus: 'ACTIVE',
      faculty: { name: language === 'ar' ? 'كلية العلوم الإدارية' : 'Faculty of Management' },
      department: { name: language === 'ar' ? 'قسم نظم المعلومات' : 'Information Systems' } } };
  if (mode === 'missing') delete account.student;
  if (mode === 'partial') account.student = { academicStatus: 'GRADUATED', faculty: account.student.faculty };
  if (mode === 'blank') { account.displayName = ' '; account.universityEmail = null; account.student = null; }
  if (mode === 'unknown') account.student.academicStatus = 'SUPPLIED_STATUS';
  if (mode === 'long') {
    account.universityEmail = `research.student.${'longname'.repeat(5)}@${'university'.repeat(6)}.example`;
    account.student.studentId = `SAMS-${'20261117'.repeat(12)}`;
    account.student.faculty.name += ` ${'UnbrokenAcademicName'.repeat(12)}`;
    account.student.department.name += ` ${'LongDepartmentName'.repeat(12)}`;
  }
  return account;
}
async function fixture(t, { language = 'en', theme = 'light', width = 390, mode = 'normal', auth = 'ready' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], state = { mode, auth };
  page.setDefaultTimeout(12000); page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__audit/fixtures.js', (route) => {
    const shim = `;(() => {
      const original = window.fetch; window.__ui4dRequests = [];
      window.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname.startsWith('/api/v1/')) window.__ui4dRequests.push({ path: url.pathname, method: options.method || 'GET' });
        if (url.pathname === '/api/v1/auth/me') {
          if (${JSON.stringify(state.auth)} === 'hold') await new Promise(resolve => { window.__releaseProfileAuth = resolve; });
          return new Response(JSON.stringify(${state.auth === 'error' ? JSON.stringify({ error: { message: 'Fixture unavailable session' } }) : JSON.stringify({ user: user(language, state.mode) })}),
            { status: ${state.auth === 'error' ? 503 : 200}, headers: { 'content-type': 'application/json' } });
        }
        return original(input, options);
      };
    })();`;
    return route.fulfill({ body: baseFixtures + shim, contentType: 'text/javascript' });
  });
  t.after(async () => {
    assert.deepEqual(errors, []);
    const unexpected = await page.evaluate(() => window.__samsAudit?.unknown || []);
    assert.deepEqual(unexpected, [], 'existing fixtures handle every request');
    assert.equal(await page.evaluate(() => window.__ui4dRequests.every((entry) => entry.method === 'GET')), true, 'no mutation traffic');
    await context.close();
  });
  return { page, state, tr: (key) => translate(language, key), goto: (path = '/student/profile') =>
    page.goto(`${origin}${path}${path.includes('?') ? '&' : '?'}__lang=${language}&__theme=${theme}`) };
}
async function audit(page) {
  await page.evaluate(axe.source);
  return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })));
}
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
async function maximumScroll(page, width, profile = false) {
  if (width >= 761) return;
  for (const inset of ['0px', '34px']) {
    await page.locator('.student-shell').evaluate((node, value) => node.style.setProperty('--student-safe-bottom', value), inset);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    if (profile) {
      const clear = await page.locator('.profile-fields dd').last().evaluate((node) =>
        node.getBoundingClientRect().bottom <= document.querySelector('.student-mobile-nav').getBoundingClientRect().top - 4);
      assert.equal(clear, true, 'last read-only profile field clears bottom navigation');
    } else {
      const controls = page.locator('main a[href], main button:not(:disabled), main input:not(:disabled), main select:not(:disabled)');
      const last = await controls.evaluateAll((nodes) => {
        const visible = nodes.filter((node) => node.getClientRects().length && !node.closest('[hidden]'));
        const last = visible.at(-1), previous = visible.at(-2);
        previous?.focus({ preventScroll: true });
        return last ? { tag: last.tagName, hasPrevious: Boolean(previous) } : null;
      });
      if (last?.hasPrevious) {
        await page.keyboard.press('Tab');
        const bounds = await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, header: document.querySelector('.student-shell__header').getBoundingClientRect().bottom,
            nav: document.querySelector('.student-mobile-nav').getBoundingClientRect().top, outline: getComputedStyle(document.activeElement).outlineStyle };
        });
        assert.ok(bounds.top >= bounds.header && bounds.bottom <= bounds.nav, JSON.stringify(bounds));
        assert.equal(bounds.outline, 'solid');
      }
    }
  }
}

for (const width of [320, 390, 768, 1024, 1440]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`Profile ${width}/${language}/${theme}: hierarchy, read-only data, keyboard and safe area`, async (t) => {
    const { page, goto, tr } = await fixture(t, { width, language, theme });
    await goto(); await expect(page.locator('.profile-fields dd')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: tr('profile.personalTitle'), exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: tr('profile.academicTitle'), exact: true })).toBeVisible();
    await expect(page.locator('.profile-page :is(input, select, textarea, button)')).toHaveCount(0);
    await expect(page.locator('.profile-fields dd').nth(1)).toHaveText('student@university.example');
    await expect(page.locator('.profile-fields dd').nth(1).locator('bdi')).toHaveAttribute('dir', 'ltr');
    assert.equal(await page.locator('.profile-fields dt').first().evaluate((node) => getComputedStyle(node).fontSize), '12px');
    assert.ok(await page.locator('.profile-page').evaluate((node) => node.getBoundingClientRect().width) <= 900);
    await noOverflow(page); assert.deepEqual(await audit(page), []);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: tr('common.skipToContent'), exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.locator('#main-content')).toBeFocused();
    await maximumScroll(page, width, true);
    assert.deepEqual(await page.evaluate(() => window.__ui4dRequests.map((entry) => entry.path)), ['/api/v1/auth/me']);
    if (width === 390 && ((language === 'en' && theme === 'light') || (language === 'ar' && theme === 'dark'))) {
      await page.evaluate(() => document.activeElement?.blur());
      await page.screenshot({ path: `${evidence}/profile-${width}-${language}-${theme}-end.png` });
    }
    if ((width === 1440 || width === 390) && ((language === 'en' && theme === 'light') || (language === 'ar' && theme === 'dark'))) {
      await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' }); });
      await page.screenshot({ path: `${evidence}/profile-${width}-${language}-${theme}.png`, fullPage: true });
    }
  });
}

for (const language of ['en', 'ar']) test(`Profile ${language}: missing, partial, unknown and long supplied values remain truthful`, async (t) => {
  const { page, state, goto, tr } = await fixture(t, { language });
  for (const mode of ['missing', 'partial', 'blank', 'unknown', 'long']) {
    state.mode = mode;
    await goto(); await expect(page.locator('.profile-fields dd')).toHaveCount(6);
    if (mode === 'missing') {
      await expect(page.getByText(tr('profile.academicMissing'), { exact: true })).toBeVisible();
      await expect(page.locator('[data-missing="true"]')).toHaveCount(4);
    }
    if (mode === 'partial') {
      await expect(page.locator('[data-missing="true"]')).toHaveCount(2);
      await expect(page.locator('.profile-fields').last()).toContainText(tr('profile.academicStatus.GRADUATED'));
    }
    if (mode === 'blank') {
      await expect(page.locator('[data-missing="true"]')).toHaveCount(6);
      await expect(page.locator('.profile-avatar svg')).toBeVisible();
    }
    if (mode === 'unknown') await expect(page.locator('.profile-fields').last()).toContainText('SUPPLIED_STATUS');
    if (mode === 'long') for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await noOverflow(page);
      await expect(page.locator('.profile-fields dd').nth(1)).toHaveText(user(language, mode).universityEmail);
      await expect(page.locator('.profile-fields dd').nth(2)).toHaveText(user(language, mode).student.studentId);
      assert.equal(await page.locator('.profile-sheet').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    }
  }
});

for (const language of ['en', 'ar']) test(`Profile ${language}: session loading and failed authentication retain existing guard behavior`, async (t) => {
  const { page, state, goto, tr } = await fixture(t, { language, auth: 'hold' });
  await goto(); await expect(page.getByRole('status')).toContainText(tr('auth.restoringSession'));
  await expect(page.locator('.profile-page')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.__releaseProfileAuth)).toBe('function');
  await page.evaluate(() => window.__releaseProfileAuth()); await expect(page.locator('.profile-fields dd')).toHaveCount(6);
  state.auth = 'error'; await goto(); await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.profile-page')).toHaveCount(0);
});

for (const width of [320, 390, 768, 1024, 1440]) for (const [language, theme] of [['en', 'light'], ['ar', 'dark']]) {
  test(`Student review ${width}/${language}/${theme}: established pages keep layout, states and final controls reachable`, async (t) => {
    const { page, goto } = await fixture(t, { width, language, theme });
    for (const [path, selector] of [['/student', '.student-home'], ['/student/catalog', '.catalog-page'],
      ['/student/items/audit-item-1', '.item-detail-page'], ['/student/reservations', '.circulation-page'],
      ['/student/borrowings', '.circulation-page'], ['/student/profile', '.profile-page']]) {
      await goto(path); await expect(page.locator(selector)).toBeVisible();
      if (path === '/student/catalog') await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'false');
      if (path === '/student/items/audit-item-1') await expect(page.locator('.reservation-panel')).toBeVisible();
      if (/\/(reservations|borrowings)$/.test(path)) await expect(page.locator('.circulation-results')).toHaveAttribute('aria-busy', 'false');
      await noOverflow(page); await maximumScroll(page, width, path.endsWith('/profile'));
      assert.equal(await page.locator('h1').count(), 1);
      if (width === 768) assert.deepEqual(await audit(page), [], path);
    }
  });
}
