import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createAccessAdapters} from '../scripts/gui-acceptance-access.mjs';
const binding={sourceCommit:'a'.repeat(40)},launch={cdp:{port:9222,expectedUrl:'file:///synthetic/index.html'}};
const state={id:'access-authenticator-registration',owner:'access',selector:'.access-registration',observable:'Real registration controls with cleared private fields',actions:['open-registration','cancel-registration-clears-private-fields']};
const inventory={states:[state]};
function setup(overrides={}){
 let mutations=0;
 const producer={prepare:async()=>({ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,productionApi:true}),perform:async()=>({ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,productionApi:true}),observe:async()=>({passed:true,privacySafe:true}),restore:async()=>({ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,productionApi:true,restored:true})};
 const options={launch,receipt:{},inventory,prepareOwnedFixture:async()=>{mutations++;return {ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit};},fixtures:{access:producer},...overrides};
 return {adapters:createAccessAdapters(options),producer,mutations:()=>mutations};
}
test('missing protected fixture producer stops before native preparation',async()=>{const f=setup({fixtures:{}});await assert.rejects(f.adapters[state.id].prepare({binding}),/CAPABILITY_UNAVAILABLE: access/);assert.equal(f.mutations(),0);});
test('missing native picker stops before any picker mutation',async()=>{const f=setup({inventory:{states:[{...state,id:'access-once'}]}});await assert.rejects(f.adapters['access-once'].prepare({binding}),/CAPABILITY_UNAVAILABLE: nativePicker/);assert.equal(f.mutations(),0);});
test('foreign source binding is rejected instead of relabelled',async()=>{const f=setup();f.producer.prepare=async()=>({ownedSyntheticFixture:true,sourceCommit:'b'.repeat(40),productionApi:true});await assert.rejects(f.adapters[state.id].prepare({binding}),/Source binding/);});
test('wrong production state fails despite successful transport',async()=>{const f=setup();await assert.rejects(f.adapters[state.id].assertState({executePlan:async()=>({ok:true,results:[{value:false}]})}),/observable did not match/);});
test('absent or disabled production controls cannot produce successful actions',async()=>{for(const element of [null,{disabled:true,getClientRects:()=>[{}],closest:()=>null}]){const f=setup();await assert.rejects(f.adapters[state.id].actions['open-registration']({binding,executePlan:async plan=>{const result=vm.runInNewContext(plan.steps[0].expression,{document:{querySelector:()=>element}});return {ok:true,results:[{value:result}]};}}),/Active access control unavailable/);}});
test('unsafe secret-dependent observation is rejected and never copied to evidence',async()=>{const f=setup();f.producer.observe=async()=>({passed:true,privacySafe:false,secret:'not-for-evidence'});await assert.rejects(f.adapters[state.id].assertState({executePlan:async()=>({ok:true,results:[{value:true}]})}),/privacy unproven/);});
test('restoration requires verified production ownership',async()=>{const f=setup();f.producer.restore=async()=>({ownedSyntheticFixture:true,sourceCommit:binding.sourceCommit,productionApi:false,restored:true});await assert.rejects(f.adapters[state.id].restore({binding}),/Production fixture route/);});

test('access adapter leaves foundation creation states unclaimed',()=>{const f=setup({inventory:{states:[state,{...state,id:"create-key-file"},{...state,id:"create-private-repository"}]}});assert.deepEqual(Object.keys(f.adapters),[state.id]);});
