// Inventory and evidence admission for the integrated GUI candidate.
// Runtime acquisition stays in the existing owned Lowlevel lifecycle helpers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const axes = Object.freeze({viewports:[{width:1180,height:850},{width:880,height:650}],languages:['en','yue','bilingual'],themes:['light','dark'],scales:[1,1.25,1.5,2]});
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha256(JSON.stringify(value));
const hashPattern=/^[a-f0-9]{64}$/;
export function validateInventory(inventory,design) {
 assert.equal(inventory.schemaVersion,1);assert.deepEqual(inventory.axes,axes);
 assert.ok(Array.isArray(inventory.states)&&inventory.states.length>0);
 const ids=new Set();
 for(const state of inventory.states){
  assert.match(state.id,/^[a-z][a-z0-9-]+$/);assert.ok(!ids.has(state.id),'Duplicate state');ids.add(state.id);
  for(const key of ['owner','selector','fixture','observable'])assert.ok(typeof state[key]==='string'&&state[key].trim(),`Missing ${key}: ${state.id}`);
  assert.ok(Array.isArray(state.actions)&&state.actions.length>0,`Missing actions: ${state.id}`);
  assert.ok(state.actions.every(action=>typeof action==='string'&&action.length>0));
 }
 if(design)for(const state of design.states)assert.ok(ids.has(state.id),`Design state missing: ${state.id}`);
 return inventory;
}
export function matrixFor(inventory) {
 validateInventory(inventory);
 return inventory.states.flatMap(state=>axes.viewports.flatMap(viewport=>axes.languages.flatMap(language=>axes.themes.flatMap(theme=>axes.scales.map(scale=>({state:state.id,...viewport,language,theme,scale}))))));
}
export const tupleKey=tuple=>`${tuple.state}/${tuple.width}x${tuple.height}/${tuple.language}/${tuple.theme}/${tuple.scale}`;
export function bindingFor({sourceCommit,executableSha256,resourceSha256,verifierSha256,referenceSha256,inventory}) {
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 for(const value of [executableSha256,resourceSha256,verifierSha256,referenceSha256])assert.match(value,hashPattern);
 validateInventory(inventory);
 return {sourceCommit,executableSha256,resourceSha256,verifierSha256,referenceSha256,inventorySha256:digest(inventory)};
}
export function validateBinding(binding,inventory) {
 const expected=bindingFor({...binding,inventory});assert.deepEqual(binding,expected,'Complete exact candidate binding required');return binding;
}
export function admitRow(row,{tuple,state,binding}) {
 assert.equal(row.schemaVersion,1);assert.equal(row.status,'passed');assert.deepEqual(row.tuple,tuple);assert.deepEqual(row.binding,binding);
 assert.equal(row.route,'cheap-lowlevel-headless');assert.equal(row.captureKind,'packaged-renderer');
 assert.equal(row.scaleProof,'renderer-emulation','Renderer captures must not imply physical DPI verification');
 for(const key of ['capture','layout','referenceCapture','sideBySide','visualDiff']){
  assert.ok(row[key]?.path&&hashPattern.test(row[key].sha256),`Missing ${key} binding`);
 }
 assert.equal(row.inspection?.inspected,true);assert.equal(row.inspection?.privacyPassed,true);assert.equal(row.inspection?.correctState,true);
 assert.equal(row.inspection?.referenceReviewed,true);assert.equal(row.inspection?.designParityPassed,true);
 assert.equal(row.layoutResult?.outerFrameScroll,false);assert.deepEqual(row.layoutResult?.clipped,[]);
 assert.deepEqual(row.primitiveAudit?.genericControls,[]);assert.deepEqual(row.primitiveAudit?.unregisteredControls,[]);
 assert.equal(row.motionSettled,true);assert.equal(row.resourceGraphVerified,true);assert.equal(row.cspVerified,true);
 assert.equal(row.fixtureIdentityVerified,true);assert.equal(row.stateObservable,state.observable);
 assert.ok(Array.isArray(row.actions));
 for(const action of state.actions){const results=row.actions.filter(item=>item.id===action);assert.equal(results.length,1,`Missing or duplicate action ${action}`);const result=results[0];assert.equal(result.activated,true);assert.equal(result.observablePassed,true);assert.ok(result.evidencePath);assert.ok(hashPattern.test(result.evidenceSha256));}
 return true;
}
export async function verifyFiles(row,root) {
 const base=await fs.realpath(root);
 for(const evidence of [...['capture','layout','referenceCapture','sideBySide','visualDiff'].map(key=>row[key]),...row.actions.map(action=>({path:action.evidencePath,sha256:action.evidenceSha256}))]){
  assert.ok(!path.isAbsolute(evidence.path),'Evidence paths must be relative');
  const resolved=await fs.realpath(path.resolve(base,evidence.path));assert.ok(resolved.startsWith(base+path.sep),'Evidence escaped run root');
  assert.equal(sha256(await fs.readFile(resolved)),evidence.sha256,'Evidence bytes changed');
 }
 return true;
}
export async function auditRun({inventory,binding,rows,root,physicalDpi}) {
 validateInventory(inventory);validateBinding(binding,inventory);
 const byKey=new Map();for(const row of rows){const key=tupleKey(row.tuple);assert.ok(!byKey.has(key),'Duplicate evidence row');byKey.set(key,row);}
 const planned=matrixFor(inventory),keys=new Set(planned.map(tupleKey));for(const key of byKey.keys())assert.ok(keys.has(key),'Unknown evidence tuple');
 const pending=[],reusable=[];
 for(const tuple of planned){const key=tupleKey(tuple),row=byKey.get(key);if(!row){pending.push({key,reason:'No evidence'});continue;}
  try{admitRow(row,{tuple,state:inventory.states.find(state=>state.id===tuple.state),binding});await verifyFiles(row,root);reusable.push(key);}catch(error){pending.push({key,reason:error.message});}
 }
 let dpiPassed=false;
 try{
  assert.equal(physicalDpi?.kind,'native-display-scale');assert.deepEqual(physicalDpi.binding,binding);
  assert.equal(physicalDpi.rows.length,axes.scales.length);
  for(const scale of axes.scales){
   const matches=physicalDpi.rows.filter(row=>row.scale===scale);assert.equal(matches.length,1);
   const row=matches[0];assert.equal(row.verified,true);assert.ok(hashPattern.test(row.receiptSha256||''));assert.ok(typeof row.receiptPath==='string'&&!path.isAbsolute(row.receiptPath));
   const base=await fs.realpath(root),file=await fs.realpath(path.resolve(base,row.receiptPath));assert.ok(file.startsWith(base+path.sep));
   const bytes=await fs.readFile(file);assert.equal(sha256(bytes),row.receiptSha256);
   const receipt=JSON.parse(bytes);assert.equal(receipt.kind,'native-display-scale');assert.equal(receipt.scale,scale);assert.deepEqual(receipt.binding,binding);assert.equal(receipt.verified,true);
  }
  dpiPassed=true;
 }catch{}
 return {schemaVersion:1,expected:planned.length,reusable:reusable.length,pending,rendererMatrixPassed:pending.length===0,physicalDpiPassed:dpiPassed,passed:pending.length===0&&dpiPassed,reusableKeys:reusable};
}
// A separate ledger per state stays below the shared ledger's 128-phase bound.
// Capture receipts contain history only; resume always reacquires live identities.
export function resumeManifests({inventory,sourceRoot,sourceCommit,runRoot,executable,resource,reference,verifier}) {
 validateInventory(inventory);assert.ok(path.isAbsolute(runRoot));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 return inventory.states.map(state=>({schemaVersion:1,runId:'gui-'+state.id,runRoot:path.join(runRoot,state.id),producer:{name:'gui-acceptance',version:'1'},source:{root:sourceRoot,revision:sourceCommit},phases:matrixFor({...inventory,states:[state]}).map(tuple=>({id:tupleKey(tuple).replaceAll('/','-'),inputs:[{name:'tuple',type:'value',value:tuple},{name:'state',type:'value',value:state},...Object.entries({executable,resource,reference,verifier}).map(([name,value])=>({name,type:'file',path:value}))],artifacts:[{name:'evidence',type:'tree',path:path.join(runRoot,state.id,tupleKey(tuple).replaceAll('/','-'))}]})),cleanup:[]}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url),'utf8'));
 const design=JSON.parse(await fs.readFile(new URL('../design/gui-redesign/inventory.json',import.meta.url),'utf8'));
 validateInventory(inventory,design);
 if(process.argv[2]==='inventory')console.log(JSON.stringify({states:inventory.states.length,tuples:matrixFor(inventory).length,axes,acceptance:'unverified'},null,2));
 else if(process.argv[2]==='audit'){const input=JSON.parse(await fs.readFile(process.argv[3],'utf8'));const result=await auditRun({...input,inventory});console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:2;}
 else throw Error('Use inventory or audit <run.json>');
}
