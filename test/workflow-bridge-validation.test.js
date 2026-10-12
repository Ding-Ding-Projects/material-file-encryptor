import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFeatureRequest,validateRequest,validateWorkflowAdmission,WORKFLOW_DESKTOP_ACTIONS} from '../src/main/validation.js';
const id='12345678-1234-1234-1234-123456789abc';
const identity={sourceKind:'gh-keyring',credentialRevision:null};
const selection={accountId:'owner',...identity};
const preparation={...identity,documentId:id,accountId:'owner',ownerId:'owner',name:'project',visibility:'private',route:'copy-push'};
const payloads={owners:selection,accountState:{},signInAccount:{},refreshAccount:selection,setActiveAccount:selection,signOutAccount:selection,preparePublication:preparation,publishPublication:{id,confirmation:'owner/project',...identity},cancelPublication:{},browserProposals:{},prepareCapturedDownload:{id},cancelBrowserProposal:{id}};
test('all new workflow actions accept exact desktop payloads and reject browser adapter calls',()=>{
 assert.deepEqual([...WORKFLOW_DESKTOP_ACTIONS].sort(),Object.keys(payloads).sort());
 for(const action of WORKFLOW_DESKTOP_ACTIONS){assert.doesNotThrow(()=>validateFeatureRequest('workflow',action,payloads[action]));assert.throws(()=>validateFeatureRequest('workflow',action,payloads[action],{browser:true}));assert.throws(()=>validateRequest('featureRequest',{feature:'workflow',action,payload:payloads[action]}));}
});
test('credentials, host callbacks, extra fields and inherited payloads never cross the bridge',()=>{
 for(const action of WORKFLOW_DESKTOP_ACTIONS){assert.throws(()=>validateFeatureRequest('workflow',action,{...payloads[action],token:'synthetic'}));assert.throws(()=>validateFeatureRequest('workflow',action,Object.assign(Object.create({extra:true}),payloads[action])));}
 assert.throws(()=>validateFeatureRequest('workflow','receiveBrowserProposal',{}));
 assert.throws(()=>validateFeatureRequest('workflow','signInAccount',{password:'synthetic'}));
 const symbolPayload={...preparation,[Symbol('hidden')]:'value'};assert.throws(()=>validateFeatureRequest('workflow','preparePublication',symbolPayload));
});
test('publication grants, exact confirmation and fork source are bounded',()=>{
 for(const change of [{documentId:'../path'},{accountId:'bad/name'},{ownerId:'-bad'},{name:'../repo'},{name:'project.git'},{visibility:'internal'},{route:'unknown'},{route:'fork'},{route:'fork',upstream:'https://github.com/owner/repo'},{upstream:null}])assert.throws(()=>validateFeatureRequest('workflow','preparePublication',{...preparation,...change}));
 assert.doesNotThrow(()=>validateFeatureRequest('workflow','preparePublication',{...preparation,route:'fork',upstream:'owner/repository'}));
 for(const confirmation of ['yes','owner/../repo','owner/project.git','owner/name\n','owner/'+ 'x'.repeat(101)])assert.throws(()=>validateFeatureRequest('workflow','publishPublication',{id,confirmation,...identity}));
 for(const action of ['prepareCapturedDownload','cancelBrowserProposal'])assert.throws(()=>validateFeatureRequest('workflow',action,{id:'file:///private'}));
});
test('new desktop workflows require verified unlocked admission and stop during exit or update preparation',()=>{
 for(const action of WORKFLOW_DESKTOP_ACTIONS){assert.doesNotThrow(()=>validateWorkflowAdmission(action,{locked:false,lockVerified:true}));for(const state of [{},{locked:true},{locked:false,lockVerified:false},{locked:false,quitPending:true},{locked:false,shuttingDown:true},{locked:false,updateInstallLease:true}])assert.throws(()=>validateWorkflowAdmission(action,state));}
});


test('selected workflow payloads require exact source and revision without fallback',()=>{
 const selected=['owners','refreshAccount','setActiveAccount','signOutAccount','preparePublication','publishPublication'];
 for(const action of selected){const payload=payloads[action];for(const omitted of ['sourceKind','credentialRevision']){const missing={...payload};delete missing[omitted];assert.throws(()=>validateFeatureRequest('workflow',action,missing));}
  for(const pair of [{sourceKind:'protected-product',credentialRevision:null},{sourceKind:'gh-keyring',credentialRevision:id},{sourceKind:'unknown',credentialRevision:null}])assert.throws(()=>validateFeatureRequest('workflow',action,{...payload,...pair}));
  assert.doesNotThrow(()=>validateFeatureRequest('workflow',action,{...payload,sourceKind:'protected-product',credentialRevision:id}));
 }
 assert.throws(()=>validateFeatureRequest('workflow','signInAccount',{reviewedClientId:'renderer-chosen'}));
 assert.throws(()=>validateFeatureRequest('workflow','receiveBrowserProposal',{}));
});
