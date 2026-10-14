import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserHandoffLifecycle} from '../src/main/browser-native-host.js';
test('native lifecycle forwards all genuine profile adapters while missing adapters remain absent',async()=>{
 const config={schemaVersion:1,host:'org.dingding.material_file_encryptor.downloads',allowedOrigins:['chrome-extension://'+'a'.repeat(32)+'/'],identity:{extensionId:'a'.repeat(32),packageSha256:'0'.repeat(64),publicKeySha256:'1'.repeat(64)}};
 for(const installed of [false,true]){let received;const callbacks=installed?{authenticateProfile:async()=>{},validateAuthority:async()=>false,readProfileSummary:async()=>{},revokeProfileAuthority:()=>{}}:{};
  const lifecycle=createBrowserHandoffLifecycle({hostDirectory:'C:\\Fixture',platform:'win32',readConfiguration:async()=>config,authorizePair:async()=>true,isUnlocked:()=>true,onProposal(){},...callbacks,createBroker:options=>{received=options;return {available:true,start:async()=>{},revoke(){},close:async()=>({verified:true})};}});
  await lifecycle.initialize();for(const name of ['authenticateProfile','validateAuthority','readProfileSummary','revokeProfileAuthority'])assert.equal(received[name],callbacks[name]);await lifecycle.close();
 }
});
