import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {validateRequest} from '../src/main/validation.js';

const main=await fs.readFile(new URL('../src/main/main.js',import.meta.url),'utf8');
const renderer=await fs.readFile(new URL('../src/renderer/app.js',import.meta.url),'utf8');
const preload=await fs.readFile(new URL('../src/main/preload.cjs',import.meta.url),'utf8');
function fixture(response,result={busy:true,locked:false}) {
  const calls=[];let shown;
  const state={mounted:true,locked:false};
  const context=vm.createContext({window:{},state,Error,
    uiDialog:{showMessageBox:async(window,options)=>{shown=options;return {response};}},
    helper:{request:async method=>{calls.push(method);return method==='forceLock'?result:{mounted:false,locked:true};}},
    nativeState:value=>value,publish:()=>calls.push('publish'),
    browserHandoff:{revoke:()=>calls.push('revokeBrowser')}});
  const start=main.indexOf('async function forceLockDrive('),end=main.indexOf('async function request(',start);assert.ok(start>=0&&end>start);vm.runInContext(main.slice(start,end),context);
  return {context,calls,get shown(){return shown;}};
}
test('force lock cancellation keeps helper untouched in every current language',async()=>{
  for(const language of ['en','yue','bilingual']) {
    const f=fixture(0);
    assert.equal((await f.context.forceLockDrive(language)).cancelled,true);
    assert.deepEqual(f.calls,[]);
    assert.equal(f.shown.defaultId,0);assert.equal(f.shown.cancelId,0);
    assert.equal(f.shown.buttons.length,2);
    assert.equal(f.shown.buttons[1],f.shown.title);
    // The confirmation says what will really happen: work is cancelled, other programs lose the drive.
    assert.match(f.shown.detail,language==='yue'?/失去磁碟存取/:/lose access to the drive/);
    if(language==='bilingual')assert.match(f.shown.detail,/失去磁碟存取/);
    assert.doesNotMatch(f.shown.detail,/prevent locking|阻止鎖定/);
  }
});
test('busy response preserves mounted state and says what is still running, in every language',async()=>{
  const cases=[
    ['operations-active',/command on the drive did not finish/,/指令未能及時完成/],
    ['crypto-active',/encrypting or decrypting/,/加密或解密/],
    ['filesystem-handles-active',/still reading or writing/,/讀寫緊資料/],
    [undefined,/could not finish while the drive was busy/,/磁碟忙緊/]
  ];
  for(const [code,english,cantonese] of cases) for(const language of ['en','yue','bilingual']) {
    const f=fixture(1,{busy:true,locked:false,code});
    await assert.rejects(f.context.forceLockDrive(language),error=>{
      assert.match(error.message,language==='yue'?cantonese:english);
      if(language==='bilingual')assert.match(error.message,cantonese);
      assert.match(error.message,language==='yue'?/磁碟仍然掛載|仍然掛載/:/still mounted/);
      return true;
    });
    assert.deepEqual(f.calls,['revokeBrowser','forceLock']);assert.equal(f.context.state.mounted,true);
  }
});
test('confirmed lock refreshes status and publishes once; omitted language stays English',async()=>{
  const f=fixture(1,{locked:true,busy:false});
  await f.context.forceLockDrive();
  // Browser authority ends before the drive is forced to lock.
  assert.deepEqual(f.calls,['revokeBrowser','forceLock','statusSummary','publish']);
  assert.equal(f.context.state.locked,true);assert.equal(f.shown.title,'Force Lock');
});
test('current language and School mode reach validated preload request',async()=>{
  let bridge;
  vm.runInNewContext(preload,{require:()=>({contextBridge:{exposeInMainWorld:(name,value)=>{bridge=value;}},ipcRenderer:{invoke:(channel,method,params)=>({channel,method,params}),on(){},removeListener(){}}})});
  const preferences={language:'en'},effectiveLocalSettings={school:{enabled:false}};
  const context=vm.createContext({preferences,effectiveLocalSettings});
  const start=renderer.indexOf('function forceLockOptions()');
  vm.runInContext(renderer.slice(start,renderer.indexOf('\n',start)),context);
  for(const language of ['en','yue','bilingual']) {
    preferences.language=language;
    const request=bridge.forceLock(context.forceLockOptions());
    assert.equal(request.method,'forceLock');assert.equal(validateRequest(request.method,request.params).language,language);
    effectiveLocalSettings.school.enabled=true;
    assert.equal(context.forceLockOptions().language,'en');
    effectiveLocalSettings.school.enabled=false;
  }
  assert.deepEqual(validateRequest('forceLock',{}),{});
  assert.throws(()=>validateRequest('forceLock',{language:'invalid'}));
  assert.throws(()=>validateRequest('forceLock',{language:'en',unknown:true}));
});
