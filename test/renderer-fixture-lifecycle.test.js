import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {command,serveRendererFixture,requireClosureProof,retainClosureAttempt} from '../scripts/test-renderer-browser.mjs';

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
 const source=await fs.readFile(new URL('../scripts/test-renderer-browser.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fs\.rm\(runRoot/);assert.match(source,/launchAttempted=true;\s*await lifecycleCommand/);assert.match(source,/await fs\.access\(state\)/);
 // Deliberately retain this non-browser fixture evidence too.
});

test('closure rejects helper success without both explicit absence flags',async()=>{
 const fake="process.stdout.write(JSON.stringify({client_ok:true}))";
 const result=await command(process.execPath,['-e',fake],undefined,process.env);
 assert.throws(()=>requireClosureProof(result),/explicit process and desktop absence/);
 for(const result of [{recordedProcessesAbsent:true},{desktopClosed:true},{recordedProcessesAbsent:true,desktopClosed:false}])assert.throws(()=>requireClosureProof(result));
 assert.equal(requireClosureProof({recordedProcessesAbsent:true,desktopClosed:true}),true);
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
 assert.equal(JSON.parse(await fs.readFile(first.outcomePath,'utf8')).error,'first failure');
 assert.equal(JSON.parse(await fs.readFile(second.outcomePath,'utf8')).error,'second failure');
});
