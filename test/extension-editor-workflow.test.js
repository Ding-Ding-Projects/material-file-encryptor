import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBrowserWorkflowMediation} from '../src/main/browser-workflow-mediation.js';
import {createWorkflowServices} from '../src/main/workflow-services.js';
const session='s'.repeat(43),origin='chrome-extension://'+'a'.repeat(32)+'/';
function mediation(options={}){let pair={session,expires:Date.now()+1000000};const service=createBrowserWorkflowMediation({getPair:()=>pair,isUnlocked:()=>true,...options});return {service,replace(){pair={...pair};},send:type=>service.receive(origin,{type,session,...(type==='workflow-editor-open'?{language:'en'}:{})},()=>{})};}
test('editor mediation only accepts exact typed requests and returns bounded outcomes',async()=>{
 const f=mediation({openEditor:async({check})=>{check();return {outcome:'opened'};}});
 assert.equal((await f.send('workflow-discover')).externalEditor,true);assert.deepEqual(await f.send('workflow-editor-open'),{type:'workflow-editor-result',schemaVersion:1,outcome:'opened'});
 for(const message of [{type:'workflow-editor-open',language:'en',session,path:'C:/private'},{type:'workflow-editor-open',language:'en',session:'bad'},{type:'execute',session}])await assert.rejects(f.service.receive(origin,message,()=>{}));
 const absent=mediation();assert.equal((await absent.send('workflow-discover')).externalEditor,false);await assert.rejects(absent.send('workflow-editor-open'));
});
test('revocation, replacement and timeout prevent delayed operation continuation',async()=>{
 for(const action of ['revoke','replace','timeout']){
  let resume,continued=false;const f=mediation({timeoutMs:25,openEditor:async({check})=>{await new Promise(resolve=>resume=resolve);check();continued=true;return {outcome:'opened'};}});
  const request=f.send('workflow-editor-open'),rejected=assert.rejects(request);await new Promise(resolve=>setImmediate(resolve));
  if(action==='revoke')f.service.revoke();if(action==='replace')f.replace();
  if(action!=='timeout')resume();await rejected;if(action==='timeout')resume();await new Promise(resolve=>setImmediate(resolve));assert.equal(continued,false);f.service.close();
 }
});
test('live connection check runs again after native adapter returns',async()=>{
 let current=true;const pair={session,expires:Date.now()+100000};const service=createBrowserWorkflowMediation({getPair:()=>pair,isUnlocked:()=>true,openEditor:async()=>{current=false;return {outcome:'opened'};}});
 await assert.rejects(service.receive(origin,{type:'workflow-editor-open',language:'en',session},()=>{if(!current)throw Error('Disconnected');}),/Disconnected/);
});
async function editorFixture(cancelAtSignature=false){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'browser-editor-')),file=path.join(root,'note.txt'),editor=path.join(root,'Code.exe');await fs.writeFile(file,'note');await fs.writeFile(editor,'signed fixture');
 const prompts=[],choices=[file,editor],controller=new AbortController();let spawned=0,signatures=0,confirmations=0;
 const service=createWorkflowServices({dataDirectory:root,forgeService:{close(){},cancel(){}},dialog:{showOpenDialog:async options=>{prompts.push(options);return {canceled:false,filePaths:[choices.shift()]};},showMessageBox:async options=>{prompts.push(options);confirmations++;return {response:1};}},signatureInspector:async()=>{if(++signatures===2&&cancelAtSignature)controller.abort();return {valid:true,publisher:'O=Microsoft Corporation'};},spawnEditor:()=>{spawned++;const child=new EventEmitter();queueMicrotask(()=>child.emit('spawn'));return child;}});
 return {service,controller,prompts,get spawned(){return spawned;},get confirmations(){return confirmations;},async close(){await service.close();await fs.rm(root,{recursive:true,force:true});}};
}
test('native editor picks file and signed editor then confirms the exact selection',async()=>{
 const f=await editorFixture();try{assert.deepEqual(await f.service.openBrowserEditor({origin,signal:f.controller.signal,check(){}}),{outcome:'opened'});assert.equal(f.spawned,1);assert.equal(f.confirmations,2);assert.deepEqual(await f.service.dispatch('documents'),[]);}finally{await f.close();}
});
test('cancellation during editor signature validation prevents the actual process launch',async()=>{
 const f=await editorFixture(true);try{await assert.rejects(f.service.openBrowserEditor({origin,signal:f.controller.signal,check(){}}),/cancelled/);assert.equal(f.spawned,0);assert.deepEqual(await f.service.dispatch('documents'),[]);}finally{await f.close();}
});

test('native confirmations and pickers honor the three validated language modes',async()=>{
 for(const language of ['en','yue','bilingual']){const f=await editorFixture();try{await f.service.openBrowserEditor({origin,language,signal:f.controller.signal,check(){}});assert.equal(f.prompts.length,4);for(const prompt of f.prompts){assert.equal(/[\u3400-\u9fff]/.test(prompt.title),language!=='en');assert.equal(/[A-Za-z]/.test(prompt.title),language!=='yue');}}finally{await f.close();}}
 const f=mediation({openEditor:async()=>({outcome:'opened'})});await assert.rejects(f.service.receive(origin,{type:'workflow-editor-open',session,language:'arbitrary'},()=>{}));
});
