// Production-preview verification. All API traffic is fulfilled locally.
import { FRAME_END, FRAME_START, frameFor } from '../src/components/landing/heroProgress.js';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { createServer, preview } from 'vite';
import { translate } from '../src/i18n/index.js';

const screenshots = process.env.SAMS_TEST_EVIDENCE_DIR
  ? `${process.env.SAMS_TEST_EVIDENCE_DIR}/student-home`
  : fileURLToPath(new URL('../../../.output/screenshots/sprint10b3/', import.meta.url));
const metrics = [];
let server;
let browser;
let origin;

before(async () => {
  await mkdir(screenshots, { recursive: true });
  server = await preview({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, open: false }
  });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
});

after(async () => {
  await writeFile(`${screenshots}/verification-metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function fixture(t, { language = 'en', theme = 'light', role = 'STUDENT', viewport,
  reducedMotion = 'no-preference', deviceScaleFactor = 1, holdAuth = false, authError = false, imageError = false, facetTypes = [], facetsError = false, saveData = false, appOrigin = origin } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, reducedMotion, deviceScaleFactor });
  const state = { api: [], unexpected: [], errors: [], releaseAuth: null };
  t.after(async () => {
    state.releaseAuth?.();
    await context.close();
    assert.deepEqual(state.unexpected, [], 'no unexpected API or external requests');
    assert.deepEqual(state.errors, [], 'no browser runtime exceptions');
  });
  await context.addInitScript(({ language, theme, role }) => {
    localStorage.setItem('sams.language', language);
    localStorage.setItem('sams.theme', theme);
    if (role) sessionStorage.setItem('sams.devAccessToken', 'fixture-only-token');
    window.__homeMetrics = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      window.__homeMetrics.lcp = list.getEntries().at(-1)?.startTime || 0;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__homeMetrics.cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  }, { language, theme, role });
  if (saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, addEventListener() {}, removeEventListener() {} } }));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (imageError && (url.pathname.includes('living-library-concept') || url.pathname.includes('/scrollVideo/'))) return route.abort();
    if (url.pathname.startsWith('/api/v1/')) {
      state.api.push({ path: url.pathname, method: route.request().method(), query: Object.fromEntries(url.searchParams) });
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (url.pathname.endsWith('/auth/me')) {
        if (holdAuth) await new Promise((resolve) => { state.releaseAuth = resolve; });
        if (authError) return json({ error: { message: 'Fixture expired session' } }, 401);
        return json({ user: { id: 'fixture', displayName: language === 'ar' ? 'طالب المكتبة' : 'SAMS Student',
          roles: [role], universityEmail: 'student@example.test' } });
      }
      if (url.pathname === '/api/v1/ai/health') return json({ data: { status: 'ok' } });
      if (url.pathname === '/api/v1/discovery/facets') return facetsError ? json({ error: { code: 'UNAVAILABLE' } }, 503) : json({ data: { types: facetTypes } });
      if (['/api/v1/discovery/items', '/api/v1/reservations/me',
        '/api/v1/borrowings/me', '/api/v1/visits'].includes(url.pathname)) {
        return json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      }
      state.unexpected.push(`${route.request().method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin === appOrigin) return route.continue();
    state.unexpected.push(url.origin);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { page, state, tr: (key) => translate(language, key) };
}

async function audit(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
  }));
  return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
}

for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 390, height: 844 }]
]) for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) {
  test(`${device} ${language} ${theme}: responsive Home, contrast, landmarks and screenshot`, async (t) => {
    const { page, state, tr } = await fixture(t, { language, theme, viewport });
    await page.goto(`${origin}/student`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tr('studentHome.titleLead'));
    await page.locator('.student-home__copy').evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.evaluate(() => Promise.all(Array.from(document.images).map((image) => image.decode())));
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.home-hero__credit')).toHaveText(tr('studentHome.imageCaption'));
    await expect(page.getByRole('note')).toContainText(tr('discovery.inventoryNotice.body'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
    assert.equal(await page.locator('.student-search').evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    assert.equal(state.api.every((request) => ['/api/v1/auth/me','/api/v1/discovery/facets'].includes(request.path)), true, 'Home reads only auth and actual collection facets');
    await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}.png`, fullPage: device !== 'mobile' });
    if (device === 'mobile') await page.screenshot({ path: `${screenshots}/${device}-${language}-${theme}-full.png`, fullPage: true });
    const finding = await audit(page);
    const performance = await page.evaluate(() => ({ ...window.__homeMetrics,
      hero: document.querySelector('.home-hero__media img').currentSrc,
      imageBytes: performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'img').reduce((sum, entry) => sum + entry.encodedBodySize, 0)
    }));
    metrics.push({ device, language, theme, ...performance, violations: finding });
    assert.deepEqual(finding, [], 'full Home WCAG A/AA scan, including contrast, has no exclusions');
    assert.ok(performance.cls < 0.1, `layout shift ${performance.cls}`);
  });
}

test('keyboard search, collection links, account menu, theme/language and stock transparency', async (t) => {
  const { page, state, tr } = await fixture(t);
  await page.goto(`${origin}/student`);
  await expect(page.locator('.student-home')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: tr('common.skipToContent') })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const account = page.getByRole('button', { name: tr('auth.accountMenu'), exact: true });
  await account.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  assert.deepEqual(await audit(page), [], 'open menu contrast and semantics');
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  assert.equal(await account.evaluate((node) => getComputedStyle(node).outlineStyle !== 'none'), true);
  await page.getByRole('button', { name: tr('common.switchToDark'), exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('h1')).toContainText(translate('ar', 'studentHome.titleLead'));
  const arabicAccount = page.getByRole('button', { name: translate('ar', 'auth.accountMenu'), exact: true });
  await arabicAccount.focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await audit(page), [], 'dark Arabic open menu also passes contrast');
  await page.keyboard.press('Escape');
  const search = page.getByRole('searchbox');
  await search.fill('  إدارة & البحث  ');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/student\/catalog\?q=/);
  assert.equal(new URL(page.url()).searchParams.get('q'), 'إدارة & البحث');
  await expect(page.getByRole('note')).toContainText(translate('ar', 'discovery.inventoryNotice.body'));
  for (const type of ['BOOK', 'ACADEMIC_WORK']) {
    await page.goto(`${origin}/student`);
    await page.locator(`.collection-card[href$="type=${type}"]`).click();
    await expect(page).toHaveURL(new RegExp(`type=${type}`));
  }
  assert.equal(state.api.every((request) => request.method === 'GET'), true);
});

test('reduced motion and unavailable illustration retain a readable functional hero', async (t) => {
  const { page } = await fixture(t, { reducedMotion: 'reduce', imageError: true, viewport: { width: 320, height: 760 } });
  await page.goto(`${origin}/student`);
  await expect(page.locator('h1')).toBeVisible();
  assert.equal(await page.locator('.student-home__copy').evaluate((node) => getComputedStyle(node).animationName), 'none');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await expect(page.getByRole('searchbox')).toBeEditable();
  assert.deepEqual(await audit(page), []);
});

test('authentication loading and expired sessions preserve existing guards', async (t) => {
  const { page, state, tr } = await fixture(t, { holdAuth: true, authError: true });
  await page.goto(`${origin}/student`);
  await expect(page.getByRole('status')).toContainText(tr('auth.restoringSession'));
  await expect(page.locator('.student-home')).toHaveCount(0);
  state.releaseAuth();
  await expect(page).toHaveURL(/\/login$/);
});

test('anonymous and other roles retain their existing protected routes', async (t) => {
  const anonymous = await fixture(t, { role: null });
  await anonymous.page.goto(`${origin}/student`);
  await expect(anonymous.page).toHaveURL(/\/login$/);
  const librarian = await fixture(t, { role: 'LIBRARIAN' });
  await librarian.page.goto(`${origin}/student`);
  await expect(librarian.page).toHaveURL(/\/forbidden$/);
  await librarian.page.goto(`${origin}/librarian`);
  await expect(librarian.page.locator('.staff-shell h1')).toBeVisible();
  const management = await fixture(t, { role: 'MANAGEMENT' });
  await management.page.goto(`${origin}/student`);
  await expect(management.page).toHaveURL(/\/forbidden$/);
  await management.page.goto(`${origin}/management/visits`);
  await expect(management.page.locator('.staff-shell h1')).toBeVisible();
});

test('React 18 development render uses native image priority without console errors', async (t) => {
  const development = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }
  });
  t.after(() => development.close());
  await development.listen();
  const appOrigin = `http://127.0.0.1:${development.httpServer.address().port}`;
  const { page } = await fixture(t, { appOrigin });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${appOrigin}/student`);
  await expect(page.locator('.home-hero__media img')).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('h1')).toBeVisible();
  assert.deepEqual(errors, []);
});

for (const width of [320,390,768,1024,1440]) for(const language of ['en','ar']) for(const theme of ['light','dark']) test(`UI3B ${width}/${language}/${theme}: static first and native journey`,async(t)=>{
 const {page,tr}=await fixture(t,{language,theme,viewport:{width,height:width<500?844:1000}});
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto(`${origin}/student`);await expect(page.getByRole('searchbox')).toBeEditable();
 await expect(page.locator('.home-destinations')).toBeVisible();
 assert.equal(requests.some(u=>/ezgif-frame|\.png|three|knowledge-spirit-viewer|\.glb/.test(u)),false);
 assert.equal(requests.filter(u=>/frame-\d+\.webp/.test(u)).every(u=>u.includes('frame-001')),true);
 await expect(page.locator('.home-destinations a').nth(1)).toHaveAttribute('href','/student/catalog?type=ACADEMIC_WORK');
 await expect(page.getByRole('button',{name:tr('cinematic.start')})).toHaveCount(0);await expect(page.locator('canvas')).toHaveCount(0);
 {
  const track=page.locator('.campus-track');const canvas=page.locator('.campus-canvas');
  await track.evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-document.querySelector('.student-shell__header').getBoundingClientRect().height+2,behavior:'instant'}));
  await expect(canvas).toHaveAttribute('data-ready','true');
  const headerBottom=await page.locator('.student-shell__header').evaluate(el=>el.getBoundingClientRect().bottom);
  assert.ok((await page.locator('.campus-sticky').boundingBox()).y>=headerBottom-1);
  const y=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,300);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(y);
  await track.evaluate(el=>{const h=document.querySelector('.student-shell__header').getBoundingClientRect().height,s=el.querySelector('.campus-sticky').getBoundingClientRect().height;window.scrollTo({top:el.getBoundingClientRect().top+scrollY-h+(el.getBoundingClientRect().height-s)*.64,behavior:'instant'});});
  await expect.poll(async()=>Number(await canvas.getAttribute('data-frame'))).toBeGreaterThan(28);
  assert.ok(Number(await canvas.getAttribute('data-cached'))<=8);
  const paints=await canvas.getAttribute('data-paints');await page.waitForTimeout(180);assert.equal(await canvas.getAttribute('data-paints'),paints,'stationary frame does not repaint');
  await page.screenshot({path:`${screenshots}/ui3b-journey-${width}-${language}-${theme}.png`});
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const skip=page.getByRole('link',{name:tr('cinematic.skip'),exact:false}).last();await skip.click();
 await expect(page.locator('#home-collections')).toBeFocused();
 assert.ok(await page.locator('#home-collections').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.student-shell__header').getBoundingClientRect().bottom-1));
 await page.goto(`${origin}/student`);await expect(page.getByRole('searchbox')).toBeEditable();await expect(page.locator('canvas')).toHaveCount(0);
 await page.screenshot({path:`${screenshots}/ui3b-static-${width}-${language}-${theme}.png`,fullPage:false});
 assert.deepEqual(await audit(page),[]);
});

for(const mode of ['reduced','save-data','failed-images','slow-frames','facets-unavailable','populated-types'])test(`UI3B ${mode}: useful discovery survives`,async(t)=>{
 const {page,tr}=await fixture(t,{reducedMotion:mode==='reduced'?'reduce':'no-preference',saveData:mode==='save-data',imageError:mode==='failed-images',facetsError:mode==='facets-unavailable',facetTypes:mode==='populated-types'?[{value:'PROJECT',count:3},{value:'THESIS',count:2}]:[]});
 if(mode==='slow-frames')await page.route('**/frame-*.webp',async route=>{if(!route.request().url().includes('frame-001'))await new Promise(r=>setTimeout(r,500));await route.continue().catch(()=>{});});
 await page.goto(`${origin}/student`);await expect(page.getByRole('searchbox')).toBeEditable();
 if(['reduced','save-data'].includes(mode)){await page.locator('.campus-track').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY+400,behavior:'instant'}));await page.waitForTimeout(150);await expect(page.locator('canvas')).toHaveCount(0);await page.evaluate(()=>window.scrollTo(0,0));}
 else if(['failed-images','slow-frames'].includes(mode)){
  await page.locator('.campus-track').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY+400,behavior:'instant'}));
  await page.getByRole('link',{name:tr('cinematic.skip'),exact:false}).last().click();await expect(page.locator('#home-collections')).toBeFocused();
  await page.goto(`${origin}/student`);
 }
 const suffix=mode==='populated-types'?'PROJECT':'ACADEMIC_WORK';
 await expect(page.locator('.home-destinations a').nth(1)).toHaveAttribute('href',`/student/catalog?type=${suffix}`);
 if(mode==='populated-types')await expect(page.locator('.home-destinations a').nth(2)).toHaveAttribute('href','/student/catalog?type=THESIS');
 await page.getByRole('searchbox').fill('إدارة & research');await page.getByRole('searchbox').press('Enter');await expect(page).toHaveURL(/\/student\/catalog\?q=/);
 assert.equal(new URL(page.url()).searchParams.get('q'),'إدارة & research');
});

test('UI3B all 50 frames, settled painting, visibility pause and cleanup',async(t)=>{
 const {page,tr}=await fixture(t);
 await page.addInitScript(()=>{
  window.__frameBitmaps={created:0,closed:0};const original=window.createImageBitmap;
  window.createImageBitmap=async(...args)=>{const image=await original(...args);window.__frameBitmaps.created++;const close=image.close.bind(image);image.close=()=>{window.__frameBitmaps.closed++;close();};return image;};
 });
 await page.goto(`${origin}/student`);
 const canvas=page.locator('.campus-canvas'),track=page.locator('.campus-track');
 for(let index=0;index<50;index++){
  await track.evaluate((el,p)=>{const h=document.querySelector('.student-shell__header').getBoundingClientRect().height,s=el.querySelector('.campus-sticky').getBoundingClientRect().height;window.scrollTo({top:el.getBoundingClientRect().top+scrollY-h+(el.getBoundingClientRect().height-s)*p,behavior:'instant'});},(FRAME_START+(index/49)*(FRAME_END-FRAME_START)));
  await expect(canvas).toHaveAttribute('data-frame',String(index+1));assert.ok(Number(await canvas.getAttribute('data-cached'))<=8);
 }
 await expect(page.locator('.campus-caption h3')).toHaveText(tr('cinematic.chapters.5'));
 await page.screenshot({path:`${screenshots}/ui3b-final-frame.png`});
 await page.locator('.campus-caption h3 a').focus();const position=await page.evaluate(()=>scrollY);await page.keyboard.press('PageUp');await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(position);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 const before=await canvas.getAttribute('data-paints');await page.waitForTimeout(180);assert.equal(await canvas.getAttribute('data-paints'),before);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('link',{name:tr('cinematic.skip'),exact:false}).last().click();const offscreen=await canvas.getAttribute('data-paints');await page.waitForTimeout(180);assert.equal(await canvas.getAttribute('data-paints'),offscreen);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(canvas).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__frameBitmaps.closed-window.__frameBitmaps.created)).toBe(0);
 assert.ok(await page.evaluate(()=>window.__frameBitmaps.created>8),'evicted and remaining decoded images were closed');
 await page.getByRole('searchbox').fill('Knowledge');await page.getByRole('searchbox').press('Enter');await expect(page.locator('canvas')).toHaveCount(0);
 await page.goBack();await expect(page.locator('.student-home')).toBeVisible();await expect(page.locator('canvas')).toHaveCount(0);
});

test('UI3B high-DPR phone requests only the mobile poster',async(t)=>{
 const {page}=await fixture(t,{viewport:{width:390,height:844},deviceScaleFactor:3});const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto(`${origin}/student`);
 await expect(page.locator('.home-hero__media img')).toHaveJSProperty('complete',true);
 assert.ok((await page.locator('.home-hero__media img').evaluate(el=>el.currentSrc)).includes('/mobile/'));
 assert.equal(requests.some(u=>u.includes('/desktop/frame-')),false);await expect(page.locator('canvas')).toHaveCount(0);
});

test('UI3B enabled AI destination preserves the existing assistant route',async(t)=>{
 const development=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:fileURLToPath(new URL('../vite.config.js',import.meta.url)),envFile:false,define:{'import.meta.env.VITE_AI_ASSISTANT_ENABLED':'"true"'},server:{host:'127.0.0.1',port:0,open:false}});
 t.after(()=>development.close());await development.listen();const appOrigin=`http://127.0.0.1:${development.httpServer.address().port}`;
 const {page,tr}=await fixture(t,{appOrigin,viewport:{width:390,height:844}});await page.goto(`${appOrigin}/student`);
 const ai=page.locator('.home-destinations').getByRole('link',{name:tr('ai.nav'),exact:true});await expect(ai).toHaveAttribute('href','/student/ai');await ai.click();
 await expect(page).toHaveURL(/\/student\/ai$/);await expect(page.locator('.student-ai')).toHaveAttribute('data-ai-state','idle');
});

for(const width of [320,390])for(const language of ['en','ar'])for(const theme of ['light','dark'])test(`UI3C mobile ${width}/${language}/${theme}: reachable destinations and final-page clearance`,async(t)=>{
 const {page,tr}=await fixture(t,{viewport:{width,height:844},language,theme});await page.goto(`${origin}/student`);await expect(page.locator('.home-destinations')).toBeVisible();
 const targets=page.locator('.home-destinations a');
 for(let i=0;i<await targets.count();i++){
  const target=targets.nth(i);await target.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const reachable=await target.evaluate(el=>{const r=el.getBoundingClientRect(),nav=document.querySelector('.student-mobile-nav').getBoundingClientRect(),h=document.querySelector('.student-shell__header').getBoundingClientRect();return r.top>=h.bottom&&r.bottom<=nav.top&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(reachable,'discovery link is fully above nav and hit-testable');
 }
 await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 const final=await page.locator('.student-home__footer a').evaluate(el=>{const r=el.getBoundingClientRect(),n=document.querySelector('.student-mobile-nav').getBoundingClientRect();return{targetBottom:r.bottom,navTop:n.top,clearance:n.top-r.bottom,scrollY:scrollY,maxScroll:document.documentElement.scrollHeight-innerHeight};});
 metrics.push({kind:'ui3c-mobile',width,language,theme,...final});
 assert.ok(final.clearance>=12,JSON.stringify(final));assert.ok(Math.abs(final.scrollY-final.maxScroll)<2);
 await page.screenshot({path:`${screenshots}/ui3c-mobile-end-${width}-${language}-${theme}.png`});
 await page.locator('.home-destinations a').first().focus();await expect(page.locator('.home-destinations a').first()).toBeFocused();
 const ai=page.locator('.home-destinations > span');if(await ai.count()){await expect(ai).toHaveAttribute('aria-disabled','true');assert.equal(await ai.getAttribute('tabindex'),null);}
 await page.getByRole('searchbox').fill('Curiosity');await page.getByRole('searchbox').press('Enter');await expect(page).toHaveURL(/\/student\/catalog\?q=Curiosity/);
});

for(const width of [768,1440])test(`UI3C density ${width}: meaningful progression and real-content handoff`,async(t)=>{
 const {page,tr}=await fixture(t,{viewport:{width,height:1000},language:'ar',theme:'dark'});await page.goto(`${origin}/student`);
 const track=page.locator('.campus-track'),canvas=page.locator('.campus-canvas');const frames=[];
 const geometry=await track.evaluate(el=>({track:el.getBoundingClientRect().height,stage:el.querySelector('.campus-sticky').getBoundingClientRect().height}));
 for(const progress of [.002,.2,.4,.6,.8,1]){
  await track.evaluate((el,p)=>{const header=document.querySelector('.student-shell__header').getBoundingClientRect().height;window.scrollTo({top:el.getBoundingClientRect().top+scrollY-header+(el.getBoundingClientRect().height-el.querySelector('.campus-sticky').getBoundingClientRect().height)*p,behavior:'instant'});},progress);
  await expect(canvas).toHaveAttribute('data-frame',String(frameFor(progress)+1));frames.push(Number(await canvas.getAttribute('data-frame')));
 }
 metrics.push({kind:'ui3c-density',width,...geometry,travel:geometry.track-geometry.stage,frames});
 assert.ok(geometry.track-geometry.stage<=geometry.stage*2.5);assert.equal(new Set(frames).size,6);
 await expect(page.locator('.campus-handoff')).toBeVisible();assert.equal(await page.locator('.campus-handoff').evaluate(el=>Number(getComputedStyle(el).opacity)),1);
 await expect(page.locator('.campus-handoff p')).toHaveText(tr('cinematic.finalDisclaimer'));
 assert.deepEqual(await audit(page),[], 'active handoff has no accessibility violations');
 await page.screenshot({path:`${screenshots}/ui3c-handoff-${width}.png`});
 await page.locator('.campus-handoff a').click();await expect(page.locator('#home-collections')).toBeFocused();await expect(page.locator('.collection-grid')).toBeInViewport();
 await page.screenshot({path:`${screenshots}/ui3c-real-collections-${width}.png`});
});

test('UI3C mobile native Tab reachability',async(t)=>{
 const {page}=await fixture(t,{viewport:{width:320,height:844}});await page.goto(`${origin}/student`);await expect(page.getByRole('searchbox')).toBeEditable();const failures=[];let tested=0;
 for(let i=0;i<40;i++){await page.keyboard.press('Tab');await page.waitForTimeout(200);await page.evaluate(()=>new Promise(done=>{let last=-1,still=0;const tick=()=>{if(scrollY===last&&++still>4)return done();if(scrollY!==last)still=0;last=scrollY;setTimeout(tick,60);};tick();}));const result=await page.evaluate(()=>{const el=document.activeElement;if(!el?.closest('.student-home'))return null;const r=el.getBoundingClientRect(),n=document.querySelector('.student-mobile-nav').getBoundingClientRect(),h=document.querySelector('.student-shell__header').getBoundingClientRect();return {text:el.textContent.slice(0,45),top:r.top,bottom:r.bottom,header:h.bottom,nav:n.top,clear:r.top>=h.bottom&&r.bottom<=n.top};});if(result){tested++;if(!result.clear)failures.push(result);}}
 assert.ok(tested>8);assert.deepEqual(failures,[]);
});

test('UI3C capture: browser scroll animation',async(t)=>{
 const {page,tr}=await fixture(t,{viewport:{width:1440,height:1000}});const dir=`${screenshots}/ui3c-browser-frames`;await mkdir(dir,{recursive:true});let shot=0;
 const capture=()=>page.screenshot({path:`${dir}/${String(shot++).padStart(3,'0')}.png`});
 await page.goto(`${origin}/student`);await expect(page.getByRole('searchbox')).toBeEditable();await page.screenshot({path:`${screenshots}/ui3c-desktop-hero.png`});
 const track=page.locator('.campus-track'),canvas=page.locator('.campus-canvas');
 for(let i=0;i<50;i++){
  await track.evaluate((el,p)=>{const header=document.querySelector('.student-shell__header').getBoundingClientRect().height;window.scrollTo({top:el.getBoundingClientRect().top+scrollY-header+(el.getBoundingClientRect().height-el.querySelector('.campus-sticky').getBoundingClientRect().height)*p,behavior:'instant'});},FRAME_START+(i/49)*(FRAME_END-FRAME_START));
  await expect(canvas).toHaveAttribute('data-frame',String(i+1));await capture();
  if(i===25)await page.screenshot({path:`${screenshots}/ui3c-desktop-journey.png`});
 }
 for(let i=0;i<5;i++)await capture();
 await page.locator('.campus-caption h3 a').click();await expect(page.locator('#home-collections')).toBeFocused();
 for(let i=0;i<6;i++)await capture();
 await writeFile(`${screenshots}/ui3c-recording.json`,JSON.stringify({frames:shot,directory:dir,source:'Actual Playwright viewport screenshots during native document scroll; all 50 frame positions plus real collections',playbackFps:10}));
});
