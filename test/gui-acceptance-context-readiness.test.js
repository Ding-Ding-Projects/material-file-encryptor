import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {observeContextStartupReadiness,requireContextStartupReadiness} from '../scripts/gui-acceptance-context-readiness.mjs';
function fixture(){
 const options=['pin','password'].map(value=>({value}));
 const policy={isConnected:true,disabled:false,value:undefined,querySelectorAll:()=>options};
 const wizard={isConnected:true,querySelectorAll:()=>[policy]};
 const access={isConnected:true,querySelector:()=>wizard};
 const editor={isConnected:true,hidden:true},language={isConnected:true,value:'en'},theme={isConnected:true,value:'light'},error={hidden:true};
 const nodes={'#view-access .access-workspace':access,'.appearance-editor':editor,'#language-setting':language,'#theme-setting':theme,'#main-error':error};
 const run=()=>vm.runInNewContext('('+observeContextStartupReadiness.toString()+')()',{document:{querySelector:s=>nodes[s]}});
 return {run,policy,editor,nodes,wizard};
}
test('real select getter readiness is required without substituting its intended value',()=>{
 const f=fixture();assert.equal(f.run(),false);f.policy.value='pin';assert.equal(f.run(),true);
 for(const value of [undefined,'', 'unknown','password']){f.policy.value=value;assert.equal(f.run(),false);}f.policy.value='pin';
 f.policy.disabled=true;assert.equal(f.run(),false);f.policy.disabled=false;f.editor.isConnected=false;assert.equal(f.run(),false);f.editor.isConnected=true;
 f.editor.hidden=false;assert.equal(f.run(),false);f.editor.hidden=true;f.nodes['#main-error'].hidden=false;assert.equal(f.run(),false);
});
test('duplicate policy controls and throwing getters cannot establish readiness',()=>{
 const f=fixture();f.policy.value='pin';f.wizard.querySelectorAll=()=>[f.policy,f.policy];assert.equal(f.run(),false);f.wizard.querySelectorAll=()=>[f.policy];
 Object.defineProperty(f.policy,'value',{get(){throw Error('Material menu not ready');}});assert.equal(f.run(),false);
});
test('readiness verifies identity before polling and again before returning',async()=>{
 const calls=[],context={binding:{sourceCommit:'a'.repeat(40)}};
 const page={waitForFunction:async(fn,arg,options)=>{assert.strictEqual(fn,observeContextStartupReadiness);assert.equal(options.timeout,10000);calls.push('poll');},evaluate:async fn=>{assert.strictEqual(fn,observeContextStartupReadiness);calls.push('observe');return true;}};
 const result=await requireContextStartupReadiness({page,context,identity:async()=>calls.push('identity')});assert.deepEqual(calls,['identity','poll','observe','identity']);assert.equal(result.privateValuesRead,false);
 let polls=0;await assert.rejects(requireContextStartupReadiness({context,page:{waitForFunction:async()=>polls++},identity:async()=>{throw Error('Foreign source');}}),/Foreign source/);assert.equal(polls,0);
 await assert.rejects(requireContextStartupReadiness({context,page:{...page,evaluate:async()=>false},identity:async()=>{}}),/unverified/);
 let identities=0;await assert.rejects(requireContextStartupReadiness({context,page,identity:async()=>{if(++identities===2)throw Error('Changed source');}}),/Changed source/);
});
