import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVocabulary, emptyVocabulary, createVocabularyStore, replaceVocabulary } from '../src/shared/personal-vocabulary.js';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const file = text => ({ size: text.length, text: async () => text });
const words = replacement => JSON.stringify({ schemaVersion: 1, entries: { folder: replacement } });
test('actual site upload callback stays locked and persists authenticated replacements', async () => {
  const script = source('../docs/site/site.js');
  const callbackSource = script.slice(script.indexOf('let uploadVersion = 0;'), script.indexOf('renderCopy(); revealHash();'));
  const handlers = {}, storage = new Map();
  const localStorage = { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) };
  const input = { files: [], value: '', addEventListener: (event,handler) => { handlers.upload = handler; } };
  let renders = 0;
  const run = new Function('parseVocabulary','emptyVocabulary','localStorage','vocabularyFile','document','renderCopy','updateMessages', `
    let privateWordingAvailable=false, pendingVocabularySource=null, vocabulary=emptyVocabulary(), vocabularyState={}, vocabularyStore=null;
    const vocabularyStorageKey='test';
    ${callbackSource}
    return { state:()=>({vocabulary,vocabularyState,pendingVocabularySource}), unlock:store=>{privateWordingAvailable=true;vocabularyStore=store;} };
  `);
  const state = run(parseVocabulary,emptyVocabulary,localStorage,input,{querySelector:()=>({addEventListener:(event,handler)=>{handlers.reset=handler;}})},()=>renders++,()=>{});
  input.files=[file(words('cabinet'))]; await handlers.upload();
  assert.equal(state.state().vocabulary.replacements.length,0);
  assert.equal(state.state().pendingVocabularySource,words('cabinet'));
  assert.equal(renders,0); assert.equal(storage.size,0);
  state.unlock(createVocabularyStore(localStorage,'test'));
  input.files=[file(words('drawer'))]; await handlers.upload();
  assert.equal(replaceVocabulary('folder',state.state().vocabulary),'drawer');
  assert.equal(parseVocabulary(storage.get('test')).replacements[0].to,'drawer');
  input.files=[file('{broken')]; await handlers.upload();
  assert.equal(replaceVocabulary('folder',state.state().vocabulary),'drawer');
  handlers.reset(); assert.equal(storage.size,0); assert.equal(state.state().pendingVocabularySource,null);
});
test('actual desktop callback suppresses stale failures and removes failed-write cache', async () => {
  const script=source('../src/renderer/app.js');
  const callbackSource=script.slice(script.indexOf("listen('vocabulary-file','change'"),script.indexOf("for (const dialog of",script.indexOf("listen('vocabulary-file','change'")));
  const handlers={}, removed=[], errors=[];
  const run = new Function('parseVocabulary','listen','localStorage','$','showError','applyPreferences','toast', `
    let vocabularyUploadVersion=0, preferences={vocabulary:parseVocabulary('${words('old')}')}, vocabularyPersisted=true;
    const savePreferences=()=>false;
    ${callbackSource}
    return ()=>preferences;
  `);
  const state=run(parseVocabulary,(id,event,handler)=>handlers[id]=handler,{removeItem:key=>removed.push(key)},()=>({remove(){}}),error=>errors.push(error),()=>{},()=>{});
  let reject;
  const stale={files:[{size:1,text:()=>new Promise((resolve,rejectPromise)=>{reject=rejectPromise;})}],value:'old-selection'};
  const pending=handlers['vocabulary-file']({target:stale});
  handlers['reset-vocabulary'](); reject(Error('stale read')); await pending;
  assert.equal(errors.length,0); assert.equal(stale.value,'old-selection');
  const current={files:[file(words('current'))],value:'selected'};
  await handlers['vocabulary-file']({target:current});
  assert.equal(replaceVocabulary('folder',state().vocabulary),'current');
  assert.ok(removed.includes('material-drive.preferences.v1'));
  assert.equal(current.value,'');
});
test('complete relative paths and option values remain literal', () => {
  const vocabulary=parseVocabulary(words('cabinet'));
  assert.equal(replaceVocabulary('folder folder/file ./folder/file ../folder/file --encrypt=folder --output="folder/file"',vocabulary),'cabinet folder/file ./folder/file ../folder/file --encrypt=folder --output="folder/file"');
});
test('Unicode path prefixes and quoted paths with spaces preserve both separators', () => {
  const vocabulary=parseVocabulary(JSON.stringify({schemaVersion:1,entries:{'資料夾':'replacement',folder:'cabinet'}}));
  for (const path of ['資料夾/file','資料夾\\file','"資料夾 name/file name"',"'資料夾 name\\file name'",'"folder name/file name"']) {
    assert.equal(replaceVocabulary(`${path} folder 資料夾`,vocabulary),`${path} cabinet replacement`);
  }
});
