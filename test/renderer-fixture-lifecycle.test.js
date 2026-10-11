import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {command,serveRendererFixture,requireClosureProof,retainClosureAttempt,openRendererBrowser} from '../scripts/test-renderer-browser.mjs';

async function request(url){let status=200,body;await serveRendererFixture({url},{writeHead(value){status=value;return this;},setHeader(){},end(value){body=value;}});return {status,body};}
test('fixture serves renderer and shared modules and rejects traversal and unknown roots',async()=>{
 for(const url of ['/','/app.js','/features/shell/index.js','/shared/personal-vocabulary.js','/shared/local-ux/language.js'])assert.equal((await request(url)).status,200,url);
 for(const url of ['/../package.json','/%2e%2e/package.json','/shared/%2e%2e/renderer/app.js','/shared%5c..%5cpackage.json','/native/Program.cs','/missing.js','/%zz'])assert.equal((await request(url)).status,404,url);
});
test('partial helper timeout retains ownership state and bounded original streams',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-lifecycle-regression-'));
 const state=path.join(root,'lifecycle.json'),outcomes=[];
 const script="require('node:fs').writeFileSync(process.argv[1],JSON.stringify({process:{pid:123},desktop:'fixture-only'}));process.stdout.write('partial stdout');process.stderr.write('partial stderr');setInterval(()=>{},1000)";
 await assert.rejects(command(process.execPath,['-e',script,state],undefined,process.env,value=>outcomes.push(value),{timeoutMs:10000}),error=>{
  assert.match(error.message,/timed out/);assert.equal(error.lifecycleObservation.stdout,'partial stdout');assert.equal(error.lifecycleObservation.stderr,'partial stderr');return true;
 });
 assert.equal(outcomes.length,1);assert.equal(JSON.parse(await fs.readFile(state,'utf8')).desktop,'fixture-only');
 // Deliberately retain this non-browser fixture evidence too.
});

test('actual wrapper retains original partial launch state when owned cleanup remains unverified',{skip:process.platform!=='win32'},async()=>{
 const evidenceRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-partial-wrapper-unit-'));
 const originalBytes=JSON.stringify({fixtureOnly:true,process:{pid:123},desktop:'fixture-partial-owned'});
 const events=[];let originalState,ownedProfileMarker;
 const runtime={executable:process.execPath,sourceCommit:'a'.repeat(40),chromium:{executablePath:()=>process.execPath,async connectOverCDP(){throw new Error('Partial launch must not connect.');}},async command(executable,args,input,env,onOutcome){
  const operation=args[1];events.push(operation);
  if(operation==='preflight')return {client_ok:true};
  if(operation==='launch'){
   originalState=args[3];await fs.writeFile(originalState,originalBytes);
   await fs.mkdir(path.join(input.runRoot,'profile'));
   ownedProfileMarker=path.join(input.runRoot,'profile','unit-retention-marker.txt');await fs.writeFile(ownedProfileMarker,'owned unit profile retained');
   onOutcome({operation,exitCode:null,stdout:'partial stdout',stderr:'partial stderr'});
   throw new Error('Injected partial launch helper timeout.');
  }
  assert.equal(operation,'cleanup');assert.equal(args[3],originalState);
  onOutcome({operation,exitCode:1,stdout:'',stderr:'Owned execution remains unverified.'});
  throw new Error('Owned execution remains unverified.');
 }};
 await assert.rejects(openRendererBrowser('http://127.0.0.1:49151/',{evidenceRoot,runtime}),/fixture failed and closure also failed/);
 assert.deepEqual(events,['preflight','launch','cleanup','cleanup']);
 const [attempt]=await fs.readdir(evidenceRoot);
 const retainedRoot=path.join(evidenceRoot,attempt);
 assert.equal(await fs.readFile(path.join(retainedRoot,'lifecycle.original.json'),'utf8'),originalBytes);
 assert.equal(await fs.readFile(originalState,'utf8'),originalBytes);
 assert.equal(await fs.readFile(ownedProfileMarker,'utf8'),'owned unit profile retained');
 const outcome=JSON.parse(await fs.readFile(path.join(retainedRoot,'helper-outcomes.normalized.json'),'utf8'));
 assert.equal(outcome.launchAttempted,true);assert.equal(outcome.connectionOwned,false);
 assert.equal(outcome.closure.resourcesAbsent,false);assert.equal(outcome.closure.fallback,'failed');
 assert.equal(outcome.profileRetained,true);assert.equal(outcome.outcomes[0].stdout,'partial stdout');assert.equal(outcome.outcomes[0].stderr,'partial stderr');
});

test('closure rejects helper success without both explicit absence flags',async()=>{
 const fake="process.stdout.write(JSON.stringify({client_ok:true}))";
 const result=await command(process.execPath,['-e',fake],undefined,process.env);
 assert.throws(()=>requireClosureProof(result),/explicit process and desktop absence/);
 for(const result of [{recordedProcessesAbsent:true},{desktopClosed:true},{recordedProcessesAbsent:true,desktopClosed:false}])assert.throws(()=>requireClosureProof(result));
 assert.equal(requireClosureProof({recordedProcessesAbsent:true,desktopClosed:true}),true);
});

test('actual wrapper retains pending launch journal and never cleans partial state',{skip:process.platform!=='win32'},async()=>{
 const evidenceRoot=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-pending-launch-unit-'));const events=[];
 const runtime={executable:process.execPath,sourceCommit:'a'.repeat(40),chromium:{executablePath:()=>process.execPath},async command(executable,args,input,env,onOutcome){
  events.push(args[1]);if(args[1]==='preflight')return {client_ok:true};
  assert.equal(args[1],'launch');await fs.writeFile(args[3],JSON.stringify({fixtureOnly:true,partial:true}));
  onOutcome({operation:'launch',pending:true,journalPath:path.join(input.runRoot,'launch-observation')});
  throw Object.assign(new Error('Launch observer remains pending.'),{launchPending:true});
 }};
 await assert.rejects(openRendererBrowser('http://127.0.0.1:49151/',{evidenceRoot,runtime}),/closure also failed/);
 assert.deepEqual(events,['preflight','launch']);
 const [attempt]=await fs.readdir(evidenceRoot);const outcome=JSON.parse(await fs.readFile(path.join(evidenceRoot,attempt,'helper-outcomes.normalized.json')));
 assert.equal(outcome.launchPending,true);assert.equal(outcome.closure.resourcesAbsent,false);assert.equal(outcome.outcomes[0].pending,true);
});
test('repeated closure retention preserves each original state and diagnostics',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-retention-regression-')),state=path.join(root,'state.json');
 await fs.writeFile(state,'original state');
 const first=await retainClosureAttempt(path.join(root,'evidence'),state,{error:'first failure'});
 await fs.writeFile(state,'later state');
 const second=await retainClosureAttempt(path.join(root,'evidence'),state,{error:'second failure'});
 assert.notEqual(first.statePath,second.statePath);
 assert.equal(await fs.readFile(first.statePath,'utf8'),'original state');
 assert.equal(await fs.readFile(second.statePath,'utf8'),'later state');
 assert.equal(first.stateSha256,createHash('sha256').update(await fs.readFile(first.statePath)).digest('hex'));
 assert.equal(second.stateSha256,createHash('sha256').update(await fs.readFile(second.statePath)).digest('hex'));
 const missing=await retainClosureAttempt(path.join(root,'evidence'),path.join(root,'missing.json'),{});
 assert.equal(missing.statePath,null);assert.equal(missing.stateSha256,null);
 assert.equal(JSON.parse(await fs.readFile(first.outcomePath,'utf8')).error,'first failure');
 assert.equal(JSON.parse(await fs.readFile(second.outcomePath,'utf8')).error,'second failure');
});
