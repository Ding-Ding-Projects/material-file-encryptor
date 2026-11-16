import test from 'node:test';
import assert from 'node:assert/strict';
import { registryLoginSnapshot, registryLoginAction, registryLoginMessageKey, REGISTRY_LOGIN_REASONS } from '../src/renderer/features/storage-maintenance/registry-login-model.js';
import { REGISTRY_COPY } from '../src/renderer/features/storage-maintenance/registry-copy.js';

class Node {
  constructor(tag) { this.localName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.disabled = false; this.value = ''; this.href = ''; this.tabIndex = -1; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; } setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; } remove() { this.removed = true; }
}
globalThis.document = { createElement: tag => new Node(tag) };
const { RegistryLoginPanel } = await import('../src/renderer/features/storage-maintenance/registry-login-panel.js');
const tick = () => new Promise(resolve => setImmediate(resolve)), panels = [];
test.afterEach(() => { panels.splice(0).forEach(panel => panel.destroy()); });
const view = (value, extra = {}) => ({ state: value, deviceCode: null, canOpenPage: false, expiresAt: null, account: null, reason: null, ...extra });
async function fixture(initial, extra = {}, options = {}) {
  const calls = [];
  const services = { registryLoginStatus: async () => { calls.push('status'); return initial; }, recheckRegistryLogin: async () => { calls.push('recheck'); return initial; },
    startRegistryLogin: async () => { calls.push('start'); return view('checking'); }, cancelRegistryLogin: async () => { calls.push('cancel'); return view('cancelled'); },
    openRegistryLoginPage: async () => { calls.push('open'); return initial; }, ...extra };
  const panel = new RegistryLoginPanel({ translate: key => REGISTRY_COPY[key]?.[0] || key, ...options }); panels.push(panel); panel.configure(services); await tick(); calls.length = 0;
  return { panel, calls, services };
}
const click = panel => panel.buttons.start.listeners.click();

test('P1: only a known reason crosses into the panel; raw or unknown text is dropped', () => {
  assert.equal(registryLoginSnapshot(view('unavailable', { reason: 'docker-not-running' })).reason, 'docker-not-running');
  assert.equal(registryLoginSnapshot(view('unavailable', { reason: 'C:\\Users\\private\\secret.txt' })).reason, null);
  assert.equal(registryLoginSnapshot(view('signed-in', { account: 'yourname' })).account, 'yourname');
  assert.equal(registryLoginSnapshot(view('signed-in', { account: '../etc' })).account, null);
  assert.equal(registryLoginSnapshot(view('failed', { account: 'yourname' })).account, null, 'an account is only surfaced for a verified sign-in');
});

test('P1: every reason reaches a reason-specific message with English and Cantonese copy', async () => {
  for (const reason of REGISTRY_LOGIN_REASONS) {
    const key = registryLoginMessageKey('unavailable', reason);
    assert.equal(REGISTRY_COPY[key]?.length, 2, key);
    const { panel } = await fixture(view('unavailable', { reason }));
    assert.equal(panel.status.textContent, REGISTRY_COPY[key][0], reason);
  }
  assert.equal(registryLoginMessageKey('idle', null), 'login-idle'); assert.equal(registryLoginMessageKey('unavailable', null), 'login-unavailable');
});

test('each state offers exactly one clear next action', () => {
  const table = [['idle', null, 'loginStart', 'start'], ['signed-in', null, 'loginChooseDrives', 'choose'], ['cancelled', null, 'loginStartAgain', 'start'], ['expired', 'device-login-expired', 'loginNewCode', 'start'],
    ['stale', 'stored-sign-in-unverified', 'loginSignInAgain', 'start'], ['failed', 'device-login-incomplete', 'loginRetry', 'start'],
    ['unavailable', 'docker-not-installed', 'loginCheckAgain', 'recheck'], ['unavailable', 'docker-not-running', 'loginCheckAgain', 'recheck'], ['unavailable', 'device-flow-unavailable', 'loginCheckAgainUpdated', 'recheck'],
    ['unavailable', 'provider-unavailable', 'loginCheckAgain', 'recheck'], ['unavailable', null, 'loginRetry', 'start']];
  for (const [state, reason, label, run] of table) { const action = registryLoginAction(state, reason); assert.equal(action.label, label, `${state}/${reason}`); assert.equal(action.run, run, `${state}/${reason}`); assert.equal(REGISTRY_COPY[label]?.length, 2, label); }
  for (const state of ['checking', 'authorizing', 'verifying']) assert.equal(registryLoginAction(state).run, null);
});

test('P4: a stale saved sign-in offers Sign in again, which runs the device flow', async () => {
  const { panel, calls } = await fixture(view('stale', { reason: 'stored-sign-in-unverified' }));
  panel.accept(view('stale', { reason: 'stored-sign-in-unverified' })); panel.render();
  assert.equal(panel.buttons.start.textContent, 'Sign in again'); assert.equal(panel.buttons.start.disabled, false);
  assert.equal(panel.status.textContent, REGISTRY_COPY['loginReason-stored-sign-in-unverified'][0]);
  await click(panel); assert.deepEqual(calls, ['start']);
});

test('P5: Check status asks the host to re-inspect, and a verified account appears with Choose drives', async () => {
  let chosen = 0, signedIn = 0;
  const { panel, calls, services } = await fixture(view('idle'), {}, { onChooseDrives: () => chosen++, onSignedIn: () => signedIn++ });
  services.recheckRegistryLogin = async () => { calls.push('recheck'); return view('signed-in', { account: 'yourname' }); };
  await panel.buttons.refresh.listeners.click(); assert.deepEqual(calls, ['recheck']);
  assert.equal(signedIn, 1); assert.equal(panel.account.hidden, false); assert.equal(panel.account.textContent, 'Signed in as yourname');
  assert.equal(panel.buttons.start.textContent, 'Choose drives'); assert.equal(panel.buttons.start.disabled, false);
  await click(panel); assert.equal(chosen, 1); assert.deepEqual(calls, ['recheck'], 'choosing drives never restarts a sign-in');
  panel.accept(view('signed-in')); panel.render(); assert.equal(panel.account.textContent, 'Signed in to Docker Hub');
});

test('P5: an environment problem is fixed outside the app and Check again re-inspects instead of retrying the browser flow', async () => {
  const { panel, calls, services } = await fixture(view('unavailable', { reason: 'docker-not-running' }));
  panel.accept(view('unavailable', { reason: 'docker-not-running' })); panel.render();
  assert.equal(panel.buttons.start.textContent, 'Check again');
  services.recheckRegistryLogin = async () => { calls.push('recheck'); return view('signed-in', { account: 'yourname' }); };
  await click(panel); assert.deepEqual(calls, ['recheck']); assert.equal(panel.value.state, 'signed-in');
});

test('P6: after cancel or expiry the very next click starts a new sign-in', async () => {
  const { panel, calls } = await fixture(view('idle'));
  panel.accept(view('cancelled')); panel.render(); assert.equal(panel.buttons.start.textContent, 'Start again'); assert.equal(panel.buttons.start.disabled, false);
  await click(panel); assert.deepEqual(calls, ['start']);
  calls.length = 0; panel.accept(view('expired', { reason: 'device-login-expired' })); panel.render(); assert.equal(panel.buttons.start.textContent, 'Get a new code');
  await click(panel); assert.deepEqual(calls, ['start']);
});

test('the sign-in panel reports changes to the backup panel and the account never carries a secret', async () => {
  const { panel } = await fixture(view('idle')); let renders = 0, signed = 0;
  panel.onRender(() => renders++); panel.onSignedInChange(() => signed++);
  panel.accept(view('signed-in', { account: 'yourname' })); panel.render();
  assert.equal(renders, 1); assert.equal(signed, 1); assert.equal(panel.signedIn, true); assert.ok(!JSON.stringify(panel.value).includes('secret'));
});
