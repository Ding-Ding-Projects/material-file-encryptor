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

test('both actual renderer case callbacks reject an invalid bridge before evidence, server or opener',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const {default:path}=await import('node:path'),{default:os}=await import('node:os'),{fileURLToPath}=await import('node:url'),{createHash}=await import('node:crypto');
 const names=['real renderer interactions, error states, keyboard dialogs and responsive layouts','scoped clear-control selectors use their actual owning wrappers'];
 for(const name of names){
  const cases=new Map(),calls=[];
  const server={listen(_port,_host,callback){calls.push('listen');callback();},address:()=>({port:19222}),closeAllConnections(){},close(callback){callback();}};
  const context={assert,path,os,fileURLToPath,createHash,process,performance,console:{log:()=>{calls.push('unit-log');}},
   test:(name,options,callback)=>cases.set(name,typeof options==='function'?options:callback),
   fs:{access:async()=>{},mkdtemp:async()=>{calls.push('evidence');return path.join(os.tmpdir(),'unit-not-created');},readFile:async()=>Buffer.from('unit only'),writeFile:async()=>{calls.push('evidence-write');}},
   createServer:()=>{calls.push('server');return server;},serveRendererFixture:()=>{},
   openRendererBrowser:async()=>{calls.push('opener');throw Error('UNIT OPENER REACHED');},
   createRendererFeatureFixture:()=>({bridge:{}}),verifyRendererFeatureFixture,
  };
  const executableSource=source.replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./ui-renderer.test.js',import.meta.url).href));
  vm.runInNewContext(executableSource,context);assert.equal(typeof cases.get(name),'function');
  await assert.rejects(cases.get(name)({skip(){throw Error('UNIT UNEXPECTED SKIP');}}),/Required renderer fixture method missing/);
  assert.deepEqual(calls,[],name+' must validate before creating evidence or opening a server/browser');
 }
});

test('imported-file action uses the exact radio through the real renderer control adapter',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const {default:path}=await import('node:path'),{default:os}=await import('node:os'),{fileURLToPath}=await import('node:url');
 const selector='#file-list tr[data-file-id="file-1"] md-radio.file-selection',doc={activeElement:null},calls=[],actions=[];let selected=false;
 const radio={get checked(){return selected;},name:'selected-file',ownerDocument:doc,shadowRoot:null},row={classList:{contains:name=>name==='selected'&&selected}};
 const context={assert:{...assert,deepEqual:(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)))},path,os,fileURLToPath,process,test:()=>{},window:{calls}};
 const locator=key=>{
  if(![selector,'#file-list tr[data-file-id="file-1"]','#selection-label'].includes(key))throw Error('UNSUPPORTED FIXTURE SELECTOR: '+key);
  const node=key===selector?radio:row;
  return{count:async()=>1,isVisible:async()=>true,evaluate:async fn=>fn(node),click:async()=>{assert.equal(key,selector);actions.push('radio-click');selected=true;},focus:async()=>{assert.equal(key,selector);actions.push('radio-focus');doc.activeElement=radio;},getAttribute:async name=>name==='data-file-id'?'file-1':null,textContent:async()=>selected?'notes.txt':''};
 };
 const page={locator,keyboard:{press:async key=>{assert.equal(key,'Enter');assert.equal(doc.activeElement,radio);actions.push('keyboard-enter');calls.push({name:'open',value:'file-1'});}},waitForFunction:async fn=>assert.equal(fn(),true),evaluate:async fn=>fn()};
 const executableSource=source.replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./ui-renderer.test.js',import.meta.url).href));
 const api=vm.runInNewContext(executableSource+';({controls,selectImportedFile})',context);
 await api.selectImportedFile(api.controls(page));assert.deepEqual(actions,['radio-click','radio-focus','keyboard-enter']);assert.deepEqual(calls,[{name:'open',value:'file-1'}]);
 assert.equal(radio.checked,true);
});


test('actual keyboard adapter records pending, completion and rejection with monotonic case elapsed time',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function trackedControls('),source.indexOf('async function selectImportedFile('));
 const tracked=vm.runInNewContext(body+';trackedControls');let clock=100,finish,calls=0;
 const progress=createRendererFixtureProgress(()=>{}, {now:()=>clock,startedAt:20});
 const keyboard={press(key){assert.equal(this,keyboard);assert.equal(key,'Escape');calls++;return new Promise(resolve=>{finish=resolve;});}};
 const page=tracked({keyboard,__fixtureProgress:progress.record});const pending=page.keyboard.press('Escape');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 assert.equal(progress.snapshot().phase.lastStarted.phase,'keyboard.press:Escape');assert.equal(progress.snapshot().phase.lastStarted.elapsedMs,80);assert.equal(progress.snapshot().phase.lastCompleted,null);
 clock=145;finish('original result');assert.equal(await pending,'original result');assert.equal(progress.snapshot().phase.lastCompleted.elapsedMs,125);
 const rejected=Error('original keyboard rejection');keyboard.press=async()=>{throw rejected;};clock=160;
 await assert.rejects(page.keyboard.press('Escape'),error=>error===rejected);
 assert.equal(progress.snapshot().phase.lastStarted.elapsedMs,140);assert.equal(progress.snapshot().phase.lastCompleted.elapsedMs,125);
 assert.match(source,/const progress=await caseProgress\(startedAt,t.signal\)/);assert.match(source,/await fixture\(page,progress\)/);
});

test('actual adapter refuses new operations after abort and retains settled in-flight truth',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function controls('),source.indexOf('async function selectImportedFile('));
 const {controls,trackedControls}=vm.runInNewContext(body+';({controls,trackedControls})',{assert});
 const controller=new AbortController(),reason=Error('original test deadline');let clock=0,finish;
 const saved=[],progress=createRendererFixtureProgress(value=>saved.push(value),{signal:controller.signal,now:()=>clock,startedAt:0});
 const calls=[],locator={evaluate:async()=>{calls.push('evaluate');return 'md-outlined-text-field';},fill:async()=>calls.push('fill'),click:async()=>calls.push('click'),locator(){return this;}};
 const raw={__fixtureProgress:progress.record,locator:()=>locator,keyboard:{press:()=>{calls.push('press');return new Promise(resolve=>{finish=resolve;});}},mouse:{click:async()=>calls.push('mouse')},evaluate:async()=>calls.push('page-evaluate')};
 const page=controls(trackedControls(raw,controller.signal));
 const pending=page.keyboard.press('Escape');await new Promise(resolve=>setImmediate(resolve));
 clock=120000;controller.abort(reason);const deadline=progress.snapshot().deadline;
 assert.equal(deadline.elapsedMs,120000);assert.equal(deadline.phase.lastStarted.phase,'keyboard.press:Escape');assert.equal(deadline.phase.lastCompleted,null);
 clock=120005;finish('settled result');await assert.rejects(pending,error=>error===reason);
 assert.equal(progress.snapshot().phase.lastCompleted.elapsedMs,120005);
 for(const action of [()=>page.evaluate(()=>{}),()=>page.locator('#owned').click(),()=>page.locator('#owned').fill('value'),()=>page.mouse.click(1,2),()=>page.keyboard.press('Enter')])await assert.rejects(action(),error=>error===reason);
 assert.deepEqual(calls,['press']);
 for(let i=0;i<140;i++)await progress.record({kind:'request',state:'completed',pair:'status/status'});
 assert.deepEqual(progress.snapshot().deadline,deadline);assert.deepEqual(saved.at(-1).deadline,deadline);assert.equal(progress.snapshot().recent.length,128);
 await progress.flush();progress.dispose();
});

test('actual adapter checks cancellation again after progress persistence and before chained Material input',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function controls('),source.indexOf('async function selectImportedFile('));
 const {controls,trackedControls}=vm.runInNewContext(body+';({controls,trackedControls})',{assert});
 for(const abortAt of ['progress','evaluation']){
  const controller=new AbortController(),reason=Error('cancel '+abortAt),calls=[];
  const locator={evaluate:async()=>{calls.push('evaluate');controller.abort(reason);return 'md-outlined-text-field';},fill:async()=>calls.push('fill'),locator(){return this;}};
  const raw={locator:()=>locator,__fixtureProgress:async row=>{if(abortAt==='progress'&&row.state==='started')controller.abort(reason);}};
  const page=controls(trackedControls(raw,controller.signal));
  await assert.rejects(page.locator('#owned').fill('value'),error=>error===reason);
  assert.deepEqual(calls,abortAt==='progress'?[]:['evaluate']);
 }
});

test('actual renderer cancellation still closes its owned browser and server without diagnostic evaluation',async()=>{
 const source=await fs.readFile(new URL('./ui-renderer.test.js',import.meta.url),'utf8');
 const {default:path}=await import('node:path'),{default:os}=await import('node:os'),{fileURLToPath}=await import('node:url'),{createHash}=await import('node:crypto');
 for(const name of ['real renderer interactions, error states, keyboard dialogs and responsive layouts','scoped clear-control selectors use their actual owning wrappers']){
 const cases=new Map(),calls=[],controller=new AbortController(),reason=Error('actual callback abort');
 const raw={setViewportSize:async()=>{calls.push('viewport');controller.abort(reason);},evaluate:async()=>{calls.push('unexpected diagnostic');},};
 const server={listen(_p,_h,callback){callback();},address:()=>({port:19222}),closeAllConnections(){calls.push('server-connections');},close(callback){calls.push('server-close');callback();}};
 const context={assert,path,os,fileURLToPath,createHash,process,performance,console:{log(){},error(){}},
  test:(name,options,callback)=>cases.set(name,typeof options==='function'?options:callback),
  fs:{access:async()=>{},mkdtemp:async()=>path.join(os.tmpdir(),'unit-not-created'),readFile:async()=>Buffer.from('unit only'),writeFile:async()=>{},rename:async()=>{}},
  createServer:()=>server,serveRendererFixture:()=>{},createRendererFeatureFixture,verifyRendererFeatureFixture,createRendererFixtureProgress,
  openRendererBrowser:async()=>({page:raw,close:async()=>calls.push('browser-close')})};
 vm.runInNewContext(source.replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./ui-renderer.test.js',import.meta.url).href)),context);
 await assert.rejects(cases.get(name)({signal:controller.signal}),error=>error===reason);
 assert.deepEqual(calls,['viewport','browser-close','server-connections','server-close']);
 }
});
