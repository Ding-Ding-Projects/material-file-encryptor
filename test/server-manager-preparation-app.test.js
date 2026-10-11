import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

test('complete renderer module parses with synchronous workspace setup',()=>{
 const result=spawnSync(process.execPath,['--check','src/renderer/app.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('actual workspace mount queue waits for preparation settlement before final activation',async()=>{
 const source=await fs.readFile('src/renderer/app.js','utf8');
 const start=source.indexOf(' const mounts=[',source.indexOf('function setupEnhancedWorkspace()'));
 const end=source.indexOf('\n foundation.registerCommands(',start);
 assert.ok(start>0&&end>start);// The queue is evaluated as a script; callback-only module URL syntax is replaced with a literal.
 const startupStart=source.indexOf('function attemptStartup()'),startupEnd=source.indexOf('function acceptUpdateSnapshot',startupStart);assert.ok(startupEnd>startupStart);
 const code=(source.slice(startupStart,startupEnd)+source.slice(start,end)).replaceAll('import.meta.url',JSON.stringify('file:///fixture/app.js'));
 for(const rejectPreparation of [false,true]){
  const mounted=[],activated=[];let settle,refreshed=0,attempted=0;
  const context={startupStarted:false,startupReady:false,statusReady:true,updateSnapshot:{state:'idle'},startupSurprise:{attempt:async()=>{attempted++;}},localStorage:{setItem(){}},mountFeature(id){mounted.push(id);return id==='server-manager'?new Promise((resolve,reject)=>{settle=rejectPreparation?()=>reject(Error('Synthetic mount failure')):resolve;}):Promise.resolve();},foundation:{shell:{activate:value=>activated.push(value)}},view:'drive',refreshPaletteInventory:()=>refreshed++};
  vm.runInNewContext(code,context);assert.equal(mounted.filter(id=>id==='server-manager').length,1);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(activated,[]);assert.equal(refreshed,0);settle();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(activated,['drive']);assert.equal(refreshed,1);assert.equal(attempted,1);assert.equal(context.startupStarted,true);
 }
});
