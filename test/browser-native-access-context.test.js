import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {validateFeatureRequest} from '../src/main/validation.js';

const main=await fs.readFile(new URL('../src/main/main.js',import.meta.url),'utf8');
function fixture(){
 const frame={},window={webContents:{mainFrame:frame}},calls=[],callbacks={};
 const context=vm.createContext({Error,window,rendererURL:'https://desktop.invalid',features:{request:async(...args)=>{calls.push(args);return{accepted:true};}},trustedFrame:event=>event.senderFrame===frame,validateFeatureRequest,
  ipcMain:{handle:(channel,callback)=>{callbacks[channel]=callback;}}});
 vm.runInContext(main.slice(main.indexOf('async function featureRequest('),main.indexOf('async function acquireUpdateLease(')),context);
 for(const channel of ['feature:request','vault:request']){
  const line=main.split(/\r?\n/).find(line=>line.includes(`ipcMain.handle('${channel}'`));assert.ok(line);vm.runInContext(line,context);
 }
 return{frame,context,calls,callbacks};
}
test('validated feature IPC carries only its actual sender frame in separate native context',async()=>{
 const f=fixture();await f.callbacks['feature:request']({senderFrame:f.frame},'access','dataFolder',{});assert.equal(f.calls.length,1);assert.equal(f.calls[0][3].senderFrame,f.frame);assert.deepEqual(Object.keys(f.calls[0][3]),['senderFrame']);assert.deepEqual(Object.keys(f.calls[0][2]),[]);
 await assert.rejects(f.callbacks['feature:request']({senderFrame:{}},'access','dataFolder',{}),/Untrusted/);assert.equal(f.calls.length,1);
});
test('local feature calls retain missing context rather than borrowing the current renderer',async()=>{
 const f=fixture();await f.context.featureRequest('access','dataFolder',{});assert.equal(f.calls[0][3],undefined);
});
test('validated vault IPC carries actual frame context without a renderer-supplied actor',async()=>{
 const f=fixture();let call;f.context.request=async(...args)=>{call=args;};await f.callbacks['vault:request']({senderFrame:f.frame},'getState',{});assert.equal(call[2].senderFrame,f.frame);assert.deepEqual(Object.keys(call[2]),['senderFrame']);await assert.rejects(f.callbacks['vault:request']({senderFrame:{}},'getState',{}),/Untrusted/);
});
