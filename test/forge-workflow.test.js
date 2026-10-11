import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createForgeWorkflow,runForgeCommand} from '../src/main/forge-workflow.js';
const revision='a'.repeat(40);
async function fixture(t,{changed=false,pushFail=false}={}){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'forge-workflow-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const calls=[];
 const execute=async(file,args,options)=>{calls.push({file,args,options});const has=value=>args.includes(value);let output='';let code=0;
  if(file==='gh'&&has('status'))output='  ✓ Logged in to github.com account alice (keyring)\n  - Active account: true\n  ✓ Logged in to github.com account bob (keyring)\n  - Active account: false\n';
  if(file==='gh'&&has('user')&&!has('switch')&&!has('logout'))output=JSON.stringify({login:'alice'});
  if(has('graphql'))output=JSON.stringify({data:{viewer:{login:'alice',organizations:{nodes:[{login:'write-org',viewerCanCreateRepositories:true},{login:'read-org',viewerCanCreateRepositories:false}]}}}});
  if(file==='git'&&has('--show-toplevel'))output=folder;if(file==='git'&&has('--porcelain'))output=changed?' M README.md':'';if(file==='git'&&has('HEAD'))output=revision;if(has('push')&&pushFail)code=1;
  if(file==='gh'&&has('view'))output=JSON.stringify({nameWithOwner:'write-org/example',url:'https://github.com/write-org/example',isPrivate:true,isFork:false});
  if(has('ls-remote'))output=revision+'\trefs/heads/main\n';return{code,output};};
 const service=createForgeWorkflow({dataDirectory:folder,execute,credentialStorageCheck:async()=>{},env:{GH_TOKEN:'never-forward',GIT_SSH_COMMAND:'never-forward'}});t.after(()=>service.close());return{service,folder,calls};
}
test('account discovery exposes labels and active state without forwarding bearer environment',async t=>{const{service,calls}=await fixture(t);assert.deepEqual(await service.accounts(),[{id:'alice',label:'alice',active:true},{id:'bob',label:'bob',active:false}]);assert.equal(calls[0].options.env.GH_TOKEN,undefined);assert.equal(calls[0].options.env.GIT_SSH_COMMAND,undefined);assert.deepEqual((await service.owners('alice')).map(row=>row.id),['alice','write-org']);await assert.rejects(service.owners('bob'),/Set the selected account active/);});
test('publication fails closed before mutation when durable account binding is unavailable',async t=>{const{service,folder,calls}=await fixture(t);const prepared=await service.prepare({folder,accountId:'alice',ownerId:'write-org',name:'example',visibility:'private',route:'copy-push'});assert.equal(prepared.includesCompleteHistory,true);assert.equal(prepared.publicationAvailable,false);await assert.rejects(service.publish({id:prepared.id,confirmation:'another/example'}),/Confirm/);const count=calls.length;await assert.rejects(service.publish({id:prepared.id,confirmation:'write-org/example'}),/cannot durably bind/);assert.equal(calls.length,count);assert.equal(calls.some(row=>row.args.some(arg=>['create','fork','push','clone'].includes(arg))),false);});
test('dirty source and invalid owner/name stay explicit',async t=>{const dirty=await fixture(t,{changed:true});await assert.rejects(dirty.service.prepare({folder:dirty.folder,accountId:'alice',ownerId:'write-org',name:'example',visibility:'private',route:'copy-push'}),/commit all/);const{service,folder}=await fixture(t);await assert.rejects(service.prepare({folder,accountId:'alice',ownerId:'--bad',name:'../bad',visibility:'private',route:'copy-push'}),/valid destination/);});
test('authentication presents only a fixed device challenge and supplies the browser prompt newline',async()=>{const challenges=[];const result=await runForgeCommand(process.execPath,['-e',"process.stdout.write('First copy your one-time code: ABCD-1234\\nPress Enter to open github.com in your browser\\n');process.stdin.once('data',()=>process.exit(0));"],{interactive:true,onAuthenticationChallenge:value=>challenges.push(value)});assert.equal(result.code,0);assert.deepEqual(challenges,[{verificationUri:'https://github.com/login/device',userCode:'ABCD-1234',expiresInSeconds:null}]);});
test('cancellation during a credential-check gap prevents a later mutation',async()=>{
 let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve);let checks=0;const calls=[];
 const service=createForgeWorkflow({credentialStorageCheck:async()=>{if(++checks===3){entered();await blocked;}},execute:async(file,args)=>{calls.push(args);if(args.includes('status'))return{code:0,output:'Logged in to github.com account alice (keyring)\nActive account: true'};if(args.includes('user')&&!args.includes('refresh'))return{code:0,output:'{"login":"alice"}'};return{code:0,output:''};}});
 const request=service.refresh({accountId:'alice'});await enteredPromise;service.cancel();release();await assert.rejects(request,/cancelled/);assert.equal(calls.some(args=>args.includes('refresh')),false);service.close();
});
test('cancellation after an account mutation prevents a false successful outcome',async()=>{
 let service;const calls=[];service=createForgeWorkflow({credentialStorageCheck:async()=>{},execute:async(file,args)=>{calls.push(args);if(args.includes('status'))return{code:0,output:'Logged in to github.com account alice (keyring)\nActive account: true'};if(args.includes('switch'))service.cancel();return{code:0,output:''};}});
 await assert.rejects(service.setActive({accountId:'alice'}),/cancelled/);assert.equal(calls.filter(args=>args.includes('status')).length,1);service.close();
});
test('external selected-account changes never enable the unavailable publication transport',async t=>{const{service,folder,calls}=await fixture(t);const plan=await service.prepare({folder,accountId:'alice',ownerId:'write-org',name:'example',visibility:'private',route:'copy-push'});const original=calls.length;await assert.rejects(service.publish({id:plan.id,confirmation:'write-org/example'}),/cannot durably bind/);assert.equal(calls.length,original);});
