import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {packagedRendererVerifierHashes,assertPackagedRendererVerifierHashes} from '../scripts/packaged-renderer-runtime.mjs';
import {packagedVerifierHash} from '../scripts/gui-acceptance-producer.mjs';

// This handwritten contract intentionally does not derive its required inventory
// from the production lists being checked.
const packaged=['packaged-renderer-runtime.mjs','test-renderer-browser.mjs','test-renderer-browser-cli.py','renderer-process-snapshot.py','renderer-launch-observer.mjs','renderer-launch-observer.py','renderer-native-path.mjs','renderer-native-path.py','supplemental-renderer-recovery.py'];
const producer=[...packaged,'modern-ui-check.mjs','local-headless-desktop-check.mjs','modern-phase.mjs','cdp-connection-plan.mjs','preview-runtime-fixture.mjs','native-window-observation.py'];
test('packaged binding and producer hash both detect either resolver changing',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-verifier-inventory-'));
 for(const name of new Set(producer))await fs.writeFile(path.join(root,name),'synthetic '+name);
 const baseline=await packagedRendererVerifierHashes(root);
 assert.deepEqual(Object.keys(baseline).sort(),packaged.slice().sort());
 const producerBaseline=await packagedVerifierHash(root);
 await assertPackagedRendererVerifierHashes(baseline,root);
 for(const name of ['renderer-native-path.mjs','renderer-native-path.py']){
  const file=path.join(root,name),original=await fs.readFile(file);
  await fs.writeFile(file,'changed synthetic resolver');
  await assert.rejects(assertPackagedRendererVerifierHashes(baseline,root),/Verifier files changed/);
  assert.notEqual(await packagedVerifierHash(root),producerBaseline);
  await fs.writeFile(file,original);
 }
 await assertPackagedRendererVerifierHashes(baseline,root);
 assert.equal(await packagedVerifierHash(root),producerBaseline);
});
