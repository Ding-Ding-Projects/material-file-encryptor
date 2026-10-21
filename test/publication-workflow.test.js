import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/publication-language.yml', import.meta.url), 'utf8');
function safetyProblems(text) {
  const problems = [];
  if (!text.includes('ref: ${{ vars.PUBLICATION_SCAN_POLICY_SHA }}')) problems.push('trusted pin missing');
  if ((text.match(/uses: actions\/checkout@/g) ?? []).length !== 1) problems.push('candidate checkout admitted');
  if (!text.includes('git init --bare') || !text.includes('fetch --no-tags --no-recurse-submodules')) problems.push('object-only acquisition missing');
  if (!text.includes('pull_request_target:') || !text.includes('workflow_call:')) problems.push('event coverage incomplete');
  if (!text.includes('refs/pull/$PR_NUMBER/head:refs/publication/candidate') || !text.includes('[[ "$fetched" == "$CANDIDATE_SHA" ]]')) problems.push('pull-request ref identity unverified');
  if (!text.includes('args+=(--mode history --base "$BASE_SHA")')) problems.push('history scope omitted');
  if (!text.includes('args+=(--mode current-tree-only)')) problems.push('manual scope omitted');
  if ((text.match(/secrets\.PUBLICATION_LANGUAGE_DATA/g) ?? []).length !== 1 || (text.match(/secrets\.PUBLICATION_LANGUAGE_EXCEPTIONS/g) ?? []).length !== 1) problems.push('protected input scope widened');
  if (!text.includes('env -u PUBLICATION_DICTIONARY -u PUBLICATION_EXCEPTIONS -u NODE_OPTIONS')) problems.push('child environment not scrubbed');
  if (/npm\s|node\s+--test|dotnet\s|lint|uses:\s*\.\//.test(text)) problems.push('candidate or quality execution admitted');
  return problems;
}
test('privacy workflow executes only pinned scanner code with object-only candidate input', () => {
  assert.deepEqual(safetyProblems(workflow), []);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /mode:0o600/);
  assert.doesNotMatch(workflow, /secrets: inherit/);
});
test('privacy contract rejects candidate checkout, missing pin and protected-input widening', () => {
  assert.ok(safetyProblems(workflow + '\n      - uses: actions/checkout@untrusted\n').length);
  assert.ok(safetyProblems(workflow.replace('ref: ${{ vars.PUBLICATION_SCAN_POLICY_SHA }}', 'ref: candidate')).length);
  assert.ok(safetyProblems(workflow + '\n env: ${{ secrets.PUBLICATION_LANGUAGE_DATA }}\n').length);
  assert.ok(safetyProblems(workflow + '\n run: npm run candidate\n').length);
  assert.ok(safetyProblems(workflow.replace('args+=(--mode history --base "$BASE_SHA")', 'args+=(--mode current-tree-only)')).length);
  assert.ok(safetyProblems(workflow.replace('[[ "$fetched" == "$CANDIDATE_SHA" ]]', 'true')).length);
});
test('both local hooks retain currency checks and delegate complete candidate scans', () => {
  for (const [name, mode] of [['pre-commit', 'index'], ['pre-push', 'outgoing']]) {
    const hook = readFileSync(new URL('../.githooks/' + name, import.meta.url), 'utf8');
    assert.ok(hook.indexOf('scripts/check-vocabulary.mjs') < hook.indexOf('scripts/check-publication-local.mjs'));
    assert.ok(hook.includes('scripts/check-publication-local.mjs" ' + mode));
  }
});
