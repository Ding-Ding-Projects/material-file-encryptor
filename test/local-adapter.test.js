import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAdapter } from '../src/main/local-adapter.js';
import { mountLocalAdapter } from '../docs/site/local-adapter.js';
const origin = 'https://ding-ding-projects.github.io';
async function fixture(t, options={}) {
  let unlocked=true;
  const calls=[];
  const adapter=createLocalAdapter({allowedOrigins:[origin],authorizePair:async()=>true,dispatch:async(action,params)=>{calls.push({action,params});return {ok:true};},isAuthenticated:()=>unlocked,...options});
  await adapter.start(); t.after(()=>adapter.close());
  const send=(path,payload={},headers={},method='POST')=>fetch(adapter.address+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)}),redirect:'error'});
  const pair=async()=>{const {code}=adapter.pairingCode();const response=await send('/pair',{code});assert.equal(response.status,200);return (await response.json()).token;};
  return {adapter,send,pair,calls,lock:()=>{unlocked=false;}};
}
test('adapter binds only loopback and pairs once with explicit approval',async t=>{
  const f=await fixture(t); assert.match(f.adapter.address,/^http:\/\/127\.0\.0\.1:\d+$/);
  const {code}=f.adapter.pairingCode(); const paired=await f.send('/pair',{code}); assert.equal(paired.status,200);
  const {token}=await paired.json(); assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await f.send('/pair',{code})).status,401);
  const state=await f.send('/status',{}, {Authorization:`Bearer ${token}`});assert.equal(state.status,200);assert.equal((await state.json()).authenticated,true);
});
test('origin, method, content type, malformed and oversized requests fail closed',async t=>{
  const f=await fixture(t);
  assert.equal((await f.send('/status',{}, {Origin:'https://example.com'})).status,403);
  assert.equal((await f.send('/status',{}, {Origin:''})).status,403);
  assert.equal((await f.send('/status',{}, {},'GET')).status,405);
  assert.equal((await f.send('/status',{}, {'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.send('/status','{"x":1,"x":2}')).status,400);
  assert.equal((await f.send('/status',' '.repeat(65537))).status,413);
  const response=await f.send('/status',{}, {'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},'OPTIONS');
  assert.equal(response.status,204); assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.equal(response.headers.get('access-control-allow-credentials'),null);
});
test('feature actions require paired credentials and validated allowlisted parameters',async t=>{
  const f=await fixture(t), token=await f.pair(), headers={Authorization:`Bearer ${token}`};
  assert.equal((await f.send('/request',{action:'getState',params:{}})).status,401);
  assert.equal((await f.send('/request',{action:'openExternal',params:{url:'https://example.com'}},headers)).status,400);
  assert.equal((await f.send('/request',{action:'getState',params:{extra:true}},headers)).status,400);
  assert.equal((await f.send('/request',{action:'getState',params:{}},headers)).status,200);
  assert.deepEqual(f.calls,[{action:'getState',params:{}}]);
});
test('lock and explicit revocation invalidate all paired credentials',async t=>{
  const f=await fixture(t),token=await f.pair(),headers={Authorization:`Bearer ${token}`};
  f.adapter.revoke();assert.equal((await f.send('/status',{},headers)).status,401);
  const next=await f.pair();f.lock();assert.equal((await f.send('/status',{}, {Authorization:`Bearer ${next}`})).status,401);
  assert.throws(()=>f.adapter.pairingCode());
});
test('native rejection consumes code and pending consent cannot survive revocation',async t=>{
  let consent;
  const f=await fixture(t,{authorizePair:()=>new Promise(resolve=>{consent=resolve;})});
  const {code}=f.adapter.pairingCode();const pending=f.send('/pair',{code});
  while(!consent)await new Promise(resolve=>setTimeout(resolve,1));
  f.adapter.revoke();consent(true);assert.equal((await pending).status,403);
  assert.equal((await f.send('/pair',{code})).status,401);
});
test('pairing rate limit is bounded and origins cannot be widened',async t=>{
  assert.throws(()=>createLocalAdapter({allowedOrigins:['*']}));
  const f=await fixture(t);
  for(let i=0;i<5;i++)assert.equal((await f.send('/pair',{code:'wrong'})).status,401);
  assert.equal((await f.send('/pair',{code:'wrong'})).status,429);
});
test('expired codes and rejected native consent do not issue credentials',async t=>{
  const f=await fixture(t,{authorizePair:async()=>false});
  const first=f.adapter.pairingCode();assert.equal((await f.send('/pair',{code:first.code})).status,403);
  assert.equal((await f.send('/pair',{code:first.code})).status,401);
  const second=f.adapter.pairingCode(),originalNow=Date.now;
  try { Date.now=()=>second.expiresAt+1;assert.equal((await f.send('/pair',{code:second.code})).status,401); }
  finally { Date.now=originalNow; }
});
test('visible browser pairing authenticates only after real loopback readback and revokes on lock',async t=>{
  const f=await fixture(t), changes=[];
  const nodes=[];
  const document={createElement:tag=>{const node={tag,children:[],events:{},append(...children){this.children.push(...children);},setAttribute(){},addEventListener(type,handler){this.events[type]=handler;},remove(){}};nodes.push(node);return node;},defaultView:{addEventListener(){},removeEventListener(){}}};
  const root={ownerDocument:document,append(){}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>originalFetch(url,{...options,headers:{...options.headers,Origin:origin}});
  t.after(()=>{globalThis.fetch=originalFetch;});
  const browser=mountLocalAdapter(root,{onAuthenticatedChange:state=>changes.push(state)});t.after(()=>browser.dispose());
  assert.deepEqual(changes,[false]);
  const addressInput=nodes.find(node=>node.type==='url'),codeInput=nodes.find(node=>node.type==='password'),form=nodes.find(node=>node.tag==='form');
  addressInput.value=f.adapter.address;codeInput.value=f.adapter.pairingCode().code;
  await form.events.submit({preventDefault(){}});
  assert.deepEqual(changes,[false,true]);assert.equal(codeInput.value,'');
  assert.deepEqual(await browser.featureRequest('getState'),{ok:true});
  f.lock();assert.deepEqual(await browser.status(),{authenticated:false});assert.deepEqual(changes,[false,true,false]);
});
