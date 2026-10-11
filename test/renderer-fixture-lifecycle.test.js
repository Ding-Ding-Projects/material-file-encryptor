import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {command,serveRendererFixture} from '../scripts/test-renderer-browser.mjs';

async function request(url){let status=200,body;await serveRendererFixture({url},{writeHead(value){status=value;return this;},setHeader(){},end(value){body=value;}});return {status,body};}
test('fixture serves renderer and shared modules and rejects traversal and unknown roots',async()=>{
 for(const url of ['/','/app.js','/features/shell/index.js','/shared/personal-vocabulary.js','/shared/local-ux/language.js'])assert.equal((await request(url)).status,200,url);
 for(const url of ['/../package.json','/%2e%2e/package.json','/shared/%2e%2e/renderer/app.js','/shared%5c..%5cpackage.json','/native/Program.cs','/missing.js','/%zz'])assert.equal((await request(url)).status,404,url);
});
test('partial helper timeout retains ownership state and bounded original streams',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-lifecycle-regression-'));
 const state=path.join(root,'lifecycle.json'),outcomes=[];
 const script="require('node:fs').writeFileSync(process.argv[1],JSON.stringify({process:{pid:123},desktop:'fixture-only'}));process.stdout.write('partial stdout');process.stderr.write('partial stderr');setInterval(()=>{},1000)";
 await assert.rejects(command(process.execPath,['-e',script,state],undefined,process.env,value=>outcomes.push(value),{timeoutMs:1000}),error=>{
  assert.match(error.message,/timed out/);assert.equal(error.lifecycleObservation.stdout,'partial stdout');assert.equal(error.lifecycleObservation.stderr,'partial stderr');return true;
 });
 assert.equal(outcomes.length,1);assert.equal(JSON.parse(await fs.readFile(state,'utf8')).desktop,'fixture-only');
 const source=await fs.readFile(new URL('../scripts/test-renderer-browser.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fs\.rm\(runRoot/);assert.match(source,/launchAttempted=true;\s*await lifecycleCommand/);assert.match(source,/await fs\.access\(state\)/);
 // Deliberately retain this non-browser fixture evidence too.
});
