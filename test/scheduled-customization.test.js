import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,createSettingsStore} from '../src/shared/local-ux/store.js';
import {SCHEDULE_FIELDS,validateRule,validateScheduleRules,validateSettingValues,resolveSchedules,resolveScheduledSettings,createScheduledCustomizationController,createExternalScheduleResolver,ruleMatches,validateExternalResponse} from '../src/shared/local-ux/schedules.js';
const rule=(patch={})=>({id:'a',label:'Day',enabled:true,start:'09:00',end:'17:00',timezone:'UTC',weekdays:[0,1,2,3,4,5,6],priority:0,values:{theme:'dark'},source:{type:'local'},...patch});
const now=new Date('2026-10-05T12:00:00Z');
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
test('schedule inventory covers all ordinary base preferences and local appearance/logo references',()=>{
 const expected=['language','theme','density','seed','fontFamily','fontScale','fontWeight','motion','displayName','emoji','funnyEnglish','funnyCantonese','narrator','attention','appearance','logo'];assert.deepEqual(SCHEDULE_FIELDS,expected);
 const values={language:'bilingual',funnyEnglish:1,funnyCantonese:4,emoji:true,theme:'dark',density:'compact',seed:'#123abc',fontFamily:'serif',fontScale:1.5,fontWeight:700,motion:'reduced',displayName:'Example',narrator:{enabled:true,language:'both',englishVoice:'local-en',cantoneseVoice:'local-yue',rate:1.2,pitch:.8},attention:{focus:true,lowStimulation:true,timeAwareness:true,oneThing:true,momentum:true,nextAction:'Review',snoozedUntil:100},appearance:{version:1,reference:'appearance-evening'},logo:{version:1,reference:'logo-dark'}};
 assert.deepEqual(resolveSchedules([rule({values})],now),values);
 const result=resolveScheduledSettings(DEFAULTS,values);assert.equal(result.narrator.rate,1.2);assert.equal(result.attention.focus,true);assert.equal(result.language,'bilingual');assert.ok(!('appearance' in result));
});
test('legacy schedules migrate, history records edits, restart preserves new values and invalid saves are atomic',()=>{
 const storage=memory(),history=[],store=createSettingsStore({storage,history:entry=>history.push(entry)});const old=rule();store.update({schedules:[old]});assert.equal(store.get().schedules[0].version,2);
 store.update({schedules:[rule({values:{narrator:{rate:2},attention:{focus:true},logo:{version:1,reference:'logo-dark'}}})]});const before=store.get();assert.deepEqual(createSettingsStore({storage}).get(),before);assert.equal(history.length,2);
 assert.throws(()=>store.update({schedules:[rule({values:{school:{enabled:false}}})]}));assert.deepEqual(store.get(),before);assert.equal(history.length,2);
});
test('nested precedence keeps independent values and protected mode remains authoritative',()=>{
 const result=resolveSchedules([rule({values:{narrator:{rate:2,language:'both'},attention:{focus:true}}}),rule({id:'z',priority:1,values:{narrator:{pitch:.2},attention:{momentum:true},language:'yue'}})],now);
 assert.deepEqual(result.narrator,{rate:2,language:'both',pitch:.2});assert.deepEqual(result.attention,{focus:true,momentum:true});const base={...structuredClone(DEFAULTS),school:{enabled:true,name:'Presentation'}};const effective=resolveScheduledSettings(base,result);assert.equal(effective.language,'en');assert.equal(effective.narrator.language,'en');assert.equal(effective.narrator.rate,2);assert.equal(base.narrator.rate,1);
});
test('invalid nested values, credentials, snapshots, unknown versions and impossible dates are rejected',()=>{
 for(const values of [{narrator:{rate:9}},{attention:{focus:'true'}},{attention:{unknown:true}},{narrator:{token:'secret'}},{appearance:{version:1,reference:'data:image/png'}},{logo:{version:1,reference:'x',bytes:'image'}},{school:{enabled:false}},{locks:{}},{vocabulary:{}},{theme:'other'},{displayName:'\u0000'}])assert.throws(()=>validateSettingValues(values));
 for(const patch of [{version:3},{enabled:'true'},{timezone:undefined},{startDate:'2026-02-30'},{values:[]},{source:{type:'api',token:'secret'}},{source:{type:'api',url:'https://user:password@example.com'}},{source:{type:'api',url:'http://example.com'}},{source:{type:'api',url:'file:///private'}}])assert.throws(()=>validateRule(rule(patch)));
 assert.throws(()=>validateScheduleRules([rule(),rule()]));assert.throws(()=>validateScheduleRules(Array.from({length:101},(_,i)=>rule({id:String(i)}))));assert.throws(()=>validateExternalResponse({version:2,settings:{theme:'dark'},token:'secret'}));
 assert.deepEqual(validateExternalResponse({version:2,settings:{logo:{version:1,reference:'local-logo'}}}),{logo:{version:1,reference:'local-logo'}});
});
test('timezone DST uses wall clock, overnight starting dates and equal endpoints mean full selected day',()=>{
 const repeated=rule({timezone:'America/Toronto',start:'01:00',end:'02:00'});assert.equal(ruleMatches(repeated,new Date('2026-11-01T05:30:00Z')),true);assert.equal(ruleMatches(repeated,new Date('2026-11-01T06:30:00Z')),true);
 const missing=rule({timezone:'America/Toronto',start:'02:00',end:'03:00'});assert.equal(ruleMatches(missing,new Date('2026-03-08T07:00:00Z')),false);
 assert.equal(ruleMatches(rule({start:'00:00',end:'00:00',weekdays:[1]}),now),true);
});
test('transient consumers apply local snapshots, preserve bases and restore independently on end and disposal',async()=>{
 const base=structuredClone(DEFAULTS),saved={appearance:'base-a',logo:'base-l'},effective={...saved},calls=[];let settings;
 const adapter=key=>({resolve:async id=>({id}),applyTransient:async snapshot=>{effective[key]=snapshot.id;calls.push(key+':apply');},clearTransient:async()=>{effective[key]=saved[key];calls.push(key+':clear');}});
 const controller=createScheduledCustomizationController({getBaseSettings:()=>base,applySettings:async value=>settings=value,appearance:adapter('appearance'),logo:adapter('logo')});
 const values={narrator:{rate:2},appearance:{version:1,reference:'style'},logo:{version:1,reference:'mark'}};assert.equal((await controller.update(values)).appearance,'applied');assert.equal(effective.appearance,'style');assert.equal(settings.narrator.rate,2);assert.equal(base.narrator.rate,1);assert.deepEqual(saved,{appearance:'base-a',logo:'base-l'});
 assert.equal((await controller.update({})).logo,'restored');assert.deepEqual(effective,saved);assert.equal(settings.narrator.rate,1);await controller.update(values);await controller.dispose();assert.deepEqual(effective,saved);await assert.rejects(controller.update(values),/disposed/);assert.ok(calls.includes('appearance:clear'));
});
test('missing local references and stale external refresh never masquerade as applied values',async()=>{
 const errors=[];const controller=createScheduledCustomizationController({getBaseSettings:()=>DEFAULTS,applySettings:()=>{},appearance:{resolve:()=>undefined,applyTransient:()=>assert.fail(),clearTransient:()=>{}},onError:error=>errors.push(error)});assert.equal((await controller.update({appearance:{version:1,reference:'missing'}})).appearance,'failed');assert.equal(errors.length,1);
 let release;const resolver=createExternalScheduleResolver({fetchSource:()=>new Promise(resolve=>release=resolve)});const request=resolver.refresh([rule({source:{type:'api'}})]);resolver.cancel();release({version:2,settings:{narrator:{rate:2}}});await request;assert.equal(resolver.values.size,0);
 const ok=createExternalScheduleResolver({fetchSource:async()=>({version:2,settings:{narrator:{rate:2}}})});await ok.refresh([rule({source:{type:'api'}})]);assert.equal(ok.values.get('a').narrator.rate,2);await ok.refresh([]);assert.equal(ok.values.size,0);
});

test('queued cancellation restores a pending consumer and negative consumer verdicts stay failed',async()=>{
 let release,applied='base';const adapter={resolve:()=>new Promise(resolve=>release=resolve),applyTransient:async value=>{applied=value;},clearTransient:async()=>{applied='base';}};const controller=createScheduledCustomizationController({getBaseSettings:()=>DEFAULTS,applySettings:()=>{},appearance:adapter});const pending=controller.update({appearance:{version:1,reference:'style'}});await new Promise(resolve=>setImmediate(resolve));const end=controller.dispose();release('temporary');await pending;await end;assert.equal(applied,'base');
 const rejected=createScheduledCustomizationController({getBaseSettings:()=>DEFAULTS,applySettings:()=>{},logo:{resolve:()=>({}),applyTransient:()=>false,clearTransient:()=>{}}});assert.equal((await rejected.update({logo:{version:1,reference:'mark'}})).logo,'failed');
});
