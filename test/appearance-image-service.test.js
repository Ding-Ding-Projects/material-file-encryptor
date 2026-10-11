import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppearanceImageService} from '../src/main/appearance-image-service.js';
import {validateFeatureRequest} from '../src/main/validation.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const dataUrl='data:image/png;base64,'+png.toString('base64');
function provider(run){return {verifiedOsIsolation:true,verifiedMediaRuntime:true,launch:run};}
test('image normalization requires verified isolation and retains no input bytes after success',async()=>{
 let input,output;
 const service=createAppearanceImageService({getProvider:async()=>provider(request=>{assert.equal(request.adapterId,'image-png');input=request.inputs[0];output=Buffer.from(png);return {result:Promise.resolve({outputs:[{bytes:output}],details:{decoded:true,metadataRemoved:true}}),terminate:async()=>{}};})});
 const result=await service.normalize({dataUrl});assert.equal(result.isolation,'app-container');assert.equal(result.width,1);assert.equal(result.height,1);assert.equal(result.dataUrl,dataUrl);assert.ok(input.every(n=>n===0));assert.ok(output.every(n=>n===0));assert.equal(service.pending,0);
 const unavailable=createAppearanceImageService({getProvider:async()=>({verifiedOsIsolation:false})});await assert.rejects(unavailable.normalize({dataUrl}),/unavailable/);
});
test('image admission is bounded and cancel waits for the active worker',async()=>{
 let rejectWork,terminated=false;
 const service=createAppearanceImageService({getProvider:async()=>provider(()=>({result:new Promise((_,reject)=>{rejectWork=reject;}),terminate:async()=>{terminated=true;rejectWork(new Error('Cancelled.'));}}))});
 const pending=service.normalize({dataUrl});await new Promise(resolve=>setImmediate(resolve));assert.equal(service.pending,1);await assert.rejects(service.normalize({dataUrl}),/Another image/);await service.cancelAll();await assert.rejects(pending,/Cancelled/);assert.equal(terminated,true);assert.equal(service.pending,0);await service.close();await assert.rejects(service.normalize({dataUrl}),/stopping/);
});
test('unverified decoded output and invalid PNG input cannot be returned',async()=>{
 let launches=0;
 const service=createAppearanceImageService({getProvider:async()=>provider(()=>{launches++;return {result:Promise.resolve({outputs:[{bytes:Buffer.from(png)}],details:{decoded:false,metadataRemoved:true}})};})});
 await assert.rejects(service.normalize({dataUrl:'data:image/png;base64,AAAA'}));assert.equal(launches,0);await assert.rejects(service.normalize({dataUrl}),/verified output/);
});
test('large image payload exception is desktop-only and does not widen other feature actions',()=>{
 const payload={dataUrl:'x'.repeat(300000)};
 assert.equal(validateFeatureRequest('personalization','normalizeImage',payload).action,'normalizeImage');
 assert.throws(()=>validateFeatureRequest('personalization','normalizeImage',payload,{browser:true}));
 assert.throws(()=>validateFeatureRequest('personalization','sharedWrite',payload));
 assert.throws(()=>validateFeatureRequest('personalization','normalizeImage',{dataUrl:'x'.repeat(6*1024*1024)}));
});
