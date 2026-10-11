// Real-component browser assertions. Synthetic fixture evidence is not native or packaged acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {openRendererBrowser,serveRendererFixture} from './test-renderer-browser.mjs';

export async function assertMenuBehavior(page,{host='mfe-context-menu',anchor='#acceptance-anchor',capture=async()=>{}}={}) {
 const menu=page.locator(host),input=menu.locator('mfe-search md-outlined-text-field').first();
 await page.evaluate(({host,anchor})=>{
  window.__acceptanceInvoked=[];
  const target=document.querySelector(anchor);
  document.querySelector(host).open({anchor:target,target,items:[{label:{en:'Alpha action',yue:'甲操作'},run:target=>window.__acceptanceInvoked.push(target.id)},{label:{en:'Beta action',yue:'乙操作'},run:target=>window.__acceptanceInvoked.push(target.id)}]});
 },{host,anchor});
 await input.waitFor({state:'visible'});
 await input.locator('input').focus();
 await page.evaluate(host=>{const menu=document.querySelector(host);window.__acceptanceSearch=menu.search;window.__acceptanceInput=menu.search.input;window.__acceptanceInner=menu.search.input.shadowRoot.querySelector('input');},host);
 await page.keyboard.type('Al');
 await page.waitForFunction(host=>document.querySelector(host).itemsHost.querySelectorAll('md-menu-item').length===1,host);
 assert.equal(await page.evaluate(()=>window.__acceptanceSearch.input===window.__acceptanceInput&&window.__acceptanceInput.shadowRoot.querySelector('input')===window.__acceptanceInner&&window.__acceptanceInner.getRootNode().activeElement===window.__acceptanceInner),true,'Filtering replaced or blurred the active search input');
 assert.equal(await input.evaluate(node=>node.value),'Al');
 await capture('menu-filtered');
 await menu.locator('mfe-search').locator('md-outlined-button').first().click();
 const builder=menu.locator('mfe-search .builder');await builder.waitFor({state:'visible'});
 await page.evaluate(host=>document.querySelector(host).renderItems(),host);
 assert.equal(await builder.isVisible(),true,'Filtering dismissed the regex builder');
 await capture('menu-builder');
 await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 assert.equal(await page.locator(anchor).evaluate(node=>node.getRootNode().activeElement===node),true,'Escape did not restore anchor focus');
 await page.evaluate(({host,anchor})=>{const menu=document.querySelector(host);window.__acceptanceMenuEvents=[];menu.open({anchor:document.querySelector(anchor),onClose:reason=>window.__acceptanceMenuEvents.push({type:'owner-close',reason}),items:[{label:'Alpha action',run:()=>window.__acceptanceInvoked.push('selected')}]});for(const type of ['click','closed','close-menu'])menu.addEventListener(type,event=>window.__acceptanceMenuEvents.push({type,hidden:menu.hidden,phase:event.eventPhase}),{capture:true});},{host,anchor});
 await capture('menu-action-ready');
 await menu.locator('md-menu-item').waitFor({state:'visible'});await menu.locator('md-menu-item').click();
 await menu.waitFor({state:'hidden'});await page.waitForFunction(()=>window.__acceptanceInvoked.includes('selected'));
 for(const key of ['Enter',' ']){
  await page.evaluate(({host,anchor})=>document.querySelector(host).open({anchor:document.querySelector(anchor),items:[{label:'Keyboard action',run:()=>window.__acceptanceInvoked.push('keyboard')}]}),{host,anchor});
  const item=menu.locator('md-menu-item');await item.waitFor({state:'visible'});await item.focus();
  const before=await page.evaluate(()=>window.__acceptanceInvoked.length);await page.keyboard.press(key);await menu.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__acceptanceInvoked.length),before+1,'Keyboard action did not execute exactly once');
 }
 await page.evaluate(({host,anchor})=>{const owner=document.querySelector(host);owner.open({anchor:document.querySelector(anchor),items:[{label:'Stale action',run:()=>window.__acceptanceInvoked.push('stale')}]});},{host,anchor});
 await menu.locator('md-menu-item').waitFor({state:'visible'});
 await page.evaluate(host=>{const owner=document.querySelector(host),item=owner.itemsHost.querySelector('md-menu-item');owner.close('test-stale');item.click();},host);
 assert.equal(await page.evaluate(()=>window.__acceptanceInvoked.includes('stale')),false);
 await page.evaluate(({host,anchor})=>{const target=document.querySelector(anchor);target.addEventListener('mfe-action-request',event=>event.preventDefault(),{once:true});document.querySelector(host).open({anchor:target,target,items:[{label:'Locked action',run:()=>window.__acceptanceInvoked.push('locked')}]});},{host,anchor});
 await menu.locator('md-menu-item').waitFor({state:'visible'});await menu.locator('md-menu-item').click();await menu.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.__acceptanceInvoked.includes('locked')),false);
 for(const reason of ['outside','resize','removed']){
  await page.evaluate(reason=>{window.__acceptanceStage=reason;},reason);
  await page.evaluate(({host,anchor})=>document.querySelector(host).open({anchor:document.querySelector(anchor),target:document.querySelector(anchor),items:[{label:'Action'}]}),{host,anchor});
  await menu.waitFor({state:'visible'});
  if(reason==='outside')await page.locator('body').click({position:{x:2,y:2}});
  if(reason==='resize'){const size=page.viewportSize();await page.setViewportSize({width:size.width+1,height:size.height});await menu.waitFor({state:'hidden'});await page.setViewportSize(size);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
  if(reason==='removed')await page.locator(anchor).evaluate(node=>node.remove());
  await menu.waitFor({state:'hidden'});
 }
 return {scope:'source-fixture',menuFocusPreserved:true,builderPreserved:true,dismissal:['escape','selection','outside','resize','target-removed'],actionEffect:true,keyboardExactlyOnce:true,staleItemRejected:true,lockedTargetRejected:true};
}

export async function runComponentAcceptance({evidenceRoot,runtime={}}) {
 assert.ok(path.isAbsolute(evidenceRoot));await fs.mkdir(evidenceRoot,{recursive:true});
 const index=await fs.readFile(new URL('../src/renderer/index.html',import.meta.url),'utf8');
 const csp=index.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)?.[0];assert.ok(csp,'Production CSP missing');
 const html=`<!doctype html><html><head><meta charset="utf-8">${csp}<script type="module" src="/acceptance-components.js"></script></head><body><md-outlined-button id="acceptance-anchor">Actions</md-outlined-button><md-outlined-button id="palette-anchor">Commands</md-outlined-button><form id="acceptance-form"><md-outlined-select label="Fixture choices"><md-select-option value="alpha"><span slot="headline">Alpha</span></md-select-option><md-select-option value="beta"><span slot="headline">Beta</span></md-select-option></md-outlined-select></form><mfe-command-palette></mfe-command-palette><mfe-file-picker label="Synthetic acceptance file"></mfe-file-picker></body></html>`;
 const script="import '/shared/surface/material.js';import '/shared/surface/context-menu.js';import '/shared/surface/command-palette.js';import '/shared/surface/controls.js';import {getContextOverlay} from '/shared/surface/overlay.js';getContextOverlay();window.acceptanceReady=true;";
 const server=createServer((request,response)=>{if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(html);}else if(request.url==='/acceptance-components.js'){response.setHeader('Content-Type','text/javascript');response.end(script);}else void serveRendererFixture(request,response);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;
 let browser,primaryError,closure;const result={schemaVersion:1,scope:'source-fixture',packagedAcceptance:false,nativeDriveAcceptance:false,browserErrors:[],failedResources:[],captures:[]};
 try{
  browser=await openRendererBrowser(url,{evidenceRoot:path.join(evidenceRoot,'lifecycle'),runtime});
  const page=browser.page;await page.setViewportSize({width:1180,height:850});
  const errors=result.browserErrors;page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(url))result.failedResources.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.goto(url);await page.waitForFunction(()=>window.acceptanceReady&&customElements.get('md-menu')&&customElements.get('md-outlined-text-field'));
  const capture=async name=>{const file=path.join(evidenceRoot,name+'.png'),startedAt=new Date().toISOString();const bytes=await page.screenshot({path:file});result.captures.push({path:file,sha256:createHash('sha256').update(bytes).digest('hex'),startedAt,capturedAt:new Date().toISOString(),scope:'source-fixture',inspected:false});};
  result.menu=await assertMenuBehavior(page,{capture});
  result.choiceSearch=await assertChoiceSearchBehavior(page,{capture});
  result.palette=await assertPaletteBehavior(page,{capture});
  result.filePicker=await assertFilePickerBehavior(page);
  assert.deepEqual(errors,[],'Production component graph emitted browser errors');result.browserErrors=errors;
  result.passed=true;
 }catch(error){primaryError=error;result.passed=false;result.failure=error.message;if(browser)try{result.menuDiagnostic=await browser.page.evaluate(()=>({stage:window.__acceptanceStage,events:window.__acceptanceMenuEvents||[],invoked:window.__acceptanceInvoked||[],menuHidden:document.querySelector('mfe-context-menu')?.hidden}));}catch{}}
 finally{
  if(browser){try{closure=await browser.close();result.closure=closure;}catch(error){result.closureFailure=error.message;result.passed=false;primaryError??=error;}}
  await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(evidenceRoot,'components.json'),JSON.stringify(result,null,2)+'\n');
 }
 if(primaryError)throw primaryError;return result;
}

export async function assertChoiceSearchBehavior(page,{capture=async()=>{}}={}) {
 await page.locator('#acceptance-form').evaluate(form=>{window.__acceptanceSubmits=0;form.addEventListener('submit',event=>{event.preventDefault();window.__acceptanceSubmits++;});});
 const trigger=page.locator('#acceptance-form [data-choice-search]');await trigger.waitFor({state:'visible'});
 assert.equal(await trigger.evaluate(node=>node.type),'button');await trigger.click();
 const menu=page.locator('mfe-context-menu');await menu.waitFor({state:'visible'});assert.equal(await menu.count(),1);
 await capture('choice-search');await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.__acceptanceSubmits),0,'Choice search submitted its containing form');
 return {scope:'source-fixture',type:'button',submitCount:0,menuCount:1};
}

export async function assertPaletteBehavior(page,{capture=async()=>{}}={}) {
 await page.locator('#palette-anchor').focus();
 await page.evaluate(()=>{
  const palette=document.querySelector('mfe-command-palette');window.__acceptanceSettings={theme:'light',language:'en'};
  palette.setCommands([{id:'theme',label:'Theme',description:'Choose theme',control:{type:'select',get:()=>window.__acceptanceSettings.theme,set:value=>{window.__acceptanceSettings.theme=value;},options:[{value:'light',label:'Light'},{value:'dark',label:'Dark'}]}},{id:'language',label:'Language',description:'Choose language',control:{type:'select',get:()=>window.__acceptanceSettings.language,set:value=>{window.__acceptanceSettings.language=value;},options:[{value:'en',label:'English'},{value:'yue',label:'Cantonese'}]}}]);palette.open();
 });
 const palette=page.locator('mfe-command-palette'),menu=page.locator('mfe-context-menu');
 await palette.locator('.result').first().locator('md-outlined-button').click();await menu.waitFor({state:'visible'});assert.equal(await menu.count(),1,'Palette created a second menu');
 await menu.locator('mfe-search md-outlined-text-field').first().locator('input').fill('Dark');
 await menu.locator('md-menu-item').waitFor({state:'visible'});await capture('palette-theme-choice');await menu.locator('md-menu-item').click();
 await page.waitForFunction(()=>window.__acceptanceSettings.theme==='dark');
 await palette.locator('.result').nth(1).locator('md-outlined-button').click();await menu.waitFor({state:'visible'});
 await menu.locator('mfe-search md-outlined-text-field').first().locator('input').fill('Cantonese');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.__acceptanceSettings.language==='yue');await capture('palette-applied-settings');
 await palette.locator('.result').first().locator('md-outlined-button').click();await menu.waitFor({state:'visible'});await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 assert.equal(await palette.locator('md-dialog').evaluate(node=>node.open),true,'Menu Escape closed its owning palette');
 await palette.locator('md-text-button[slot=actions]').click();await page.waitForFunction(()=>!document.querySelector('mfe-command-palette').dialog.open);
 assert.equal(await page.locator('#palette-anchor').evaluate(node=>document.activeElement===node),true);
 return {scope:'source-fixture',pointerSelection:true,keyboardSelection:true,menuCount:1,escapeScoped:true,focusRestored:true};
}

export async function assertFilePickerBehavior(page,{host='mfe-file-picker[label="Synthetic acceptance file"]',content='synthetic acceptance data'}={}) {
 const picker=page.locator(host);
 await picker.evaluate(node=>{window.__acceptancePickerChanges=[];node.addEventListener('change',()=>window.__acceptancePickerChanges.push(node.files?.length??-1));});
 const chooser=page.waitForEvent('filechooser');
 await picker.locator('md-outlined-button').click();
 await (await chooser).setFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(content)});
 await page.waitForFunction(()=>window.__acceptancePickerChanges.length===1);
 assert.equal(await picker.evaluate(node=>node.files?.length),1,'Chosen file was not retained');
 assert.deepEqual(await page.evaluate(()=>window.__acceptancePickerChanges),[1],'One user selection must emit one change');
 return {scope:'source-fixture',nativeChooserOpened:true,selectionRetained:true,changeCount:1};
}

// Traverses open shadow roots, but does not misclassify private native internals
// inside registered Material components as generic product controls.
export function inspectSurface(root=document) {
 const generic=[],unregistered=[],clipped=[];
 const walk=(container,owned=false)=>{
  for(const node of container.children||[]){
   const material=node.localName.startsWith('md-');
   const visible=node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
   if(visible&&!owned&&/^(button|input|select|textarea|dialog)$/.test(node.localName))generic.push(node.id||node.localName);
   if(visible&&(material||node.localName.startsWith('mfe-'))&&!customElements.get(node.localName))unregistered.push(node.localName);
   if(visible&&!owned){const rect=node.getBoundingClientRect(),style=getComputedStyle(node);if(rect.left < -1||rect.right>innerWidth+1)clipped.push({tag:node.localName,id:node.id,axis:'horizontal'});if(node.scrollHeight>node.clientHeight+1&&style.overflowY==='hidden'&&node.clientHeight>0)clipped.push({tag:node.localName,id:node.id,axis:'vertical-hidden'});}
   if(node.shadowRoot)walk(node.shadowRoot,owned||material||['mfe-file-picker','mfe-date-field'].includes(node.localName));
   walk(node,owned);
  }
 };
 walk(root);
 const scrolling=document.scrollingElement;
 return {genericControls:generic,unregisteredControls:unregistered,clipped,outerFrameScroll:scrolling.scrollHeight>innerHeight+1||scrolling.scrollWidth>innerWidth+1};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const evidenceRoot=path.resolve(process.argv[2]||'.test-output/gui-components');
 console.log(JSON.stringify(await runComponentAcceptance({evidenceRoot}),null,2));
}
