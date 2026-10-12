import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createContextAppearancePersistence,observeContextAppearance} from '../scripts/gui-acceptance-context-persistence.mjs';
const context={binding:{sourceCommit:'a'.repeat(40)}};
function fixture({lostSave=false,noEffect=false,resetFails=false,existing=false,foreign=false,reloadFailureAt=0,mutation=null,afterWrite=()=>{}}={}){
 let state=existing?{elements:{foreign:{}}}:null,journal=[],editor=false,reloads=0,appearanceId=null,opacity=1,field='1',foreignNow=foreign;
 const calls=[],base=()=>({version:1,elements:{},presets:{},rainbowLevel:5,colorPalette:{custom:[],recent:[]}});
 const revision=()=>journal.push({id:'r'+(journal.length+1),previous:journal.at(-1)?.id??null,snapshot:structuredClone(state)});
 const layer=properties=>({name:'Base',visible:true,locked:false,properties});
 const color=()=>{state??=base();state.elements.target??={normal:[layer({})]};state.elements.target.normal[0].properties.color='#abcdef';};
 const snapshot=()=>({targetId:'b',appearanceId,connected:true,opacity,editorOpen:editor,fieldValue:field,fieldDisabled:false,state:structuredClone(state),journal:structuredClone(journal)});
 const page={
  keyboard:{press:async key=>{calls.push(key);if(key==='Escape')editor=false;}},
  waitForFunction:async()=>{},
  evaluate:async fn=>fn.name==='observeContextStartupReadiness'?true:snapshot(),
  reload:async()=>{calls.push('reload');reloads++;if(reloads===reloadFailureAt)throw Error('Reload unavailable');editor=false;appearanceId=null;if(lostSave&&reloads===1)state=null;},
  locator(selector){const control={evaluate:async()=>true,filter(){return control;},count:async()=>1,click:async()=>{calls.push('reset');if(resetFails)throw Error('Reset unavailable');state={...state,elements:{}};opacity=1;field='1';revision();},fill:async value=>{assert.ok(selector.endsWith('md-outlined-text-field input'));calls.push('fill');field=value;},press:async key=>{assert.equal(key,'Tab');calls.push('change');state??=base();state.elements.target??={normal:[layer({})]};state.elements.target.normal[0].properties.opacity=field;opacity=noEffect?1:Number(field);if(mutation==='coalesced')color();revision();if(mutation==='post-write'){color();revision();}afterWrite(state,journal);}};return control;}
 };
 const contextFixture={
  'open-context':async()=>{calls.push('context');return{capturedTargetId:'b'};},
  'open-editor':async()=>{calls.push('editor');editor=true;appearanceId='target';if(mutation==='pre-fill'&&!state){color();revision();}field=state?.elements?.target?.normal?.[0]?.properties.opacity||'1';return{capturedTargetId:'b',effect:{count:1},focusInEditor:true,editorRetained:true};}
 };
 const subject=createContextAppearancePersistence({page,contextFixture,identity:async()=>{calls.push('identity');if(foreignNow)throw Error('Foreign source');}});
 return{subject,calls,setForeign:value=>foreignNow=value,read:()=>({state,journal,reloads,editor})};
}
for(const mutation of ['pre-fill','post-write','coalesced'])test(`${mutation} concurrent same-target change cannot authorize reset`,async()=>{
 const f=fixture({mutation});await assert.rejects(f.subject.run(context));
 assert.equal(f.calls.includes('fill'),mutation!=='pre-fill');assert.equal(f.calls.includes('reset'),false);
 const preserved=structuredClone(f.read());assert.equal(preserved.state.elements.target.normal[0].properties.color,'#abcdef');
 await assert.rejects(f.subject.restore(context));assert.equal(f.calls.includes('reset'),false);assert.deepEqual(f.read(),preserved);
});
test('normal control write, reload and independent control restoration retain explicit revisions',async()=>{
 const f=fixture(),result=await f.subject.run(context);assert.equal(result.reloadVerified,true);assert.equal(result.liveEffectVerified,true);assert.equal(result.accepted,false);assert.equal(result.restoration.reloadVerified,true);assert.equal(result.restoration.journalRetained,true);assert.equal(result.restoration.defaultRecordRetained,true);assert.equal(result.restoration.originalStorageAbsent,true);assert.equal(result.restoration.revisionCount,2);
 assert.deepEqual(f.calls.filter(x=>['fill','change','reload','reset'].includes(x)),['fill','change','reload','reset','reload']);assert.deepEqual(f.read().state.elements,{});assert.equal(f.read().journal.length,2);
 assert.deepEqual(await f.subject.restore(context),{restored:true,mutated:false,journalRetained:true});
});
test('absent live effect rejects success and still attempts normal restoration',async()=>{
 const f=fixture({noEffect:true});await assert.rejects(f.subject.run(context));assert.ok(f.calls.includes('reset'));assert.deepEqual(f.read().state.elements,{});assert.equal(f.read().editor,false);
});
test('a lost saved record with a retained journal preserves inconsistent state',async()=>{
 const f=fixture({lostSave:true});await assert.rejects(f.subject.run(context),error=>error instanceof AggregateError&&error.errors.length===2);assert.equal(f.calls.includes('reset'),false);assert.equal(f.read().state,null);assert.equal(f.read().journal.length,1);
});
test('failed restoration remains retryable and changed ownership prevents further controls',async()=>{
 const f=fixture({resetFails:true});await assert.rejects(f.subject.run(context),/Reset unavailable/);assert.ok(f.read().state.elements.target);const before=f.calls.filter(x=>x==='reset').length;f.setForeign(true);await assert.rejects(f.subject.restore(context),/Foreign source/);assert.equal(f.calls.filter(x=>x==='reset').length,before);
});
test('foreign or nonfresh profiles cannot reach the appearance field',async()=>{
 for(const options of [{foreign:true},{existing:true}]){const f=fixture(options);await assert.rejects(f.subject.run(context));assert.equal(f.calls.includes('fill'),false);assert.equal(f.calls.includes('reset'),false);}
});
test('observation verifies actual revision chain and returns no credential fields',()=>{
 const storage=new Map(),target={isConnected:true,dataset:{appearanceId:'target'}},row={dataset:{fileId:'b'},querySelectorAll:()=>[target]};
 const state={elements:{target:{normal:[{properties:{opacity:'0.37'}}]}}},key='material-file-encryptor.appearance-journal.v1';storage.set('m4e.appearance.v1',JSON.stringify(state));storage.set(key,JSON.stringify(['r1']));storage.set(key+':r1',JSON.stringify({version:1,id:'r1',previous:null,snapshot:state,omitted:'Local image pixels are omitted.'}));
 const environment={document:{querySelectorAll:()=>[row],querySelector:selector=>selector.includes('opacity')?{value:'0.37',disabled:false}:{hidden:false}},localStorage:{getItem:key=>storage.get(key)??null},getComputedStyle:()=>({opacity:'0.37'})};
 const run=()=>vm.runInNewContext('('+observeContextAppearance.toString()+')({targetId:"b"})',environment);assert.equal(run().journal.length,1);assert.equal(run().opacity,.37);
 storage.set(key+':r1',JSON.stringify({version:1,id:'r1',previous:'foreign',snapshot:state,omitted:'Local image pixels are omitted.'}));assert.throws(run,/chain differs/);
});

test('unexpected target changes remain preserved during an independent restoration retry',async()=>{
 const f=fixture({resetFails:true});await assert.rejects(f.subject.run(context));f.read().state.elements.target.normal[0].properties.color='#abcdef';const before=f.calls.filter(x=>x==='reset').length;await assert.rejects(f.subject.restore(context),/outside the observed mutation/);assert.equal(f.calls.filter(x=>x==='reset').length,before);assert.equal(f.read().state.elements.target.normal[0].properties.color,'#abcdef');
});

test('post-reset reload failure retries readback without resetting again or erasing revisions',async()=>{
 const f=fixture({reloadFailureAt:2});await assert.rejects(f.subject.run(context),/Reload unavailable/);assert.deepEqual(f.read().state.elements,{});assert.equal(f.read().journal.length,2);const result=await f.subject.restore(context);assert.equal(result.restored,true);assert.equal(result.reloadVerified,true);assert.equal(result.revisionCount,2);assert.equal(f.calls.filter(x=>x==='reset').length,1);
});

for(const [name,afterWrite] of [
 ['extra revision',(_state,journal)=>journal.push({...structuredClone(journal[0]),id:'r2',previous:'r1'})],
 ['invalid predecessor',(_state,journal)=>journal[0].previous='foreign'],
 ['different snapshot',(_state,journal)=>journal[0].snapshot.rainbowLevel=7],
 ['additional layer',state=>state.elements.target.normal.push({name:'Other',visible:true,locked:false,properties:{}})],
 ['unrelated setting',state=>state.rainbowLevel=7]
])test(`unproved ${name} cannot acquire restoration authority`,async()=>{
 const f=fixture({afterWrite});await assert.rejects(f.subject.run(context));assert.equal(f.calls.includes('reset'),false);
 const preserved=structuredClone(f.read());await assert.rejects(f.subject.restore(context),/Unproved/);assert.deepEqual(f.read(),preserved);
});
