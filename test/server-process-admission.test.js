import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServerProcessAdmission} from '../src/main/server-process-admission.js';
import {validateFeatureRequest} from '../src/main/validation.js';
test('protected native capability stays unavailable without its main-process request seam',async()=>{
 const service=createServerProcessAdmission();assert.equal((await service.capabilities()).available,false);await assert.rejects(service.initialize('owned'),/unavailable/);assert.equal(service.pending,0);assert.deepEqual(await service.close(),{closed:true,verified:true});
});
test('protected native capability emits only fixed methods and internally resolved distribution identities',async()=>{
 const calls=[],service=createServerProcessAdmission({nativeRequest:async(method,params)=>{calls.push({method,params});return method==='server.initialize'?{initialized:true}:method==='server.close'?{closed:true,verified:true}:{available:false};}});
 await service.initialize('owned');await service.register({id:'owned-id',distribution:{version:'fixture',runtime:{state:'specified',majorVersion:21},url:'private-provider-url'},distributionSha256:'a'.repeat(64)});await service.start('owned-id');await service.status('owned-id');await service.stop('owned-id');await service.close();
 assert.deepEqual(calls.map(row=>row.method),['server.initialize','server.register','server.start','server.status','server.stop','server.close']);assert.deepEqual(calls[1].params,{id:'owned-id',version:'fixture',majorVersion:21,distributionSha256:'a'.repeat(64)});await assert.rejects(service.start('owned-id'),/unavailable/);
});
test('desktop lifecycle schema rejects renderer launch authority and all browser lifecycle calls',()=>{
 const payload={serverId:'server-12345678-1234-1234-1234-123456789abc'};
 for(const action of ['acceptLicense','start','status','stop']){validateFeatureRequest('server-manager',action,payload);assert.throws(()=>validateFeatureRequest('server-manager',action,payload,{browser:true}));for(const key of ['path','port','runtime','command','url','accepted'])assert.throws(()=>validateFeatureRequest('server-manager',action,{...payload,[key]:true}));}
});
test('production constructor uses a lazy protected native callback and disables it in verification',async()=>{
 const source=await fs.readFile('src/main/main.js','utf8');assert.match(source,/nativeRequest:\(method,params\)=>\{if\(verificationMode\|\|testMode\|\|!helper\)/);assert.match(source,/return helper\.request\(method,params\)/);
});
