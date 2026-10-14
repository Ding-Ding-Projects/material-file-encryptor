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

export async function assertMenuKeyboardNavigation(page,{capture=async()=>{}}={}){
 const menu=page.locator('mfe-context-menu');
 await page.evaluate(()=>{const anchor=document.querySelector('#palette-anchor');document.querySelector('mfe-context-menu').open({anchor,target:anchor,items:[{label:'First action'},{label:'Last action'}]});});
 await menu.locator('md-menu-item').last().waitFor({state:'visible'});
 const input=menu.locator('mfe-search md-outlined-text-field').first().locator('input');await input.focus();
 await page.keyboard.type('action');await page.keyboard.press('ArrowLeft');
 assert.equal(await input.evaluate(node=>node.getRootNode().activeElement===node&&node.selectionStart===5),true,'ArrowLeft was intercepted outside the editable input');
 await input.fill('');await page.waitForFunction(()=>document.querySelector('mfe-context-menu').itemsHost.querySelectorAll('md-menu-item').length===2);
 await page.keyboard.press('ArrowUp');
 assert.equal(await menu.locator('md-menu-item').last().evaluate(node=>node.getRootNode().activeElement===node),true,'ArrowUp from search did not focus the last action');
 await input.focus();
 const builderButton=menu.locator('mfe-search md-outlined-button').first();let reachedBuilder=false;
 for(let index=0;index<5;index++){
  await page.keyboard.press('Tab');assert.equal(await menu.isVisible(),true,'Tab closed the menu before focus exited');
  reachedBuilder=await builderButton.evaluate(node=>node.getRootNode().activeElement===node);if(reachedBuilder)break;
 }
 assert.equal(reachedBuilder,true,'Regex builder is not reachable by Tab from query');
 await page.keyboard.press('Enter');const builder=menu.locator('mfe-search .builder');await builder.waitFor({state:'visible'});
 await page.keyboard.press('Tab');assert.equal(await menu.isVisible(),true,'Tab into builder closed the menu');
 await page.keyboard.press('Shift+Tab');assert.equal(await menu.isVisible(),true,'Reverse Tab inside menu closed it');
 await capture('menu-keyboard-builder');
 let exited=false;
 for(let index=0;index<100;index++){await page.keyboard.press('Tab');if(!await menu.isVisible()){exited=true;break;}}
 assert.equal(exited,true,'Tab could not exit the menu');
 assert.equal(await page.evaluate(()=>{let node=document.activeElement;while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;for(let current=node;current;current=current.parentElement||current.getRootNode?.().host)if(current.localName==='mfe-context-menu')return false;return Boolean(node);}),true,'Menu dismissal left focus inside the closed menu');
 return {scope:'source-fixture',route:'browser-keyboard',arrowLeftRetained:true,arrowUpLast:true,queryToBuilderTab:true,reverseTabWithinMenu:true,tabExitDismissed:true,outsideFocus:true};
}

export async function assertControlLanguageBehavior(page){
 await page.evaluate(async()=>{const {prepareControl}=await import('/shared/surface/controls.js');const field=prepareControl(document.createElement('md-outlined-text-field'));field.id='acceptance-language-field';field.label='Synthetic field';field.value='Retained synthetic value';document.body.append(field);});
 const field=page.locator('#acceptance-language-field'),input=field.locator('input');await input.waitFor({state:'visible'});await input.focus();
 await page.evaluate(()=>{const field=document.querySelector('#acceptance-language-field');window.__acceptanceLanguageInput=field.shadowRoot.querySelector('input');});
 const observed=[];
 for(const language of ['en','yue','bilingual']){
  const value=await page.evaluate(async language=>{const {setControlLanguage}=await import('/shared/surface/controls.js');if(typeof setControlLanguage!=='function')throw Error('Control language capability unavailable');setControlLanguage(document,language);const field=document.querySelector('#acceptance-language-field'),input=field.shadowRoot.querySelector('input');return {language,clear:field.querySelector('[slot=trailing-icon]').getAttribute('aria-label'),choice:document.querySelector('[data-choice-search]').getAttribute('aria-label'),picker:document.querySelector('mfe-file-picker[label="Synthetic acceptance file"]').button.textContent,value:field.value,sameInput:input===window.__acceptanceLanguageInput,focused:input.getRootNode().activeElement===input};},language);
  assert.equal(value.value,'Retained synthetic value');assert.equal(value.sameInput,true);assert.equal(value.focused,true);
  if(language!=='yue'){assert.match(value.clear,/Clear field:/);assert.match(value.choice,/Search choices:/);assert.match(value.picker,/Choose/);}
  if(language!=='en'){assert.match(value.clear,/清除欄位/);assert.match(value.choice,/搜尋選項/);assert.match(value.picker,/選擇/);}
  observed.push(value);
 }
 await page.evaluate(async()=>{const {setControlLanguage}=await import('/shared/surface/controls.js');setControlLanguage(document,'en');document.querySelector('#acceptance-language-field').remove();});
 return {scope:'source-fixture',languageLabelsObserved:true,valuesPreserved:true,inputIdentityPreserved:true,focusPreserved:true,observed};
}

export async function runComponentAcceptance({evidenceRoot,runtime={},checks=['menu','menuKeyboardNavigation','choiceSearch','palette','filePicker','controlLanguage']}) {
 const knownChecks=['menu','menuKeyboardNavigation','choiceSearch','palette','filePicker','controlLanguage'];assert.ok(checks.length>0&&new Set(checks).size===checks.length&&checks.every(check=>knownChecks.includes(check)));
 assert.ok(path.isAbsolute(evidenceRoot));await fs.mkdir(evidenceRoot,{recursive:true});
 const index=await fs.readFile(new URL('../src/renderer/index.html',import.meta.url),'utf8');
 const csp=index.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)?.[0];assert.ok(csp,'Production CSP missing');
 const html=`<!doctype html><html><head><meta charset="utf-8">${csp}<script type="module" src="/acceptance-components.js"></script></head><body><md-outlined-button id="acceptance-anchor">Actions</md-outlined-button><md-outlined-button id="palette-anchor">Commands</md-outlined-button><form id="acceptance-form"><md-outlined-select label="Fixture choices"><md-select-option value="alpha"><span slot="headline">Alpha</span></md-select-option><md-select-option value="beta"><span slot="headline">Beta</span></md-select-option></md-outlined-select></form><mfe-command-palette></mfe-command-palette><mfe-file-picker label="Synthetic acceptance file"></mfe-file-picker></body></html>`;
 const script="import '/shared/surface/material.js';import '/shared/surface/context-menu.js';import '/shared/surface/command-palette.js';import '/shared/surface/controls.js';import {getContextOverlay} from '/shared/surface/overlay.js';getContextOverlay();window.acceptanceReady=true;";
 const resources=new Map();
 const server=createServer((request,response)=>{
  const end=response.end.bind(response);response.end=(bytes,...rest)=>{if(bytes!==undefined&&response.statusCode===200)resources.set(request.url,{path:request.url,sha256:createHash('sha256').update(bytes).digest('hex')});return end(bytes,...rest);};
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(html);}else if(request.url==='/acceptance-components.js'){response.setHeader('Content-Type','text/javascript');response.end(script);}else void serveRendererFixture(request,response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;
 let browser,primaryError,closure;const result={schemaVersion:1,scope:'source-fixture',requestedChecks:checks,completeComponentSuite:checks.length===knownChecks.length,packagedAcceptance:false,nativeDriveAcceptance:false,browserErrors:[],failedResources:[],captures:[]};
 try{
  browser=await openRendererBrowser(url,{evidenceRoot:path.join(evidenceRoot,'lifecycle'),runtime});
  if(browser.statePath){const bytes=await fs.readFile(browser.statePath+'.native-v1.json');const source=JSON.parse(bytes);result.sourceCommit=source.sourceCommit;result.nativeProvenanceSha256=createHash('sha256').update(bytes).digest('hex');}
  const page=browser.page;await page.setViewportSize({width:1180,height:850});
  const errors=result.browserErrors;page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(url))result.failedResources.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.goto(url);await page.waitForFunction(()=>window.acceptanceReady&&customElements.get('md-menu')&&customElements.get('md-outlined-text-field'));
  const capture=async name=>{const file=path.join(evidenceRoot,name+'.png'),startedAt=new Date().toISOString();const bytes=await page.screenshot({path:file});result.captures.push({path:file,sha256:createHash('sha256').update(bytes).digest('hex'),startedAt,capturedAt:new Date().toISOString(),scope:'source-fixture',inspected:false});};
  if(checks.includes('menu'))result.menu=await assertMenuBehavior(page,{capture});
  if(checks.includes('menuKeyboardNavigation'))result.menuKeyboardNavigation=await assertMenuKeyboardNavigation(page,{capture});
  if(checks.includes('choiceSearch'))result.choiceSearch=await assertChoiceSearchBehavior(page,{capture});
  if(checks.includes('palette'))result.palette=await assertPaletteBehavior(page,{capture});
  if(checks.includes('filePicker'))result.filePicker=await assertFilePickerBehavior(page);
  if(checks.includes('controlLanguage'))result.controlLanguage=await assertControlLanguageBehavior(page);
  assert.deepEqual(errors,[],'Production component graph emitted browser errors');result.browserErrors=errors;
  result.passed=true;
 }catch(error){primaryError=error;result.passed=false;result.failure=error.message;if(browser)try{result.menuDiagnostic=await browser.page.evaluate(()=>({stage:window.__acceptanceStage,events:window.__acceptanceMenuEvents||[],invoked:window.__acceptanceInvoked||[],menuHidden:document.querySelector('mfe-context-menu')?.hidden}));}catch{}}
 finally{
  if(browser){try{closure=await browser.close();result.closure=closure;}catch(error){result.closureFailure=error.message;result.passed=false;primaryError??=error;}}
  await new Promise(resolve=>server.close(resolve));
  result.resourceGraph=[...resources.values()].sort((a,b)=>a.path.localeCompare(b.path));
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
 assert.equal(await picker.evaluate(node=>node.shadowRoot.querySelector('input').type),'file','File-picker native type differs from its declared component');
 await picker.evaluate(node=>{window.__acceptancePickerChanges=[];node.addEventListener('change',()=>window.__acceptancePickerChanges.push(node.files?.length??-1));});
 const chooser=page.waitForEvent('filechooser');
 await picker.locator('md-outlined-button').click();
 await (await chooser).setFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(content)});
 await page.waitForFunction(()=>window.__acceptancePickerChanges.length===1);
 assert.equal(await picker.evaluate(node=>node.files?.length),1,'Chosen file was not retained');
 assert.deepEqual(await page.evaluate(()=>window.__acceptancePickerChanges),[1],'One user selection must emit one change');
 return {scope:'source-fixture',browserFileChooserObserved:true,nativePickerPixelsVerified:false,selectionRetained:true,changeCount:1};
}

// Traverses open shadow roots, but does not misclassify private native internals
// inside registered Material components as generic product controls.
export function inspectSurface(root=document) {
 const generic=[],unregistered=[],clipped=[],compositionIssues=[];
 const compositionTags=['mfe-titlebar','mfe-main-workspace','mfe-content-panel','mfe-data-table','mfe-selection-toolbar'];
 const required=[['.titlebar','mfe-titlebar'],['.app-shell > mfe-main-workspace','mfe-main-workspace'],['.view','mfe-content-panel'],['.table-scroll','mfe-data-table'],['.selection-toolbar','mfe-selection-toolbar']];
 for(const [selector,tag] of required)for(const node of root.querySelectorAll(selector))if(node.localName!==tag)compositionIssues.push({tag,id:node.id,reason:'generic-replacement'});
 // A removed workspace must fail even when its classes were removed with it.
 if(root.querySelector('.app-shell')&&!root.querySelector('mfe-main-workspace'))compositionIssues.push({tag:'mfe-main-workspace',reason:'missing-workspace'});
 if(root.querySelector('.app-shell')&&!root.querySelector('mfe-titlebar'))compositionIssues.push({tag:'mfe-titlebar',reason:'missing-titlebar'});
 const walk=(container,owned=false)=>{
  for(const node of container.children||[]){
   const material=node.localName.startsWith('md-');
   if(compositionTags.includes(node.localName)){
    const Type=customElements.get(node.localName);
    const issues=Type&&node instanceof Type&&typeof Type.inspect==='function'?Type.inspect(node):['unregistered-composition'];
    for(const reason of issues)compositionIssues.push({tag:node.localName,id:node.id,reason});
   }
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
 // Existing acquisition admits only an empty genericControls list. Composition
 // violations must fail that same gate, not merely appear in an ignored report.
 generic.push(...compositionIssues.map(issue=>'composition:'+issue.tag+':'+issue.reason));
 return {genericControls:generic,unregisteredControls:unregistered,compositionIssues,clipped,outerFrameScroll:scrolling.scrollHeight>innerHeight+1||scrolling.scrollWidth>innerWidth+1};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const evidenceRoot=path.resolve(process.argv[2]||'.test-output/gui-components');
 console.log(JSON.stringify(await runComponentAcceptance({evidenceRoot}),null,2));
}
