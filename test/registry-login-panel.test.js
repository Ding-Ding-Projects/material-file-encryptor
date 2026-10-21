import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {registryLoginSnapshot,REGISTRY_ACTIVATION_URL} from '../src/renderer/features/storage-maintenance/registry-login-model.js';
import {REGISTRY_COPY} from '../src/renderer/features/storage-maintenance/registry-copy.js';
class Node {
 constructor(tag){this.localName=tag;this.children=[];this.attributes={};this.listeners={};this.disabled=false;this.value='';this.href='';this.tabIndex=-1;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this.attributes[key]=value;}addEventListener(key,fn){this.listeners[key]=fn;}remove(){this.removed=true;}
}
globalThis.document={createElement:tag=>new Node(tag)};
const {RegistryLoginPanel}=await import('../src/renderer/features/storage-maintenance/registry-login-panel.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),panels=[];
test.afterEach(()=>{panels.splice(0).forEach(panel=>panel.destroy());});
const state=(value,extra={})=>({state:value,deviceCode:null,canOpenPage:false,expiresAt:null,account:null,reason:null,...extra});
const authorization=(now=Date.now())=>state('authorizing',{deviceCode:'TEST-CODE',canOpenPage:true,expiresAt:new Date(now+60000).toISOString()});
async function fixture(overrides={},options={}){
 const calls=[],services={registryLoginStatus:async()=>state('idle'),startRegistryLogin:async()=>{calls.push('start');return authorization();},cancelRegistryLogin:async()=>{calls.push('cancel');return state('cancelled');},openRegistryLoginPage:async()=>{calls.push('open');return{opened:true};},...overrides};
 const panel=new RegistryLoginPanel({translate:key=>REGISTRY_COPY[key]?.[0]||key,clipboard:()=>({writeText:async value=>calls.push(['copy',value])}),...options});panels.push(panel);panel.configure(services);await tick();return{panel,calls};
}

test('login view accepts only bounded active codes and clears terminal or expired data',()=>{
 const now=Date.now();assert.equal(registryLoginSnapshot(authorization(now),now).deviceCode,'TEST-CODE');
 for(const value of ['idle','checking','signed-in','verifying','cancelled','expired','failed','unavailable','stale'])assert.equal(registryLoginSnapshot(state(value,{deviceCode:'TEST-CODE'}),now).deviceCode,null);
 assert.equal(registryLoginSnapshot(authorization(now-60001),now).state,'expired');
 for(const patch of [{deviceCode:'<script>'},{deviceCode:'A'.repeat(33)},{expiresAt:'invalid'},{expiresAt:new Date(now+7200000).toISOString()}])assert.throws(()=>registryLoginSnapshot({...authorization(now),...patch},now));
 const view=registryLoginSnapshot({...authorization(now),account:{password:'synthetic-only'},extra:'discarded'},now);assert.deepEqual(Object.keys(view),['state','deviceCode','canOpenPage','expiresAt']);
});

test('guided start, explicit copy/open and verified completion use actual services without automatic sync',async()=>{
 let signedIn=0;const {panel,calls}=await fixture({}, {onSignedIn:()=>signedIn++});
 assert.equal(calls.length,0);await panel.start();assert.equal(panel.code.textContent,'TEST-CODE');assert.equal(panel.link.href,REGISTRY_ACTIVATION_URL);
 await panel.copy();await panel.open();assert.deepEqual(calls,['start',['copy','TEST-CODE'],'open']);
 panel.services.registryLoginStatus=async()=>state('signed-in');await panel.refresh();assert.equal(panel.code.textContent,'');assert.equal(panel.value.deviceCode,null);assert.equal(panel.codeBlock.hidden,true);assert.equal(signedIn,1);assert.match(panel.status.textContent,/Sign-in verified/);
});

test('cancellation clears code immediately and a late start response cannot resurrect it',async()=>{
 let release;const {panel}=await fixture({startRegistryLogin:()=>new Promise(resolve=>{release=resolve;})});
 const start=panel.start();assert.equal(panel.buttons.cancel.disabled,false);await panel.cancel();release(authorization());await start;
 assert.equal(panel.value.state,'cancelled');assert.equal(panel.code.textContent,'');assert.equal(panel.value.deviceCode,null);
});

test('expiry clears code even while a cached status request is still in flight',async()=>{
 const {panel}=await fixture();panel.accept({...authorization(),expiresAt:new Date(Date.now()+25).toISOString()});panel.render();
 let release;panel.services.registryLoginStatus=()=>new Promise(resolve=>{release=resolve;});const refresh=panel.refresh();
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(panel.code.textContent,'');assert.equal(panel.value.state,'expired');
 release(state('expired'));await refresh;assert.equal(panel.value.deviceCode,null);
});

test('poll failure and destroy remove sensitive text without persisting or returning raw host errors',async()=>{
 const {panel}=await fixture();await panel.start();panel.services.registryLoginStatus=async()=>{throw Error('private host output TEST-CODE');};await panel.refresh();
 assert.equal(panel.value.state,'unavailable');assert.equal(panel.code.textContent,'');assert.ok(!panel.detail.textContent.includes('private host output'));
 panel.accept(authorization());panel.render();panel.destroy();assert.equal(panel.code.textContent,'');assert.equal(panel.value,null);assert.equal(panel.root.removed,true);
});

test('an owned sign-in can still be cancelled after status becomes unavailable',async()=>{
 const {panel,calls}=await fixture();await panel.start();panel.services.registryLoginStatus=async()=>{throw Error('unavailable');};await panel.refresh();
 assert.equal(panel.buttons.cancel.disabled,false);await panel.cancel();assert.equal(panel.value.state,'cancelled');assert.equal(panel.value.deviceCode,null);assert.equal(calls.at(-1),'cancel');
});

test('all sign-in and visibility copy has English and Cantonese with keyboard-focusable code/link',async()=>{
 for(const [key,pair]of Object.entries(REGISTRY_COPY).filter(([key])=>key.startsWith('login')||['visibility','public','private','publicDestinationNote','privateDestinationNote'].includes(key))){assert.equal(pair.length,2,key);assert.ok(pair.every(value=>typeof value==='string'&&value.length>0),key);}
 const {panel}=await fixture();await panel.start();assert.equal(panel.code.tabIndex,0);assert.equal(panel.link.tabIndex,0);assert.equal(panel.code.attributes['aria-label'],'Temporary sign-in code');
 panel.t=key=>REGISTRY_COPY[key]?.join(' · ')||key;panel.render();assert.match(panel.heading.textContent,/Sign in.*登入/);assert.equal(panel.code.textContent,'TEST-CODE');
});

test('the actual storage service namespace forwards all four no-argument sign-in methods',async()=>{
 const source=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const storage=source.split('\n').find(line=>line.includes("mountFeature('storage'"));
 const expression=storage.match(/Object\.fromEntries\(\[[^\]]+\]\.filter\(name=>typeof api\[name\]==='function'\)\.map\(name=>\[name,\(\.\.\.args\)=>api\[name\]\(\.\.\.args\)\]\)\)/)?.[0];
 assert.ok(expression);const methods=['registryLoginStatus','startRegistryLogin','cancelRegistryLogin','openRegistryLoginPage'],calls=[];
 const api=Object.fromEntries(methods.map(name=>[name,(...args)=>{calls.push([name,args.length]);return name;}]));
 const services=vm.runInNewContext(expression,{api});assert.deepEqual(Object.keys(services).sort(),[...methods].sort());
 for(const name of methods)assert.equal(services[name](),name);assert.deepEqual(calls,methods.map(name=>[name,0]));
});
