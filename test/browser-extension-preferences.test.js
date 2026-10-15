import test from 'node:test';import assert from 'node:assert/strict';
import {readPreferences,savePreferences,applyPreferences,defaults,tabTarget,acquireStorage,validDisplayName,validAccent} from '../browser-extension/preferences.js';
test('local preferences reject malformed oversized unknown or invalid values and persist atomically',()=>{let value=null;const store={getItem:()=>value,setItem:(key,next)=>value=next};assert.deepEqual(readPreferences(store).value,defaults);savePreferences(store,{...defaults,language:'bilingual',theme:'dark',tab:'status'});assert.equal(readPreferences(store).value.language,'bilingual');const prior=value;assert.throws(()=>savePreferences(store,{...defaults,session:'secret'}));assert.equal(value,prior);for(const bad of ['{', 'x'.repeat(2049),JSON.stringify({...defaults,language:'unknown'}),JSON.stringify({...defaults,version:4}),JSON.stringify({...defaults,displayName:' padded'}),JSON.stringify({...defaults,displayName:'<b>x</b>'}),JSON.stringify({...defaults,accent:'green'}),JSON.stringify({...defaults,accent:'#12345'})]){value=bad;assert.equal(readPreferences(store).state,'unavailable');assert.deepEqual(readPreferences(store).value,defaults);}});
test('tab keyboard routing wraps and retains ordinary browser shortcuts',()=>{assert.equal(tabTarget('ArrowLeft',0,3),2);assert.equal(tabTarget('ArrowRight',2,3),0);assert.equal(tabTarget('Home',2,3),0);assert.equal(tabTarget('End',0,3),2);assert.equal(tabTarget('Tab',1,3),null);});

test('storage write failure retains usable in-memory tab and language state without claiming save',()=>{const result=applyPreferences({setItem(){throw new Error('unavailable');}},defaults,{tab:'status',language:'yue'});assert.equal(result.value.tab,'status');assert.equal(result.value.language,'yue');assert.equal(result.state,'write-failed');});

test('blocked browser storage access falls back without crashing the workspace',()=>{const root={get localStorage(){throw new Error('storage blocked');}};assert.equal(acquireStorage(root),null);assert.equal(readPreferences(acquireStorage(root)).state,'unavailable');});
test('version two preferences gain an empty display name and accent without losing settings',()=>{const old=JSON.stringify({version:2,language:'bilingual',theme:'dark',tab:'changelog',funnyEnglish:3,funnyCantonese:4,emoji:true});const result=readPreferences({getItem:()=>old});assert.equal(result.state,'saved');assert.deepEqual(result.value,{version:3,language:'bilingual',theme:'dark',tab:'home',funnyEnglish:3,funnyCantonese:4,emoji:true,displayName:'',accent:''});});
test('home is the default tab, a valid saved tab, and the landing view for migrated records',()=>{
  assert.equal(defaults.tab,'home');
  const store={value:null,getItem:()=>store.value,setItem:(key,next)=>{store.value=next;}};
  assert.equal(savePreferences(store,{...defaults,tab:'home'}).tab,'home');
  assert.equal(readPreferences(store).value.tab,'home');
  const v1=JSON.stringify({version:1,language:'yue',theme:'dark',tab:'status'});
  assert.equal(readPreferences({getItem:()=>v1}).value.tab,'home');
  assert.equal(readPreferences({getItem:()=>v1}).state,'saved');
  assert.throws(()=>savePreferences(store,{...defaults,tab:'Home'}),/Invalid local preferences/);
});
test('display names and accent colours are bounded plain values',()=>{assert.equal(validDisplayName('Family vault'),true);assert.equal(validDisplayName('x'.repeat(61)),false);assert.equal(validDisplayName('line\nbreak'),false);assert.equal(validAccent(''),true);assert.equal(validAccent('#3a7d44'),true);assert.equal(validAccent('#3a7d4480'),true);assert.equal(validAccent('#3A7D44'),false);assert.equal(validAccent('rgb(1,2,3)'),false);});
test('the models tab is a valid saved tab, unknown tabs are still refused and older versions keep working', () => {
  const store = {value: null, getItem: () => store.value, setItem: (key, next) => { store.value = next; }};
  assert.equal(savePreferences(store, {...defaults, tab: 'models'}).tab, 'models');
  assert.equal(readPreferences(store).value.tab, 'models');
  assert.equal(readPreferences(store).state, 'saved');
  assert.throws(() => savePreferences(store, {...defaults, tab: 'chat'}), /Invalid local preferences/);
  assert.equal(applyPreferences(store, defaults, {tab: 'models'}).value.tab, 'models');
  const old = JSON.stringify({version: 2, language: 'yue', theme: 'dark', tab: 'models', funnyEnglish: 3, funnyCantonese: 4, emoji: true});
  assert.equal(readPreferences({getItem: () => old}).value.tab, 'home', 'migrated records start on Home');
  assert.equal(readPreferences({getItem: () => old}).value.language, 'yue');
  assert.equal(defaults.version, 3);
});
