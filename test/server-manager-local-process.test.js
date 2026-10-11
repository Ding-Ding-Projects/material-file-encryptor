import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {LocalProcessServerAdapter} from '../src/features/server-manager/local-process.js';
const bytes=Buffer.from('owned synthetic server fixture');
const distribution={state:'resolved',version:'fixture',metadataUrl:'https://piston-meta.mojang.com/v1/packages/fixture.json',metadataSha1:'a'.repeat(40),url:'https://piston-data.mojang.com/v1/objects/fixture/server.jar',sha1:createHash('sha1').update(bytes).digest('hex'),size:bytes.length,runtime:{state:'specified',majorVersion:25}};
async function fixture(t,overrides={}){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'server-manager-owned-test-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const java=path.join(base,'synthetic-java.exe');await fs.writeFile(java,'synthetic runtime, never executed');
  const runtime={executable:java,sha256:createHash('sha256').update(await fs.readFile(java)).digest('hex'),majorVersion:25,verified:true};
  let child,spawned;let identity={pid:12345,creationTime:'123456789',executablePath:java};
  const adapter=new LocalProcessServerAdapter({baseRoot:base,fetchImpl:async()=>new Response(bytes),resolveRuntime:async()=>runtime,approveNetwork:async binding=>({...binding,verified:true,host:'127.0.0.1',port:25565,portAvailable:true,propertySchemaVerified:true}),identityReader:async()=>({...identity}),acquireFileLease:async({files})=>({kind:'windows-deny-write-delete',files,assertHeld:async()=>{},release:async()=>{}}),processFactory:(exe,args,options)=>{
    spawned={exe,args,options};child=new EventEmitter();child.pid=12345;child.exitCode=null;child.stdin={write:(value,callback)=>{child.lastInput=value;callback();queueMicrotask(()=>{child.exitCode=0;child.emit('exit',0,null);});}};return child;
  },...overrides});
  return {base,adapter,runtime,get child(){return child;},get spawned(){return spawned;},changeIdentity(){identity={...identity,creationTime:'different'};}};
}
async function prepared(f){await f.adapter.create({id:'owned',distribution});return f.adapter.licenseContract('owned');}
test('creation verifies exact downloaded bytes, preserves immutable identity and does not accept the license',async t=>{
  const f=await fixture(t);const contract=await prepared(f);const state=await f.adapter.status('owned');
  assert.equal(state.status,'prepared');assert.equal(state.bytesVerified,true);assert.equal(contract.accepted,false);
  assert.equal(await fs.readFile(path.join(f.base,'owned/server/eula.txt'),'utf8'),'eula=false\n');
  assert.equal(state.distributionSha256,createHash('sha256').update(bytes).digest('hex'));
  await assert.rejects(f.adapter.create({id:'owned',distribution}),/exist/i);
});
test('checksum mismatch and cancellation retain non-ready durable recovery states',async t=>{
  const f=await fixture(t,{fetchImpl:async()=>new Response(Buffer.alloc(bytes.length,1))});
  await assert.rejects(f.adapter.create({id:'bad',distribution}),/integrity/);assert.equal((await f.adapter.status('bad')).status,'creation-failed');
  await assert.rejects(fs.access(path.join(f.base,'bad/server/server.jar')));
  const cancel=new AbortController();cancel.abort();await assert.rejects(f.adapter.create({id:'cancel',distribution,signal:cancel.signal}));
  assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'cancel/state.json'),'utf8')).status,'canceled');
});
test('license consent is exact, and unavailable compatible Java prevents any launch',async t=>{
  const f=await fixture(t,{resolveRuntime:async()=>null});const contract=await prepared(f);
  await assert.rejects(f.adapter.start('owned'),/license/);
  await assert.rejects(f.adapter.acceptLicense('owned',{...contract,accepted:true,version:'other'}),/consent/);
  await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned'),/Java/);assert.equal(f.spawned,undefined);
});
test('owned fake process launch is shell-free, loopback-bound, identity-checked and stops only through normal stdin',async t=>{
  const f=await fixture(t);const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});
  const running=await f.adapter.start('owned');assert.equal(running.status,'running');assert.equal(running.readiness,'not-verified');assert.equal(f.spawned.options.shell,false);assert.equal(f.spawned.options.windowsHide,true);assert.equal(f.spawned.args[0],'-Xmx512M');
  assert.equal(await fs.readFile(path.join(f.base,'owned/server/server.properties'),'utf8'),'server-ip=127.0.0.1\nserver-port=25565\n');
  const stopped=await f.adapter.stop('owned');assert.equal(f.child.lastInput,'stop\n');assert.equal(stopped.status,'stopped');assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'owned/state.json'),'utf8')).status,'stopped');
});
test('changed process identity, modified bytes and unknown ownership fail closed without stop or spawn',async t=>{
  const f=await fixture(t);const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await f.adapter.start('owned');f.changeIdentity();
  await assert.rejects(f.adapter.stop('owned'),/identity|owned/);assert.equal(f.child.lastInput,undefined);assert.equal((await f.adapter.status('owned')).status,'ownership-unverified');
  const second=await fixture(t);const consent=await prepared(second);await second.adapter.acceptLicense('owned',{...consent,accepted:true});await fs.writeFile(path.join(second.base,'owned/server/server.jar'),'changed');await assert.rejects(second.adapter.start('owned'),/changed/);assert.equal(second.spawned,undefined);
  const restarted=new LocalProcessServerAdapter({baseRoot:second.base});await assert.rejects(restarted.status('owned'),/explicit recovery/);
});
test('unverified network configuration and untrusted downloads never launch or fetch',async t=>{
  const f=await fixture(t,{approveNetwork:async()=>null});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned'),/loopback/);assert.equal(f.spawned,undefined);
  await assert.rejects(f.adapter.create({id:'untrusted',distribution:{...distribution,url:'https://evil.example/server.jar'}}),/Untrusted/);
});
test('normal-stop timeout retains the owned process and never escalates to a kill',async t=>{
  const f=await fixture(t);const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await f.adapter.start('owned');
  f.child.stdin.write=(value,callback)=>{f.child.lastInput=value;callback();};let kills=0;f.child.kill=()=>{kills++;};
  await assert.rejects(f.adapter.stop('owned',{timeoutMs:5}),/no force/);assert.equal(kills,0);assert.equal(f.child.lastInput,'stop\n');assert.equal((await f.adapter.status('owned')).status,'stop-timeout');
  f.child.exitCode=0;f.child.emit('exit',0,null);await f.adapter.entry('owned').exitPersistence;
});
test('startup cancellation prevents spawn and serialized persistence cannot publish an older running state over exit',async t=>{
  const cancel=new AbortController();let f;f=await fixture(t,{resolveRuntime:async()=>{cancel.abort();return f.runtime;}});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned',{signal:cancel.signal}));assert.equal(f.spawned,undefined);
  const entry=f.adapter.entry('owned');entry.state.status='running';const earlier=f.adapter.persist(entry);entry.state.status='stopped';const later=f.adapter.persist(entry);await Promise.all([earlier,later]);assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'owned/state.json'),'utf8')).status,'stopped');
});

test('asynchronous approval cannot replace verified jar or runtime before spawn',async t=>{
  for(const changed of ['jar','runtime']) {let f;f=await fixture(t,{approveNetwork:async binding=>{await fs.writeFile(changed==='jar'?path.join(f.base,'owned/server/server.jar'):f.runtime.executable,'replaced during approval');return {...binding,verified:true,host:'127.0.0.1',port:25565,portAvailable:true,propertySchemaVerified:true};}});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned'),/changed/);assert.equal(f.spawned,undefined);}
});
test('abort during network approval publishes no configuration and a fresh attempt succeeds',async t=>{
  const controller=new AbortController();let first=true;const f=await fixture(t,{approveNetwork:async binding=>{if(first){first=false;controller.abort();}return {...binding,verified:true,host:'127.0.0.1',port:25565,portAvailable:true,propertySchemaVerified:true};}});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned',{signal:controller.signal}));await assert.rejects(fs.access(path.join(f.base,'owned/server/server.properties')));assert.equal((await f.adapter.status('owned')).startup.status,'canceled');const retried=await f.adapter.start('owned');assert.equal(retried.status,'running');assert.equal(retried.startup.status,'admitted');await f.adapter.stop('owned');
});
test('absent native file lease prevents launch even with otherwise approved runtime and network',async t=>{
  const f=await fixture(t,{acquireFileLease:async()=>null});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await assert.rejects(f.adapter.start('owned'),/file lease/);assert.equal(f.spawned,undefined);
});

test('a child error with a live PID retains ownership and the file lease until actual exit, once only',async t=>{
  let releases=0;const f=await fixture(t,{acquireFileLease:async({files})=>({kind:'windows-deny-write-delete',files,assertHeld:async()=>{},release:async()=>{releases++;}})});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await f.adapter.start('owned');const child=f.child;child.emit('error',new Error('Process API error'));await f.adapter.entry('owned').errorPersistence;assert.equal(releases,0);assert.equal(f.adapter.entry('owned').child,child);assert.equal((await f.adapter.status('owned')).status,'process-error');child.exitCode=0;child.emit('exit',0,null);await f.adapter.entry('owned').exitPersistence;assert.equal(releases,1);child.emit('exit',0,null);child.emit('close',0,null);assert.equal(releases,1);
});

test('failed admission release preserves every error, attempts persistence and blocks automatic retry',async t=>{
  for(const failPersistence of [false,true]) {let releases=0;const lease={kind:'windows-deny-write-delete',files:null,assertHeld:async()=>{throw new Error('original admission error');},release:async()=>{releases++;throw new Error('lease release error');}};const f=await fixture(t,{acquireFileLease:async({files})=>{lease.files=files;return lease;}});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});const persist=f.adapter.persist.bind(f.adapter);let attempts=0;f.adapter.persist=async entry=>{if(entry.state.startup?.status==='recovery-required'){attempts++;if(failPersistence)throw new Error('persistence error');}return persist(entry);};let failure;try{await f.adapter.start('owned');}catch(error){failure=error;}assert.ok(failure instanceof AggregateError);assert.deepEqual(failure.errors.map(error=>error.message),failPersistence?['original admission error','lease release error','persistence error']:['original admission error','lease release error']);assert.equal(attempts,1);assert.equal(f.adapter.entry('owned').lease,lease);assert.equal((await f.adapter.status('owned')).startup.status,'recovery-required');if(!failPersistence)assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'owned/state.json'),'utf8')).startup.status,'recovery-required');await assert.rejects(f.adapter.start('owned'),/Retained native lease/);assert.equal(releases,1);assert.equal(f.spawned,undefined);}
});
test('post-spawn record failure retains the actual child and lease until its exit',async t=>{
  let releases=0;const f=await fixture(t,{acquireFileLease:async({files})=>({kind:'windows-deny-write-delete',files,assertHeld:async()=>{},release:async()=>{releases++;}})});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});const persist=f.adapter.persist.bind(f.adapter);f.adapter.persist=async entry=>{if(entry.state.status==='running')throw new Error('running record failed');return persist(entry);};await assert.rejects(f.adapter.start('owned'),/running record failed/);assert.equal(f.adapter.entry('owned').child,f.child);assert.ok(f.adapter.entry('owned').lease);assert.equal(releases,0);f.child.exitCode=0;f.child.emit('exit',0,null);await f.adapter.entry('owned').exitPersistence;assert.equal(releases,1);
});
test('exit release failure still attempts durable state and retains the failed-release handle',async t=>{
  let releases=0;const lease={kind:'windows-deny-write-delete',files:null,assertHeld:async()=>{},release:async()=>{releases++;throw new Error('exit lease release failed');}};const f=await fixture(t,{acquireFileLease:async({files})=>{lease.files=files;return lease;}});const contract=await prepared(f);await f.adapter.acceptLicense('owned',{...contract,accepted:true});await f.adapter.start('owned');f.child.exitCode=0;f.child.emit('exit',0,null);await assert.rejects(f.adapter.entry('owned').exitPersistence,error=>error instanceof AggregateError&&error.errors[0].message==='exit lease release failed');assert.equal(releases,1);assert.equal(f.adapter.entry('owned').lease,lease);assert.equal(f.adapter.entry('owned').child,null);assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'owned/state.json'),'utf8')).startup.status,'recovery-required');await assert.rejects(f.adapter.start('owned'),/Retained native lease/);assert.equal(releases,1);
});
