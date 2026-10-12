import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveNativeExecutable} from '../scripts/renderer-native-path.mjs';
const requested=path.resolve('synthetic-request.exe'),finalPath=path.resolve('synthetic-physical.exe');
const bytes=Buffer.from('synthetic executable'),sha256=createHash('sha256').update(bytes).digest('hex');
const identity={volume:1,indexHigh:2,indexLow:3,sizeHigh:0,sizeLow:bytes.length,writtenHigh:4,writtenLow:5};
const receipt=()=>({version:1,requestedPath:requested,finalPath,sha256,fileIdentity:{...identity},finalIdentity:{...identity}});
const options=value=>({execute:async()=>({stdout:JSON.stringify(value)}),readFile:async file=>{assert.equal(file,finalPath);return bytes;}});
test('native resolution selects physical path only after exact file identity and bytes agree',async()=>{
 const result=await resolveNativeExecutable('synthetic-python',requested,options(receipt()));
 assert.equal(result.finalPath,finalPath);assert.notEqual(result.finalPath,requested);
});
test('same-hash aliases cannot substitute different native file identities',async()=>{
 const value=receipt();value.finalIdentity.indexLow++;
 await assert.rejects(resolveNativeExecutable('synthetic-python',requested,options(value)),/binding differs/);
});
test('wrong request, relative final path and incomplete identities fail before byte admission',async()=>{
 for(const change of [value=>value.requestedPath=finalPath,value=>value.finalPath='relative.exe',value=>delete value.fileIdentity.volume,value=>value.finalIdentity.volume=-1]){
  const value=receipt();change(value);await assert.rejects(resolveNativeExecutable('synthetic-python',requested,options(value)),/binding differs/);
 }
});
test('changed physical bytes reject a previously matching native resolution',async()=>{
 const value=receipt();await assert.rejects(resolveNativeExecutable('synthetic-python',requested,{...options(value),readFile:async()=>Buffer.alloc(bytes.length)}),/bytes changed/);
 const wrongSize=receipt();wrongSize.fileIdentity.sizeLow++;wrongSize.finalIdentity.sizeLow++;
 await assert.rejects(resolveNativeExecutable('synthetic-python',requested,options(wrongSize)),/size differs/);
});
