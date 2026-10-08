import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
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
   status: async () => clone(window.testState), onStatus: callback => { subscriber = callback; return () => {}; },
   chooseFolder: async kind => kind === 'cache' ? 'C:\\EncryptedCache' : 'C:\\EncryptedStorage', chooseFiles:async () => ['C:\\Import\\notes.txt'],chooseExport:async () => 'C:\\Export\\notes.txt',chooseKeyFile:async () => 'C:\\Keys\\test.key',generateKeyFile:async () => 'C:\\Keys\\generated.key',
   create:async value => { record('create',value); return change({...value,locked:false,mounted:true}); },unlock:async value => { record('unlock',value); return change({...value,locked:false,mounted:true}); },
   lock:async () => { record('lock'); if (window.blockLock) throw new Error('Close open files before locking the drive.'); return change({locked:true,mounted:false,files:[]}); },
   mount:async value => { record('mount',value); return change({mounted:true}); },
   importFiles:async value => { record('importFiles',value); return change({files:[{id:'file-1',path:'notes.txt',size:4096,modified:'2026-01-01',partCount:1,partSizeBytes:10485760,offline:false}]}); },
   open:async id => record('open',id), openExplorer:async () => record('openExplorer'),exportFile:async value => record('exportFile',value),
   keepOffline:async id => {record('keepOffline',id);window.testState.files.find(file => file.id === id).offline=true;return change({});},releaseOffline:async id => {record('releaseOffline',id);window.testState.files.find(file => file.id === id).offline=false;return change({});},
   sync:async () => {record('sync');return change({sync:{running:false,lastSync:'2026-01-01'}});},setPartSize:async value => {record('setPartSize',value);return change({partSizeBytes:value});},resplit:async () => record('resplit'),
   setStartup:async value => {record('setStartup',value);return change({startup:value});},setAutoUnlock:async value => {record('setAutoUnlock',value);return change({autoUnlock:value});},forgetSavedCredential:async () => {record('forgetSavedCredential');return change({autoUnlock:false});},windowControl:async value => record('windowControl',value),openExternal:async value => record('openExternal',value)
  };
 });
}
test('real renderer interactions, error states, keyboard dialogs and responsive layouts', {timeout:60000}, async t => {
 if (executable) { try { await fs.access(executable); } catch { return t.skip('Set CHROMIUM_PATH to an installed Chromium executable.'); } }
 const server = createServer(async (request,response) => {
  const name = new URL(request.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^[a-z0-9.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await fs.readFile(path.join(root,name))); } catch { response.writeHead(404).end(); }
 });
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 const browser = await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:900}}); await fixture(page);
  const errors = []; page.on('pageerror',error => {errors.push(error.message);console.error(error.message);});
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => document.querySelector('#vault-badge').textContent !== 'Checking drive…');
  assert.equal(await page.locator('#vault-badge').textContent(),'Locked'); assert.equal(await page.locator('#file-list tr').count(),0);
  await page.click('[data-view=help]');await page.click('#project-website-link');assert.equal(await page.evaluate(() => window.calls.find(call => call.name === 'openExternal').value),'https://ding-ding-projects.github.io/material-file-encryptor/');await page.click('[data-view=drive]');
  await page.click('#create-button'); assert.equal(await page.locator('#cache-input').inputValue(),'C:\\EncryptedCache'); assert.equal(await page.locator('#drive-letter').inputValue(),'M');
  await page.click('[data-browse="storage-input"]'); await page.fill('#password-input','correct horse battery staple');await page.fill('#confirm-password','wrong');await page.click('#dialog-submit');assert.match(await page.locator('#dialog-error').textContent(),/do not match/);
  await page.check('[name=credential-mode][value=keyFile]'); await page.click('#generate-key');assert.equal(await page.locator('#key-path').inputValue(),'C:\\Keys\\generated.key');
  await page.fill('#create-split-value','0.5');await page.selectOption('#create-split-unit','KB');await page.click('#dialog-submit');assert.match(await page.locator('#dialog-error').textContent(),/between 1 KB and 1 GB/);
  await page.fill('#create-split-value','10');await page.selectOption('#create-split-unit','MB');await page.click('#dialog-submit');await page.waitForFunction(() => !document.querySelector('#vault-dialog').open);
  const create = await page.evaluate(() => window.calls.find(call => call.name === 'create').value); assert.equal(create.keyFilePath,'C:\\Keys\\generated.key');assert.equal(Object.hasOwn(create,'password'),false);assert.equal(create.partSizeBytes,10485760);
  await page.click('#explorer-button');await page.click('#import-button');await page.waitForSelector('#file-list tr');await page.check('#file-list input');await page.keyboard.press('Enter');
  await page.click('#offline-button');await page.waitForFunction(() => document.querySelector('#offline-count').textContent === '1');
  await page.click('[data-view=offline]');assert.equal(await page.locator('#file-list tr').count(),1);
  await page.click('#release-button');assert.equal(await page.locator('#confirm-dialog button[value=cancel]').evaluate(el => document.activeElement === el),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#confirm-dialog').evaluate(el => el.open),false);
  await page.click('[data-view=drive]');await page.click('#resplit-button');assert.equal(await page.evaluate(() => window.calls.some(call => call.name === 'resplit')),false);await page.click('#confirm-action');await page.waitForFunction(() => window.calls.some(call => call.name === 'resplit'));
  await page.evaluate(() => window.pushState({files:[{id:'unsafe',path:'<img src=x onerror=alert(1)>.txt',size:12,modified:'2026-01-01',offline:false}]}));assert.equal(await page.locator('#file-list img').count(),0);assert.match(await page.locator('#file-list').textContent(),/<img src=x/);
  await page.evaluate(() => { window.blockLock = true; });await page.click('#lock-button');await page.waitForSelector('#main-error:not([hidden])');assert.match(await page.locator('#main-error').textContent(),/Close open files/);assert.equal(await page.locator('#vault-badge').textContent(),'Mounted');
  await page.evaluate(() => window.pushState({locked:false,mounted:false}));await page.click('#mount-button');await page.waitForFunction(() => window.calls.some(call => call.name === 'mount'));
  await page.click('[data-view=settings]');await page.uncheck('#startup-setting');await page.waitForFunction(() => window.calls.some(call => call.name === 'setStartup' && call.value === false));
  await page.check('#auto-unlock-setting');await page.click('#confirm-action');await page.waitForFunction(() => window.calls.some(call => call.name === 'setAutoUnlock' && call.value === true));await page.click('#forget-credential');
  await page.selectOption('#theme-setting','dark');await page.selectOption('#language-setting','bilingual');await page.reload();await page.waitForFunction(() => document.querySelector('#vault-badge').textContent !== 'Checking drive…');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.match(await page.locator('#project-website-link').textContent(),/Project website · 項目網站/);
  for (const width of [1440,768,390]) {
   await page.setViewportSize({width,height:720});
   for (const theme of ['light','dark']) {
    await page.click('[data-view=settings]');await page.selectOption('#theme-setting',theme);
    for (const destination of ['settings','drive','help']) { await page.click(`[data-view=${destination}]`);assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${destination} ${width} ${theme} must not overflow`); }
   }
  }
  await page.click('[data-view=drive]');await page.click('#create-button');await page.setViewportSize({width:768,height:400});
  await page.locator('#dialog-cancel').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.equal(await page.evaluate(() => document.querySelector('#vault-dialog').contains(document.activeElement)),true);
  assert.equal(await page.locator('#dialog-submit').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight),true,'short viewport keeps dialog actions visible');
  await page.keyboard.press('Escape');await page.setViewportSize({width:720,height:450});await page.evaluate(() => {document.documentElement.style.zoom='2';});assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'200% zoom has no page overflow');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.view:not([hidden])').evaluate(el => getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
