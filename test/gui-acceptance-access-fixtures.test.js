import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import {createAccessFixtures,accessControl,accessObservation} from '../scripts/gui-acceptance-access-fixtures.mjs';
import {createAccessAdapters} from '../scripts/gui-acceptance-access.mjs';
import {sha256} from '../scripts/gui-acceptance.mjs';

function fixture(overrides={}){
 const runRoot=path.resolve('synthetic-owned-session'),sourceCommit='a'.repeat(40),executable=path.join(runRoot,'package','app.exe');
 const target={kind:'extracted-packaged-runtime',sourceCommit,executable,expectedUrl:'file:///synthetic-owned-package/index.html',files:{executable},hashes:{executable:sha256('package')}};
 const native={storageDir:path.join(runRoot,'storage'),cacheDir:path.join(runRoot,'cache'),driveLetter:'Q:',mounted:true,locked:false,operation:null};
 const state={configured:false,profileGrant:false,wait:{failures:0,level:0,until:0},tickets:[],rowIds:[],privacySafe:true,confirmation:false,confirmDisabled:false,registrationOpen:false,waiting:false,unlocks:0,authenticatorCount:0,lockCount:0,...overrides};
 const calls=[];let password='',tab='profile',category='',description='',editing=false,dataFolder=path.join(runRoot,'profile'),packageBytes='package';
 const opened={connectionOwned:true,runRoot,statePath:path.join(runRoot,'lifecycle.json'),receiptPath:path.join(runRoot,'package-receipt.json'),target,fixture:{prepared:true,...native}};
 opened.receipt={launched:true,connectionOwned:true,runRoot,statePath:opened.statePath,target};
 const lifecycle={created:true,runRoot,process:{executablePath:executable}};
 const io={realpath:async p=>p,lstat:async p=>({isDirectory:()=>[runRoot,path.join(runRoot,'profile')].includes(p),isFile:()=>![runRoot,path.join(runRoot,'profile')].includes(p),isSymbolicLink:()=>false}),readFile:async p=>Buffer.from(p===executable?packageBytes:JSON.stringify(p===opened.statePath?lifecycle:opened.receipt))};
 opened.page={url:()=>target.expectedUrl,evaluate:async(fn,arg)=>{
  if(fn===accessObservation)return structuredClone(state);
  if(fn===accessControl){calls.push(arg);if(arg.operation==='value'){if(arg.selector.includes('category'))category=arg.value;else if(arg.selector.includes('description'))description=arg.value;else password=arg.value;return true;}if(arg.selector.startsWith('#access-tab-')){tab=arg.selector.slice(12);return true;}
   if(arg.selector.includes('set-up-local-profile')){assert.equal(state.configured,false);state.configured=true;state.profileGrant=true;state.privacySafe=true;}
   else if(arg.selector.includes('unlock-local-profile')){if(password==='Acceptance fixture only 2026!'){state.profileGrant=true;state.wait={failures:0,level:0,until:0};}else {state.profileGrant=false;state.wait.failures++;}password='';}
   else if(arg.selector.includes('log-out')){state.profileGrant=false;state.waiting=false;}
   else if(arg.selector.includes('add-authenticator'))state.registrationOpen=true;
   else if(arg.selector.includes('cancel-editing'))state.registrationOpen=false;
   else if(arg.selector.includes('create-local-ticket')){if(editing){state.tickets[0].description=description;editing=false;}else{state.tickets=[{id:'synthetic-ticket-1',category,description,stage:0}];state.rowIds=['synthetic-ticket-1'];}}
   else if(arg.selector.includes('data-access-action=\"edit\"'))editing=true;
   else if(arg.selector.includes('select-visible')){}
   else if(arg.selector.includes('remove-selected')){state.confirmation=true;state.confirmDisabled=true;}
   else if(arg.selector.includes('data-access-action=\"cancel\"'))state.confirmation=false;
   else if(arg.selector.includes('data-access-action=\"confirm\"')){assert.equal(state.confirmDisabled,false);state.tickets=[];state.rowIds=[];state.confirmation=false;}
   else throw Error('Unexpected test control '+arg.selector);
   return true;
  }
  if(fn.toString().includes('Two confirmation keys required')){assert.equal(state.confirmation,true);state.confirmDisabled=false;return;}
  if(fn.toString().includes('dataFolder'))return dataFolder;
  if(fn.toString().includes('window.drive.status'))return structuredClone(native);
  throw Error('Unexpected page expression');
 }};
 const provider=createAccessFixtures({opened,io}),context={binding:{sourceCommit},state:'access-profile-locked',phase:'prepare'};
 return {provider,context,state,calls,opened,native,lifecycle,io,setFolder:v=>dataFolder=v,setBytes:v=>packageBytes=v};
}
async function enter(f,state='access-profile-locked'){await f.provider.prepare({...f.context,state,phase:'prepare'});await f.provider.prepare({...f.context,state,phase:'enter'});}
test('unsupported states and actions fail before touching a native fixture',async()=>{
 const f=fixture();let nativeCalls=0;
 const inventory={states:[{id:'access-history-unlocked',owner:'access',actions:['restore-entry']}]};
 const adapter=createAccessAdapters({launch:{},inventory,fixtures:{access:f.provider},prepareOwnedFixture:async()=>{nativeCalls++;}})['access-history-unlocked'];
 await assert.rejects(adapter.prepare(f.context),/CAPABILITY_UNAVAILABLE/);assert.equal(nativeCalls,0);assert.equal(f.calls.length,0);
 assert.throws(()=>f.provider.assertCapabilities('access-profile-locked',['invented-action']),/CAPABILITY_UNAVAILABLE/);
});
test('configured foreign profile fails admission without a control mutation',async()=>{const f=fixture({configured:true});await assert.rejects(enter(f),/Fresh unconfigured/);assert.equal(f.calls.length,0);});
test('native profile and source changes are rejected before controls',async()=>{const f=fixture();f.setFolder(path.resolve('not-owned-profile'));await assert.rejects(enter(f),/Native profile/);assert.equal(f.calls.length,0);const g=fixture();g.context.binding.sourceCommit='b'.repeat(40);await assert.rejects(enter(g),/Source binding/);assert.equal(g.calls.length,0);});
test('package and drive drift prevent later actions',async()=>{const f=fixture();await enter(f);f.setBytes('changed');await assert.rejects(f.provider.perform({...f.context,action:'begin-unlock'}),/Package bytes changed/);const g=fixture();await enter(g);g.native.mounted=false;await assert.rejects(g.provider.observe({...g.context,action:'state'}),/native drive state/);});
test('profile wrong attempt is causally observed and restored through successful controls',async()=>{
 const f=fixture();await enter(f);assert.equal(f.state.configured,true);assert.equal(f.state.profileGrant,false);
 await f.provider.perform({...f.context,action:'begin-unlock'});assert.equal(f.state.wait.failures,1);await f.provider.observe({...f.context,action:'begin-unlock'});
 await f.provider.perform({...f.context,action:'cancel-unlock'});assert.equal(f.state.wait.failures,0);assert.equal(f.state.profileGrant,false);
 const result=await f.provider.restore(f.context);assert.equal(result.restored,true);assert.equal(result.profileRetained,true);assert.equal(result.nativeDriveUnchanged,true);
 assert.ok(f.calls.some(x=>x.selector.includes('set-up-local-profile')));assert.ok(f.calls.filter(x=>x.selector.includes('unlock-local-profile')).length>=3);
 assert.equal(JSON.stringify(result).includes('Acceptance fixture only'),false);
});
test('wrong-attempt observation rejects transport success with unchanged host state',async()=>{const f=fixture();await enter(f);await assert.rejects(f.provider.observe({...f.context,action:'begin-unlock'}));});
test('registration is entered and restored through production controls',async()=>{const f=fixture();await enter(f,'access-authenticator-registration');assert.equal(f.state.registrationOpen,true);await f.provider.observe({...f.context,state:'access-authenticator-registration',action:'state'});await f.provider.restore(f.context);assert.equal(f.state.registrationOpen,false);});
test('unexpected durable ticket identity blocks restoration rather than deleting it',async()=>{const f=fixture();await enter(f);f.state.tickets=[{id:'foreign',category:'Synthetic acceptance',description:'Synthetic local support fixture.',stage:0}];f.state.rowIds=['foreign'];const count=f.calls.length;await assert.rejects(f.provider.restore(f.context),/Unexpected ticket identity/);assert.equal(f.calls.length,count);});
test('restoration refuses to report success while private output remains',async()=>{const f=fixture();await enter(f);f.state.privacySafe=false;await assert.rejects(f.provider.restore(f.context),/Private output/);});
test('control driver rejects duplicates, hidden, disabled and nonregistered elements',()=>{
 const good={tagName:'MD-FILLED-BUTTON',getClientRects:()=>[{}],closest:()=>null,getAttribute:()=>null,click(){this.clicked=true;}};
 for(const rows of [[],[good,good],[{...good,disabled:true}],[{...good,tagName:'BUTTON'}],[{...good,getClientRects:()=>[]}]])assert.throws(()=>vm.runInNewContext('('+accessControl.toString()+')({selector:"x",operation:"click"})',{document:{querySelectorAll:()=>rows}}));
 vm.runInNewContext('('+accessControl.toString()+')({selector:"x",operation:"click"})',{document:{querySelectorAll:()=>[good]}});assert.equal(good.clicked,true);
});

test('confirmation preparation creates then edits one durable identity and restoration removes it',async()=>{const f=fixture();await enter(f,'access-confirmation');assert.equal(f.state.tickets.length,1);assert.equal(f.state.tickets[0].description,'Synthetic edited local support fixture.');assert.equal(f.state.confirmDisabled,true);await f.provider.observe({...f.context,state:'access-confirmation',action:'reject-early-confirm'});const result=await f.provider.restore(f.context);assert.equal(result.restored,true);assert.deepEqual(f.state.tickets,[]);assert.equal(f.state.confirmation,false);});
test('early-confirm evidence requires the original durable ticket to remain',async()=>{const f=fixture();await enter(f,'access-confirmation');f.state.tickets=[];f.state.rowIds=[];await assert.rejects(f.provider.observe({...f.context,state:'access-confirmation',action:'reject-early-confirm'}));});

test('live process identity drift stops the same-url session',async()=>{const f=fixture();await enter(f);f.lifecycle.process.pid=991;await assert.rejects(f.provider.observe({...f.context,action:'state'}),/lifecycle process changed/);});
