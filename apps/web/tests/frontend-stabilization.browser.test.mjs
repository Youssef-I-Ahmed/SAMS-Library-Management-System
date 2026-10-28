// Production build only, on an isolated fixture host that rejects real APIs.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import axe from 'axe-core';
import { translate } from '../src/i18n/index.js';
import { createAuditServer } from '../../../docs/frontend/qa/sprint10b5/serve.mjs';
let browser, server, origin;
const evidence = fileURLToPath(new URL('../../../docs/frontend/screenshots/sprint10b5/states/', import.meta.url));
before(async()=>{
  await mkdir(evidence,{recursive:true}); server=createAuditServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function fixture(t,language='en',theme='light',width=390,motion='reduce'){
  const context=await browser.newContext({viewport:{width,height:width===320?740:844},reducedMotion:motion});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{await context.close();assert.deepEqual(errors,[],'no runtime exceptions')});
  return{page,tr:key=>translate(language,key),goto:async(path,state='normal')=>{
    await page.goto(`${origin}${path}?__lang=${language}&__theme=${theme}&__state=${state}`,{waitUntil:'networkidle'});
    await page.locator('h1').waitFor();
  }};
}
async function axeCheck(page){
  await page.evaluate(axe.source);
  return page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(({id,nodes})=>({id,targets:nodes.map(n=>n.target)})));
}
async function focusBounds(page){return page.evaluate(()=>{
  const n=document.activeElement,r=n.getBoundingClientRect(),nav=document.querySelector('.student-mobile-nav').getBoundingClientRect(),header=document.querySelector('.student-shell__header').getBoundingClientRect();
  return{visible:r.top>=header.bottom+4&&r.bottom<=nav.top-4,outline:getComputedStyle(n).outlineStyle};
})}
async function tabFromBoundary(page,selector){
  await page.evaluate(selector=>{
    const target=document.querySelector(selector),nav=document.querySelector('.student-mobile-nav').getBoundingClientRect();
    const controls=[...document.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select,textarea')].filter(n=>n.getClientRects().length);
    scrollTo({top:Math.max(0,target.getBoundingClientRect().top+scrollY-nav.top-8),behavior:'instant'});
    controls[controls.indexOf(target)-1].focus({preventScroll:true});
  },selector);
  await page.keyboard.press('Tab');
  await expect.poll(async()=> (await focusBounds(page)).visible).toBe(true);
  assert.equal((await focusBounds(page)).outline,'solid');
}
for(const language of ['en','ar'])for(const theme of ['light','dark']){
  test(`${language} ${theme}: keyboard targets clear fixed navigation at 320/390px and simulated safe area`,async(t)=>{
    for(const width of [320,390]){
      const {page,goto}=await fixture(t,language,theme,width,width===320?'reduce':'no-preference');
      for(const[name,path,target]of[['home','/student','.collection-card'],['catalog','/student/catalog','.discovery-item-card__footer a'],['details','/student/items/audit-item-1','.reservation-primary-button']]){
        await goto(path);await page.locator(target).first().waitFor();
        await tabFromBoundary(page,target);
        await page.screenshot({path:`${evidence}/${name}-${width}-${language}-${theme}-keyboard.png`});
        await page.locator('.student-shell').evaluate(n=>n.style.setProperty('--student-safe-bottom','34px'));
        await tabFromBoundary(page,target);
        await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
        const clear=await page.evaluate(()=>{
          const nav=document.querySelector('.student-mobile-nav').getBoundingClientRect();
          const targets=[...document.querySelectorAll('main a[href],main button')].filter(n=>n.getClientRects().length);
          const last=targets.at(-1).getBoundingClientRect();
          return{lastBottom:last.bottom,navTop:nav.top,clear:last.bottom<=nav.top-4,padding:getComputedStyle(document.querySelector('.student-shell')).paddingBottom};
        });
        assert.equal(clear.clear,true,JSON.stringify(clear));assert.equal(clear.padding,'114px');
        assert.deepEqual(await axeCheck(page),[]);
      }
    }
  });
  test(`${language} ${theme}: shared status/nav contrast and Analytics controls/zero/error states`,async(t)=>{
    const{page,goto,tr}=await fixture(t,language,theme);
    for(const[name,path]of[['reservations','/student/reservations'],['borrowings','/student/borrowings'],['librarian','/librarian'],['return','/librarian/return'],['management','/management']]){
      await goto(path);assert.deepEqual(await axeCheck(page),[],name);
    }
    await expect(page.getByRole('combobox',{name:tr('admin.analytics.topItems'),exact:true})).toBeVisible();
    await page.getByRole('region',{name:tr('admin.analytics.trends'),exact:true}).focus();
    await page.keyboard.press('PageDown');
    assert.ok(await page.locator('.trend-list').evaluate(n=>n.scrollTop)>0,'trend region scrolls with keys');
    await goto('/management','empty');await page.locator('.trend-bars b').first().waitFor({state:'attached'});
    assert.equal(await page.locator('.trend-bars b').evaluateAll(nodes=>nodes.every(n=>n.style.width==='0%')),true,'zero counts have zero width');
    await page.screenshot({path:`${evidence}/management-zero-${language}-${theme}.png`,fullPage:true});
    await goto('/management','error');await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(tr('admin.common.loading'),{exact:true})).toHaveCount(0);
    assert.deepEqual(await axeCheck(page),[]);
    await page.screenshot({path:`${evidence}/management-error-${language}-${theme}.png`,fullPage:true});
  });
  test(`${language} ${theme}: Return reuses dialog focus, trap, Escape, restoration and pending dismissal gate`,async(t)=>{
    const{page,goto,tr}=await fixture(t,language,theme);
    await goto('/librarian/return');const opener=page.locator('.staff-operation-row__actions button').first();
    await opener.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    assert.equal(await dialog.evaluate(n=>n.contains(document.activeElement)),true);
    const close=page.getByRole('button',{name:tr('common.closeDialog'),exact:true});
    await expect(close).toBeFocused();await close.press('Shift+Tab');
    const cancel=dialog.getByRole('button',{name:tr('staff.common.cancel'),exact:true});await expect(cancel).toBeFocused();
    await cancel.press('Tab');await expect(close).toBeFocused();
    assert.deepEqual(await axeCheck(page),[]);
    await page.screenshot({path:`${evidence}/return-dialog-${language}-${theme}.png`,fullPage:true});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
    await opener.press('Enter');
    await page.evaluate(()=>{
      const original=window.fetch;window.__testPosts=[];
      window.fetch=(url,options={})=>options.method==='POST'&&String(url).includes('/return')
        ?new Promise(resolve=>{window.__testPosts.push(JSON.parse(options.body));window.__releaseTestReturn=()=>resolve(new Response(JSON.stringify({error:{message:'Local blocked return fixture'}}),{status:409,headers:{'content-type':'application/json'}}))})
        :original(url,options);
    });
    await dialog.getByRole('button',{name:tr('staff.return.confirm'),exact:true}).click();
    await expect(close).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__testPosts.length),1);
    await page.evaluate(()=>window.__releaseTestReturn());await expect(close).toBeEnabled();
    await page.keyboard.press('Escape');await expect(opener).toBeFocused();
  });
}
for(const language of ['en','ar'])test(`${language}: tablet sticky filters and Details anchors clear the wrapped header`,async(t)=>{
  const{page,goto,tr}=await fixture(t,language,language==='ar'?'dark':'light',1024);
  await goto('/student/catalog');await page.locator('.discovery-filters').waitFor();
  await page.evaluate(()=>scrollTo({top:650,behavior:'instant'}));
  assert.equal(await page.locator('.discovery-filters').evaluate(n=>n.getBoundingClientRect().top>=document.querySelector('.student-shell__header').getBoundingClientRect().bottom+4),true);
  await goto('/student/items/audit-item-1');
  await page.getByRole('navigation',{name:tr('discovery.detail.sections'),exact:true}).getByRole('link',{name:tr('discovery.detail.availabilityTitle'),exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:tr('discovery.detail.availabilityTitle'),exact:true})).toBeFocused();
  assert.equal(await page.locator('.availability-panel h2').evaluate(n=>n.getBoundingClientRect().top>=document.querySelector('.student-shell__header').getBoundingClientRect().bottom+4),true);
});
