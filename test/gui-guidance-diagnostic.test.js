import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateGuidanceConfiguration,verifyGuidanceInputs,runGuidanceDiagnostic,GUIDANCE_TUPLE,GUIDANCE_TABS} from '../scripts/gui-guidance-diagnostic.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-guidance-admission-unit-'));
 const put=async(name,data)=>{const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});const bytes=Buffer.from(typeof data==='string'?data:JSON.stringify(data));await fs.writeFile(file,bytes);return{path:file,sha256:sha(bytes)};};
 const cli=await put('tools/cli.exe','UNIT ONLY, NEVER EXECUTED'),python=await put('tools/python.exe','UNIT ONLY, NEVER EXECUTED');
 const inventory=await put('inventory.json',await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url),'utf8')),reference=await put('reference.json','UNIT REFERENCE'),source='a'.repeat(40),verifier='b'.repeat(40),hashes={executable:'1'.repeat(64),asar:'2'.repeat(64),nativeHost:'3'.repeat(64)};
 const buildReceipt=await put('build.json',{command:'build.bat /s',sourceCommit:source,sourceCommitAtCompletion:source,sourceDirtyAtStart:false,sourceDirtyAtCompletion:false,exitCode:0,executableSha256:hashes.executable,archiveSha256:hashes.asar,nativeHostSha256:hashes.nativeHost});
 const driver=await put('skills/drive-electron-cdp-headless/scripts/cdp_driver.mjs','UNIT DRIVER'),client=await put('skills/run-lowlevel-headless-app/scripts/lowlevel_mcp_client.py','UNIT CLIENT');
 const now=Date.parse('2030-01-01T00:00:00Z'),config={schemaVersion:1,scope:'diagnostic-subset',reviewedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),expected:{sourceCommit:source,version:'1.2.3',executable:path.join(root,'package','MaterialFileEncryptor.exe'),hashes},buildReceipt,reference,inventory,verifier:{sourceCommit:verifier,entrypointSha256:sha(await fs.readFile(new URL('../scripts/gui-guidance-diagnostic.mjs',import.meta.url))),packagedVerifierSha256:'4'.repeat(64),cdpDriverSha256:driver.sha256,lowlevelClientSha256:client.sha256},transport:{backend:'native-v1',cli:cli.path,cliSha256:cli.sha256,python:python.path,pythonSha256:python.sha256},outputRoot:path.join(root,'new-evidence')};
 const env={MFE_LOWLEVEL_CLI:cli.path,MFE_LOWLEVEL_PYTHON:python.path,MFE_RENDERER_PROCESS_BACKEND:'native-v1'};
 const admission={head:verifier,skillRoot:path.join(root,'skills'),packagedVerifierHash:async()=>config.verifier.packagedVerifierSha256,inspectPackagedRendererTarget:async expected=>({kind:'extracted-packaged-runtime',...expected})};
 return{root,put,config,env,now,admission};
}
test('configuration requires every reviewed input, exact transport and a fresh bounded review',async()=>{
 const f=await fixture();assert.deepEqual(validateGuidanceConfiguration(f.config,f),f.config);assert.equal(GUIDANCE_TABS.length,5);assert.deepEqual(GUIDANCE_TUPLE,{state:'p-language',width:1180,height:850,language:'en',theme:'light',scale:1});
 const mutations=[c=>delete c.reference,c=>c.extra='unknown',c=>c.scope='full',c=>delete c.expected.hashes.nativeHost,c=>c.expected.sourceCommit='main',c=>c.verifier.sourceCommit='4840f931',c=>c.transport.backend='cim',c=>c.expiresAt=c.reviewedAt,c=>c.reviewedAt=new Date(f.now+1000).toISOString(),c=>c.outputRoot='relative'];
 for(const mutate of mutations){const c=structuredClone(f.config);mutate(c);assert.throws(()=>validateGuidanceConfiguration(c,f));}
 for(const env of [{...f.env,MFE_LOWLEVEL_CLI:'other'},{...f.env,MFE_LOWLEVEL_PYTHON:undefined},{...f.env,MFE_RENDERER_PROCESS_BACKEND:undefined},{...f.env,MFE_LOWLEVEL_URL:'http://127.0.0.1/'}])assert.throws(()=>validateGuidanceConfiguration(f.config,{now:f.now,env}));
});
test('file admission rejects stale bytes, wrong verifier source and mismatched root-build provenance without creating evidence',async()=>{
 const f=await fixture();await verifyGuidanceInputs(f.config,f.admission);
 await assert.rejects(verifyGuidanceInputs(f.config,{...f.admission,head:'c'.repeat(40)}),/Verifier source/);
 await fs.appendFile(f.config.reference.path,'changed');await assert.rejects(verifyGuidanceInputs(f.config,f.admission),/Changed input/);await fs.writeFile(f.config.reference.path,'UNIT REFERENCE');
 const build=JSON.parse(await fs.readFile(f.config.buildReceipt.path));build.sourceCommitAtCompletion='c'.repeat(40);const bytes=JSON.stringify(build);await fs.writeFile(f.config.buildReceipt.path,bytes);const c=structuredClone(f.config);c.buildReceipt.sha256=sha(bytes);await assert.rejects(verifyGuidanceInputs(c,f.admission));
 await assert.rejects(fs.access(f.config.outputRoot));
});
test('a hashed but incomplete inventory and an existing output directory are not admitted',async()=>{
 const f=await fixture(),inventory=JSON.parse(await fs.readFile(f.config.inventory.path));inventory.states=inventory.states.filter(row=>row.id!=='p-language');const bytes=JSON.stringify(inventory);await fs.writeFile(f.config.inventory.path,bytes);f.config.inventory.sha256=sha(bytes);await assert.rejects(verifyGuidanceInputs(f.config,f.admission),/Required tuple/);
 await fs.mkdir(f.config.outputRoot);await assert.rejects(verifyGuidanceInputs(f.config,f.admission),/already exists/);
});
function lifecycle(f,{stageFailure,closureFailure}={}){
 const calls=[];const opened={connectionOwned:true,target:{sourceCommit:f.config.expected.sourceCommit,hashes:f.config.expected.hashes},receiptPath:'unit-only',async close(){calls.push('close');if(closureFailure)throw Error('UNIT CLOSURE UNVERIFIED');return{closureVerified:true};}};
 const load=async()=>({verify:async()=>{calls.push('verify');return{};},preflight:async()=>{calls.push('preflight');if(stageFailure==='preflight')throw Error('UNIT TRANSPORT UNAVAILABLE');},open:async()=>{calls.push('open');return opened;},acquire:async()=>{calls.push('acquire');if(stageFailure==='acquire')throw Error('UNIT ACQUISITION FAILED');return{scope:'diagnostic-subset',accepted:false,results:[{status:'captured-awaiting-inspection-and-reference'}]};},exercise:async(c,a,o,record)=>{calls.push('exercise');if(stageFailure==='exercise')throw Error('UNIT EXERCISE FAILED');record.guidancePassed=true;record.guidanceRestoration={restored:true};}});
 return{calls,load};
}
test('transport refusal happens before output creation, native fixture preparation or launch',async()=>{
 const f=await fixture(),l=lifecycle(f,{stageFailure:'preflight'});await assert.rejects(runGuidanceDiagnostic(f.config,{...f,platform:'win32',load:l.load}),/TRANSPORT UNAVAILABLE/);assert.deepEqual(l.calls,['verify','preflight']);await assert.rejects(fs.access(f.config.outputRoot));
 let loaded=false;const c=structuredClone(f.config);delete c.expected.hashes.nativeHost;await assert.rejects(runGuidanceDiagnostic(c,{...f,platform:'win32',load:async()=>{loaded=true;}}));assert.equal(loaded,false);
});
test('every admitted opened unit session closes once after acquisition or exercise failure and remains unaccepted',async()=>{
 for(const stageFailure of ['acquire','exercise']){const f=await fixture(),l=lifecycle(f,{stageFailure});await assert.rejects(runGuidanceDiagnostic(f.config,{...f,platform:'win32',load:l.load}),/UNIT/);assert.equal(l.calls.filter(row=>row==='close').length,1);const record=JSON.parse(await fs.readFile(path.join(f.config.outputRoot,'guidance-diagnostic.json')));assert.equal(record.accepted,false);assert.equal(record.status,'failed');assert.equal(record.physicalDpiVerified,false);}
});
test('diagnostic completion cannot claim matrix acceptance and closure failure remains terminal',async()=>{
 const f=await fixture(),l=lifecycle(f),result=await runGuidanceDiagnostic(f.config,{...f,platform:'win32',load:l.load});assert.equal(result.accepted,false);assert.equal(result.status,'diagnostic-complete-awaiting-inspection');assert.notEqual(result.packageSourceCommit,result.verifierSourceCommit);assert.equal(l.calls.at(-1),'close');
 const g=await fixture(),broken=lifecycle(g,{closureFailure:true});await assert.rejects(runGuidanceDiagnostic(g.config,{...g,platform:'win32',load:broken.load}),/CLOSURE UNVERIFIED/);const record=JSON.parse(await fs.readFile(path.join(g.config.outputRoot,'guidance-diagnostic.json')));assert.equal(record.status,'closure-unverified');assert.equal(record.accepted,false);
});
test('changed admission after transport preflight and a falsely accepted producer stop the operation',async()=>{
 const f=await fixture(),l=lifecycle(f);let verifies=0;const load=async()=>({...await l.load(),verify:async()=>{if(++verifies===2)throw Error('UNIT INPUT CHANGED DURING PREFLIGHT');return{};}});
 await assert.rejects(runGuidanceDiagnostic(f.config,{...f,platform:'win32',load}),/CHANGED DURING PREFLIGHT/);assert.equal(l.calls.includes('open'),false);await assert.rejects(fs.access(f.config.outputRoot));
 const g=await fixture(),m=lifecycle(g),overclaim=async()=>({...await m.load(),acquire:async()=>({scope:'diagnostic-subset',accepted:true,results:[{status:'captured-awaiting-inspection-and-reference'}]})});
 await assert.rejects(runGuidanceDiagnostic(g.config,{...g,platform:'win32',load:overclaim}));assert.equal(m.calls.includes('exercise'),false);assert.equal(m.calls.filter(row=>row==='close').length,1);const result=JSON.parse(await fs.readFile(path.join(g.config.outputRoot,'guidance-diagnostic.json')));assert.equal(result.accepted,false);
});
