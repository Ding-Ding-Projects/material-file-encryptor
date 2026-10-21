import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE, registryConfiguration, registryDraft, registrySnapshots, registryBusy } from '../src/renderer/features/storage-maintenance/registry-model.js';
import { REGISTRY_COPY } from '../src/renderer/features/storage-maintenance/registry-copy.js';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
}
globalThis.HTMLElement = Node;
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { map: new Map(), get(key) { return this.map.get(key); }, define(key, value) { this.map.set(key, value); } };
globalThis.document = { createElement: tag => customElements.get(tag) ? new (customElements.get(tag))() : new Node(tag) };
const { RegistryStoragePanel } = await import('../src/renderer/features/storage-maintenance/registry-panel.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = `sha256:${'a'.repeat(64)}`;
const vault = (sessionId = 'main', source = `C:\\${sessionId}`) => ({ sessionId, storageDir: source, transport: { mode: 'folder' }, locked: false, mounted: true });
const configuration = () => ({ repository: 'owner/vault', schedule: { ...DEFAULT_SCHEDULE } });
const snapshot = () => ({ digest, tag: 'snapshot-device-123', snapshot: { vaultId: 'b'.repeat(32), deviceId: 'device-one', parents: [], fileCount: 3 } });
async function fixture(overrides = {}) {
  let selected = vault(); const calls = [], configs = new Map([['main', configuration()]]);
  const services = {
    registryStorageStatus: async () => ({ sessionId: selected.sessionId, source: selected.storageDir, configured: configs.has(selected.sessionId), configuration: configs.get(selected.sessionId), state: 'idle', nextDue: null }),
    configureRegistryStorage: async value => { calls.push(['save', selected.sessionId, value]); configs.set(selected.sessionId, value); },
    syncRegistryStorage: async () => { calls.push(['sync', selected.sessionId]); return { verified: true, digest }; },
    listRegistrySnapshots: async () => { calls.push(['list', selected.sessionId]); return [snapshot()]; },
    restoreRegistrySnapshot: async value => { calls.push(['restore', selected.sessionId, value]); return { restored: true, requiresUnlock: true, destination: 'C:\\Restored vault' }; },
    cancelRegistryStorage: async () => { calls.push(['cancel', selected.sessionId]); return { cancelling: true }; },
    ...overrides,
  };
  const panel = new RegistryStoragePanel(); panel.configure({ services, getVaultState: () => selected }); await tick();
  return { panel, calls, configs, setState(value) { selected = value; panel.setVaultState(value); } };
}
function edit(panel, field, value) { panel.fields[field].value = value; panel.edit(field); }

test('schedule validation bounds every field without accepting URLs, credentials or tags', () => {
  const draft = registryDraft(configuration()); assert.equal(registryConfiguration(draft).schedule.enabled, false);
  for (const [field, values] of Object.entries({ repository: ['owner/vault:tag', 'https://hub.docker.com/owner/vault', 'user:password@host/repo'], intervalMinutes: [0, 4, 10081, 5.5, ''], retryMinutes: [4, 1441, 5.1], mode: ['unknown'], days: [[], [7]], times: ['25:00', '09:00,', '9:00'], timeZone: ['Mars/Unknown', ''], missed: ['unknown'] })) {
    for (const value of values) assert.throws(() => registryConfiguration({ ...draft, [field]: value }), error => error.field === field);
  }
  assert.throws(() => registrySnapshots([{ ...snapshot(), digest: 'latest' }]));
  assert.throws(() => registrySnapshots([snapshot(), snapshot()]));
  for (const state of ['idle', 'unconfigured', 'verified', 'incomplete', 'cancelled']) assert.equal(registryBusy({ state }), false);
  for (const state of ['discovering', 'downloading', 'preparing', 'uploading', 'restoring', 'native-release-unverified']) assert.equal(registryBusy({ state }), true);
});

test('real component sends full saved schedule and never synchronizes on configuration save', async () => {
  const { panel, calls } = await fixture();
  edit(panel, 'repository', 'owner/backup'); edit(panel, 'mode', 'calendar'); edit(panel, 'times', '08:15, 19:45'); edit(panel, 'timeZone', 'America/Toronto'); edit(panel, 'retryMinutes', '20'); edit(panel, 'missed', 'skip');
  panel.days.forEach((node, day) => { node.checked = [0, 6].includes(day); }); panel.edit('days');
  panel.fields.enabled.checked = true; panel.edit('enabled'); panel.fields.background.checked = true; panel.edit('background');
  await panel.save();
  assert.deepEqual(calls, [['save', 'main', { repository: 'owner/backup', schedule: { enabled: true, mode: 'calendar', intervalMinutes: 60, days: [0, 6], times: ['08:15', '19:45'], timeZone: 'America/Toronto', missed: 'skip', retryMinutes: 20, background: true } }]]);
  assert.match(panel.statusText.textContent, /does not confirm an upload/); assert.equal(panel.calendar.hidden, false); assert.equal(panel.interval.hidden, true);
});

test('drafts survive refresh and localization while invalid edits stay offline', async () => {
  const { panel, calls } = await fixture(); edit(panel, 'repository', 'owner/draft'); await panel.refresh(); panel.setLanguage('bilingual');
  assert.equal(panel.fields.repository.value, 'owner/draft'); assert.equal(panel.metrics.savedRepository.value.textContent, 'owner/vault');
  edit(panel, 'times', '27:00'); edit(panel, 'mode', 'calendar'); await panel.save();
  assert.equal(calls.length, 0); assert.equal(panel.fields.times.focused, true); assert.match(panel.error.textContent, /HH:mm/);
});

test('disabled scheduling permits manual sync and its verified result is distinguished from unknown outcome', async () => {
  const { panel, calls } = await fixture(); assert.equal(panel.fields.enabled.checked, false); assert.equal(panel.buttons.sync.disabled, false);
  await panel.sync(); assert.deepEqual(calls, [['sync', 'main']]); assert.match(panel.statusText.textContent, /verified digest/);
  panel.services.syncRegistryStorage = async () => ({ verified: false }); await panel.sync(); assert.match(panel.statusText.textContent, /unverified/);
});

test('pending transfer suppresses duplicates while cancellation stays independently available', async () => {
  let finish; const { panel, calls } = await fixture({ syncRegistryStorage: () => new Promise(resolve => { finish = resolve; }) });
  const running = panel.sync(); assert.equal(panel.buttons.sync.disabled, true); assert.equal(panel.buttons.cancel.disabled, false); assert.equal(panel.progress.hidden, false);
  await panel.sync(); await panel.cancel(); await panel.cancel(); assert.deepEqual(calls, [['cancel', 'main']]); assert.match(panel.statusText.textContent, /already transferred data is not undone/);
  finish({ verified: false }); await running; assert.equal(panel.progress.hidden, true); assert.match(panel.statusText.textContent, /unverified/);
});

test('restore requires explicit immutable selection and failed list refresh removes stale admission', async () => {
  const { panel, calls } = await fixture(); await panel.restore(); assert.equal(calls.length, 0);
  await panel.list(); assert.equal(panel.buttons.restore.disabled, true);
  panel.revision.value = digest; panel.revision.listeners.change(); assert.equal(panel.buttons.restore.disabled, false);
  assert.equal(panel.rows.deviceId.value.textContent, 'device-one'); await panel.restore();
  assert.deepEqual(calls.at(-1), ['restore', 'main', { digest }]); assert.match(panel.statusText.textContent, /Unlock it separately/);
  panel.services.listRegistrySnapshots = async () => { throw Error('offline'); }; await panel.list(); assert.equal(panel.buttons.restore.disabled, true); assert.equal(panel.current().selected, '');
});

test('session and source switches fence pending responses and do not invoke follow-up status for another vault', async () => {
  let finish; let statusCalls = 0;
  const { panel, setState } = await fixture({ syncRegistryStorage: () => new Promise(resolve => { finish = resolve; }) });
  const originalStatus = panel.services.registryStorageStatus; panel.services.registryStorageStatus = (...args) => { statusCalls++; return originalStatus(...args); };
  edit(panel, 'repository', 'owner/private-draft'); const running = panel.sync(); setState(vault('second')); await tick();
  const count = statusCalls; finish({ verified: true, digest }); await running;
  assert.equal(statusCalls, count); assert.equal(panel.fields.repository.value, ''); assert.doesNotMatch(panel.statusText.textContent, /verified digest/);
  setState(vault('main')); await tick(); assert.equal(panel.fields.repository.value, 'owner/private-draft');
  setState(vault('main', 'C:\\different')); await tick(); assert.notEqual(panel.fields.repository.value, 'owner/private-draft');
});

test('wrong status identity and missing services fail closed; destruction ignores late results', async () => {
  const bad = await fixture({ registryStorageStatus: async () => ({ sessionId: 'other', source: 'C:\\main', configured: true, configuration: configuration(), state: 'idle' }) });
  assert.equal(bad.panel.buttons.sync.disabled, true); assert.match(bad.panel.error.textContent, /does not match/);
  const missing = await fixture({ cancelRegistryStorage: null }); assert.equal(missing.panel.buttons.save.disabled, true);
  let finish; const { panel } = await fixture({ listRegistrySnapshots: () => new Promise(resolve => { finish = resolve; }) });
  const listing = panel.list(); panel.destroy(); finish([snapshot()]); await listing; assert.equal(panel.sessions.size, 0); assert.equal(panel.removed, true);
});

test('all labels translate and important state has accessible text without interpreting snapshot markup', async () => {
  for (const [key, pair] of Object.entries(REGISTRY_COPY)) { assert.ok(pair[0], key); assert.ok(pair[1], key); }
  const { panel } = await fixture({ listRegistrySnapshots: async () => [{ ...snapshot(), tag: '<script>bad</script>' }] });
  panel.setLanguage('zh-HK'); assert.equal(panel.copyNodes.title.textContent, REGISTRY_COPY.title[1]); assert.equal(panel.fields.repository.attributes['aria-label'], REGISTRY_COPY.repository[1]);
  panel.setLanguage('bilingual'); assert.match(panel.buttons.save.textContent, /Save destination and schedule · 儲存/);
  assert.equal(panel.statusText.attributes.role, 'status'); assert.equal(panel.error.attributes.role, 'alert');
  await panel.list(); assert.equal(panel.revision.children[1].children[0].textContent, `<script>bad</script> · ${digest}`);
});

test('fresh computer can save a destination and restore its first vault without an existing source', async () => {
  const { panel, calls, setState } = await fixture();
  setState(vault('fresh', '')); await tick();
  assert.equal(panel.buttons.save.disabled, false);
  assert.equal(panel.buttons.sync.disabled, true);
  assert.equal(panel.fields.enabled.disabled, true);
  assert.equal(panel.copyNodes.sourceRequired.hidden, false);
  assert.deepEqual(panel.current().draft.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(panel.current().draft.times, '02:00');
  edit(panel, 'repository', 'docker.io/owner/backup'); await panel.save();
  assert.equal(calls[0][0], 'save'); assert.equal(calls[0][2].repository, 'owner/backup');
  assert.equal(calls[0][2].schedule.enabled, false);
  assert.equal(panel.current().status.source, ''); assert.equal(panel.buttons.sync.disabled, true);
  await panel.sync(); assert.equal(calls.filter(call => call[0] === 'sync').length, 0);
  await panel.list(); panel.revision.value = digest; panel.revision.listeners.change(); await panel.restore();
  assert.deepEqual(calls.at(-1), ['restore', 'fresh', { digest }]);
  assert.match(panel.statusText.textContent, /Unlock it separately/);
  assert.equal(panel.restoredLocation.textContent, 'C:\\Restored vault');
  assert.equal(panel.restoreResult.hidden, false);
  assert.equal(panel.vaultState.storageDir, '');
  assert.match(panel.copyNodes.unlockRestored.textContent, /Unlock existing drive/);
  setState(vault('another', '')); await tick(); assert.equal(panel.restoreResult.hidden, true);
});

test('source-less scheduling is rejected locally and an unsupported transport still permits independent restore', async () => {
  const { panel, calls, setState } = await fixture();
  setState(vault('fresh', '')); await tick(); edit(panel, 'repository', 'owner/backup');
  panel.current().draft.enabled = true; await panel.save();
  assert.equal(calls.length, 0); assert.match(panel.error.textContent, /Choose or restore/);
  assert.equal(panel.fields.enabled.disabled, false); // An existing enabled draft can always be turned off.
  panel.fields.enabled.checked = false; panel.edit('enabled'); await panel.save();
  setState({ ...vault(), transport: { mode: 'privateGit' } }); await tick();
  assert.equal(panel.buttons.sync.disabled, true); assert.equal(panel.buttons.list.disabled, false);
  await panel.list(); panel.revision.value = digest; panel.revision.listeners.change(); await panel.restore();
  assert.deepEqual(calls.at(-1), ['restore', 'main', { digest }]);
});

test('repository normalization and native lease recovery retain bounded action admission', async () => {
  const result = registryConfiguration({ ...registryDraft(configuration()), repository: ' docker.io/owner/vault ' });
  assert.equal(result.repository, 'owner/vault');
  const { panel } = await fixture();
  panel.services.registryStorageStatus = async () => ({ sessionId: 'main', source: 'C:\\main', configured: true, configuration: configuration(), state: 'native-release-unverified' });
  await panel.refresh(); assert.equal(panel.buttons.cancel.disabled, false); assert.equal(panel.buttons.sync.disabled, true);
  assert.match(panel.statusText.textContent, /native-release-unverified/);
});
