import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {validateRequest} from '../src/main/validation.js';

const source=await fs.readFile(new URL('../src/main/main.js',import.meta.url),'utf8');
const start=source.indexOf('async function request('),end=source.indexOf('\nfunction showWindow()',start);
assert.ok(start>=0&&end>start);
function fixture(){
 const calls=[];
 const context=vm.createContext({validateRequest,path,quitPending:false,shuttingDown:false,
  state:{files:[{id:'file-1',path:'folder/document.txt'}],storageDir:'C:\\vault',cacheDir:'C:\\cache'},
  selectedExports:new Set(['C:\\output\\document.txt']),window:{},
  mountedPath:()=> 'M:\\',safeDestination:async value=>value,
  dialog:{showSaveDialog:async()=>({canceled:false,filePath:'C:\\output\\document.txt'})},
  helper:{request:async(method,params)=>{calls.push({method,params});return {operationId:'owned-operation'};}}
 });
 vm.runInContext(source.slice(start,end)+'\nglobalThis.invoke=request;',context);
 return {context,calls};
}
test('selected and path exports enter the cancellable native operation registry',async()=>{
 for(const [method,params]of [['fileAction',{id:'file-1',action:'export',destination:'C:\\output\\document.txt'}],['exportFile',{path:'folder/document.txt'}]]){
  const {context,calls}=fixture();
  assert.equal((await context.invoke(method,params)).operationId,'owned-operation');
  assert.equal(calls.length,1);assert.equal(calls[0].method,'startExport');
  assert.equal(calls[0].params.path,'folder/document.txt');
  assert.equal(calls[0].params.destination,'C:\\output\\document.txt');
 }
});
test('export admission requires a chosen destination and rechecks pending quit',async()=>{
 const {context,calls}=fixture();
 await assert.rejects(context.invoke('fileAction',{id:'file-1',action:'export',destination:'C:\\unselected.txt'}),/file picker/);
 context.safeDestination=async value=>{context.quitPending=true;return value;};
 await assert.rejects(context.invoke('fileAction',{id:'file-1',action:'export',destination:'C:\\output\\document.txt'}),/waiting to quit/);
 assert.equal(calls.length,0);
});
