import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {matrix,makeClearPlan,layoutExpression} from '../scripts/modern-ui-check.mjs';
import { fileURLToPath } from 'node:url';
import { openRendererBrowser } from '../scripts/test-renderer-browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/renderer');
const executable = process.env.CHROMIUM_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined);
// This isolated bridge tests renderer behavior only. Real native-drive evidence is separate.
async function fixture(page) {
 await page.addInitScript(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  window.calls = [];
  window.testState = {locked:true,mounted:false,storageDir:'',cacheDir:'C:\\EncryptedCache',driveLetter:'M:',partSizeBytes:10485760,availableDriveLetters:['M:','N:'],files:[],driver:{available:true},startup:true,autoUnlock:false,sync:{running:false},defaults:{cacheDir:'C:\\EncryptedCache',driveLetter:'M:'}};
  let subscriber = () => {};
  const record = (name,value) => { window.calls.push({name,value}); };
  const change = patch => { Object.assign(window.testState,patch); subscriber(clone(window.testState)); return clone(window.testState); };
  window.pushState = change;
  window.drive = {
   history: async () => [{id:'version-1',entryId:'file-1',path:'notes.txt',timestampUtc:'2026-01-01',length:4096,isDirectory:false,deleted:false,isAvailable:true}], recycled: async () => [{id:'deleted-1',entryId:'file-2',path:'deleted.txt',timestampUtc:'2026-01-01',length:20,isDirectory:false,deleted:true,isAvailable:true}], saveVersion:async()=>record('saveVersion'),restoreVersion:async id=>record('restoreVersion',id),restoreDeleted:async ids=>record('restoreDeleted',ids),emptyRecycleBin:async()=>record('emptyRecycleBin'),setHistoryRetention:async value=>{record('setHistoryRetention',value);return change({preferences:{historyRetentionDays:value}});},
   status: async () => clone(window.testState), onStatus: callback => { subscriber = callback; return () => {}; },
   chooseFolder: async kind => kind === 'cache' ? 'C:\\EncryptedCache' : 'C:\\EncryptedStorage', chooseFiles:async () => ['C:\\Import\\notes.txt'],chooseExport:async () => 'C:\\Export\\notes.txt',chooseKeyFile:async () => 'C:\\Keys\\test.key',generateKeyFile:async () => 'C:\\Keys\\generated.key',
   upgrade:async value => {record('upgrade',value);return change({...value,storageFormat:2,locked:false,mounted:true});},
   create:async value => { record('create',value); return change({...value,locked:false,mounted:true}); },unlock:async value => { record('unlock',value); return change({...value,locked:false,mounted:true}); },
   lock:async () => { record('lock'); if (window.blockLock) throw new Error('Close open files before locking the drive.'); return change({locked:true,mounted:false,files:[]}); },
   mount:async value => { record('mount',value); return change({mounted:true}); },
   importFiles:async value => { record('importFiles',value); return change({files:[{id:'file-1',path:'notes.txt',size:4096,modified:'2026-01-01',partCount:1,partSizeBytes:10485760,offline:false}]}); },
   open:async id => record('open',id), openExplorer:async () => record('openExplorer'),exportFile:async value => record('exportFile',value),
   keepOffline:async id => {record('keepOffline',id);window.testState.files.find(file => file.id === id).offline=true;return change({});},releaseOffline:async id => {record('releaseOffline',id);const file=window.testState.files.find(file => file.id === id);file.offline=false;return change({lastOfflineRelease:{path:file.path,bytesFreed:window.releaseBytes ?? 4096}});},
   sync:async () => {record('sync');return change({sync:{running:false,lastSync:'2026-01-01'}});},setPartSize:async value => {record('setPartSize',value);return change({partSizeBytes:value});},resplit:async () => record('resplit'),
   setStartup:async value => {record('setStartup',value);return change({startup:value});},setAutoUnlock:async value => {record('setAutoUnlock',value);return change({autoUnlock:value});},forgetSavedCredential:async () => {record('forgetSavedCredential');return change({autoUnlock:false});},windowControl:async value => record('windowControl',value),openExternal:async value => record('openExternal',value)
  };
 });
}
// Include bounded hidden-desktop launch and independent process-exit proof.
test('real renderer interactions, error states, keyboard dialogs and responsive layouts', {timeout:120000}, async t => {
 if (executable) { try { await fs.access(executable); } catch { return t.skip('Set CHROMIUM_PATH to an installed Chromium executable.'); } }
 const server = createServer(async (request,response) => {
  const name = new URL(request.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^[a-z0-9.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await fs.readFile(path.join(root,name))); } catch { response.writeHead(404).end(); }
 });
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser = await openRendererBrowser(`http://127.0.0.1:${server.address().port}/`);
  const page = browser.page; await page.setViewportSize({width:1440,height:900}); await fixture(page);
  const errors = []; page.on('pageerror',error => {errors.push(error.message);console.error(error.message);});
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#vault-badge').textContent !== 'Checking drive…');
  assert.equal(await page.locator('#vault-badge').textContent(),'Locked'); assert.equal(await page.locator('#file-list tr').count(),0);
  await page.click('[data-view=help]');await page.click('#project-website-link');assert.equal(await page.evaluate(() => window.calls.find(call => call.name === 'openExternal').value),'https://ding-ding-projects.github.io/material-file-encryptor/');await page.click('[data-view=drive]');
  await page.evaluate(() => window.pushState({availableDriveLetters:[],driver:{available:false,checking:true}}));
  await page.click('#create-button');assert.match(await page.locator('#drive-letter-status').textContent(),/Checking available drive letters/);
  assert.equal(await page.locator('#dialog-submit').isDisabled(),true);assert.equal(await page.locator('#driver-notice').isVisible(),false);
  await page.fill('#password-input','entry survives discovery');
  await page.evaluate(() => window.pushState({availableDriveLetters:['M:','N:'],driver:{available:true,checking:false}}));
  assert.equal(await page.locator('#drive-letter').inputValue(),'M:');assert.equal(await page.locator('#dialog-submit').isEnabled(),true);
  assert.equal(await page.locator('#password-input').inputValue(),'entry survives discovery');assert.equal(await page.locator('#password-input').evaluate(el => el===document.activeElement),true);
  await page.fill('#drive-letter','N:');await page.evaluate(() => window.pushState({availableDriveLetters:['L:','M:','N:']}));
  assert.equal(await page.locator('#drive-letter').inputValue(),'N:','ready status must preserve a chosen available letter');
  await page.fill('#drive-letter','M:');assert.equal(await page.locator('#cache-input').inputValue(),'C:\\EncryptedCache');

  // Clear every editable field without submitting, exposing credentials, or losing focus.
  for (const id of ['storage-input','cache-input','drive-letter','password-input','confirm-password','create-split-value']) {
   const input = page.locator('#'+id), clear = input.locator('..').locator('.field-clear');
   await input.fill(id==='drive-letter'?'N:':'sample value');
   const bounds = await clear.boundingBox(); assert.ok(bounds.width>=44 && bounds.height>=44);
   assert.equal(await clear.getAttribute('type'),'button');
   await clear.focus(); await page.keyboard.press('Enter');
   assert.equal(await input.inputValue(),'');
   assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  }
  assert.equal(await page.evaluate(()=>window.calls.some(call=>call.name==='create')),false);
  assert.equal(await page.locator('#password-input').getAttribute('type'),'password');
  await page.fill('#cache-input','C:\\EncryptedCache'); await page.fill('#drive-letter','M:');
  await page.click('[data-browse="storage-input"]'); await page.fill('#password-input','correct horse battery staple');await page.fill('#confirm-password','wrong');await page.click('#dialog-submit');assert.match(await page.locator('#dialog-error').textContent(),/do not match/);
  await page.locator('[name=credential-mode][value=password]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[name=credential-mode][value=keyFile]').isChecked(),true);
  assert.equal(await page.locator('[name=credential-mode][value=keyFile]').evaluate(el => el.matches(':focus-visible')),true);
  await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('[name=credential-mode][value=password]').isChecked(),true);
  await page.check('[name=credential-mode][value=keyFile]'); await page.click('#generate-key');assert.equal(await page.locator('#key-path').inputValue(),'C:\\Keys\\generated.key');
  await page.fill('#create-split-value','0.5');await page.selectOption('#create-split-unit','KB');await page.click('#dialog-submit');assert.match(await page.locator('#dialog-error').textContent(),/between 1 KiB and 90,000,000/);
  await page.fill('#create-split-value','10');await page.selectOption('#create-split-unit','MB');await page.click('#dialog-submit');await page.waitForFunction(() => !document.querySelector('#vault-dialog').open);
  const create = await page.evaluate(() => window.calls.find(call => call.name === 'create').value); assert.equal(create.keyFilePath,'C:\\Keys\\generated.key');assert.equal(Object.hasOwn(create,'password'),false);assert.equal(create.partSizeBytes,10485760);
  await page.click('[data-view=history]');await page.waitForSelector('#history-list tr');
  assert.match(await page.locator('#history-list').textContent(),/notes.txt/);
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   for(const language of ['en','yue','bilingual']) {
    await page.click('[data-view=settings]');await page.selectOption('#language-setting',language);
    for(const destination of ['history','recycle']) {
     await page.click(`[data-view=${destination}]`);
     const geometry=await page.locator(`#view-${destination} th:first-child`).evaluate(el=>{
      const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()];
      const style=getComputedStyle(el);return {lines:new Set(rects.map(rect=>rect.top)).size,width:el.getBoundingClientRect().width,textWidth:range.getBoundingClientRect().width,padding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),whiteSpace:style.whiteSpace,overflowWrap:style.overflowWrap};
     });
     assert.equal(geometry.lines,1,`${destination} ${language} ${width} selection heading stays on one line`);
     assert.ok(geometry.width>=geometry.textWidth+geometry.padding-1,`${destination} ${language} ${width} has room for heading and padding`);
     assert.equal(geometry.whiteSpace,'nowrap');assert.equal(geometry.overflowWrap,'normal');
    }
   }
  }
  await page.setViewportSize({width:1440,height:900});await page.click('[data-view=settings]');await page.selectOption('#language-setting','en');await page.click('[data-view=history]');
  await page.selectOption('#history-retention','custom');
  await page.locator('#history-days').locator('..').locator('.field-clear').click();
  assert.equal(await page.locator('#history-days').inputValue(),'');
  await page.click('#history-retention-apply');
  assert.match(await page.locator('#main-error-text').textContent(),/1 to 36500/);
  await page.click('#dismiss-error');
  const historyQuery=page.locator('#history-search-host input[type=search]');
  await historyQuery.fill('missing-entry');await page.waitForFunction(()=>document.querySelectorAll('#history-list tr').length===0);
  await historyQuery.locator('..').locator('.field-clear').click();await page.waitForSelector('#history-list tr');
  await page.evaluate(()=>{const field=document.querySelector('#history-days');field.readOnly=true;});
  await page.waitForFunction(()=>document.querySelector('#history-days').parentElement.querySelector('.field-clear').disabled);
  await page.evaluate(()=>{const field=document.querySelector('#history-days');field.readOnly=false;});
  await page.click('#save-version');await page.waitForFunction(()=>window.calls.some(call=>call.name==='saveVersion'));
  await page.selectOption('#history-retention','30');await page.click('#history-retention-apply');await page.waitForFunction(()=>window.calls.some(call=>call.name==='setHistoryRetention'&&call.value===30));
  await page.click('#history-list button');await page.click('#confirm-action');await page.waitForFunction(()=>window.calls.some(call=>call.name==='restoreVersion'&&call.value==='version-1'));
  await page.click('[data-view=recycle]');await page.waitForSelector('#recycle-list input');await page.check('#recycle-list input');await page.click('#restore-recycled');await page.waitForFunction(()=>window.calls.some(call=>call.name==='restoreDeleted'&&call.value[0]==='deleted-1'));
  await page.click('#empty-recycle');assert.match(await page.locator('#confirm-description').textContent(),/history is retained/);await page.click('#confirm-action');await page.waitForFunction(()=>window.calls.some(call=>call.name==='emptyRecycleBin'));
  await page.click('[data-view=drive]');
  await page.evaluate(()=>window.pushState({storageFormat:2}));assert.equal(await page.locator('#upgrade-vault').isVisible(),false);
  await page.evaluate(()=>window.pushState({storageFormat:1}));assert.equal(await page.locator('#upgrade-vault').isVisible(),true);
  await page.click('#upgrade-vault');assert.equal(await page.locator('#storage-input').inputValue(),'');assert.equal(await page.locator('#cache-input').inputValue(),'');assert.match(await page.locator('#dialog-description').textContent(),/original vault is preserved/);
  await page.fill('#storage-input','C:\\UpgradedStorage');await page.fill('#cache-input','C:\\UpgradedCache');await page.fill('#password-input','new copy credential');await page.fill('#confirm-password','new copy credential');await page.click('#dialog-submit');await page.waitForFunction(()=>window.calls.some(call=>call.name==='upgrade'));await page.waitForFunction(()=>!document.querySelector('#vault-dialog').open);assert.equal(await page.locator('#upgrade-vault').isVisible(),false);
  await page.click('#explorer-button');await page.click('#import-button');await page.waitForSelector('#file-list tr');await page.check('#file-list input');await page.keyboard.press('Enter');
  await page.click('#offline-button');await page.waitForFunction(() => document.querySelector('#offline-count').textContent === '1');
  await page.click('[data-view=offline]');assert.equal(await page.locator('#file-list tr').count(),1);
  await page.click('#release-button');assert.equal(await page.locator('#confirm-dialog button[value=cancel]').evaluate(el => document.activeElement === el),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#confirm-dialog').evaluate(el => el.open),false);
  await page.click('[data-view=drive]');await page.click('#release-button');await page.click('#confirm-action');
  await page.waitForFunction(() => document.querySelector('#snackbar').textContent.includes('Released 4 KB of encrypted cache'));
  assert.match(await page.locator('#snackbar').textContent(),/Protected data is retained/);
  await page.click('#offline-button');await page.evaluate(() => { window.releaseBytes=0; });
  await page.click('[data-view=settings]');await page.selectOption('#language-setting','yue');await page.click('[data-view=drive]');
  await page.click('#release-button');await page.click('#confirm-action');
  await page.waitForFunction(() => document.querySelector('#snackbar').textContent.includes('未有釋放加密快取'));
  assert.match(await page.locator('#snackbar').textContent(),/繼續加密保留/);
  assert.equal(await page.locator('#offline-count').textContent(),'0');
  await page.click('[data-view=settings]');await page.selectOption('#language-setting','en');await page.click('[data-view=drive]');
  await page.click('#resplit-button');assert.equal(await page.evaluate(() => window.calls.some(call => call.name === 'resplit')),false);await page.click('#confirm-action');await page.waitForFunction(() => window.calls.some(call => call.name === 'resplit'));
  await page.evaluate(() => window.pushState({files:[{id:'unsafe',path:'<img src=x onerror=alert(1)>.txt',size:12,modified:'2026-01-01',offline:false}]}));assert.equal(await page.locator('#file-list img').count(),0);assert.match(await page.locator('#file-list').textContent(),/<img src=x/);
  await page.evaluate(() => { window.blockLock = true; });await page.click('#lock-button');await page.waitForSelector('#main-error:not([hidden])');assert.match(await page.locator('#main-error').textContent(),/Close open files/);assert.equal(await page.locator('#vault-badge').textContent(),'Mounted');
  await page.evaluate(() => window.pushState({locked:false,mounted:false}));await page.click('#mount-button');await page.waitForFunction(() => window.calls.some(call => call.name === 'mount'));
  await page.click('[data-view=settings]');await page.uncheck('#startup-setting');await page.waitForFunction(() => window.calls.some(call => call.name === 'setStartup' && call.value === false));
  await page.check('#auto-unlock-setting');await page.click('#confirm-action');await page.waitForFunction(() => window.calls.some(call => call.name === 'setAutoUnlock' && call.value === true));await page.click('#forget-credential');
  await page.selectOption('#theme-setting','dark');await page.selectOption('#language-setting','bilingual');await page.reload();await page.waitForFunction(() => document.querySelector('#vault-badge').textContent !== 'Checking drive…');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.match(await page.locator('#project-website-link').textContent(),/Project website · 項目網站/);
  assert.match(await page.locator('#password-input').locator('..').locator('.field-clear').getAttribute('aria-label'),/Clear field · 清除欄位/);
  assert.match(await page.locator('#history-days').locator('..').locator('.field-clear').getAttribute('aria-label'),/Custom days · 自訂日數/);
  const coverage=await page.evaluate(()=>[...document.querySelectorAll('input')].filter(el=>['text','search','password','number'].includes(el.type)).map(el=>({id:el.id,type:el.type,count:el.parentElement.querySelectorAll('.field-clear').length})));
  assert.equal(coverage.length,13);assert.ok(coverage.every(field=>field.count===1));
  // Future dynamic multiline fields use the same event and disabled/read-only contract.
  await page.evaluate(()=>{const field=document.createElement('textarea');field.id='test-multiline';field.setAttribute('aria-label','Notes');field.value='first\nsecond';window.clearEvents=[];for(const type of ['input','change'])field.addEventListener(type,event=>window.clearEvents.push(event.type));document.body.append(field);});
  const multiline=page.locator('#test-multiline'), multilineClear=multiline.locator('..').locator('.field-clear');
  await multilineClear.click();assert.equal(await multiline.inputValue(),'');assert.deepEqual(await page.evaluate(()=>window.clearEvents),['input','change']);
  await multiline.evaluate(el=>{el.disabled=true;});await page.waitForFunction(()=>document.querySelector('#test-multiline').parentElement.querySelector('.field-clear').disabled);
  await multiline.evaluate(el=>el.parentElement.remove());
  for (const width of [1440,768,390]) {
   await page.setViewportSize({width,height:720});
   for (const theme of ['light','dark']) {
    await page.click('[data-view=settings]');await page.selectOption('#theme-setting',theme);
    await page.locator('#theme-setting').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#theme-setting').evaluate(el => el.matches(':open')),true);await page.keyboard.press('Escape');
    const prior = Number(await page.locator('#celebration-setting').inputValue());await page.locator('#celebration-setting').focus();await page.keyboard.press('ArrowRight');
    assert.equal(Number(await page.locator('#celebration-output').textContent()),prior+1);
    await page.click('[data-view=drive]');await page.click('#create-button');await page.locator('#create-split-value').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#vault-dialog .dialog-body').evaluate(el => el.scrollTop > 0),true);
    assert.equal(await page.locator('#dialog-submit').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight),true);
    await page.locator('[name=credential-mode][value=password]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[name=credential-mode][value=keyFile]').isChecked(),true);
    await page.click('#dialog-cancel');
    for (const destination of ['settings','drive','help']) { await page.click(`[data-view=${destination}]`);assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${destination} ${width} ${theme} must not overflow`); }
   }
  }
  await page.click('[data-view=drive]');await page.click('#create-button');await page.setViewportSize({width:768,height:400});
  await page.locator('#dialog-cancel').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.equal(await page.evaluate(() => document.querySelector('#vault-dialog').contains(document.activeElement)),true);
  assert.equal(await page.locator('#dialog-submit').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight),true,'short viewport keeps dialog actions visible');
  await page.keyboard.press('Escape');await page.setViewportSize({width:720,height:450});await page.evaluate(() => {document.documentElement.style.zoom='2';});assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'200% zoom has no page overflow');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.view:not([hidden])').evaluate(el => getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
 } catch(error) { console.error('Renderer assertion failed:',error.message); throw error;
 } finally { try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); } }
});

// This isolated DOM regression does not claim native-drive or installed acceptance.
test('scoped clear-control selectors use their actual owning wrappers', {timeout:90000}, async () => {
 const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(),'mfe-scoped-clear-proof-'));
 const proof = {version:1,scope:'Actual renderer DOM selector regression',cases:[],passed:false};
 for (const name of ['scoped-search.js','clear-fields.js']) proof[name] = createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');
 const server = createServer(async (request,response) => {
  const name = new URL(request.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^[a-z0-9.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await fs.readFile(path.join(root,name))); } catch { response.writeHead(404).end(); }
 });
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 let browser,primaryError;
 try {
  const url = `http://127.0.0.1:${server.address().port}/`;
  browser = await openRendererBrowser(url,{evidenceRoot:path.join(evidenceRoot,'owned-closure')});
  const page = browser.page; await page.setViewportSize({width:1180,height:850}); await fixture(page);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#vault-badge').textContent !== 'Checking drive…');
  await page.evaluate(() => window.pushState({locked:false,mounted:true,storageFormat:2}));
  const plan = makeClearPlan({launch:{outputRoot:path.join(evidenceRoot,'output'),cdp:{port:9333,expectedUrl:'file:///fixture/index.html'}},receipt:path.join(evidenceRoot,'lifecycle.json'),phase:'workspace',tuple:matrix[0]});
  const eligible = async selector => {
   const target = page.locator(selector);
   assert.equal(await target.count(),1,'Exactly one target is required');
   assert.equal(await target.isVisible(),true,'Target must be visible');
   assert.equal(await target.isEnabled(),true,'Target must be enabled');
   return target;
  };
  for (const id of ['clear-file-search','clear-part-size']) {
   const step = plan.steps.find(item => item.id === id+'-clear');
   await eligible(step.selector); proof.cases.push({id,simpleIdPreserved:true});
  }
  for (const view of ['history','recycle']) {
   await page.click(`[data-view="${view}"]`);
   await page.waitForFunction(kind => {const s=document.querySelector('#view-'+kind).dataset;return s.archiveState==='ready' && s.archiveCompletedRequest===s.archiveRequest && s.archiveRendered===s.archiveRender;},view);
   const id = `clear-${view}-search`;
   const input = plan.steps.find(item => item.id === id+'-enter');
   const click = plan.steps.find(item => item.id === id+'-clear');
   const empty = plan.steps.find(item => item.id === id+'-empty-focused');
   const measure = plan.steps.find(item => item.id === id+'-measure');
   const oldField = `.clearable-field:has(${input.selector})`;
   assert.equal(await page.locator(oldField+' > .field-clear').count(),0,'Original query must reproduce zero matches');
   await assert.rejects(page.evaluate(layoutExpression(oldField)));
   const target = await eligible(click.selector);
   await assert.rejects(eligible(click.selector.replace(`#${view}-search-host`,'#missing-search-host')));
   await page.locator(input.selector).evaluate(el => {el.disabled=true;});
   await page.waitForFunction(selector => document.querySelector(selector).disabled,click.selector);
   await assert.rejects(eligible(click.selector));
   await page.locator(input.selector).evaluate(el => {el.disabled=false;});
   await page.waitForFunction(selector => !document.querySelector(selector).disabled,click.selector);
   await target.evaluate(el => {el.hidden=true;}); await assert.rejects(eligible(click.selector)); await target.evaluate(el => {el.hidden=false;});
   await target.evaluate(el => {const duplicate=el.cloneNode(true);duplicate.dataset.selectorDuplicate='true';el.parentElement.append(duplicate);});
   assert.equal(await page.locator(click.selector).count(),2); await assert.rejects(eligible(click.selector));
   await page.locator('[data-selector-duplicate]').evaluate(el => el.remove());
   await page.locator(input.selector).fill(input.text);
   assert.ok((await page.locator(input.selector).inputValue()).length>0);
   await (await eligible(click.selector)).click();
   await page.waitForFunction(empty.expression);
   const measurement = await page.evaluate(measure.expression);
   assert.equal(measurement.matchedCount,1);assert.equal(measurement.fields.length,1);assert.equal(measurement.fields[0].buttonCount,1);
   const imagePath=path.join(evidenceRoot,view+'.png');await page.screenshot({path:imagePath});
   proof.cases.push({id,oldMatchCount:0,newMatchCount:1,wrongHostRejected:true,duplicateRejected:true,hiddenRejected:true,disabledRejected:true,emptyAndFocused:true,measurementMatchCount:measurement.matchedCount,imageSha256:createHash('sha256').update(await fs.readFile(imagePath)).digest('hex')});
   await fs.writeFile(path.join(evidenceRoot,'dom-proof.json'),JSON.stringify(proof,null,2));
  }
  proof.domPassed=true;
 } catch(error) {primaryError=error;throw error;} finally {
  let cleanupVerified=false;
  try { proof.ownedClosure=await browser?.close(); cleanupVerified=Boolean(browser); } catch(closureError) {if(primaryError)throw new AggregateError([primaryError,closureError],'DOM assertion and owned closure both failed.');throw closureError;} finally {
   proof.cleanupVerified=cleanupVerified;proof.passed=proof.domPassed===true && cleanupVerified;
   await new Promise(resolve => server.close(resolve));
   await fs.writeFile(path.join(evidenceRoot,'dom-proof.json'),JSON.stringify(proof,null,2));
   console.log(JSON.stringify({scope:proof.scope,evidenceRoot,passed:proof.passed}));
  }
 }
});
