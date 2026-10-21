import assert from 'node:assert/strict';
import {createRegistryFixtures} from './gui-acceptance-registry-provider.mjs';
import {acquirePackagedDiagnosticSubset} from './gui-acceptance-producer.mjs';
import {createRegistryDialogDriver} from './gui-acceptance-registry-dialogs.mjs';

// Executable composition for an already admitted package. Launch/lifecycle and
// the loopback server remain owned by the caller and are never duplicated here.
// The entrypoint intentionally reports a subset, never full UI acceptance.
export async function acquirePackagedRegistry({opened,nativeFixtureOptions,proxy,dialogs,reviewDialog,fixtures={},...acquisition}) {
  assert.ok(acquisition.tuples?.length);
  assert.ok(acquisition.tuples.every(tuple=>tuple.state.startsWith('registry-')||tuple.state.startsWith('conflicts-')));
  assert.equal(Object.hasOwn(fixtures,'registry'),false,'Registry producer cannot be replaced in this composition');
  const nativeDialogs=dialogs||(reviewDialog?createRegistryDialogDriver({opened,review:reviewDialog}):undefined);
  const registry=createRegistryFixtures({opened,nativeFixtureOptions,proxy,dialogs:nativeDialogs});
  for(const tuple of acquisition.tuples) registry.assertCapabilities(tuple.state);
  return acquirePackagedDiagnosticSubset({...acquisition,opened,fixtures:{...fixtures,registry}});
}
