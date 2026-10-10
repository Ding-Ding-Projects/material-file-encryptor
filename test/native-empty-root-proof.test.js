import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareGuiVaultFixture,proveFreshGuiRootEmpty,validateNativeEmptyRoot} from '../scripts/preview-runtime-fixture.mjs';

const identity={directory:true,attributes:16,volumeSerial:'17',handleVolumeSerial:'17',fileIndex:'16925299219354966000',filesystem:'MaterialVault',label:'Material Files'};
const proof=()=>({version:1,root:'M:\\',before:{...identity},after:{...identity},reopened:{...identity},initialNtStatus:'0x00000103',completedNtStatus:'0xC000000F',returnedBytes:0,empty:true});
test('native empty statuses require a stable open directory and expected volume',()=>{
 for(const status of ['0xC000000F','0x80000006']){const p=proof();p.completedNtStatus=status;assert.equal(validateNativeEmptyRoot(p,'M:\\'),true);}
 for(const mutate of [p=>p.root='N:\\',p=>p.empty=false,p=>p.returnedBytes=128,p=>p.completedNtStatus='0x00000000',p=>p.completedNtStatus='0xC000003A',p=>p.initialNtStatus='0x00000102',p=>p.after.fileIndex='99',p=>p.reopened.volumeSerial=42,p=>{for(const k of ['before','after','reopened'])p[k].filesystem='NTFS';},p=>{for(const k of ['before','after','reopened'])p[k].directory=false;},p=>{for(const k of ['before','after','reopened'])p[k].handleVolumeSerial=42;}]){const p=proof();mutate(p);assert.throws(()=>validateNativeEmptyRoot(p,'M:\\'));}
});

test('native identifiers remain canonical bounded decimal strings beyond the safe integer range',()=>{
 for(const value of ['0','9007199254740993','18446744073709551615']){const p=proof();for(const k of ['before','after','reopened'])p[k].fileIndex=value;assert.equal(validateNativeEmptyRoot(p,'M:\\'),true);}
 for(const value of [16925299219354966000,'01','-1','18446744073709551616']){const p=proof();for(const k of ['before','after','reopened'])p[k].fileIndex=value;assert.throws(()=>validateNativeEmptyRoot(p,'M:\\'));}
 for(const value of [17,'01','4294967296']){const p=proof();for(const k of ['before','after','reopened']){p[k].volumeSerial=value;p[k].handleVolumeSerial=value;}assert.throws(()=>validateNativeEmptyRoot(p,'M:\\'));}
});

async function setup(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mfe-empty-unit-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fixtureRoot=path.join(root,'fixture');await fs.mkdir(fixtureRoot);
 const saved={root:fixtureRoot,driveLetter:'M:',prepared:true};await fs.writeFile(path.join(fixtureRoot,'fixture.json'),JSON.stringify(saved));
 const gui=await prepareGuiVaultFixture(saved);const runRoot=path.join(root,'run');await fs.mkdir(runRoot);
 const executable=path.join(root,'fixture-executable');await fs.writeFile(executable,'unit fixture');
 const launch={runRoot,executable};const receipt=path.join(runRoot,'lifecycle.json');
 await fs.writeFile(receipt,JSON.stringify({runRoot,created:true,process:{executablePath:executable}}));
 await fs.writeFile(path.join(runRoot,'prepared.json'),JSON.stringify({sourceCommit:'a'.repeat(40),executableSha256:createHash('sha256').update('unit fixture').digest('hex')}));
 const state={mounted:true,locked:false,operation:null,storageDir:gui.storageDir,cacheDir:gui.cacheDir,driveLetter:gui.driveLetter};
 return {gui,launch,receipt,state,options:{launch,receipt,platform:'win32',observeStatus:async()=>({...state}),runProbe:async()=>proof()}};
}
test('owned proof stores an exclusive source-bound receipt and consumes the fresh fixture',async t=>{
 const f=await setup(t);const result=await proveFreshGuiRootEmpty(f.gui,f.options);assert.equal(result.empty,true);assert.match(result.helperSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.launch.runRoot,'gui-empty-root-proof.json'))),result);
 await assert.rejects(proveFreshGuiRootEmpty(f.gui,f.options),/newly prepared/);
});
test('non-Windows, unowned and changed mounted bindings cannot invoke the native probe',async t=>{
 const f=await setup(t);let calls=0;const options={...f.options,runProbe:async()=>{calls++;return proof();}};
 await assert.rejects(proveFreshGuiRootEmpty(f.gui,{...options,platform:'linux'}));
 await assert.rejects(proveFreshGuiRootEmpty({...f.gui},options));
 f.state.driveLetter='N:';await assert.rejects(proveFreshGuiRootEmpty(f.gui,options));assert.equal(calls,0);
});
test('nonempty result, timeout, changed mount and changed lifecycle produce no success receipt',async t=>{
 for(const scenario of ['nonempty','timeout','mount','lifecycle']){
  const f=await setup(t);const options={...f.options,runProbe:async()=>{if(scenario==='timeout')throw new Error('QUERY_TIMEOUT');if(scenario==='mount')f.state.mounted=false;if(scenario==='lifecycle')await fs.appendFile(f.receipt,' ');const p=proof();if(scenario==='nonempty')p.returnedBytes=100;return p;}};
  await assert.rejects(proveFreshGuiRootEmpty(f.gui,options));await assert.rejects(fs.access(path.join(f.launch.runRoot,'gui-empty-root-proof.json')));
 }
});
test('existing receipt is never overwritten',async t=>{
 const f=await setup(t);const target=path.join(f.launch.runRoot,'gui-empty-root-proof.json');await fs.writeFile(target,'preserved');
 await assert.rejects(proveFreshGuiRootEmpty(f.gui,f.options),{code:'EEXIST'});assert.equal(await fs.readFile(target,'utf8'),'preserved');
});
