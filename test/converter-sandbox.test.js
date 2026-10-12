import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import {probeRestrictedRuntime,createRestrictedProcess} from '../src/features/converter/sandbox.mjs';
const execute=promisify(execFile);
const unavailable=error=>error.code==='ERR_CONVERTER_NETWORK_ISOLATION_UNAVAILABLE'&&/operating-system isolation/.test(error.message);

test('observed network behavior never substitutes for operating-system isolation',async t=>{
 const sockets=new Set();let connections=0;
 const server=net.createServer(socket=>{connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.end();});
 t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const source=`const net=require('node:net');const p=process.permission;const value={networkScope:p.has('net'),unknownScope:p.has('converter-unknown-scope')};const socket=net.connect(${server.address().port},'127.0.0.1');socket.once('connect',()=>{process.stdout.write(JSON.stringify({...value,connected:true}));socket.destroy();});socket.once('error',error=>{process.stdout.write(JSON.stringify({...value,connected:false,error:error.code}));});`;
 const result=await execute(process.env.CONVERTER_TEST_NODE||process.execPath,['--permission','-e',source],{encoding:'utf8',timeout:5000,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
 const observed=JSON.parse(result.stdout);
 assert.equal(observed.networkScope,false);assert.equal(observed.unknownScope,false);
 if(observed.connected)assert.equal(connections,1,'The owned listener must observe the connection');
 else{assert.equal(observed.error,'ERR_ACCESS_DENIED');assert.equal(connections,0);}
 t.diagnostic(observed.connected?'Controlled loopback connected despite false scope queries.':'This runtime denied controlled loopback; OS confinement is still unavailable.');
 assert.equal(probeRestrictedRuntime(),false,'Network-capable runtimes must not pass sandbox admission');
});

test('permission-only launch is unavailable before input or option access',()=>{
 let reads=0;
 const request=new Proxy({},{get(){reads++;throw new Error('Input must not be inspected');}});
 assert.throws(()=>createRestrictedProcess(request),unavailable);
 assert.equal(reads,0);
});

test('permission-only launch rejects absolute and relative runtime paths',()=>{
 for(const executable of [process.execPath,'node','/missing/runtime']){
  assert.equal(probeRestrictedRuntime(executable),false);
  assert.throws(()=>createRestrictedProcess({inputs:[Buffer.from('synthetic')],adapterId:'hex',options:{},executable}),unavailable);
 }
});
