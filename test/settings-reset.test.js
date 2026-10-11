import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsResetWorkflow} from '../src/shared/local-ux/settings-reset.js';
import {createVisitorSettings} from '../docs/site/visitor-personalization.js';
import {createPrivateHistory} from '../src/shared/local-ux/history.js';

const saved={HTMLElement:globalThis.HTMLElement,document:globalThis.document};
globalThis.HTMLElement=class{};
class Node{constructor(){this.children=[];this.listeners={};this.selected=false;this.value=0;}append(...nodes){this.children.push(...nodes);}setAttribute(){}addEventListener(name,run){this.listeners[name]=run;}show(){}remove(){this.removed=true;}}
const doc={activeElement:{focus(){}},createElement:()=>new Node(),addEventListener(name,run){this[name]=run;},removeEventListener(name){delete this[name];}};globalThis.document=doc;
const {requestSuperConfirmation}=await import('../src/shared/surface/workflow-confirm.js');
function confirm(host){const dialog=host.children.at(-1),content=dialog.children[1];content.children[2].selected=true;content.children[3].selected=true;content.children[2].listeners.change();content.children[4].value=100;content.children[4].listeners.input();return dialog.children[3].listeners.click();}

test('actual approval helper and visitor settings reset cancel safely and record one confirmed reset',async()=>{
 const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};
 const history=createPrivateHistory({storage});await history.setup('synthetic independent history');let authenticated=true;
 const controller=createVisitorSettings({storage,historyManager:history,isAuthenticated:()=>authenticated,credentialCapabilities:{setSharedCredential:async()=>true,verifySharedCredential:async()=>true}});
 controller.store.update({theme:'dark'});await controller.flushHistory();const baseline=(await history.list()).length;
 for(const mode of ['cancel','navigation','auth-loss','destroy']){
  const host=new Node();host.ownerDocument=doc;const target=new EventTarget();const workflow=createSettingsResetWorkflow({store:controller.store,host,requestConfirmation:requestSuperConfirmation,isAuthenticated:()=>authenticated,eventTarget:target});const operation=workflow.reset();
  if(mode==='cancel')host.children.at(-1).children[2].listeners.click();
  else{confirm(host);if(mode==='navigation')target.dispatchEvent(new Event('pagehide'));if(mode==='auth-loss'){authenticated=false;workflow.invalidate();authenticated=true;}if(mode==='destroy')workflow.destroy();}
  if(mode==='cancel')assert.deepEqual(await operation,{confirmed:false});else await assert.rejects(operation,/cancelled/);
  assert.equal(controller.store.get().theme,'dark');await controller.flushHistory();assert.equal((await history.list()).length,baseline);workflow.destroy();
 }
 const host=new Node();host.ownerDocument=doc;const workflow=createSettingsResetWorkflow({store:controller.store,host,requestConfirmation:requestSuperConfirmation,isAuthenticated:()=>authenticated});const reset=workflow.reset();confirm(host);assert.equal((await reset).confirmed,true);await controller.flushHistory();assert.equal(controller.store.get().theme,'system');assert.equal((await history.list()).length,baseline+1);
 const rejected=createSettingsResetWorkflow({store:controller.store,requestConfirmation:async()=>{throw Error('confirmation unavailable');}});await assert.rejects(rejected.reset(),/confirmation unavailable/);
 const missing=createSettingsResetWorkflow({store:controller.store});await assert.rejects(missing.reset(),/adapter is unavailable/);
 await controller.setSharedCredential('synthetic mode credential');controller.store.update({school:{enabled:true,name:'Presentation'}});await controller.flushHistory();const protectedCount=(await history.list()).length;
 const protectedReset=workflow.reset();confirm(host);await assert.rejects(protectedReset,/Verify/);assert.equal(controller.store.get().school.enabled,true);await controller.flushHistory();assert.equal((await history.list()).length,protectedCount);
 workflow.destroy();rejected.destroy();missing.destroy();controller.destroy();history.destroy();
});
test.after(()=>{for(const[key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
