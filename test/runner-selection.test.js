import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectRunner, fetchInventory, decide, parseLabels, renderSummary, HOSTED_FALLBACK, DEFAULT_REQUIRED_LABELS } from '../scripts/select-runner.mjs';

const labels = (...names) => names.map(name => ({ name }));
const ids = new Map();
const runner = (name, { status = 'online', busy = false, tags = ['self-hosted', 'Windows', 'X64'] } = {}) => ({ id: ids.get(name) ?? ids.set(name, ids.size + 1).get(name), name, status, busy, labels: labels(...tags) });

test('an idle online runner with every required label is chosen', () => {
  const decision = selectRunner({ runners: [runner('zeta'), runner('alpha')] });
  assert.equal(decision.kind, 'self-hosted');
  assert.deepEqual(decision.runner, DEFAULT_REQUIRED_LABELS);
  assert.equal(decision.idle, 2);
  assert.match(decision.reason, /first by name: alpha/);
});

test('busy and offline runners are skipped and the hosted image is used', () => {
  const decision = selectRunner({ runners: [runner('a', { busy: true }), runner('b', { status: 'offline' })] });
  assert.equal(decision.kind, 'hosted');
  assert.equal(decision.runner, HOSTED_FALLBACK);
  assert.deepEqual(decision.considered.map(row => row.skipped), ['busy', 'offline']);
});

test('a busy runner does not hide an idle one', () => {
  const decision = selectRunner({ runners: [runner('a', { busy: true }), runner('b')] });
  assert.equal(decision.kind, 'self-hosted');
  assert.equal(decision.idle, 1);
});

test('required labels are respected case-insensitively', () => {
  const lower = selectRunner({ runners: [runner('a', { tags: ['self-hosted', 'windows', 'x64'] })] });
  assert.equal(lower.kind, 'self-hosted');
  const missing = selectRunner({ runners: [runner('a', { tags: ['self-hosted', 'Linux', 'X64'] })] });
  assert.equal(missing.kind, 'hosted');
  assert.equal(missing.considered[0].skipped, 'missing-required-labels');
  const custom = selectRunner({ runners: [runner('a'), runner('b', { tags: ['self-hosted', 'Windows', 'X64', 'signing'] })], requiredLabels: ['self-hosted', 'Windows', 'X64', 'signing'] });
  assert.equal(custom.kind, 'self-hosted');
  assert.deepEqual(custom.runner, ['self-hosted', 'Windows', 'X64', 'signing']);
  assert.match(custom.reason, /first by name: b/);
});

test('no visible runners or an unreadable inventory falls back to the hosted image', () => {
  const none = selectRunner({ runners: [] });
  assert.equal(none.kind, 'hosted');
  assert.match(none.reason, /no self-hosted runners visible/);
  const failed = selectRunner({ inventoryError: 'HTTP 403' });
  assert.equal(failed.kind, 'hosted');
  assert.equal(failed.runner, HOSTED_FALLBACK);
  assert.match(failed.reason, /inventory-unavailable: HTTP 403/);
});

test('decision JSON has a stable shape and round-trips through fromJSON style parsing', () => {
  for (const decision of [selectRunner({ runners: [runner('a')] }), selectRunner({ runners: [] })]) {
    for (const key of ['kind', 'runner', 'reason', 'hostedLabel', 'requiredLabels', 'considered', 'sources', 'inventoryCount']) assert.ok(key in decision, key);
    const roundTripped = JSON.parse(JSON.stringify(decision.runner));
    assert.ok(typeof roundTripped === 'string' || (Array.isArray(roundTripped) && roundTripped.every(label => typeof label === 'string')));
  }
  assert.equal(JSON.stringify(selectRunner({ runners: [] }).runner), '"windows-2022"');
});

test('label list parsing defaults when empty', () => {
  assert.deepEqual(parseLabels(''), DEFAULT_REQUIRED_LABELS);
  assert.deepEqual(parseLabels(' self-hosted , Windows ,'), ['self-hosted', 'Windows']);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async url => {
    const path = url.replace('https://api.github.com', '').split('?')[0];
    calls.push(path);
    const route = routes[path];
    if (route === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof route === 'number') return { ok: false, status: route, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => route };
  };
  impl.calls = calls;
  return impl;
}

test('repository and organization group runners are combined and de-duplicated', async () => {
  const shared = runner('shared');
  const fetchImpl = fakeFetch({
    '/repos/o/r/actions/runners': { runners: [shared, runner('repo-only')] },
    '/orgs/o/actions/runner-groups': { runner_groups: [
      { id: 1, visibility: 'all', allows_public_repositories: true },
      { id: 2, visibility: 'selected', allows_public_repositories: true },
      { id: 3, visibility: 'selected', allows_public_repositories: true },
      { id: 4, visibility: 'all', allows_public_repositories: false },
    ] },
    '/orgs/o/actions/runner-groups/1/runners': { runners: [shared, runner('org-one')] },
    '/orgs/o/actions/runner-groups/2/repositories': { repositories: [{ full_name: 'o/r' }] },
    '/orgs/o/actions/runner-groups/2/runners': { runners: [runner('org-two')] },
    '/orgs/o/actions/runner-groups/3/repositories': { repositories: [{ full_name: 'o/other' }] },
  });
  const { runners, sources } = await fetchInventory({ repository: 'o/r', token: 't', fetchImpl });
  assert.deepEqual(runners.map(row => row.name).sort(), ['org-one', 'org-two', 'repo-only', 'shared']);
  assert.ok(sources.every(source => source.ok));
  assert.ok(!fetchImpl.calls.some(call => call.includes('/runner-groups/3/runners')), 'inaccessible group is never read');
  assert.ok(!fetchImpl.calls.some(call => call.includes('/runner-groups/4/')), 'group closed to public repositories is never read');
});

test('permission errors on every source fall back to hosted through decide', async () => {
  const fetchImpl = fakeFetch({ '/repos/o/r/actions/runners': 403, '/orgs/o/actions/runner-groups': 403 });
  const decision = await decide({ env: { GITHUB_REPOSITORY: 'o/r', RUNNER_INVENTORY_TOKEN: 't' }, fetchImpl });
  assert.equal(decision.kind, 'hosted');
  assert.equal(decision.runner, HOSTED_FALLBACK);
  assert.match(decision.reason, /inventory-unavailable/);
  assert.match(decision.reason, /HTTP 403/);
});

test('one readable source is enough, and a missing token or network error falls back', async () => {
  const fetchImpl = fakeFetch({ '/repos/o/r/actions/runners': { runners: [runner('only')] }, '/orgs/o/actions/runner-groups': 403 });
  const decision = await decide({ env: { GITHUB_REPOSITORY: 'o/r', RUNNER_INVENTORY_TOKEN: 't' }, fetchImpl });
  assert.equal(decision.kind, 'self-hosted');
  assert.deepEqual(decision.sources.map(source => source.ok), [true, false]);
  const noToken = await decide({ env: { GITHUB_REPOSITORY: 'o/r' }, fetchImpl });
  assert.equal(noToken.kind, 'hosted');
  assert.match(noToken.reason, /no token/);
  const broken = await decide({ env: { GITHUB_REPOSITORY: 'o/r', RUNNER_INVENTORY_TOKEN: 't' }, fetchImpl: async () => { throw Error('network down'); } });
  assert.equal(broken.kind, 'hosted');
  assert.match(broken.reason, /network down/);
});

test('summary records the decision and reason as capacity evidence', () => {
  const text = renderSummary(selectRunner({ runners: [runner('a', { busy: true })] }));
  assert.match(text, /Decision: \*\*hosted\*\*/);
  assert.match(text, /no online idle runner/);
  assert.match(text, /\| a \| online \| true \| busy \|/);
});

test('release workflow wires the selector first and keeps the pinned promotion image', async () => {
  const workflow = (await readFile(new URL('../.github/workflows/windows.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  assert.ok(workflow.indexOf('\n  select-runner:') < workflow.indexOf('\n  windows:'));
  assert.match(workflow, /\n  windows:\n    needs: select-runner\n    runs-on: \$\{\{ fromJSON\(needs\.select-runner\.outputs\.runner\) \}\}/);
  assert.match(workflow, /run: node scripts\/select-runner\.mjs/);
  assert.match(workflow, /\n  promote:\n    needs: windows\n[\s\S]*?runs-on: windows-2022/);
  assert.doesNotMatch(workflow, /pull_request/);
});
