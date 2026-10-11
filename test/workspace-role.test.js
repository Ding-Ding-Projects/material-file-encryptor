import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {assertCompanionRequest} from '../docs/site/local-adapter.js';

globalThis.HTMLElement=class{};
class Node {
 constructor(tag=''){this.tag=tag;this.children=[];this.listeners={};this.selected=false;this.value=0;this.attributes={};this.slot='';this.ownerDocument=doc;}
 append(...children){this.children.push(...children);}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 show(){}
 remove(){this.removed=true;}
 querySelector(selector){for(const child of this.children){if(selector==='[slot="content"]'&&child.slot==='content')return child;const found=child.querySelector?.(selector);if(found)return found;}return null;}
}
const doc={activeElement:{focus(){}},createElement:tag=>new Node(tag),addEventListener(name,fn){this[name]=fn;},removeEventListener(name){delete this[name];}};globalThis.document=doc;
const {requestSuperConfirmation}=await import('../src/shared/surface/workflow-confirm.js');
const source=await readFile(new URL('../docs/site/workspace.js',import.meta.url),'utf8');
const part=source.slice(source.indexOf('export async function confirmWorkspaceAction'),source.indexOf('function confirmAction(options)'));
const {confirmWorkspaceAction}=await import('data:text/javascript;base64,'+Buffer.from(part).toString('base64'));
function fixture(requiredText){const host=new Node('host');const promise=confirmWorkspaceAction(host,{title:'Delete local model',message:'test-model',requiredText},{requestConfirmation:requestSuperConfirmation});const wrapper=host.children[0],dialog=wrapper.children[0],content=dialog.children[1];return {host,promise,wrapper,first:content.children[2],second:content.children[3],slider:content.children[4],status:content.children[5],field:content.children[6],execute:dialog.children[3],cancel:dialog.children[2]};}
test('workspace uses real keys and slider, preserves exact confirmation text and approves without claiming execution',async()=>{
 const f=fixture('DELETE');await f.execute.listeners.click();assert.equal(f.execute.disabled,true);
 f.first.selected=true;f.first.listeners.change();f.slider.value=100;await f.execute.listeners.click();assert.equal(f.execute.disabled,true);
 f.second.selected=true;f.second.listeners.change();f.slider.value=99;f.slider.listeners.input();await f.execute.listeners.click();assert.equal(f.execute.disabled,true);
 f.slider.value=100;f.slider.listeners.input();f.field.value='delete';await f.execute.listeners.click();assert.match(f.status.textContent,/match exactly/);assert.notEqual(f.execute.textContent,'Done');
 f.field.value='DELETE';await f.execute.listeners.click();assert.equal(await f.promise,true);assert.equal(f.execute.textContent,'Confirm');assert.doesNotMatch(f.status.textContent,/Operation completed/);assert.equal(f.wrapper.removed,true);
});
test('workspace emergency exit and owner abort do not grant approval',async()=>{
 const f=fixture();f.cancel.listeners.click();assert.equal(await f.promise,false);
 const host=new Node(),controller=new AbortController();const pending=confirmWorkspaceAction(host,{title:'Replace',message:'output'},{requestConfirmation:requestSuperConfirmation,signal:controller.signal});controller.abort();assert.equal(await pending,false);assert.equal(host.children[0].removed,true);
});
test('companion keeps actual authorized tool and preference actions',()=>{
 for(const [feature,action]of [['personalization','sharedRead'],['personalization','fetchScheduleSource'],['status','status'],['converter','enqueue'],['converter','pickSources'],['ollama','chat'],['ollama','deleteModel'],['ollama','events']])assert.doesNotThrow(()=>assertCompanionRequest('featureRequest',{feature,action,payload:action==='fetchScheduleSource'?{source:{type:'home-assistant',url:'https://example.test',entity:'input_boolean.theme'},id:'theme'}:{}}));
 assert.throws(()=>assertCompanionRequest('featureRequest',{feature:'personalization',action:'fetchScheduleSource',payload:{rule:{}}}));
});
test('public workspace contains no primary drive view or dispatch and retains cached-page controls',()=>{
 for(const forbidden of ["['files','Files']",'function refreshFiles','function renderFiles',...['getState','openExplorer','sync','lockVault','chooseFiles','importSelected','fileAction'].map(action=>"native('"+action+"'")])assert.equal(source.includes(forbidden),false,forbidden);
 assert.match(source,/Documentation, preferences and authorized local tools only/);
 assert.ok(source.includes('confirmationLifetime.cancel();refreshPrivateCopy();if(event.persisted)return;copyObserver.disconnect()'));
});

test('legacy files-only saved tabs migrate to real document views without deleting other state',async()=>{
 const start=source.indexOf('export function createWorkspaceStorage'),end=source.indexOf('const root=document.querySelector',start);
 const {createWorkspaceStorage}=await import('data:text/javascript;base64,'+Buffer.from(source.slice(start,end)).toString('base64'));
 const state={version:1,tabs:[{id:'files',label:'Files'}],activeTabId:'files',closedTabs:[{id:'files'},{id:'converter'}],closedTabIds:['files','converter'],groups:[{id:'work'}],notifications:[{id:'notice'}]};
 const storage=createWorkspaceStorage({getItem:()=>JSON.stringify(state)},[{id:'documentation',label:'Documentation'}]);const migrated=JSON.parse(storage.getItem('mfe.surface.tabs.v1'));
 assert.equal(migrated.activeTabId,'documentation');assert.deepEqual(migrated.tabs,[{id:'documentation',label:'Documentation'}]);assert.deepEqual(migrated.closedTabIds,['converter']);assert.deepEqual(migrated.closedTabs,[{id:'converter'}]);assert.deepEqual(migrated.notifications,state.notifications);assert.deepEqual(migrated.groups,state.groups);
});

test('session loss and cached page departure cancel pending approval and renew the controller',async()=>{
 const start=source.indexOf('export function createConfirmationLifetime'),end=source.indexOf('const confirmationLifetime=',start);
 const {createConfirmationLifetime}=await import('data:text/javascript;base64,'+Buffer.from(source.slice(start,end)).toString('base64'));
 const lifetime=createConfirmationLifetime();
 for(const reason of ['session-loss','persisted-pagehide']){
  const host=new Node(),oldSignal=lifetime.signal;
  const pending=confirmWorkspaceAction(host,{title:'Delete',requiredText:'DELETE'},{requestConfirmation:requestSuperConfirmation,signal:oldSignal});
  lifetime.cancel();assert.equal(await pending,false,reason);assert.equal(oldSignal.aborted,true);assert.equal(lifetime.signal.aborted,false);
 }
 const host=new Node(),pending=confirmWorkspaceAction(host,{title:'Delete'},{requestConfirmation:requestSuperConfirmation,signal:lifetime.signal});
 const dialog=host.children[0].children[0],content=dialog.children[1];content.children[2].selected=true;content.children[3].selected=true;content.children[4].value=100;await dialog.children[3].listeners.click();assert.equal(await pending,true);
 assert.ok(source.includes('if(!authenticated){confirmationLifetime.cancel();settingsHistory?.lock();}'));
});

test('actual cached-page handler cancels approval before retaining live controls',async()=>{
 const start=source.indexOf('export function createConfirmationLifetime'),end=source.indexOf('const confirmationLifetime=',start);
 const {createConfirmationLifetime}=await import('data:text/javascript;base64,'+Buffer.from(source.slice(start,end)).toString('base64'));
 const lifetime=createConfirmationLifetime(),host=new Node();let pagehide,destroys=0,refreshes=0;
 const pending=confirmWorkspaceAction(host,{title:'Delete'},{requestConfirmation:requestSuperConfirmation,signal:lifetime.signal});
 const offset=source.indexOf("window.addEventListener('pagehide'");const statement=source.slice(offset,source.indexOf('\n}',offset));
 vm.runInNewContext(statement,{window:{addEventListener:(_event,handler)=>{pagehide=handler;}},wordingGeneration:0,authenticated:true,vocabulary:{},emptyVocabulary:()=>({}),confirmationLifetime:lifetime,refreshPrivateCopy:()=>refreshes++,copyObserver:{disconnect:()=>destroys++},modules:new Map(),adapter:{dispose:()=>destroys++},foundation:{destroy:()=>destroys++},cleanup:[]});
 pagehide({persisted:true});assert.equal(await pending,false);assert.equal(destroys,0);assert.equal(refreshes,1);assert.equal(lifetime.signal.aborted,false);
});


test('workspace approval revalidates authorization at final confirmation',async()=>{
 const host=new Node();let allowed=true;
 const promise=confirmWorkspaceAction(host,{title:'Prune history',validate:()=>{if(!allowed)throw Error('authorization lost');}},{requestConfirmation:requestSuperConfirmation});
 const dialog=host.children[0].children[0],content=dialog.children[1];content.children[2].selected=true;content.children[3].selected=true;content.children[4].value=100;
 allowed=false;await dialog.children[3].listeners.click();assert.match(content.children[5].textContent,/authorization lost/);assert.notEqual(dialog.children[3].textContent,'Done');
 dialog.children[2].listeners.click();assert.equal(await promise,false);
});
