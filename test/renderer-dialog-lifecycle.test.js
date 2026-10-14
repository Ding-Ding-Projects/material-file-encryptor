import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {openRendererBrowser,serveRendererFixture} from '../scripts/test-renderer-browser.mjs';

// Real Material Web submission must have one lifecycle owner. A second close
// can finish after the next confirmation has already opened.
test('dialog form submission closes once and permits immediate reopening', {timeout:60000}, async t=>{
 const appSource=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const confirmationSource=appSource.slice(appSource.indexOf('async function confirmAction('),appSource.indexOf('async function importFiles('));
 const html=`<!doctype html><meta charset="utf-8"><title>Dialog lifecycle regression</title>
 <script type="module">
 import '/shared/surface/material.js';
 import '/shared/surface/controls.js';
 const dialog=document.createElement('mfe-dialog');dialog.setAttribute('aria-label','Confirmation');
 dialog.id='confirm-dialog';dialog.innerHTML='<form method="dialog"><h2 id="confirm-title">Confirmation</h2><p id="confirm-description">Confirm the synthetic action</p><md-text-button value="cancel">Cancel</md-text-button><md-filled-button id="confirm-action" value="confirm">Confirm</md-filled-button></form>';
 document.body.append(dialog);const material=dialog.shadowRoot.querySelector('md-dialog');
 window.observed={materialClose:0,materialClosed:0,hostClose:0,opened:0,values:[]};
 material.addEventListener('close',()=>window.observed.materialClose++);
 material.addEventListener('closed',()=>window.observed.materialClosed++);
 material.addEventListener('opened',()=>window.observed.opened++);
 dialog.addEventListener('close',()=>{window.observed.hostClose++;window.observed.values.push(dialog.returnValue);if(window.observed.hostClose===1)queueMicrotask(()=>{dialog.returnValue='';dialog.showModal();});});
 window.dialog=dialog;dialog.showModal();window.ready=true;
 const $=id=>document.getElementById(id);const setText=(id,text)=>{$(id).textContent=text;};let confirmationGeneration=0;
 ${confirmationSource}
 window.confirmAction=confirmAction;
 window.settle=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Confirmation settlement timed out')),2000);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 </script>`;
 const server=createServer((request,response)=>{if(request.url==='/'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}void serveRendererFixture(request,response);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,teardown;
 const closeBrowser=()=>teardown??=(browser?.close()||Promise.resolve());
 t.signal.addEventListener('abort',()=>{void closeBrowser().catch(()=>{});},{once:true});
 try{
  const url=`http://127.0.0.1:${server.address().port}/`;browser=await openRendererBrowser(url);
  const page=browser.page;await page.goto(url);await page.waitForFunction(()=>window.ready&&window.observed.opened===1);
  await page.locator('md-filled-button[value=confirm]').click();
  await page.waitForFunction(()=>window.observed.opened>=2);
  const afterConfirm=await page.evaluate(()=>({...window.observed,hostOpen:window.dialog.open,materialOpen:window.dialog.shadowRoot.querySelector('md-dialog').open}));
  assert.equal(afterConfirm.materialClose,1,'One form submission must request exactly one Material close');
  assert.equal(afterConfirm.materialClosed,1);assert.equal(afterConfirm.hostClose,1);assert.deepEqual(afterConfirm.values,['confirm']);
  assert.equal(afterConfirm.hostOpen,true);assert.equal(afterConfirm.materialOpen,true);
  await page.locator('md-text-button[value=cancel]').click();await page.waitForFunction(()=>window.observed.hostClose===2);
  assert.deepEqual(await page.evaluate(()=>window.observed.values),['confirm','cancel']);
  assert.equal(await page.evaluate(()=>window.observed.materialClose),2);
  await page.evaluate(()=>{window.dialog.returnValue='';window.dialog.showModal();window.preventCancel=event=>event.preventDefault();window.dialog.addEventListener('cancel',window.preventCancel);});
  await page.waitForFunction(()=>window.observed.opened===3);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.dialog.open),true,'Canceled Escape keeps the confirmation open');
  await page.evaluate(()=>window.dialog.removeEventListener('cancel',window.preventCancel));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.observed.hostClose===3);
  assert.deepEqual(await page.evaluate(()=>window.observed.values),['confirm','cancel','']);
  assert.equal(await page.evaluate(()=>window.observed.materialClose),3);
  await page.evaluate(()=>{window.confirmationResult=window.confirmAction('Confirm','Synthetic action','Confirm');});
  await page.waitForFunction(()=>window.observed.opened===4);
  const completedFocus=await page.evaluate(()=>{
   const cancel=window.dialog.querySelector('[value=cancel]');let active=document.activeElement;const chain=[];while(active){chain.push(active.localName);if(active===cancel)return{focused:true,chain};active=active.shadowRoot?.activeElement;}return{focused:false,chain};
  });
  assert.equal(completedFocus.focused,true,'Completed production confirmation opening must focus Cancel');
  await page.locator('md-text-button[value=cancel]').click();
  assert.equal(await page.evaluate(()=>window.settle(window.confirmationResult)),false);
  // Hold one real opening promise after the animation. Close that confirmation,
  // open a successor, and ensure the old continuation cannot steal its focus.
  await page.evaluate(()=>{
   const nativeShow=window.dialog.showModal.bind(window.dialog);let first=true;
   window.dialog.showModal=()=>{const opening=nativeShow();if(!first)return opening;first=false;return Promise.resolve(opening).then(()=>new Promise(resolve=>{window.releaseOldOpening=resolve;}));};
   window.earlyResult=window.confirmAction('Early','Synthetic action','Confirm');
  });
  await page.waitForFunction(()=>window.observed.opened===5&&typeof window.releaseOldOpening==='function');
  await page.evaluate(()=>window.dialog.close('cancel'));assert.equal(await page.evaluate(()=>window.settle(window.earlyResult)),false);
  await page.evaluate(()=>{window.successorResult=window.confirmAction('Successor','Synthetic action','Confirm');});
  await page.waitForFunction(()=>window.observed.opened===6);
  await page.locator('md-filled-button[value=confirm]').focus();
  await page.evaluate(async()=>{window.releaseOldOpening();await Promise.resolve();await Promise.resolve();});
  assert.equal(await page.locator('md-filled-button[value=confirm]').evaluate(target=>{let active=document.activeElement;while(active){if(active===target)return true;active=active.shadowRoot?.activeElement;}return false;}),true,'Superseded opening cannot steal focus');
  await page.locator('md-filled-button[value=confirm]').click();assert.equal(await page.evaluate(()=>window.settle(window.successorResult)),true);
  const rejected=await page.evaluate(async()=>{
   let listeners=0;const add=window.dialog.addEventListener.bind(window.dialog),remove=window.dialog.removeEventListener.bind(window.dialog);
   window.dialog.addEventListener=(type,...args)=>{if(type==='close')listeners++;return add(type,...args);};window.dialog.removeEventListener=(type,...args)=>{if(type==='close')listeners--;return remove(type,...args);};
   window.dialog.showModal=()=>Promise.reject(new Error('Synthetic opening rejection'));
   try{await window.settle(window.confirmAction('Rejected','Synthetic action','Confirm'));return{unexpected:true};}catch(error){return{message:error.message,listeners};}
  });
  assert.deepEqual(rejected,{message:'Synthetic opening rejection',listeners:0});
 }finally{try{await closeBrowser();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});
