import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNativeHardwareProbe,queryWindowsGraphics} from '../src/features/ollama/native-hardware.js';
import {ProfileManager} from '../src/features/ollama/profiles.js';
import {createOllamaService} from '../src/features/ollama/service.js';
test('native graphics query uses a fixed executable and fixed bounded command without shell expansion',async()=>{
  let call;const rows=await queryWindowsGraphics({systemRoot:'C:\\Windows',executeFile:async(...args)=>{call=args;return {stdout:JSON.stringify({Name:'Test GPU',DriverVersion:'1.2',AdapterRAM:4293918720,ConfigManagerErrorCode:0,Status:'OK'})};}});
  assert.equal(call[0],'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(call[1][3],'-Command');assert.ok(call[1][4].includes('Win32_VideoController'));assert.equal(call[2].windowsHide,true);assert.equal(call[2].timeout,10000);assert.equal(rows[0].driverVersion,'1.2');assert.equal(rows[0].usableVramBytes,null);assert.equal(rows[0].backendSupported,null);
  await assert.rejects(queryWindowsGraphics({systemRoot:'C:\\Windows;bad'}),/not verified/);
});
test('native probe reports measured resources and preserves unsupported GPU memory as unknown',async()=>{
  const system={cpus:()=>[{model:'Measured CPU',speed:2400}],arch:()=> 'x64',totalmem:()=>16e9,freemem:()=>8e9};
  const filesystem={realpath:async p=>p,stat:async()=>({isDirectory:()=>true}),statfs:async()=>({bavail:100,bsize:4096})};
  const probe=createNativeHardwareProbe({platform:'win32',system,filesystem,modelStoragePath:path.resolve('owned-models'),storagePathVerified:true,graphicsQuery:async()=>[{name:'Measured GPU',driverVersion:'42',usableVramBytes:null}]});
  const h=await probe();assert.equal(h.cpu.models[0],'Measured CPU');assert.equal(h.ramBytes,16e9);assert.equal(h.freeDiskBytes,409600);assert.equal(h.gpus[0].driverVersion,'42');assert.equal(h.vramBytes,null);assert.equal(h.backendSupported,null);
  assert.throws(()=>createNativeHardwareProbe({modelStoragePath:path.resolve('unverified')}),/verified/);
  const unknown=await createNativeHardwareProbe({platform:'linux',system,filesystem})();assert.equal(unknown.freeDiskBytes,null);assert.equal(unknown.gpu,null);
});
test('profile snapshot state persists through service restart and revalidates owned paths',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ollama-profiles-'));const options={dataDir:dir,profileOwnedRoots:[dir],verifyExecutable:async p=>p===process.execPath,validateProfile:async p=>p.args.length===1&&p.args[0]==='--version',fetchImpl:async u=>new Response(JSON.stringify(u.endsWith('/api/tags')?{models:[{name:'a:1'}]}:{models:[]}))};
  let service=createOllamaService(options);
  try{
    await service.registerPickedProfile({id:'version-check',name:'Version check',executable:process.execPath,cwd:dir,args:['--version'],requiredFiles:[]});
    await service.request('models');const result=await service.request('launch',{id:'local-chat',model:'a:1'});await service.dispose();
    service=createOllamaService(options);const profiles=await service.request('profiles');assert.ok(profiles.some(p=>p.id==='version-check'));const snapshots=await service.request('snapshots');assert.equal(snapshots[0].id,result.snapshotId);assert.equal((await service.request('restore',{id:result.snapshotId})).state,'restored');
    const manager=new ProfileManager({ownedRoots:[dir],verifyExecutable:async()=>true,validateProfile:async()=>true});await assert.rejects(manager.registerPicked({id:'outside',name:'Outside',executable:process.execPath,cwd:path.dirname(dir),args:[]}),/outside/);
    const state=JSON.parse(await fs.readFile(path.join(dir,'ollama-state.json'),'utf8'));assert.equal(state.profileState.lastLaunch.state,'restored');assert.ok(state.profileState.profiles.every(p=>Object.keys(p.env).length===0));
  }finally{await service.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
