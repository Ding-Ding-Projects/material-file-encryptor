import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRegistryFixtures, navigateRegistryStorage} from '../scripts/gui-acceptance-registry-provider.mjs';

test('impossible native capability and timing states stop before fixture or page mutation',()=>{
  let calls=0;
  const opened={connectionOwned:true,target:{kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40)},page:{evaluate(){calls++;throw Error('must not call');}}};
  const provider=createRegistryFixtures({opened,nativeFixtureOptions:{}});
  for(const state of ['registry-unavailable','registry-cancelling','conflicts-loading','conflicts-error'])assert.throws(()=>provider.assertCapabilities(state),/CAPABILITY_UNAVAILABLE/);
  assert.equal(calls,0);
});
test('a proxy cannot be attached to a package launched against a different endpoint',()=>{
  const opened={connectionOwned:true,target:{kind:'extracted-packaged-runtime',sourceCommit:'a'.repeat(40)},receipt:{registryTestEndpoint:'http://127.0.0.1:12000'},page:{}};
  assert.throws(()=>createRegistryFixtures({opened,proxy:{endpoint:'http://127.0.0.1:12001'}}),/exact owned verification endpoint/);
});

function navigationFixture({visible=false,disabled=false,missing=false,drawerClosed=false,hidden=false,zeroRect=false,drawerStuck=false,panelStuck=false}={}) {
 const log=[];
 const panel={hidden:!visible,getClientRects:()=>panel.hidden?[]:[{}]};
 const sidebar={hidden:false,visibility:drawerClosed?'hidden':'visible',getClientRects:()=>[{}]};
 const button={disabled,hidden,getClientRects:()=>zeroRect?[]:[{}],click(){log.push('storage');if(!panelStuck)panel.hidden=false;}};
 const drawer={disabled:false,hidden:false,getClientRects:()=>[{}],click(){log.push('drawer');if(!drawerStuck)sidebar.visibility='visible';}};
 const rail={shadowRoot:{querySelector(selector){assert.equal(selector,'[data-destination="storage"]');return missing?null:button;}}};
 const document={querySelector(selector){if(selector==='#view-storage')return panel;if(selector==='.sidebar')return sidebar;if(selector==='mfe-top-bar')return{shadowRoot:{querySelector(s){assert.equal(s,'.drawer');return drawer;}}};assert.equal(selector,'mfe-navigation-rail');return rail;}};
 const evaluate=fn=>vm.runInNewContext(`(${fn.toString()})()`,{document,getComputedStyle:node=>({visibility:node.visibility||'visible',display:'block'})});
 return {log,page:{async evaluate(fn){return evaluate(fn);},async waitForFunction(fn,argument,options){assert.equal(options.timeout,10000);if(evaluate(fn)!==true)throw Error('Navigation wait timed out');log.push('visible');}}};
}

test('storage navigation uses the primary destination and observes its visible panel',async()=>{
 const f=navigationFixture();await navigateRegistryStorage(f.page);assert.deepEqual(f.log,['storage','visible']);
});

test('an already visible storage panel does not activate navigation again',async()=>{
 const f=navigationFixture({visible:true});await navigateRegistryStorage(f.page);assert.deepEqual(f.log,[]);
});

test('missing, disabled or hidden storage controls never activate another destination',async()=>{
 for(const options of [{missing:true},{disabled:true},{hidden:true},{zeroRect:true}]){const f=navigationFixture(options);await assert.rejects(navigateRegistryStorage(f.page),/Storage navigation unavailable/);assert.deepEqual(f.log,[]);}
});

test('a closed narrow drawer opens through its control before storage navigation',async()=>{
 const f=navigationFixture({drawerClosed:true});await navigateRegistryStorage(f.page);assert.deepEqual(f.log,['drawer','visible','storage','visible']);
});

test('drawer and final-panel timeouts remain failures',async()=>{
 for(const options of [{drawerClosed:true,drawerStuck:true},{panelStuck:true}]){const f=navigationFixture(options);await assert.rejects(navigateRegistryStorage(f.page),/timed out/);}
});
