import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {axes,validateInventory,matrixFor,bindingFor,validateBinding,admitRow,auditRun,resumeManifests,sha256} from '../scripts/gui-acceptance.mjs';
const inventory=JSON.parse(await fs.readFile(new URL('../contracts/gui-states.json',import.meta.url),'utf8'));
const design=JSON.parse(await fs.readFile(new URL('../design/gui-redesign/inventory.json',import.meta.url),'utf8'));
const accessDesign=JSON.parse(await fs.readFile(new URL('../design/gui-access/state-inventory.json',import.meta.url),'utf8'));
const binding=bindingFor({inventory,sourceCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),resourceSha256:'c'.repeat(64),verifierSha256:'d'.repeat(64),referenceSha256:'e'.repeat(64)});
const tuple=matrixFor(inventory)[0],state=inventory.states[0];
function row(){const evidence={path:'proof.json',sha256:sha256('proof')};return {schemaVersion:1,status:'passed',tuple,binding,route:'cheap-lowlevel-headless',captureKind:'packaged-renderer',scaleProof:'renderer-emulation',capture:evidence,layout:evidence,referenceCapture:evidence,sideBySide:evidence,visualDiff:evidence,inspection:{inspected:true,privacyPassed:true,correctState:true,referenceReviewed:true,designParityPassed:true},layoutResult:{outerFrameScroll:false,clipped:[]},primitiveAudit:{genericControls:[],unregisteredControls:[]},motionSettled:true,resourceGraphVerified:true,cspVerified:true,fixtureIdentityVerified:true,stateObservable:state.observable,actions:state.actions.map(id=>({id,activated:true,observablePassed:true,evidencePath:evidence.path,evidenceSha256:evidence.sha256}))};}
test('hand-written inventory covers every baseline and access design state and exactly 48 tuples per state',()=>{validateInventory(inventory,design);validateInventory(inventory,accessDesign);assert.equal(matrixFor(inventory).length,87*48);for(const id of ['access-once','storage-busy','storage-paused','converter-queue','p-school-enabled','appearance-motion-transition','p-schedule-restored-base'])assert.ok(inventory.states.some(s=>s.id===id));});
test('missing baseline screen and duplicate state cannot silently shrink acceptance',()=>{const missing=structuredClone(inventory);missing.states.shift();assert.throws(()=>validateInventory(missing,design),/Design state missing/);const duplicate=structuredClone(inventory);duplicate.states.push(duplicate.states[0]);assert.throws(()=>validateInventory(duplicate),/Duplicate/);});
test('missing state actions and unsupported tuple axes fail closed',()=>{const missing=structuredClone(inventory);missing.states[0].actions=[];assert.throws(()=>validateInventory(missing));const changed=structuredClone(inventory);changed.axes.scales=[1];assert.throws(()=>validateInventory(changed));});
test('complete declared row admits but source fixture and physical DPI relabel do not',()=>{assert.equal(admitRow(row(),{tuple,state,binding}),true);for(const patch of [{captureKind:'source-fixture'},{scaleProof:'native-display-scale'},{binding:{...binding,sourceCommit:'f'.repeat(40)}}])assert.throws(()=>admitRow({...row(),...patch},{tuple,state,binding}));});
test('audit entry rejects omitted and malformed candidate bindings',async()=>{
 for(const key of Object.keys(binding)){const incomplete={...binding};delete incomplete[key];assert.throws(()=>validateBinding(incomplete,inventory));await assert.rejects(auditRun({inventory,binding:incomplete,rows:[],root:os.tmpdir()}));}
 await assert.rejects(auditRun({inventory,binding:{...binding,sourceCommit:'invalid'},rows:[],root:os.tmpdir()}));
});
test('native display-scale proof requires existing unchanged receipts from this candidate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-gui-dpi-'));try{
  const physicalDpi={kind:'native-display-scale',binding,rows:[]};
  for(const scale of axes.scales){const receiptPath=`dpi-${scale}.json`;const bytes=JSON.stringify({kind:'native-display-scale',binding,scale,verified:true});await fs.writeFile(path.join(root,receiptPath),bytes);physicalDpi.rows.push({scale,verified:true,receiptPath,receiptSha256:sha256(bytes)});}
  const audit=()=>auditRun({inventory,binding,rows:[],root,physicalDpi});assert.equal((await audit()).physicalDpiPassed,true);
  physicalDpi.binding={...binding,sourceCommit:'f'.repeat(40)};assert.equal((await audit()).physicalDpiPassed,false);physicalDpi.binding=binding;
  const first=path.join(root,physicalDpi.rows[0].receiptPath);await fs.writeFile(first,'changed');assert.equal((await audit()).physicalDpiPassed,false);await fs.unlink(first);assert.equal((await audit()).physicalDpiPassed,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('generic controls, inactive actions, undismissable menus, outer scroll and missing inspection reject admission',()=>{
 for(const mutate of [r=>r.primitiveAudit.genericControls.push('button'),r=>r.primitiveAudit.unregisteredControls.push('md-menu'),r=>r.actions[0].observablePassed=false,r=>r.actions.pop(),r=>r.layoutResult.outerFrameScroll=true,r=>r.layoutResult.clipped.push('field'),r=>r.inspection.inspected=false,r=>r.inspection.designParityPassed=false,r=>r.referenceCapture=null]){const receipt=row();mutate(receipt);assert.throws(()=>admitRow(receipt,{tuple,state,binding}));}
 const menu=inventory.states.find(s=>s.id==='drive-overflow');assert.ok(menu.actions.includes('escape')&&menu.actions.includes('outside-click')&&menu.actions.includes('target-removal'));
});
test('resumable manifests have bounded per-state phases and no live identities or deletion targets',()=>{const manifests=resumeManifests({inventory,sourceRoot:process.cwd(),sourceCommit:binding.sourceCommit,runRoot:path.join(os.tmpdir(),'gui-acceptance-example'),executable:'app.exe',resource:'app.asar',reference:'reference.html',verifier:'gui-acceptance.mjs'});assert.equal(manifests.length,87);assert.ok(manifests.every(m=>m.phases.length===48&&m.cleanup.length===0));assert.doesNotMatch(JSON.stringify(manifests),/"(?:pid|hwnd|port|targetId)":/);});
test('resume hashes bytes, reports missing tuples, and never promotes emulation to physical DPI',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-gui-admission-'));try{
  await fs.writeFile(path.join(root,'proof.json'),'proof');let result=await auditRun({inventory,binding,rows:[row()],root});assert.equal(result.reusable,1);assert.equal(result.pending.length,4175);assert.equal(result.passed,false);assert.equal(result.physicalDpiPassed,false);
  await fs.writeFile(path.join(root,'proof.json'),'changed');result=await auditRun({inventory,binding,rows:[row()],root});assert.equal(result.reusable,0);assert.match(result.pending[0].reason,/Evidence bytes changed/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

