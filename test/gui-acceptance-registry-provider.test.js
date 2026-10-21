import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistryFixtures} from '../scripts/gui-acceptance-registry-provider.mjs';

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
