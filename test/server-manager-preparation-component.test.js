import test from 'node:test';
import assert from 'node:assert/strict';
// The logic fixture aliases generic selectors to Material controls. Inspect literal
// tags here so registered compositions pass while native replacements still fail.
function assertRegisteredControls(root){
 const native=root.querySelectorAll('*').filter(node=>['INPUT','BUTTON','SELECT','TEXTAREA'].includes(node.tagName));
 assert.deepEqual(native.map(node=>node.tagName),[],'Generic controls must not replace registered Material controls');
}

import {createAccessDocument,FixtureCSSStyleSheet} from './helpers/local-access-dom.js';
const previousHTMLElement=globalThis.HTMLElement;globalThis.HTMLElement=class{};
const {mountServerPreparation,registerServerPreparation}=await import('../src/renderer/features/server-manager/index.js');
if(previousHTMLElement===undefined)delete globalThis.HTMLElement;else globalThis.HTMLElement=previousHTMLElement;
import {PREPARATION_GUIDANCE,PREPARATION_GUIDANCE_COPY,preparationTranslator} from '../src/renderer/features/server-manager/copy.js';
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function scene(){
 const doc=createAccessDocument(),original=doc.createElement.bind(doc),definitions=new Map();const decorate=node=>{node.hidden=false;node.disabled=false;node.readOnly=false;node.before=function(other){other.remove();other.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),0,other);};return node;};const Base=original('div').constructor;
 class Element extends Base{constructor(){super(doc,'mfe-control-guidance');decorate(this);}attachShadow(){this.shadowRoot=decorate(original('shadow'));}}
 doc.defaultView={CSSStyleSheet:FixtureCSSStyleSheet,HTMLElement:Element,Event,customElements:{get:key=>definitions.get(key),define:(key,value)=>definitions.set(key,value)}};
 doc.createElement=tag=>{const C=definitions.get(tag),node=decorate(C?new C():original(tag));node.tagName=tag.toUpperCase();if(tag==='mfe-search'){node.query='';node.input=decorate(original('md-outlined-text-field'));node.filter=async rows=>rows.filter(row=>row.text.includes(node.query));node.emitChange=()=>node.dispatchEvent(new Event('search-change'));}return node;};const host=doc.createElement('div');doc.body.append(host);return{doc,host};
}
const button=(host,label)=>host.querySelectorAll('md-outlined-button').find(node=>node.textContent===label||node.textContent.startsWith(label+':'));
const catalogueId='a'.repeat(64),version={id:'fixture',channel:'release',releaseTime:'2026-10-11T00:00:00Z'};
function backend(){const calls=[];let state={catalogue:{state:'unavailable',sourceSha256:null,total:0},operations:[]},pendingResolve=null;
 const request=async(action,payload={})=>{calls.push({action,payload});if(action==='snapshot')return structuredClone(state);if(action==='refreshCatalogue'){state.catalogue={state:'current',sourceSha256:catalogueId,total:1,retrievedAt:'2026-10-11T00:00:00Z'};return structuredClone(state);}if(action==='versions')return{catalogueId,total:1,next:null,versions:[version]};if(action==='resolveVersion')return pendingResolve?pendingResolve():{selectionId:'selection',version:'fixture',state:'resolved',size:42,preparable:true};if(action==='prepare'){state.operations=[{id:'operation',serverId:'server',version:'fixture',status:'prepared',bytesVerified:true,distributionSha256:'b'.repeat(64),licenseAccepted:false}];return{id:'operation'};}if(action==='reviewLicense')return{url:'https://www.minecraft.net/en-us/eula',accepted:false};throw Error('Unexpected action.');};return{calls,request,setResolve:fn=>pendingResolve=fn};}
async function select(host){button(host,'Refresh official versions').click();await flush();button(host,'Choose version').click();await flush();}

test('mounted preparation uses original host IDs, registered controls and optional above-target guidance',async()=>{
 const {host}=scene(),service=backend();const module=mountServerPreparation(host,service);await flush();assertRegisteredControls(host);const refresh=button(host,'Refresh official versions'),guidance=refresh.parentNode.children[refresh.parentNode.children.indexOf(refresh)-1];assert.equal(guidance.tagName,'MFE-CONTROL-GUIDANCE');assert.equal(guidance.shadowRoot.children.at(-1).hidden,true);
 await select(host);button(host,'Prepare verified server files').click();await flush();assert.deepEqual(service.calls.find(row=>row.action==='prepare').payload,{selectionId:'selection'});assert.deepEqual(service.calls.find(row=>row.action==='resolveVersion').payload,{catalogueId,versionId:'fixture'});assert.match(host.textContent,/eula=false/);assert.match(host.textContent,/Verified SHA-256/);button(host,'Review server license').click();await flush();assert.equal(host.querySelector('a').href,'https://www.minecraft.net/en-us/eula');assert.equal(service.calls.some(row=>['start','acceptLicense'].includes(row.action)),false);module.destroy();
});
test('search clear preserves read-only query and changes only the actual query consumer',async()=>{
 const {host}=scene(),service=backend();const module=mountServerPreparation(host,service);await flush();await select(host);const search=host.querySelector('mfe-search');search.query='missing';search.input.value='missing';search.input.readOnly=true;button(host,'Clear version search').click();await flush();assert.equal(search.query,'missing');search.input.readOnly=false;button(host,'Clear version search').click();await flush();assert.equal(search.query,'');assert.equal(service.calls.some(row=>row.action==='prepare'),false);module.destroy();
});
test('destroyed async selection cannot mutate or repaint a replacement, subscriptions are owned',async()=>{
 const {host}=scene(),service=backend();let release,disposed=0;service.subscribe=()=>()=>disposed++;const first=mountServerPreparation(host,service);await flush();button(host,'Refresh official versions').click();await flush();service.setResolve(()=>new Promise(resolve=>release=resolve));const old=button(host,'Choose version');old.click();await flush();first.destroy();const second=mountServerPreparation(host,{request:async()=>({catalogue:{state:'unavailable'},operations:[]})});await flush();const before=host.textContent;release({selectionId:'stale',version:'fixture',preparable:true});await flush();assert.equal(host.textContent,before);const count=service.calls.length;old.click();await flush();assert.equal(service.calls.length,count);assert.equal(disposed,1);second.destroy();
});
test('authored preparation guidance is complete, distinct and localized in all three modes',()=>{
 const required=['refresh','page','choose','prepare','cancel','license','search','clear'];assert.deepEqual(PREPARATION_GUIDANCE.map(row=>row.key),required);assert.equal(new Set(PREPARATION_GUIDANCE.map(row=>row.purpose)).size,required.length);
 const validate=rows=>{for(const key of required){const row=rows.find(row=>row.key===key);assert.ok(row);for(const field of ['purpose','options','default','effects','example','validation','recovery'])assert.ok(PREPARATION_GUIDANCE_COPY[row[field]]);}};validate(PREPARATION_GUIDANCE);for(const key of required)assert.throws(()=>validate(PREPARATION_GUIDANCE.filter(row=>row.key!==key)));
 for(const language of ['en','yue','bilingual']){const t=preparationTranslator(()=>language);assert.ok(t('Prepare a local Java server'));if(language==='yue')assert.equal(t('Prepare a local Java server'),'準備本機 Java 伺服器');if(language==='bilingual')assert.match(t('Prepare a local Java server'),/ \/ /);}
});
test('retained query is reapplied after refresh, language and pagination renders; old filters cannot repaint',async()=>{
 const {host}=scene(),service=backend(),request=service.request;let language='en';service.getLanguage=()=>language;service.request=async(action,payload)=>action==='versions'?{catalogueId,total:2,next:payload.cursor==='0'?'100':null,versions:[payload.cursor==='0'?version:{...version,id:'other'}]}:request(action,payload);
 const module=mountServerPreparation(host,service);await flush();button(host,'Refresh official versions').click();await flush();let search=host.querySelector('mfe-search');search.query='other';search.emitChange();await flush();assert.equal(host.querySelectorAll('[role="listitem"]')[0].hidden,true);
 let release;search.filter=()=>new Promise(resolve=>release=resolve);search.emitChange();await flush();button(host,'Load more versions').click();await flush();let rows=host.querySelectorAll('[role="listitem"]');assert.deepEqual(rows.map(row=>row.hidden),[true,false]);release([{id:'0'}]);await flush();assert.deepEqual(rows.map(row=>row.hidden),[true,false]);
 button(host,'Refresh official versions').click();await flush();assert.deepEqual(host.querySelectorAll('[role="listitem"]').map(row=>row.hidden),[true]);button(host,'Load more versions').click();await flush();
 language='bilingual';module.setLanguage();await flush();assert.equal(host.querySelector('mfe-server-preparation').getAttribute('aria-label'),preparationTranslator(()=>language)('Prepare a local Java server'));rows=host.querySelectorAll('[role="listitem"]');assert.deepEqual(rows.map(row=>row.hidden),[true,false]);await module.refresh();await flush();assert.deepEqual(host.querySelectorAll('[role="listitem"]').map(row=>row.hidden),[true,false]);module.destroy();
});
test('preparation registration admits its exact component inventory and rejects omission',async()=>{
 const {doc,host}=scene();const {surfaceRegistry}=await import('../src/shared/surface/registry.js');registerServerPreparation(doc.defaultView);assert.ok(doc.defaultView.customElements.get('mfe-server-preparation'));assert.throws(()=>registerServerPreparation(doc.defaultView,surfaceRegistry.filter(row=>row.tag!=='mfe-server-preparation')),/incomplete/);const changed=surfaceRegistry.map(row=>row.tag==='mfe-server-preparation'?{...row,primitives:['md-outlined-button']}:row);assert.throws(()=>registerServerPreparation(doc.defaultView,changed),/incomplete/);const module=mountServerPreparation(host,backend());await flush();assert.equal(host.querySelector('mfe-server-preparation').getAttribute('role'),'region');module.destroy();
});

test('literal control assertion accepts registered components and rejects generic replacements',()=>{
 const {doc,host}=scene();
 for(const tag of ['md-outlined-text-field','md-checkbox','md-outlined-button','md-outlined-select','mfe-file-picker'])host.append(doc.createElement(tag));
 assertRegisteredControls(host);
 for(const tag of ['input','button','select','textarea']){
  const generic=doc.createElement(tag);host.append(generic);
  assert.throws(()=>assertRegisteredControls(host),/Generic controls must not replace/);
  generic.remove();assertRegisteredControls(host);
 }
});
