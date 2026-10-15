import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,access} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

if(!process.env.SITE_NAVIGATION_ROOT)throw new Error('Set SITE_NAVIGATION_ROOT to the built static website directory.');
const root=resolve(process.env.SITE_NAVIGATION_ROOT);
let browser,server,base;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/index.html`;
 let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
 if(!executablePath)try{await access(chromium.executablePath());}catch{executablePath='/usr/bin/chromium';}
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());});
async function pageFor(t,fragment='',language='en'){
 const context=await browser.newContext();await context.addInitScript(language=>localStorage.setItem('material-file-encryptor.site.messages',JSON.stringify({language,emoji:false,funnyEnglish:5,funnyCantonese:5})),language);t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>console.error(error.message));
 await page.goto(base+fragment);await page.waitForSelector('[data-site-search="settings"]',{state:'attached'});
 await page.waitForFunction(()=>!!document.querySelector('mfe-workspace-shell')?.shadowRoot);
 return page;
}
async function overview(page){if(await page.locator('#page-tools-panel').isHidden())await page.locator('#page-tools-toggle').click();await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('overview').hidden);}

test('same-document links reveal repeated and encoded fragments with native history and keyboard focus',async t=>{
 const page=await pageFor(t);
 await page.locator('#navigation a[href="#security"]').click();
 await page.waitForFunction(()=>location.hash==='#security'&&!document.getElementById('security').hidden);
 await overview(page);
 await page.locator('#navigation a[href="#security"]').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!document.getElementById('security').hidden&&document.activeElement.id==='security');
 await page.locator('#navigation a[href="#workflow"]').click();
 await page.goBack();await page.waitForFunction(()=>location.hash==='#security'&&!document.getElementById('security').hidden);
 await page.goForward();await page.waitForFunction(()=>location.hash==='#workflow'&&!document.getElementById('workflow').hidden);
 await page.locator('#navigation a[href="#security"]').evaluate(a=>a.href='#%73ecurity');
 await page.locator('#navigation a[href="#%73ecurity"]').click();
 await page.waitForFunction(()=>location.hash==='#%73ecurity'&&!document.getElementById('security').hidden);
 assert.equal(await page.locator('#security').isVisible(),true);
});

test('anchor activation ignores modified, external, download and targeted clicks and malformed hashes',async t=>{
 const page=await pageFor(t,'#security');await overview(page);
 const observations=await page.evaluate(()=>{
  const link=document.querySelector('#navigation a[href="#security"]'),values=[];
  const stop=event=>event.preventDefault();document.addEventListener('click',stop);
  for(const init of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]){link.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,cancelable:true,button:0,...init}));values.push(document.getElementById('security').hidden);}
  for(const [name,value]of [['target','_blank'],['download','security.html'],['href','https://example.com/#security'],['href','#%ZZ']]){const original=link.getAttribute(name);link.setAttribute(name,value);link.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,cancelable:true,button:0}));values.push(document.getElementById('security').hidden);original===null?link.removeAttribute(name):link.setAttribute(name,original);}
  document.removeEventListener('click',stop);return values;
 });
 assert.ok(observations.every(Boolean));
});

test('preference search finds Cantonese labels and renders localized results and empty feedback',async t=>{
 const page=await pageFor(t);
 await page.locator('#preferences-open').click();
 const input=page.locator('[data-site-search="settings"]').getByRole('textbox',{name:'Search website preferences',exact:true});
 await input.fill('主題');
 await page.waitForFunction(()=>document.querySelector('.site-setting-results').textContent.includes('Theme'));
 assert.equal(await page.locator('.site-setting-results md-text-button').count(),1);
 assert.equal(await page.locator('.site-setting-results md-text-button').innerText(),'Theme');
 await input.fill('no-such-preference-482');
 await page.waitForFunction(()=>document.querySelector('.site-setting-results').textContent.includes('No matching preferences'));
 assert.equal(await page.locator('.site-setting-results md-text-button').count(),0);
 assert.equal(await page.locator('label[for="doc-search"]').isVisible(),false);
});

for(const language of ['yue','bilingual'])test(`preference results follow persisted ${language} language`,async t=>{
 const page=await pageFor(t,'',language);await page.locator('#preferences-open').click();
 const input=page.locator('[data-site-search="settings"]').getByRole('textbox').first();await input.fill('Theme');
 await page.waitForFunction(()=>document.querySelector('.site-setting-results').textContent.includes('主題'));
 assert.equal(await page.locator('.site-setting-results md-text-button').innerText(),language==='yue'?'主題':'Theme · 主題');
 await input.fill('no-such-preference-482');await page.waitForFunction(()=>document.querySelector('.site-setting-results').textContent.includes('搵唔到符合'));
});

test('Page tools keeps commands, new-tab shortcut, Home and notification surfaces available',async t=>{
 const page=await pageFor(t);assert.equal(await page.locator('#page-tools-panel').isVisible(),false);
 await page.keyboard.press('Control+Shift+f');await page.getByRole('dialog',{name:'Command palette',exact:true}).waitFor({state:'visible'});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.keyboard.press('Control+t');await page.waitForFunction(()=>!document.getElementById('page-tools-panel').hidden);
 await page.keyboard.press('Escape');
 await page.locator('mfe-workspace-shell').getByRole('button',{name:'Home',exact:true}).click();
 await page.locator('#page-tools-toggle').click();assert.equal(await page.locator('.home-view').isVisible(),true);
 assert.equal(await page.locator('mfe-live-notification').evaluate(node=>node.closest('#page-tools-panel')===null),true);
 assert.equal(await page.locator('mfe-notification-center').evaluate(node=>node.closest('#page-tools-panel')===null),true);
});

test('filtered guide fragments restore disclosure and focus, including registered anchor internals',async t=>{
 const page=await pageFor(t,'#documentation');
 await page.locator('[data-site-search="content"]').getByRole('textbox').first().fill('no-guide-matches-482');
 await page.waitForFunction(()=>document.getElementById('guide-offline').hidden);
 await page.locator('#navigation a[href="#security"]').click();
 await page.locator('#security a[href="#guide-credentials"]').click();
 await page.waitForFunction(()=>!document.getElementById('guide-credentials').hidden&&document.getElementById('guide-credentials').open&&document.activeElement.id==='guide-credentials');
 assert.equal(await page.locator('[data-site-search="content"]').getByRole('textbox').first().inputValue(),'');
 await page.evaluate(async()=>{const link=document.createElement('md-outlined-button');link.href='#%73ecurity';link.textContent='Security component link';link.id='test-shadow-anchor';document.body.prepend(link);await link.updateComplete;});
 await page.locator('#test-shadow-anchor').click();await page.waitForFunction(()=>!document.getElementById('security').hidden&&document.activeElement.id==='security');
});
