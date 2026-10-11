import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {totp} from '../src/renderer/features/access/crypto.js';
globalThis.HTMLElement??=class {};
const {mountVisitorAccess}=await import('../docs/site/visitor-access.js');
function memory(){const data=new Map();return {data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
const click=(root,text)=>{const button=root.querySelectorAll('button').find(b=>b.textContent===text);assert.ok(button,text);return button.click();};
const field=(root,label)=>{const wrap=root.querySelectorAll('label').find(node=>node.textContent.startsWith(label));assert.ok(wrap,label);return wrap.querySelector('input');};
test('real authenticator registration encrypts its secret; support tickets remain session-only and use browser recovery',async()=>{
  const doc=createAccessDocument(),root=doc.createElement('main');doc.body.append(root);const storage=memory();
  const api=mountVisitorAccess(root,{storage,withLock:(_name,run)=>run(),eventTarget:null});
  const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network request');};
  try{
    root.querySelectorAll('input')[0].value='synthetic profile fixture';await click(root,'Set up local profile');
    const auth=root.querySelectorAll('fieldset').find(node=>node.querySelector('legend')?.textContent==='Authenticator');
    const entry={secret:'JBSWY3DPEHPK3PXP',issuer:'Fixture',account:'fixture@example.invalid',algorithm:'SHA1',digits:6,period:30};
    field(auth,'Manual base32 secret').value=entry.secret;field(auth,'Issuer').value=entry.issuer;field(auth,'Account').value=entry.account;field(auth,'Current code').value=await totp(entry);
    await click(auth,'Save authenticator');assert.ok(api.credentialStore.ids('authenticator:').length>=2);assert.ok(auth.textContent.includes(entry.account));assert.ok(![...storage.data.values()].join('').includes(entry.secret));
    const support=root.querySelectorAll('fieldset').find(node=>node.querySelector('legend')?.textContent==='Support Tickets');
    field(support,'Category').value='Fixture ticket';field(support,'Description').value='session-only fixture description';await click(support,'Create local ticket');
    assert.ok(support.textContent.includes('session-only fixture description'));assert.ok(![...storage.data.values()].join('').includes('session-only fixture description'));
    await click(support,'Advance local ticket');await click(support,'Advance local ticket');assert.ok(support.textContent.includes('clear this website’s browser storage'));assert.ok(!support.textContent.includes('open the application data folder'));
    api.lock();assert.ok(!root.textContent.includes(entry.account));assert.ok(!root.textContent.includes('session-only fixture description'));
  }finally{api.destroy();globalThis.fetch=originalFetch;}
});
test('actual shared profile controls register, lock, reject wrong password and restore authenticated session',async()=>{
  const doc=createAccessDocument(),root=doc.createElement('main');doc.body.append(root);const events=[];
  const api=mountVisitorAccess(root,{storage:memory(),withLock:(_name,run)=>run(),eventTarget:null,onAuthentication:value=>events.push(value)});
  try{
    assert.equal(api.authenticated,false);assert.deepEqual(events,[false]);
    assert.ok(!root.querySelectorAll('button').some(button=>button.textContent==='Open application data folder'));
    root.querySelectorAll('input')[0].value='synthetic profile fixture';await click(root,'Set up local profile');assert.equal(api.authenticated,true);assert.equal(events.at(-1),true);
    await api.credentialStore.set('authenticator:fixture',{secret:'synthetic protected content'});
    await click(root,'Log out');await Promise.resolve();assert.equal(api.authenticated,false);assert.equal(events.at(-1),false);assert.equal(root.querySelectorAll('input')[0].value,'');
    root.querySelectorAll('input')[0].value='wrong synthetic credential';await click(root,'Unlock local profile');assert.equal(api.authenticated,false);
    root.querySelectorAll('input')[0].value='synthetic profile fixture';await click(root,'Unlock local profile');assert.equal(api.authenticated,true);
    api.setLanguage('yue');assert.equal(root.querySelector('h2').textContent,'訪客本機存取');
    api.lock();assert.equal(api.authenticated,false);await assert.rejects(api.credentialStore.get('authenticator:fixture'),/Unlock/);
  }finally{api.destroy();}
});
test('protected mode credential is encrypted and profile locking closes history and authentication together',async()=>{
  const doc=createAccessDocument(),root=doc.createElement('main');doc.body.append(root);const storage=memory(),handlers=new Map(),events=[];
  const eventTarget={addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
  const api=mountVisitorAccess(root,{storage,withLock:(_name,run)=>run(),eventTarget,onAuthentication:value=>events.push(value)});
  try{
    await assert.rejects(api.credentialCapabilities.setSharedCredential('synthetic mode credential'),/Unlock/);
    root.querySelectorAll('input')[0].value='synthetic profile fixture';await click(root,'Set up local profile');
    await api.credentialCapabilities.setSharedCredential('synthetic mode credential');assert.equal(await api.credentialCapabilities.verifySharedCredential('wrong'),false);assert.equal(await api.credentialCapabilities.verifySharedCredential('synthetic mode credential'),true);
    assert.ok(![...storage.data.values()].join('').includes('synthetic mode credential'));
    await api.historyManager.setup('synthetic history credential');assert.equal(api.historyManager.unlocked,true);
    handlers.get('storage')({key:'material-file-encryptor.visitor.access.local-profile:v1'});
    assert.equal(api.authenticated,false);assert.equal(api.historyManager.unlocked,false);assert.equal(events.at(-1),false);
  }finally{api.destroy();}
});
test('visitor reset uses the real two-key slider confirmation and preserves unrelated browser data',async()=>{
  const doc=createAccessDocument(),root=doc.createElement('main');doc.body.append(root);const storage=memory();storage.setItem('unrelated','preserve');
  doc.addEventListener=()=>{};doc.removeEventListener=()=>{};
  const originalDocument=globalThis.document;globalThis.document=doc;const create=doc.createElement.bind(doc);doc.createElement=tag=>{const node=create(tag);node.show=()=>{};return node;};
  const api=mountVisitorAccess(root,{storage,withLock:(_name,run)=>run(),eventTarget:null});
  try{
    root.querySelectorAll('input')[0].value='synthetic profile fixture';await click(root,'Set up local profile');assert.equal(api.authenticated,true);
    const resetting=click(root,'Reset visitor records');const dialog=root.querySelector('md-dialog');assert.ok(dialog);
    const execute=dialog.querySelector('md-filled-button');assert.equal(execute.disabled,true);await execute.click();assert.equal(api.authenticated,true);
    const keys=dialog.querySelectorAll('md-switch');keys[0].selected=true;await keys[0].dispatchEvent({type:'change'});assert.equal(execute.disabled,true);
    keys[1].selected=true;await keys[1].dispatchEvent({type:'change'});const slider=dialog.querySelector('md-slider');slider.value=99;await slider.dispatchEvent({type:'input'});assert.equal(execute.disabled,true);
    slider.value=100;await slider.dispatchEvent({type:'input'});assert.equal(execute.disabled,false);await execute.click();await execute.click();await resetting;
    assert.equal(api.authenticated,false);assert.equal(await api.credentialStore.get('local-profile:v1'),null);assert.equal(storage.getItem('unrelated'),'preserve');
  }finally{api.destroy();globalThis.document=originalDocument;}
});
test('delayed cross-tab storage events cannot admit writes or cache encryption under a removed or replaced profile',async()=>{
  const storage=memory();const doc=createAccessDocument(),aRoot=doc.createElement('main'),bRoot=doc.createElement('main');doc.body.append(aRoot,bRoot);
  let chain=Promise.resolve();const withLock=(_name,run)=>{const next=chain.then(run);chain=next.catch(()=>{});return next;};
  const a=mountVisitorAccess(aRoot,{storage,withLock,eventTarget:null,confirmDestructive:async options=>{await options.run({});return {confirmed:true};}});
  const b=mountVisitorAccess(bRoot,{storage,withLock,eventTarget:null});
  try{
    aRoot.querySelectorAll('input')[0].value='synthetic first profile';await click(aRoot,'Set up local profile');
    bRoot.querySelectorAll('input')[0].value='synthetic first profile';await click(bRoot,'Unlock local profile');assert.equal(b.authenticated,true);
    await b.credentialStore.set('authenticator:positive',{secret:'synthetic first secret'});
    const cache=await b.encryptPrivateCache({wording:'synthetic private cache'},'visitor-wording:v1');assert.deepEqual(await b.decryptPrivateCache(cache,'visitor-wording:v1'),{wording:'synthetic private cache'});
    await click(aRoot,'Reset visitor records');assert.equal(b.authenticated,true,'No storage event has reached the stale tab');
    await assert.rejects(b.credentialStore.set('authenticator:stale',{secret:'must not recreate'}),/changed/);await assert.rejects(b.encryptPrivateCache({},'visitor-wording:v1'),/changed/);
    assert.ok(![...storage.data.keys()].some(key=>key.endsWith('authenticator:stale')));
    aRoot.querySelectorAll('input')[0].value='synthetic replacement profile';await click(aRoot,'Set up local profile');
    await assert.rejects(b.credentialStore.set('authenticator:stale',{secret:'must not cross profiles'}),/changed/);
    await a.credentialStore.set('authenticator:new',{secret:'synthetic replacement secret'});assert.deepEqual(await a.credentialStore.get('authenticator:new'),{secret:'synthetic replacement secret'});
    b.lock();await assert.rejects(b.decryptPrivateCache(cache,'visitor-wording:v1'),/Unlock/);
  }finally{a.destroy();b.destroy();}
});
test('failed reset keeps its error and rebuilds a usable locked profile after emergency exit',async()=>{
  for(const failure of ['Web Locks unavailable','Storage reset unavailable']){
    const doc=createAccessDocument(),root=doc.createElement('main');doc.body.append(root);doc.addEventListener=()=>{};doc.removeEventListener=()=>{};const create=doc.createElement.bind(doc);doc.createElement=tag=>{const node=create(tag);node.show=()=>{};return node;};
    const originalDocument=globalThis.document;globalThis.document=doc;
    const storage=memory(),remove=storage.removeItem,notices=[];let failing=false;
    storage.removeItem=key=>{if(failing&&failure.startsWith('Storage'))throw Error(failure);remove(key);};
    const withLock=(_name,run)=>{if(failing&&failure.startsWith('Web'))throw Error(failure);return run();};
    const api=mountVisitorAccess(root,{storage,withLock,eventTarget:null,notify:message=>notices.push(message)});
    try{
      root.querySelectorAll('input')[0].value='synthetic reset fixture';await click(root,'Set up local profile');failing=true;
      const resetting=click(root,'Reset visitor records'),dialog=root.querySelector('md-dialog');
      for(const key of dialog.querySelectorAll('md-switch')){key.selected=true;await key.dispatchEvent({type:'change'});}
      const slider=dialog.querySelector('md-slider');slider.value=100;await slider.dispatchEvent({type:'input'});await dialog.querySelector('md-filled-button').click();
      assert.ok(dialog.textContent.includes(failure));await dialog.querySelector('md-text-button').click();await resetting;
      assert.equal(api.authenticated,false);assert.ok(root.querySelectorAll('input').length>0);assert.ok(notices.includes(failure));
      failing=false;root.querySelectorAll('input')[0].value='synthetic reset fixture';await click(root,'Unlock local profile');assert.equal(api.authenticated,true);
    }finally{failing=false;api.destroy();globalThis.document=originalDocument;}
  }
});
