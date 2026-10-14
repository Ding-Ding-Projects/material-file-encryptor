import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const main=await fs.readFile(new URL('../src/main/main.js',import.meta.url),'utf8');
function fixture(receipts,responses=[0]){
 const calls=[],dialogs=[];let index=0;
 const context=vm.createContext({Error,state:{locked:true,sync:{error:null}},window:{isDestroyed:()=>false},
  browserHandoff:{close:async()=>{calls.push('close');return receipts[Math.min(index++,receipts.length-1)];}},
  app:{exit:code=>calls.push('exit:'+code)},showWindow:()=>calls.push('show'),publish:()=>calls.push('publish'),console:{error:()=>calls.push('diagnostic')},
  uiDialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return{response:responses.shift()??0};}}});
 const start=main.indexOf('async function closeBrowserHandoff()'),end=main.indexOf('\nasync function savePreferences',start);
 vm.runInContext(main.slice(start,end),context);
 if(typeof context.handleStartupFailure!=='function'){
  const callback=main.match(/\}\)\.catch\((async \(\) => \{[^\n]+)\);\r?\n  app\.on\('before-quit'/)?.[1];assert.ok(callback,'The actual startup failure handler is required.');
  context.handleStartupFailure=vm.runInContext('('+callback+')',context);
 }
 return{context,calls,dialogs};
}
test('startup failure retains the desktop when owned native process exit is unverified',async()=>{
 const f=fixture([{closed:true,processExited:false,stdioClosed:false,verified:false}]);await f.context.handleStartupFailure();
 assert.equal(f.calls.filter(call=>call.startsWith('exit:')).length,0,'Unverified owned process exit must not terminate the desktop.');
 assert.equal(f.context.state.recoveryRequired,true);assert.match(f.context.state.sync.error,/unverified/i);assert.equal(f.dialogs[0].defaultId,0);assert.equal(f.dialogs[0].cancelId,0);
});
test('startup failure exits only after the same native close verifier accepts proof',async()=>{
 const f=fixture([{closed:true,processExited:true,stdioClosed:true,verified:true}]);await f.context.handleStartupFailure();assert.deepEqual(f.calls,['close','exit:1']);assert.equal(f.dialogs.length,0);
});
test('startup shutdown retries only from the explicit native retry choice',async()=>{
 const f=fixture([{verified:false},{verified:true}],[1]);await f.context.handleStartupFailure();assert.equal(f.calls.filter(call=>call==='close').length,2);assert.equal(f.calls.filter(call=>call==='exit:1').length,1);assert.equal(f.dialogs.length,1);assert.match(f.dialogs[0].buttons[1],/Retry/);
});
test('a startup recovery surface failure still cannot terminate an unverified owned process',async()=>{
 const f=fixture([{verified:false}]);f.context.uiDialog.showMessageBox=async()=>{throw Error('Synthetic unavailable dialog');};await f.context.handleStartupFailure();assert.equal(f.calls.filter(call=>call.startsWith('exit:')).length,0);assert.equal(f.context.state.recoveryRequired,true);assert.ok(f.calls.includes('diagnostic'));
});
