import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,pbkdf2Sync} from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verifyRuntime(page,target){
 assert.equal(target.kind,'extracted-packaged-runtime');assert.equal(page.url(),target.expectedUrl);assert.ok(target.expectedUrl.startsWith('file:'));
 assert.match(target.sourceCommit,/^[a-f0-9]{40}$/);assert.match(target.hashes?.executable||'',/^[a-f0-9]{64}$/);
 const bytes=await fs.readFile(target.executable);assert.equal(digest(bytes),target.hashes.executable,'Packaged runtime changed');
 return {sourceCommit:target.sourceCommit,executableSha256:target.hashes.executable,resourceSha256:target.hashes.asar};
}

// The fixed input is public synthetic test data. Derived bytes remain transient
// in memory and never appear in the returned diagnostic or assertion messages.
// This probes renderer WebCrypto only, not the packaged main-process runtime.
export async function probePackagedBrowserPbkdf2(page,{target,maxIterations=100}={}){
 assert.equal(maxIterations,100,'The diagnostic bound is fixed, not retry-until-pass');
 const binding=await verifyRuntime(page,target),reference=pbkdf2Sync('synthetic',Buffer.alloc(16,7),310000,32,'sha256');
 let result;
 try{
  result=await page.evaluate(async expected=>{
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('synthetic'),'PBKDF2',false,['deriveBits']);let completed=0,firstMismatch=null;
   for(let index=0;index<100;index++){
    const value=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(16).fill(7),iterations:310000},key,256));
    const matches=value.length===expected.length&&value.every((byte,offset)=>byte===expected[offset]);value.fill(0);completed++;
    if(!matches){firstMismatch=index+1;break;}
   }
   expected.fill(0);return {completed,firstMismatch,allMatched:firstMismatch===null,stoppedOnFirstMismatch:firstMismatch!==null};
  },[...reference]);
 }finally{reference.fill(0);}
 await verifyRuntime(page,target);
 assert.ok(Number.isInteger(result.completed)&&result.completed>=1&&result.completed<=100);
 assert.equal(result.firstMismatch===null,result.allMatched);assert.equal(result.allMatched?result.completed:result.firstMismatch,result.completed);
 return {schemaVersion:1,scope:'packaged-renderer-webcrypto',binding,referenceRuntime:{version:process.version,executableSha256:digest(await fs.readFile(process.execPath))},iterationsPerDerivation:310000,maximumDerivations:100,...result,mainRuntimeProbed:false,derivedBytesRetained:false};
}

// AX data is acquired from the actual Chromium accessibility tree. Only the
// bounded dialog/radio names and backend node IDs requested below are returned.
export async function probePackagedAccessibility(page,{target,dialogSelector='#vault-dialog',history=false}={}){
 const binding=await verifyRuntime(page,target);
 const declared=await page.locator(dialogSelector).evaluate(node=>{
  if(!node.open||!node.getClientRects().length)throw Error('Open production dialog required');
  const ids=(node.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
  return {label:node.getAttribute('aria-label')||ids.map(id=>node.ownerDocument.getElementById(id)?.textContent||'').join(' ').trim(),visible:true};
 });
 assert.ok(declared.label,'Outer dialog has no declared accessible name');
 const session=await page.context().newCDPSession(page);let nodes;
 try{await session.send('Accessibility.enable');({nodes}=await session.send('Accessibility.getFullAXTree'));}finally{await session.detach();}
 const dialogs=nodes.filter(node=>!node.ignored&&['dialog','alertdialog'].includes(node.role?.value)).map(node=>({role:node.role.value,name:node.name?.value||'',backendNodeId:node.backendDOMNodeId}));
 assert.equal(dialogs.length,1,'Expected one open accessible dialog');
 const result={schemaVersion:1,scope:'packaged-accessibility-tree',binding,dialog:{declaredName:declared.label,...dialogs[0],namePresent:Boolean(dialogs[0].name.trim()),nameMatchesDeclared:dialogs[0].name.trim()===declared.label.trim()},historyProbed:false};
 // History cannot be probed behind a modal dialog. The caller must use a
 // separate visible-history invocation after ordinary dialog dismissal.
 assert.equal(history,false,'History radio inspection needs its separate visible state');
 await verifyRuntime(page,target);return result;
}

export async function probePackagedHistoryNames(page,{target}={}){
 const binding=await verifyRuntime(page,target);
 const versions=await page.locator('#history-list md-radio[data-history-select]').count();assert.ok(versions>=2,'At least two real synthetic versions are required');
 const session=await page.context().newCDPSession(page);const radios=[];
 try{
  await session.send('Accessibility.enable');await session.send('DOM.enable');
  const {root}=await session.send('DOM.getDocument',{depth:-1,pierce:true});
  const {nodeIds}=await session.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'#history-list md-radio[data-history-select]'});assert.equal(nodeIds.length,versions);
  for(const nodeId of nodeIds){const {nodes}=await session.send('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:true});const radio=nodes.find(node=>!node.ignored&&node.role?.value==='radio');assert.ok(radio,'Material radio missing from actual AX tree');radios.push({name:radio.name?.value||'',backendNodeId:radio.backendDOMNodeId});}
 }finally{await session.detach();}
 await verifyRuntime(page,target);return {schemaVersion:1,scope:'packaged-history-accessibility',binding,versionCount:versions,radios,allNamed:radios.every(row=>row.name.trim()),distinctNames:new Set(radios.map(row=>row.name)).size===radios.length};
}
