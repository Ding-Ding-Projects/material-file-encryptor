import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openRendererBrowser,serveRendererFixture} from '../scripts/test-renderer-browser.mjs';

// Real Material Web submission must have one lifecycle owner. A second close
// can finish after the next confirmation has already opened.
test('dialog form submission closes once and permits immediate reopening', {timeout:60000}, async()=>{
 const html=`<!doctype html><meta charset="utf-8"><title>Dialog lifecycle regression</title>
 <script type="module">
 import '/shared/surface/material.js';
 import '/shared/surface/controls.js';
 const dialog=document.createElement('mfe-dialog');dialog.setAttribute('aria-label','Confirmation');
 dialog.innerHTML='<form method="dialog"><p>Confirm the synthetic action</p><md-text-button value="cancel">Cancel</md-text-button><md-filled-button value="confirm">Confirm</md-filled-button></form>';
 document.body.append(dialog);const material=dialog.shadowRoot.querySelector('md-dialog');
 window.observed={materialClose:0,materialClosed:0,hostClose:0,opened:0,values:[]};
 material.addEventListener('close',()=>window.observed.materialClose++);
 material.addEventListener('closed',()=>window.observed.materialClosed++);
 material.addEventListener('opened',()=>window.observed.opened++);
 dialog.addEventListener('close',()=>{window.observed.hostClose++;window.observed.values.push(dialog.returnValue);if(window.observed.hostClose===1)queueMicrotask(()=>{dialog.returnValue='';dialog.showModal();});});
 window.dialog=dialog;dialog.showModal();window.ready=true;
 </script>`;
 const server=createServer((request,response)=>{if(request.url==='/'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}void serveRendererFixture(request,response);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
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
  const immediateFocus=await page.evaluate(()=>{
   const cancel=window.dialog.querySelector('[value=cancel]');window.dialog.showModal();cancel.focus();
   let active=document.activeElement;const chain=[];while(active){chain.push(active.localName);if(active===cancel)return{focused:true,chain};active=active.shadowRoot?.activeElement;}return{focused:false,chain};
  });
  await page.waitForFunction(()=>window.observed.opened===4);
  const completedFocus=await page.evaluate(()=>{
   const cancel=window.dialog.querySelector('[value=cancel]');let active=document.activeElement;const chain=[];while(active){chain.push(active.localName);if(active===cancel)return{focused:true,chain};active=active.shadowRoot?.activeElement;}return{focused:false,chain};
  });
  console.log(JSON.stringify({scope:'dialog-opening-focus-diagnostic',immediateFocus,completedFocus}));
 }finally{try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});
