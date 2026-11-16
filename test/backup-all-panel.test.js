import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_ALL_COPY } from '../src/renderer/features/storage-maintenance/backup-all-copy.js';
import { REGISTRY_COPY } from '../src/renderer/features/storage-maintenance/registry-copy.js';
import { backupAllPlan, backupAllStatus, backupSummary, fill } from '../src/renderer/features/storage-maintenance/backup-all-model.js';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; }
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
const { BackupAllPanel } = await import('../src/renderer/features/storage-maintenance/backup-all-panel.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async (condition, attempts = 200) => { for (let i = 0; i < attempts && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 2)); };
const panels = new Set(); test.afterEach(() => { for (const panel of panels) panel.destroy(); panels.clear(); });
const DIGEST = 'sha256:' + 'a'.repeat(64);
const plan = () => ({ running: false, drives: [
  { sessionId: 'main', name: 'Work vault', letter: 'M:', locked: false, ineligibleReason: null, suffix: 'mfe-work-vault', configured: null, lastSync: null, nextSync: null },
  { sessionId: 's2', name: 'Family photos', letter: 'P:', locked: false, ineligibleReason: null, suffix: 'mfe-family-photos', configured: null, lastSync: '2026-11-16T13:00:00.000Z', nextSync: '2026-11-16T14:00:00.000Z' },
  { sessionId: 's3', name: 'Tax records', letter: 'T:', locked: true, ineligibleReason: 'locked', suffix: 'mfe-tax-records', configured: null, lastSync: null, nextSync: null },
] });
const run = (states, extra = {}) => ({ phase: 'running', startedAt: '2026-11-16T14:00:00.000Z', finishedAt: null, namespace: 'yourname',
  drives: states.map(([sessionId, state, more]) => ({ sessionId, name: sessionId, repository: `yourname/mfe-${sessionId}`, visibility: 'public', state, error: null, digest: null, published: null, lastSync: null, nextSync: null, ...more })), ...extra });
function login(initial = { state: 'signed-in', account: 'yourname' }) {
  const listeners = { signed: [], render: [] }, calls = [];
  const value = { ...initial };
  return { calls, value, root: { scrollIntoView: () => calls.push('scroll') }, get signedIn() { return this.value.state === 'signed-in'; },
    onSignedInChange(fn) { listeners.signed.push(fn); return () => {}; }, onRender(fn) { listeners.render.push(fn); return () => {}; },
    async primary() { calls.push('primary'); }, async recheck() { calls.push('recheck'); },
    complete() { this.value = { state: 'signed-in', account: 'yourname' }; for (const fn of listeners.signed) fn(this.value); } };
}
async function fixture({ signedIn, statusQueue = [], startResult, services = {} } = {}) {
  const calls = [], queue = [...statusQueue]; let started = false, current = { phase: 'idle', startedAt: null, finishedAt: null, namespace: null, drives: [] };
  const api = {
    backupAllPlan: async () => plan(),
    backupAllStart: async selection => { started = true; calls.push(['start', selection]); current = startResult ?? run(selection.sessionIds.map(id => [id, 'queued'])); return current; },
    backupAllStatus: async () => { if (started && queue.length) current = queue.shift(); return current; },
    backupAllCancel: async () => { calls.push(['cancel']); return current; },
    ...services,
  };
  const panel = new BackupAllPanel(); panels.add(panel); panel.pollMs = 1;
  const account = login(signedIn); panel.configure({ services: api, login: account }); await tick(); await settle(() => panel.plan || panel.error);
  return { panel, calls, account };
}
const row = (panel, id) => panel.rows.get(id);

test('the drive list defaults to unlocked drives, names repositories mfe-<drive>, and tells locked drives to unlock', async () => {
  const { panel } = await fixture();
  assert.deepEqual([...panel.selected].sort(), ['main', 's2']); assert.equal(row(panel, 'main').input.value, 'mfe-work-vault');
  assert.equal(row(panel, 's3').check.disabled, true); assert.equal(row(panel, 's3').check.checked, false); assert.equal(row(panel, 's3').badge.textContent, 'Unlock to include');
  assert.equal(panel.buttons.start.textContent, 'Back up 2 drive(s)'); assert.equal(panel.buttons.start.disabled, false);
  assert.match(panel.account.textContent, /yourname/); assert.match(row(panel, 's2').last.textContent, /Last sync: .*2026/);
  assert.match(panel.warning.textContent, /anyone can download the encrypted copy/); assert.match(panel.warning.textContent, /key file or a long passphrase/);
  assert.match(panel.asIs.textContent, /vault\.json/); assert.equal(row(panel, 'main').check.attributes['aria-label'], 'Include in this backup: Work vault (M:)');
});

test('a signed-in backup sends only the chosen drives and names, shows per-drive progress and a final result', async () => {
  const done = { digest: DIGEST, lastSync: '2026-11-16T14:05:00.000Z', nextSync: '2026-11-16T15:05:00.000Z' };
  const { panel, calls } = await fixture({ statusQueue: [run([['main', 'syncing'], ['s2', 'queued']]), { ...run([['main', 'done', done], ['s2', 'done', done]]), phase: 'finished' }] });
  row(panel, 's2').input.value = 'mfe-photos'; row(panel, 's2').input.listeners.input();
  await panel.start(); await settle(() => panel.status.phase === 'finished');
  assert.deepEqual(calls[0], ['start', { sessionIds: ['main', 's2'], names: { main: 'mfe-work-vault', s2: 'mfe-photos' } }]);
  assert.equal(row(panel, 'main').badge.textContent, 'Backed up'); assert.match(row(panel, 'main').next.textContent, /Next sync: .*2026/);
  assert.equal(panel.statusText.textContent, 'All selected drives are backed up.'); assert.equal(panel.buttons.start.textContent, 'Back up again');
  assert.equal(backupSummary(backupAllStatus(panel.status)).percent, 100);
});

test('when not signed in, the guided sign-in starts first and the backup continues by itself once verified', async () => {
  const { panel, calls, account } = await fixture({ signedIn: { state: 'idle' } });
  await panel.start();
  assert.deepEqual(account.calls.filter(item => item !== 'scroll'), ['primary']); assert.equal(calls.length, 0); assert.match(panel.statusText.textContent, /Sign in to Docker Hub first/);
  account.complete(); await settle(() => calls.length);
  assert.equal(calls[0][0], 'start'); assert.deepEqual(calls[0][1].sessionIds, ['main', 's2']);
});

test('a failed drive shows a precise, bilingual reason with its repository and offers retry; others stay finished', async () => {
  const failed = { ...run([['main', 'failed', { repository: 'other-team/mfe-work-vault', error: { code: 'REPOSITORY_CREATE_DENIED', message: 'x' } }], ['s2', 'done', { digest: DIGEST }]]), phase: 'finished' };
  const { panel } = await fixture({ statusQueue: [failed] });
  await panel.start(); await settle(() => panel.status.phase === 'finished');
  assert.equal(row(panel, 'main').badge.textContent, 'Needs attention'); assert.equal(row(panel, 'main').error.hidden, false);
  assert.match(row(panel, 'main').error.textContent, /does not allow this account to create other-team\/mfe-work-vault/);
  assert.equal(panel.buttons.start.textContent, 'Retry failed drives'); assert.match(panel.statusText.textContent, /1 backed up, 1 need attention/);
  panel.setLanguage('zh-HK'); assert.match(row(panel, 'main').error.textContent, /Docker Hub 唔容許呢個帳戶建立 other-team\/mfe-work-vault/); assert.equal(row(panel, 'main').badge.textContent, '需要處理');
  assert.match(panel.warning.textContent, /公開即係任何人都可以下載加密副本/);
});

test('invalid or duplicate repository names block the backup and focus the offending field', async () => {
  const { panel, calls } = await fixture();
  row(panel, 'main').input.value = 'Bad Name'; row(panel, 'main').input.listeners.input();
  await panel.start(); assert.equal(calls.length, 0); assert.equal(panel.errorText.textContent, BACKUP_ALL_COPY.backupInvalidName[0]); assert.equal(row(panel, 'main').input.focused, true);
  row(panel, 'main').input.value = 'same'; row(panel, 'main').input.listeners.input(); row(panel, 's2').input.value = 'same'; row(panel, 's2').input.listeners.input();
  await panel.start(); assert.equal(calls.length, 0);
});

test('choosing no drive is refused with a clear message', async () => {
  const { panel, calls } = await fixture();
  for (const id of ['main', 's2']) { row(panel, id).check.checked = false; row(panel, id).check.listeners.change(); }
  assert.equal(panel.buttons.start.disabled, true); await panel.start(); assert.equal(calls.length, 0); assert.equal(panel.errorText.textContent, BACKUP_ALL_COPY.backupChooseDrive[0]);
});

test('cancel is offered only while running and reports the host state', async () => {
  const { panel, calls } = await fixture({ startResult: run([['main', 'syncing'], ['s2', 'queued']]), statusQueue: [] });
  await panel.start(); assert.equal(panel.buttons.cancel.hidden, false); assert.equal(panel.buttons.start.disabled, true);
  await panel.cancel(); assert.deepEqual(calls.at(-1), ['cancel']);
  const idle = await fixture(); assert.equal(idle.panel.buttons.cancel.hidden, true);
});

test('the host response is bounded: unknown shapes are refused and shown as unavailable, never trusted', async () => {
  assert.throws(() => backupAllPlan({ drives: [{ sessionId: '../x', suffix: 'a' }] })); assert.throws(() => backupAllStatus({ phase: 'weird', drives: [] }));
  assert.throws(() => backupAllStatus({ phase: 'running', drives: [{ sessionId: 'main', state: 'exploded' }] }));
  assert.equal(backupAllStatus({ phase: 'finished', drives: [{ sessionId: 'main', state: 'failed', error: { code: 'DROP TABLE', message: 'x' }, digest: 'bad' }] }).drives[0].errorCode, 'SYNC_FAILED');
  const { panel } = await fixture({ services: { backupAllPlan: async () => ({ drives: 'nope' }) } });
  assert.equal(panel.error, 'backupStatusUnavailable'); assert.equal(panel.buttons.start.disabled, true);
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and ');
});

test('every backup string has English and Cantonese, and every sign-in reason has copy', () => {
  for (const [key, pair] of Object.entries(BACKUP_ALL_COPY)) { assert.equal(pair.length, 2, key); assert.ok(pair.every(value => typeof value === 'string' && value.trim()), key); }
  for (const reason of ['docker-not-installed', 'docker-not-running', 'config-missing', 'credential-store-missing', 'credential-store-unavailable', 'device-flow-unavailable', 'device-login-expired', 'stored-sign-in-unverified', 'identity-token-unsupported', 'provider-unavailable', 'invalid-cli-output'])
    assert.equal(REGISTRY_COPY['loginReason-' + reason]?.length, 2, reason);
});
