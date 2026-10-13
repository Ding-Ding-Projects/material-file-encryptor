import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {createRendererFeatureFixture,assertRendererFeatureBridge,verifyRendererFeatureFixture,rendererFeatureFixtureScript,createRendererFixtureProgress} from './helpers/renderer-feature-fixture.js';
const requiredPairs=['access/displayNameRead','access/dataFolder','access/credentialList','access/credentialGet','access/historyLock','personalization/accessibilityState','personalization/sharedRead','personalization/listFonts','updates/status','converter/catalog','converter/list','workflow/documents','workflow/templates','workflow/editors','workflow/accountState','workflow/downloads','workflow/browserProposals','ollama/models','ollama/catalog','ollama/profiles','ollama/cart','ollama/sessions','ollama/status','ollama/runtimeInstallStatus','documentation/catalog','documentation/changelog','server-manager/snapshot','status/status'];
const payload=pair=>pair==='access/credentialList'?{prefix:'element-lock:'}:pair==='access/credentialGet'?{key:'authenticator:index:v1'}:pair==='updates/status'?{language:'en'}:pair==='converter/list'?{offset:0,limit:50}:{};
test('mounted feature reads have a finite complete inventory and distinct schemas',async()=>{
 const f=createRendererFeatureFixture();assertRendererFeatureBridge(f.bridge);assert.deepEqual(f.pairs,requiredPairs);
 const results=new Map();for(const pair of requiredPairs){const[feature,action]=pair.split('/');results.set(pair,await f.bridge.featureRequest(feature,action,payload(pair)));}
 assert.deepEqual(results.get('access/displayNameRead'),{value:null});assert.equal(typeof results.get('access/dataFolder'),'string');assert.equal(results.get('access/credentialGet'),null);assert.equal(results.get('personalization/sharedRead'),null);
 assert.deepEqual(results.get('personalization/accessibilityState'),{known:false,enabled:false,source:'runtime'});
 for(const pair of ['updates/status','ollama/status','status/status'])assert.equal(results.get(pair).state,'unavailable');
 assert.deepEqual(results.get('documentation/catalog'),{documents:[]});assert.deepEqual(results.get('ollama/models'),{models:[]});assert.equal(results.get('ollama/catalog').stale,true);
 const server=results.get('server-manager/snapshot');assert.equal(server.startAvailable,false);assert.equal(server.targets.length,4);assert.ok(server.targets.every(row=>row.available===false));
 assert.ok(Object.values(results.get('ollama/status').actions).every(value=>value===false));
});
test('missing methods and wrong response shapes fail before browser launch',async()=>{
 await verifyRendererFeatureFixture(createRendererFeatureFixture().bridge);
 await assert.rejects(verifyRendererFeatureFixture({...createRendererFeatureFixture().bridge,featureRequest:async()=>({})}),/Invalid mounted-consumer/);
 const bridge=createRendererFeatureFixture().bridge;for(const key of ['featureRequest','onFeatureEvent']){const missing={...bridge};delete missing[key];assert.throws(()=>assertRendererFeatureBridge(missing),/Required renderer fixture method/);}
 assert.throws(()=>assertRendererFeatureBridge({...bridge,onFeatureEvent:()=>undefined}),/disposer/);
 for(const [pair,value]of [['documentation/catalog',[]],['ollama/models',{}],['updates/status',{}],['server-manager/snapshot',{operations:[]}],['access/displayNameRead',{value:123}],['personalization/accessibilityState',{known:'yes',enabled:false,source:'runtime'}]])assert.throws(()=>createRendererFeatureFixture({responses:{[pair]:value}}),/Invalid fixture/);
});
test('unsupported native mutations and unknown or malformed requests never report success',async()=>{
 const f=createRendererFeatureFixture();for(const [feature,action,data]of [['workflow','publish',{}],['access','credentialSet',{key:'x',value:'x'}],['server-manager','prepare',{}],['unknown','status',{}],['access','credentialGet',{key:'unlisted'}],['converter','list',{offset:50,limit:50}],['updates','status',{language:'unknown'}]])await assert.rejects(f.bridge.featureRequest(feature,action,data),/Unsupported renderer fixture|Unsupported fixture/);
 await assert.rejects(f.bridge.featureRequest('status','status',{extra:true}),/Unsupported fixture/);
 const first=await f.bridge.featureRequest('server-manager','snapshot');first.targets[0].available=true;assert.equal((await f.bridge.featureRequest('server-manager','snapshot')).targets[0].available,false);
});
test('subscriptions preserve feature filtering, callback shape and idempotent disposal',()=>{
 const f=createRendererFeatureFixture(),a=[],b=[];const stop=f.bridge.onFeatureEvent('personalization',event=>a.push(event)),other=f.bridge.onFeatureEvent('updates',event=>b.push(event));
 assert.throws(()=>f.bridge.onFeatureEvent('personalization',null),/callback/);assert.throws(()=>f.bridge.onFeatureEvent('unknown',()=>{}),/Known fixture/);
 f.emitAccessibility();assert.equal(a.length,1);assert.equal(a[0].type,'accessibilityState');assert.deepEqual(b,[]);stop();stop();other();f.emitAccessibility();assert.equal(a.length,1);
});
test('serialized initializer installs the same required methods without closure imports',async()=>{
 const rows=[],context={window:{__recordRendererFixture:async row=>rows.push(row)}};
 vm.runInNewContext(rendererFeatureFixtureScript(f=>{window.drive={...f.bridge};}),context);
 const result=await context.window.drive.featureRequest('documentation','catalog');assert.equal(JSON.stringify(result),' {"documents":[]}'.trim());assert.equal(typeof context.window.drive.onFeatureEvent('updates',()=>{}),'function');assert.equal(rows.length,2);
});
test('progress retains bounded identities and preserves the last unfinished operation',async()=>{
 const saved=[],p=createRendererFixtureProgress(value=>saved.push(value));for(let i=0;i<80;i++){await p.record({kind:'phase',state:'started',phase:'navigation'});await p.record({kind:'phase',state:'completed',phase:'navigation'});}
 await p.record({kind:'request',state:'started',pair:'ollama/status'});const state=p.snapshot();assert.equal(state.recent.length,128);assert.equal(state.lastStarted.pair,'ollama/status');assert.equal(state.lastCompleted.phase,'navigation');assert.equal(state.phase.lastCompleted.phase,'navigation');assert.equal(state.request.lastStarted.pair,'ollama/status');assert.equal(state.request.lastCompleted,null);assert.equal(saved.at(-1).lastStarted.sequence,161);
 assert.throws(()=>p.record({kind:'request',state:'started',pair:'status/status',payload:'must-not-retain'}),/Invalid fixture progress identity/);
});
test('renderer keeps native separation, full geometry checks and unchanged timeout',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');assert.match(source,/timeout:120000/);assert.match(source,/assert\.deepEqual\(errors,\[\]\)/);assert.match(source,/for\(const width of \[1440,390\]\)/);assert.match(source,/\['en','yue','bilingual'\]/);assert.match(source,/assertOwnedTouchTarget\(clear\)/);assert.match(source,/\.\.\.featureFixture\.bridge/);
});
