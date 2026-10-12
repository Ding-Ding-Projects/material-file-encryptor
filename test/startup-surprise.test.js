import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createStartupSurprise,observeStartupInteraction} from '../src/shared/local-ux/surprise.js';
const dish={published:true,name:{en:'Rice roll',zhHant:'腸粉'},imageUrl:'https://github.com/example/catalog/releases/download/v1/roll.png',imageDataUrl:'data:image/png;base64,YQ=='};
test('startup draws once and forwards only the verified host result',async()=>{let draws=0,loads=0,shown;const surprise=createStartupSurprise({random:()=>{draws++;return .01;},getState:()=>({}),resolvePublishedDish:async()=>{loads++;return dish;},show:value=>{shown=value;return true;}});assert.deepEqual(await surprise.attempt(),{shown:true});assert.equal((await surprise.attempt()).shown,false);assert.equal(draws,1);assert.equal(loads,1);assert.equal(shown.imageDataUrl,dish.imageDataUrl);assert.equal(shown.focus,false);assert.equal(shown.timeout,5000);assert.equal(shown.name,'Rice roll · 腸粉');});
test('every startup exclusion skips both draw and catalogue access',async()=>{for(const state of [{school:{enabled:true}},{firstRun:true},{busy:true},{error:true},{updating:true},{quiet:true}]){const surprise=createStartupSurprise({getState:()=>state,random:()=>assert.fail('draw'),resolvePublishedDish:()=>assert.fail('load')});assert.equal((await surprise.attempt()).shown,false);}});
test('state is rechecked after catalogue resolution',async()=>{let busy=false,resolve;const surprise=createStartupSurprise({getState:()=>({busy}),random:()=>0,resolvePublishedDish:()=>new Promise(done=>resolve=done),show:()=>assert.fail('must not show')});const pending=surprise.attempt();busy=true;resolve(dish);assert.equal((await pending).reason,'startup state changed');});
test('non-winning draw never fetches and invalid catalogue never shows',async()=>{const noWin=createStartupSurprise({getState:()=>({}),random:()=>.1,resolvePublishedDish:()=>assert.fail('load')});assert.equal((await noWin.attempt()).shown,false);for(const row of [null,{...dish,published:false},{...dish,imageUrl:'https://example.com/a.png'}]){const surprise=createStartupSurprise({getState:()=>({}),random:()=>0,resolvePublishedDish:async()=>row,show:()=>assert.fail('show')});assert.equal((await surprise.attempt()).shown,false);}});
test('declined presentation never claims it was shown',async()=>{const surprise=createStartupSurprise({getState:()=>({}),random:()=>0,resolvePublishedDish:async()=>dish,show:()=>false});assert.deepEqual(await surprise.attempt(),{shown:false,reason:'presentation unavailable'});});


test('transient startup check defers without consuming the sole ten percent draw',async()=>{
 let checking=true,draws=0,shown=0;
 const subject=createStartupSurprise({getState:()=>({updating:checking,updateChecking:checking}),random:()=>{draws++;return .099;},resolvePublishedDish:async()=>dish,show:()=>{shown++;return true;}});
 for(let i=0;i<3;i++)assert.equal((await subject.attempt()).deferred,true);
 assert.equal(draws,0);checking=false;assert.deepEqual(await subject.attempt(),{shown:true});
 assert.equal((await subject.attempt()).reason,'already evaluated');assert.equal(draws,1);assert.equal(shown,1);
});
test('startup exclusions remain terminal while checking and pending photos cannot interrupt a form',async()=>{
 for(const state of [{firstRun:true},{school:{enabled:true}},{quiet:true},{error:true},{busy:true},{interacted:true},{modalOpen:true}]){
  let current={...state,updating:true,updateChecking:true};const subject=createStartupSurprise({getState:()=>current,random:()=>assert.fail('draw')});
  assert.equal((await subject.attempt()).reason,'ineligible startup state');current={};assert.equal((await subject.attempt()).reason,'already evaluated');
 }
 for(const reason of ['interacted','modalOpen']){
  let current={},resolve;const subject=createStartupSurprise({getState:()=>current,random:()=>0,resolvePublishedDish:()=>new Promise(done=>resolve=done),show:()=>assert.fail('interrupted work')});
  const pending=subject.attempt();current={[reason]:true};resolve(dish);assert.equal((await pending).reason,'startup state changed');
 }
});
test('startup opportunity expires without a later draw or late photo presentation',async()=>{
 let now=0;const subject=createStartupSurprise({clock:()=>now,getState:()=>({updateChecking:true,updating:true}),random:()=>assert.fail('late draw')});
 assert.equal((await subject.attempt()).deferred,true);now=15000;assert.equal((await subject.attempt()).reason,'ineligible startup state');
 now=0;let resolve;const photo=createStartupSurprise({clock:()=>now,getState:()=>({}),random:()=>0,resolvePublishedDish:()=>new Promise(done=>resolve=done),show:()=>assert.fail('late photo')});
 const pending=photo.attempt();now=15000;resolve(dish);assert.equal((await pending).reason,'startup state changed');
});
test('trusted pointer, keyboard and input interaction cancel without responding to synthetic events',()=>{
 const listeners=new Map(),target={addEventListener(type,fn,capture){assert.equal(capture,true);listeners.set(type,fn);},removeEventListener(type,fn,capture){assert.equal(capture,true);assert.equal(listeners.get(type),fn);listeners.delete(type);}};let calls=0;
 const dispose=observeStartupInteraction(target,()=>calls++);
 for(const listener of listeners.values()){listener({isTrusted:false});assert.equal(calls,0);}
 for(const listener of listeners.values())listener({isTrusted:true});assert.equal(calls,3);dispose();assert.equal(listeners.size,0);
});

test('actual renderer startup seam waits for checking to settle and preserves interaction exclusion',async()=>{
 const source=await readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
 const start=source.indexOf('let startupReady='),end=source.indexOf('const narrationEvents=',start);assert.ok(start>=0&&end>start);
 const seam=source.slice(start,end);
 for(const exclusion of ['none','interaction','quiet','school']){
  const interacted=exclusion==='interaction',suppressed=exclusion!=='none';
  const listeners=new Map();let shown=0,draws=0,stored=0;
  const context={effectiveLocalSettings:{school:{enabled:false}},state:{operations:[]},busy:false,document:{querySelector:()=>null,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:()=>{}},window:{},localStorage:{getItem:()=> '1',setItem:()=>stored++},$:()=>({hidden:true}),matchMedia:()=>({matches:false}),createStartupSurprise:options=>createStartupSurprise({...options,random:()=>{draws++;return 0;}}),observeStartupInteraction,createStartupPresentation:()=>({show:()=>{shown++;return true;},dismiss:()=>{},destroy:()=>{}}),featureRequest:async()=>dish,onPageDiscard:()=>{}};
  vm.runInNewContext(seam+';startupReady=true;statusReady=true;globalThis.accept=acceptUpdateSnapshot;',context);
  if(exclusion==='quiet')context.effectiveLocalSettings.attention={lowStimulation:true};
  if(exclusion==='school')context.effectiveLocalSettings.school.enabled=true;
  context.accept({state:'checking'});assert.equal(draws,0);
  context.effectiveLocalSettings.attention={lowStimulation:false};context.effectiveLocalSettings.school.enabled=false;
  if(interacted)listeners.get('pointerdown')({isTrusted:true});
  context.accept({state:'current'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(draws,suppressed?0:1);assert.equal(shown,suppressed?0:1);assert.ok(stored>0);
  context.accept({state:'current'});assert.equal(draws,suppressed?0:1);
 }
});
