import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('release provenance records only explicitly completed scoped CI gates', () => {
  const workflow = readFileSync(new URL('../.github/workflows/windows.yml', import.meta.url), 'utf8');
  const publisher = readFileSync(new URL('../.github/scripts/publish-preview.ps1', import.meta.url), 'utf8');
  const nativeGate = workflow.indexOf("throw 'Multi-vault controller verification failed.'");
  const imageGate = workflow.indexOf("throw 'Encrypted image offline verification failed.'");
  const receipt = workflow.indexOf('MFE_VERIFIED_CI_TEST_GATES=isolated-vault-sessions,encrypted-image-offline');
  const publication = workflow.indexOf('- name: Prepare and publish unique release');
  assert.ok(nativeGate > 0 && imageGate > nativeGate && receipt > imageGate && publication > receipt);
  assert.match(publisher, /\$ciTestGates=@\(\)/);
  assert.match(publisher, /\$env:MFE_VERIFIED_CI_TEST_GATES -ceq 'isolated-vault-sessions,encrypted-image-offline'/);
  assert.match(publisher, /testsRunInCI=\(\$ciTestGates.Count -gt 0\); ciTestGates=\$ciTestGates/);
  assert.match(publisher, /No CI test-gate receipt was supplied/);
  assert.match(publisher, /mocked Docker and network operations/);
  assert.match(publisher, /Installed runtime verification is pending an independent local receipt/);
  assert.doesNotMatch(publisher, /CI runs no tests/);
});
