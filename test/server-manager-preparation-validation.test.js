import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFeatureRequest, validateRequest } from '../src/main/validation.js';
const id='12345678-1234-1234-1234-123456789abc';
const hash='a'.repeat(64);
const valid={snapshot:{},refreshCatalogue:{},versions:{catalogueId:hash,cursor:'100'},resolveVersion:{catalogueId:hash,versionId:'1.21.5'},prepare:{selectionId:id},cancel:{operationId:id},reviewLicense:{serverId:`server-${id}`}};
test('desktop preparation admits only bounded identifiers and browser transport remains unavailable',()=>{
 for(const [action,payload] of Object.entries(valid)){
  assert.deepEqual(validateFeatureRequest('server-manager',action,payload),{feature:'server-manager',action,payload});
  assert.throws(()=>validateRequest('featureRequest',{feature:'server-manager',action,payload}));
  for(const key of ['url','path','sha256','runtime','root','accepted','providerProof']) assert.throws(()=>validateFeatureRequest('server-manager',action,{...payload,[key]:'untrusted'}));
 }
 for(const action of ['start','acceptLicense','stop','forceStop']) assert.throws(()=>validateFeatureRequest('server-manager',action,{}));
});
test('preparation rejects malformed identifiers, extra keys and inherited payloads',()=>{
 for(const [action,payload] of [['prepare',{selectionId:'../escape'}],['cancel',{operationId:id+'x'}],['reviewLicense',{serverId:id}],['versions',{catalogueId:hash,cursor:'-1'}],['versions',{catalogueId:hash,cursor:100}],['resolveVersion',{catalogueId:hash,versionId:'x\n'}],['resolveVersion',{catalogueId:hash,versionId:'x'.repeat(129)}],['versions',{catalogueId:'A'.repeat(64)}],['prepare',{}]]) assert.throws(()=>validateFeatureRequest('server-manager',action,payload));
 assert.throws(()=>validateFeatureRequest('server-manager','snapshot',Object.create({url:'hidden'})));
 assert.throws(()=>validateFeatureRequest('server-manager','snapshot',{[Symbol('hidden')]:true}));
 assert.deepEqual(validateFeatureRequest('documentation','catalog',{}).payload,{});
});
