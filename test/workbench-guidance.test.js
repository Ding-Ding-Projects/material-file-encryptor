import test from 'node:test';
import assert from 'node:assert/strict';
// The logic fixture aliases generic selectors to Material controls. Inspect literal
// tags here so registered compositions pass while native replacements still fail.
function assertRegisteredControls(root){
 const native=root.querySelectorAll('*').filter(node=>['INPUT','BUTTON','SELECT','TEXTAREA'].includes(node.tagName));
 assert.deepEqual(native.map(node=>node.tagName),[],'Generic controls must not replace registered Material controls');
}

import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountSelectionWorkbench,mountStatePreviews} from '../src/renderer/features/personalization/appearance-workbench.js';
import {WORKBENCH_GUIDANCE,WORKBENCH_GUIDANCE_COPY,workbenchDescriptor} from '../src/renderer/features/personalization/workbench-guidance.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function scene(){
 const doc=createAccessDocument(),original=doc.createElement.bind(doc),definitions=new Map();
 const decorate=node=>{node.hidden=false;node.disabled=false;node.readOnly=false;node.classList={add(...names){node.className=names.join(' ');}};node.getBoundingClientRect=()=>({left:0,top:0,width:116,height:116});node.setCustomValidity=value=>node.validationMessage=value;node.reportValidity=()=>!node.validationMessage;node.before=function(other){other.remove();other.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),0,other);};return node;};
 const Base=original('div').constructor;
 class Element extends Base {constructor(){super(doc,'mfe-control-guidance');decorate(this);}attachShadow(){this.shadowRoot=decorate(original('shadow'));return this.shadowRoot;}}
 class Sheet{replaceSync(text){this.text=text;}}
 doc.defaultView={HTMLElement:Element,Event,CSSStyleSheet:Sheet,customElements:{get:key=>definitions.get(key),define:(key,value)=>definitions.set(key,value)}};
 doc.createElement=tag=>{const C=definitions.get(tag);return decorate(C?new C():original(tag));};doc.createElementNS=(_,tag)=>doc.createElement(tag);doc.adoptedStyleSheets=[];
 const host=doc.createElement('div');doc.body.append(host);return{doc,host};
}
const buttons=root=>root.querySelectorAll('md-outlined-button');
const button=(root,label)=>buttons(root).find(node=>node.textContent===label);
const key=(surface,value,extra={})=>surface.dispatchEvent({type:'keydown',key:value,preventDefault(){},...extra});
async function triangle(surface){await key(surface,' ');await key(surface,'ArrowRight',{shiftKey:true});await key(surface,' ');await key(surface,'ArrowDown',{shiftKey:true});await key(surface,' ');}
async function finish(module){module.openWizard();const panel=module.host.shadowRoot.children.at(-1).children[5];panel.querySelector('md-filled-button').click();await settle();panel.querySelector('md-filled-button').click();await settle();return panel;}
const help=(workbench,key)=>workbench.guidance.find(module=>module.host.dataset.guidanceId.startsWith('workbench:'+key+':'));

test('authored workbench inventory has distinct bilingual context and exact article anchors',()=>{
 const required=['drawing','apply','clear','guide-x','guide-y','guide-edit','guide-remove','tool-search','preview-search','preview','tool-search-clear','preview-search-clear'];
 assert.deepEqual(WORKBENCH_GUIDANCE.map(row=>row.key),required);assert.equal(new Set(WORKBENCH_GUIDANCE.map(row=>row.purpose)).size,required.length);
 const validate=rows=>{for(const key of required){const row=rows.find(row=>row.key===key);assert.ok(row);for(const field of ['purpose','options','default','effects','example','validation','recovery']){assert.ok(row[field]);assert.ok(WORKBENCH_GUIDANCE_COPY[row[field]]);}assert.equal(workbenchDescriptor(key).sourceId,'docs/features/interface/workbench-guidance.md');assert.ok(workbenchDescriptor(key).help.endsWith('#'+key));}};
 validate(WORKBENCH_GUIDANCE);for(const key of required)assert.throws(()=>validate(WORKBENCH_GUIDANCE.filter(row=>row.key!==key)));
});
test('mounted optional guidance is above original Material controls and performs one awaited mutation',async()=>{
 const {host}=scene();let release,calls=0;const pending=new Promise(resolve=>release=resolve);
 const workbench=mountSelectionWorkbench(host,{onSelection:async()=>{calls++;return pending;},onGuides:()=>true});
 const apply=button(host,'Apply freehand selection'),module=help(workbench,'apply');assert.equal(apply.parentNode.children[apply.parentNode.children.indexOf(apply)-1],module.host);assert.equal(module.host.shadowRoot.children.at(-1).hidden,true);assertRegisteredControls(host);
 await triangle(host.querySelector('svg'));const flight=finish(module);await settle();assert.equal(calls,1);assert.doesNotMatch(host.textContent,/Selection applied/);apply.click();await settle();assert.equal(calls,1);release(true);await flight;await settle();assert.match(host.textContent,/Selection applied/);workbench.destroy();
});
test('false, missing and rejected consumers never report applied; direct and guided paths retain draft',async()=>{
 for(const consumer of [undefined,()=>false,()=>undefined,()=>Promise.reject(Error('locked'))]){
  const {host}=scene();const workbench=mountSelectionWorkbench(host,{onSelection:consumer});await triangle(host.querySelector('svg'));await finish(help(workbench,'apply'));assert.doesNotMatch(host.textContent,/Selection applied/);assert.equal(host.querySelector('polyline').getAttribute('points'),'50,50 60,50 60,60');workbench.destroy();
 }
});
test('destroyed pending instance cannot repaint or mutate a replacement and stale listeners are removed',async()=>{
 const {host}=scene();let release,calls=0;const first=mountSelectionWorkbench(host,{onSelection:()=>{calls++;return new Promise(resolve=>release=resolve);}});const svg=host.querySelector('svg');await triangle(svg);const module=help(first,'apply');await finishFirst(module);first.destroy();const replacement=mountSelectionWorkbench(host,{onSelection:()=>{calls++;return true;}});const before=host.textContent;release(true);await settle();assert.equal(host.textContent,before);await key(svg,'Enter');assert.equal(calls,1);replacement.destroy();
 async function finishFirst(module){module.openWizard();let panel=module.host.shadowRoot.children.at(-1).children[5];panel.querySelector('md-filled-button').click();await settle();panel.querySelector('md-filled-button').click();await settle();}
});
test('guide rejection rolls back local geometry, validates empty values and disposes old row guidance',async()=>{
 const {host}=scene();let accept=false,calls=0,registered=0,released=0;const workbench=mountSelectionWorkbench(host,{guides:[{axis:'x',value:50}],onGuides:()=>{calls++;return accept;},registerHelp(){registered++;return()=>released++;}});
 let field=host.querySelectorAll('md-outlined-text-field').find(node=>node.type==='number');field.value='33';await field.dispatchEvent(new Event('change'));await settle();assert.deepEqual(workbench.getGuides(),[{axis:'x',value:50}]);field.value='';await field.dispatchEvent(new Event('change'));assert.equal(calls,1);assert.ok(field.validationMessage);
 accept=true;field.value='33';await field.dispatchEvent(new Event('change'));await settle();assert.deepEqual(workbench.getGuides(),[{axis:'x',value:33}]);const previous=calls;await field.dispatchEvent(new Event('change'));assert.equal(calls,previous);assert.ok(released>=2);workbench.destroy();assert.equal(released,registered);
});
test('guide actions obey admission and bounds, cancellation changes no saved mask',async()=>{
 const {host}=scene();let available=true,calls=0;const workbench=mountSelectionWorkbench(host,{onSelection:()=>{calls++;return true;},onGuides:()=>{calls++;return true;},isAvailable:()=>available});await triangle(host.querySelector('svg'));const module=help(workbench,'apply');module.openWizard();const panel=module.host.shadowRoot.children.at(-1).children[5];panel.querySelectorAll('md-text-button').find(node=>node.textContent==='Cancel guidance').click();assert.equal(panel.hidden,true);assert.equal(calls,0);available=false;button(host,'Add vertical guide').click();await settle();assert.equal(calls,0);workbench.destroy();
});
test('state comparisons omit target text and values, preserve unrelated sheets and own service disposal',()=>{
 const {doc,host}=scene(),target=doc.createElement('input');target.value='secret value';target.textContent='private child text';const unrelated={};doc.adoptedStyleSheets=[unrelated];let registered=0,disposed=0;
 const preview=mountStatePreviews(host,{target,states:[{name:'normal',properties:{color:'#123456'}}],attachSearch:()=>()=>disposed++,registerCommands(){registered++;return()=>disposed++;}});assert.doesNotMatch(host.textContent,/secret value|private child text/);assert.equal(doc.adoptedStyleSheets.length,2);assert.equal(help(preview,'preview').host.shadowRoot.children.at(-1).hidden,true);preview.destroy();assert.deepEqual(doc.adoptedStyleSheets,[unrelated]);assert.equal(disposed,registered+1);
});

test('guidance targets the visible scoped search and clear uses its real query consumer',async()=>{
 const {doc,host}=scene();let changes=0,disposed=0;const workbench=mountSelectionWorkbench(host,{attachSearch(field){const search=doc.createElement('mfe-search');search.input=doc.createElement('md-outlined-text-field');search.query='guide';search.input.value='guide';search.emitChange=()=>changes++;field.hidden=true;field.before(search);return()=>{disposed++;search.remove();};}});
 const target=host.querySelector('mfe-search'),module=help(workbench,'tool-search');assert.equal(target.parentNode.children[target.parentNode.children.indexOf(target)-1],module.host);button(host,'Clear drawing tool search').click();await settle();assert.equal(target.query,'');assert.equal(target.input.value,'');assert.equal(changes,1);target.input.value='readonly';target.query='readonly';target.input.readOnly=true;button(host,'Clear drawing tool search').click();await settle();assert.equal(target.query,'readonly');assert.equal(changes,1);workbench.destroy();assert.equal(disposed,1);
});

test('every authored concept resolves an exact anchor in both complete articles',async()=>{const {readFile}=await import('node:fs/promises');for(const file of ['workbench-guidance.md','workbench-guidance.zh-HK.md']){const text=await readFile(new URL('../docs/features/interface/'+file,import.meta.url),'utf8');for(const row of WORKBENCH_GUIDANCE)assert.ok(text.replaceAll('\r\n','\n').includes('### '+row.key+'\n'),file+': '+row.key);}});

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
