import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(`native/MaterialFileEncryptor.Host/${name}.cs`,'utf8');
function contracts(owner,provider,broker){
  assert.match(owner,/provider\.VerifyAndRetain\(runtimeRoot,major\)/);
  assert.match(owner,/catch \{ retained\.Lease\.Release\(\);throw; \}/);
  assert.match(owner,/if\(attempted\|\|Child is not null\)throw/);
  assert.match(owner,/catch\(Win32Exception\)\{ReleaseHeld\(\);throw;\}/);
  assert.match(owner,/catch \{ IdentityVerified=false;throw; \}/);
  assert.match(owner,/Child\.SafeHandle\.IsClosed\|\|Child\.SafeHandle\.IsInvalid\|\|!Child\.HasExited/);
  assert.match(provider,/return new RetainedInventory\([\s\S]*?,lease\);/);
  assert.match(provider,/catch \{ lease\.Release\(\);throw; \}/);
  assert.match(broker,/ConfigurationAdmitted\(Entry entry\) => false/);
  assert.match(broker,/owned\.Lease = ServerExecutionLease\.Acquire/);
  assert.match(broker,/owned\.Lease\.Start\(start\)/);
  assert.match(broker,/entry\.Lease\?\.ReleaseAfterExactExit\(\)/);
  assert.match(broker,/shutdown is unverified/);
}
test('source contract retains full runtime ownership through exact child exit',()=>contracts(read('ServerExecutionLease'),read('ServerRuntimeProvisioner'),read('ServerLeaseBroker')));
test('source contract rejects releasing runtime ownership on uncertain spawn observation',()=>{
  const owner=read('ServerExecutionLease'),provider=read('ServerRuntimeProvisioner'),broker=read('ServerLeaseBroker');
  assert.throws(()=>contracts(owner.replace('catch { IdentityVerified=false;throw; }','catch { ReleaseHeld();throw; }'),provider,broker));
  assert.throws(()=>contracts(owner,provider,broker.replace('ConfigurationAdmitted(Entry entry) => false','ConfigurationAdmitted(Entry entry) => true')));
  contracts(owner,provider,broker);
});
test('synthetic native lifetime verifier is compile-separated and covers negative mutation',()=>{
  const owner=read('ServerExecutionLease');
  assert.match(owner,/#if SERVER_LEASE_VERIFIER[\s\S]*?AcquireSynthetic[\s\S]*?#endif/);
  const fixture=readFileSync('native/MaterialFileEncryptor.ServerLease.Verifier/ExecutionLifetimeVerifier.cs','utf8');
  for(const check of ['partial-acquisition-releases-full-tree','proven-no-launch-release','proven-createprocess-failure-release','full-tree-protected-through-child-lifetime','live-timeout-retains-complete-tree','exact-child-exit-releases-complete-tree','post-spawn-uncertainty-retains-full-tree','uncertain-exact-exit-release'])assert.ok(fixture.includes(check),check);
  assert.match(fixture,/if\(negative\)active\.DropRuntimeProtectionForNegativeControl\(\)/);
  assert.match(fixture,/javaExecution="not-run",serverExecution="not-run"/);
});
