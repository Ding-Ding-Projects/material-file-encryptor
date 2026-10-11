import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {containedFile,verifyStatic,installNetworkBoundary,processIdentity,ownedTree,absent,profileDisposition} from './capture-visitor-evidence.mjs';
const parent=path.resolve('out/capture-mechanics');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'owned-'));await fs.writeFile(path.join(root,'index.html'),'synthetic public fixture');
const data=await fs.readFile(path.join(root,'index.html'));const receipt={sourceCommit:'a'.repeat(40),files:[{path:'index.html',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}]};
assert.equal(await verifyStatic(root,receipt),true);
for(const name of ['/outside','/material-file-encryptor/../private','/material-file-encryptor/%2e%2e/private','/material-file-encryptor/%5cprivate','/material-file-encryptor/%00'])assert.equal(containedFile(root,name),null);
await fs.writeFile(path.join(root,'index.html'),'changed');await assert.rejects(verifyStatic(root,receipt),/STATIC_BYTES_CHANGED/);await fs.writeFile(path.join(root,'index.html'),data);assert.equal(await verifyStatic(root,receipt),true);
console.log('PASS: actual containment and static-byte admission mechanics. No browser was launched; owned fixtures retained.');

const callbacks={},events={},networkReceipt={network:[]};
const context={async route(pattern,handler){callbacks.request=handler;},async routeWebSocket(pattern,handler){callbacks.socket=handler;}};
const network=await installNetworkBoundary(context,networkReceipt,'http://127.0.0.1:4321');network.attachPage({on(event,handler){events[event]=handler;}});
let continued=0,aborted=0,closed=0,connected=0;
const route=url=>({request:()=>({url:()=>url,method:()=> 'GET',resourceType:()=> 'script'}),continue:async()=>continued++,abort:async()=>aborted++});
for(let i=0;i<2001;i++)await callbacks.request(route('http://127.0.0.1:4321/material-file-encryptor/a.js'));
assert.equal(networkReceipt.network.length,2000);assert.equal(networkReceipt.networkRecording.dropped,1);
for(let i=0;i<2001;i++)events.response({url:()=> 'http://127.0.0.1:4321/material-file-encryptor/a.js',status:()=>200});
assert.equal(networkReceipt.network.length,2000);assert.equal(networkReceipt.networkRecording.dropped,2002);assert.equal(networkReceipt.networkRecording.truncated,true);
await callbacks.request(route('https://outside.invalid/private'));assert.equal(aborted,1);assert.equal(continued,2001);
await callbacks.socket({url:()=> 'wss://outside.invalid/socket',close:async options=>{assert.equal(options.code,1008);closed++;},connectToServer:()=>connected++});assert.equal(closed,1);assert.equal(connected,0);assert.equal(networkReceipt.network.length,2000);assert.equal(networkReceipt.networkRecording.seen,4004);
console.log('PASS: actual installed HTTP/response/socket callbacks share a 2000-event cap, report drops, and still block external traffic after saturation. No browser launched.');

const stat=birth=>'1 (synthetic browser) '+['S',...Array(18).fill('0'),birth].join(' ');
const failing=code=>async()=>{throw Object.assign(Error('Synthetic process observation'),{code});};
for(const code of ['EACCES','EIO']){assert.equal((await processIdentity(1,{readFile:failing(code)})).state,'unknown');assert.equal((await absent([{pid:1,startTicks:'123'}],{readFile:failing(code)})).verified,false);}
assert.equal((await absent([{pid:1,startTicks:'123'}],{readFile:failing('ENOENT')})).verified,true);
assert.equal((await absent([{pid:1,startTicks:'123'}],{readFile:async()=>stat('124')})).verified,true);
assert.equal((await absent([{pid:1,startTicks:'123'}],{readFile:async()=>stat('123')})).verified,false);
const deniedChildren=async name=>name.endsWith('/stat')?stat('123'):failing('EACCES')();assert.equal((await ownedTree(1,{readFile:deniedChildren})).complete,false);
const overflow=async name=>name.endsWith('/stat')?stat('123'):'2 3';const tree=await ownedTree(1,{readFile:overflow,limit:2});assert.equal(tree.complete,false);assert.ok(tree.reasons.includes('tree-limit'));assert.equal(tree.identities.length,2);
console.log('PASS: actual process/tree consumers distinguish unknown EACCES/EIO from ENOENT and changed birth, and report unreadable or truncated trees. No processes launched.');

assert.deepEqual(await profileDisposition('owned-profile',{lstat:async()=>({})}),{state:'retained'});
assert.deepEqual(await profileDisposition('owned-profile',{lstat:failing('ENOENT')}),{state:'absent'});
for(const code of ['EACCES','EIO'])assert.deepEqual(await profileDisposition('owned-profile',{lstat:failing(code)}),{state:'unknown',reason:code});
assert.deepEqual(await profileDisposition('owned-profile',{lstat:failing('unbounded sensitive message')}),{state:'unknown',reason:'OBSERVATION_FAILED'});
assert.deepEqual(await profileDisposition(null,{lstat:async()=>{throw Error('Must not inspect an unobserved profile');}}),{state:'unobserved'});
console.log('PASS: actual profile consumer reports present, ENOENT absence and EACCES/EIO unknown with bounded codes. No browser launched.');
