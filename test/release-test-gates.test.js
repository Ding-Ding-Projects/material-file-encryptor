import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/windows.yml', import.meta.url), 'utf8');
const publisher = readFileSync(new URL('../.github/scripts/publish-preview.ps1', import.meta.url), 'utf8');
function releaseProblems(text, receipt) {
  const problems = [];
  if (/node\s+--test|dotnet\s+run\s+--project\s+\S*\.Tests|MFE_VERIFIED_CI_TEST_GATES/.test(text + receipt)) problems.push('CI test execution or inference');
  if (!receipt.includes('testsRunInCI=$false; ciTestGates=@()')) problems.push('untruthful test receipt');
  if (!text.includes('needs: [select-runner, publication-language]')) problems.push('publication prerequisite missing');
  if (/^    env:\r?\n      GH_TOKEN:/m.test(text)) problems.push('job-wide release authority');
  return problems;
}
test('release provenance states no CI tests and retains independent runtime limits', () => {
  assert.deepEqual(releaseProblems(workflow, publisher), []);
  assert.match(publisher, /CI runs no tests/);
  assert.match(publisher, /Installed runtime verification is pending an independent local receipt/);
  assert.match(workflow, /run: build\.bat \/s/);
  assert.match(workflow, /run: build-installer\.bat \/s/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 3);
});
test('release contract rejects test execution, invented receipts and broad authority', () => {
  assert.ok(releaseProblems(workflow + '\nrun: node --test test/example.test.js', publisher).length);
  assert.ok(releaseProblems(workflow, publisher.replace('testsRunInCI=$false', 'testsRunInCI=$true')).length);
  assert.ok(releaseProblems(workflow.replace('needs: [select-runner, publication-language]', 'needs: select-runner'), publisher).length);
  assert.ok(releaseProblems(workflow + '\n    env:\n      GH_TOKEN: broad\n', publisher).length);
});
