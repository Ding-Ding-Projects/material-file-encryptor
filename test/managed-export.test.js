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
 const context=vm.createContext({validateRequest,path,quitPending:false,shuttingDown:false,updateInstallLease:false,
  state:{files:[{id:'file-1',path:'folder/document.txt'}],storageDir:'C:\\vault',cacheDir:'C:\\cache'},
  selectedExports:new Set(['C:\\output\\document.txt']),window:{},
  mountedPath:()=> 'M:\\',safeDestination:async value=>value,
  dialog:{showSaveDialog:async()=>({canceled:false,filePath:'C:\\output\\document.txt'})},
  helper:{request:async(method,params)=>{calls.push({method,params});return method==='getFile'?{id:'file-1',path:'folder/document.txt'}:{operationId:'owned-operation'};}}
 });
 vm.runInContext(source.slice(start,end)+'\nglobalThis.invoke=request;globalThis.inventory=currentFileInventory;',context);
 return {context,calls};
}
test('selected and path exports enter the cancellable native operation registry',async()=>{
 for(const [method,params]of [['fileAction',{id:'file-1',action:'export',destination:'C:\\output\\document.txt'}],['exportFile',{path:'folder/document.txt'}]]){
  const {context,calls}=fixture();
  assert.equal((await context.invoke(method,params)).operationId,'owned-operation');
  const exports=calls.filter(call=>call.method==='startExport');
  assert.equal(exports.length,1);
  assert.equal(exports[0].params.path,'folder/document.txt');
  assert.equal(exports[0].params.destination,'C:\\output\\document.txt');
 }
});
test('bulk file inventory completes paged reads and rejects a moving revision',async()=>{
 const {context}=fixture();const cursors=[];
 context.helper.request=async(_method,params)=>{cursors.push(params.cursor);return {revision:7,items:[{id:String(params.cursor)}],nextCursor:params.cursor===0?1000:null,resetRequired:false};};
 assert.equal((await context.inventory()).length,2);assert.deepEqual(cursors,[0,1000]);
 context.helper.request=async(_method,params)=>({revision:params.cursor===0?7:8,items:[],nextCursor:params.cursor===0?1000:null,resetRequired:params.cursor!==0});
 await assert.rejects(context.inventory(),/file list changed/);
 context.helper.request=async()=>({revision:7,items:[],nextCursor:0});
 await assert.rejects(context.inventory(),/read completely/);
});
test('export admission requires a chosen destination and rechecks pending quit',async()=>{
 const {context,calls}=fixture();
 await assert.rejects(context.invoke('fileAction',{id:'file-1',action:'export',destination:'C:\\unselected.txt'}),/file picker/);
 context.safeDestination=async value=>{context.quitPending=true;return value;};
 await assert.rejects(context.invoke('fileAction',{id:'file-1',action:'export',destination:'C:\\output\\document.txt'}),/waiting to quit/);
 assert.equal(calls.filter(call=>call.method==='startExport').length,0);
});

test('update admission blocks exports before any native operation starts',async()=>{
 const {context,calls}=fixture();context.updateInstallLease=true;
 await assert.rejects(context.invoke('fileAction',{id:'file-1',action:'export',destination:'C:\\output\\document.txt'}),/preparing an update/);
 assert.equal(calls.length,0);
});
