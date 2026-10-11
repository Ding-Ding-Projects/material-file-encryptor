import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createForgeToolResolver,captureSelectedForgeCredential} from '../src/main/forge-transport.js';
test('bundled resolver binds exact paths and hashes and rejects later executable replacement',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forge-tools-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const receipt={schema:1};for(const[name,relativePath,version]of [['gh','gh/bin/gh.exe','2.102.0'],['git','git/cmd/git.exe','2.56.0.windows.2']]){const target=path.join(root,relativePath);await fs.mkdir(path.dirname(target),{recursive:true});const bytes=Buffer.from('synthetic-'+name);await fs.writeFile(target,bytes);receipt[name]={relativePath,version,sha256:createHash('sha256').update(bytes).digest('hex')};}await fs.writeFile(path.join(root,'forge-executables.json'),JSON.stringify(receipt));const resolve=createForgeToolResolver(root);assert.equal(await resolve('gh'),path.join(root,'gh/bin/gh.exe'));await fs.writeFile(path.join(root,'gh/bin/gh.exe'),'different');await assert.rejects(resolve('gh'),/unavailable or changed/);
});
function fakeSpawn({output=Buffer.from('fixture_selected\n'),code=0,diagnostic=''}={}){const calls=[];const spawnChild=(file,args,options)=>{calls.push({file,args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};queueMicrotask(()=>{child.stderr.write(Buffer.from(diagnostic));child.stdout.write(Buffer.from(output));child.emit('close',code);});return child;};return{calls,spawnChild};}
test('selected credential capture uses exact secure-only lookup without active-account fallback',async()=>{const fake=fakeSpawn(),result=await captureSelectedForgeCredential(path.resolve('synthetic-tools/gh.exe'),'alice',{env:{},spawnChild:fake.spawnChild});assert.equal(result.toString(),'fixture_selected\n');assert.deepEqual(fake.calls[0].args,['auth','token','--hostname','github.com','--user','alice','--secure-storage']);assert.equal(fake.calls[0].options.shell,false);result.fill(0);});
test('private capture errors discard stdout and stderr details',async()=>{const fake=fakeSpawn({output:Buffer.from('fixture_private_material'),diagnostic:'fixture_private_diagnostic',code:1});await assert.rejects(captureSelectedForgeCredential(path.resolve('synthetic-tools/gh.exe'),'alice',{env:{},spawnChild:fake.spawnChild}),error=>/protected credential is unavailable/.test(error.message)&&!/fixture_private/.test(error.message));});
test('oversized private capture fails without exposing its bytes',async()=>{const fake=fakeSpawn({output:Buffer.alloc(4097,65)});await assert.rejects(captureSelectedForgeCredential(path.resolve('synthetic-tools/gh.exe'),'alice',{env:{},spawnChild:fake.spawnChild}),/protected credential is unavailable/);});
