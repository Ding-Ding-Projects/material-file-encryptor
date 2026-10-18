import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { canPrepareVaultImage, vaultImageTarget, vaultImagePreview, vaultImageActions } from '../src/renderer/features/storage-maintenance/vault-image-model.js';
import { VAULT_IMAGE_COPY } from '../src/renderer/features/storage-maintenance/vault-image-copy.js';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
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
const { VaultImagePanel } = await import('../src/renderer/features/storage-maintenance/vault-image-panel.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = (sessionId = 'main', patch = {}) => ({ sessionId, locked: true, mounted: false, storageDir: `C:\\${sessionId}`, transport: { mode: 'folder' }, ...patch });
const preview = (sessionId = 'main', phase = 'prepared') => ({ sessionId, phase, previewId: `${sessionId}-preview`, target: 'docker.io/owner/vault:backup', fileCount: 3, totalBytes: 1234, vaultId: 'a'.repeat(32), storageOnly: true, excludesPendingCache: true, ...(['built', 'uploading', 'uploaded'].includes(phase) ? { imageId: `sha256:${'b'.repeat(64)}` } : {}), ...(phase === 'uploaded' ? { receipt: { uploaded: true, private: true, digest: `owner/vault@sha256:${'c'.repeat(64)}`, repository: 'owner/vault' } } : {}) });

async function fixture({ selected = state(), overrides = {} } = {}) {
  let current = selected;
  const calls = [], snapshots = new Map();
  const services = {
    prepareVaultImage: async reference => { calls.push(['prepare', current.sessionId, reference]); const result = preview(current.sessionId); snapshots.set(current.sessionId, result); return result; },
    buildVaultImage: async id => { calls.push(['build', current.sessionId, id]); const result = preview(current.sessionId, 'built'); snapshots.set(current.sessionId, result); return result; },
    uploadVaultImage: async id => { calls.push(['upload', current.sessionId, id]); const result = preview(current.sessionId, 'uploaded'); snapshots.set(current.sessionId, result); return result; },
    discardVaultImage: async () => { calls.push(['discard', current.sessionId]); snapshots.delete(current.sessionId); },
    cancelVaultImage: async () => { calls.push(['cancel', current.sessionId]); return { cancelling: true }; },
    vaultImageStatus: async () => snapshots.get(current.sessionId) || null,
    ...overrides,
  };
  const panel = new VaultImagePanel(); panel.configure({ services, getVaultState: () => current }); await tick();
  return { panel, calls, snapshots, setState: value => { current = value; panel.setVaultState(value); } };
}

test('image input validation and admission require a locked folder-backed vault', () => {
  assert.equal(vaultImageTarget(' owner/vault:backup '), 'owner/vault:backup');
  for (const target of ['owner/vault__files:tag', 'owner/vault---files:tag']) assert.equal(vaultImageTarget(target), target);
  for (const value of ['', 'owner/vault', 'https://hub.docker.com/owner/vault:tag', 'docker.io/owner/vault:tag', '-owner/vault:tag', 'owner/../vault:tag', 'owner/vault:tag --push', 'Owner/vault:tag']) assert.throws(() => vaultImageTarget(value));
  assert.equal(canPrepareVaultImage(state()), true);
  for (const patch of [{ locked: false }, { lockVerified: false }, { mounted: true }, { storageDir: '' }, { sessionId: '' }, { transport: { mode: 'privateGit' } }, { operation: 'locking' }]) assert.equal(canPrepareVaultImage(state('main', patch)), false);
  assert.equal(vaultImageActions({ state: state(), preview: preview('main', 'prepared') }).upload, false);
  assert.equal(vaultImageActions({ state: state(), preview: preview('main', 'built'), sourceChanged: true }).upload, false);
  for (const phase of ['building', 'uploading']) {
    const actions = vaultImageActions({ state: state(), preview: preview('main', phase) });
    assert.equal(actions.prepare, false); assert.equal(actions.discard, false); assert.equal(actions.cancel, true); assert.equal(actions.refresh, true);
  }
});

test('preview rejects mismatched sessions, malformed data and unverifiable upload receipts', () => {
  assert.equal(vaultImagePreview(null, 'main'), null);
  assert.equal(vaultImagePreview(preview(), 'main').fileCount, 3);
  assert.equal(vaultImagePreview({ ...preview(), vaultId: 'a'.repeat(64) }, 'main').vaultId.length, 64);
  assert.equal(vaultImagePreview(preview('main', 'uploaded'), 'main').phase, 'uploaded');
  const uploaded = preview('main', 'uploaded');
  assert.equal(vaultImagePreview({ ...uploaded, receipt: { ...uploaded.receipt, digest: `docker.io/${uploaded.receipt.digest}` } }, 'main').phase, 'uploaded');
  for (const value of [preview('other'), { ...preview(), fileCount: -1 }, { ...preview(), totalBytes: Infinity }, { ...preview(), vaultId: '<script>' }, { ...preview(), target: 'docker.io/owner/public:tag?secret' }, { ...preview(), storageOnly: false }, { ...preview(), excludesPendingCache: false }, { ...preview(), phase: 'unknown' }, { ...preview('main', 'built'), imageId: 'unknown' }, { ...uploaded, receipt: { ...uploaded.receipt, private: false } }, { ...uploaded, receipt: { ...uploaded.receipt, digest: `other/vault@sha256:${'c'.repeat(64)}` } }]) assert.throws(() => vaultImagePreview(value, 'main'));
});

test('prepare, local build and upload require separate clicks and preserve the immutable target', async () => {
  const { panel, calls } = await fixture();
  panel.target.value = 'owner/vault:backup';
  await panel.prepare();
  assert.deepEqual(calls, [['prepare', 'main', 'owner/vault:backup']]);
  assert.equal(panel.rows.target.value.textContent, 'docker.io/owner/vault:backup');
  assert.equal(panel.rows.fileCount.value.textContent, '3'); assert.equal(panel.rows.totalBytes.value.textContent, '1234');
  assert.equal(panel.rows.vaultId.value.textContent, 'a'.repeat(32)); assert.equal(panel.target.disabled, true);
  assert.equal(panel.buttons.build.disabled, false); assert.equal(panel.buttons.upload.disabled, true);
  await panel.upload(); assert.equal(calls.length, 1);
  await panel.build(); assert.equal(calls.length, 2); assert.equal(calls[1][0], 'build');
  assert.match(panel.status.textContent, /not been uploaded/); assert.equal(panel.buttons.upload.disabled, false);
  assert.match(panel.uploadRisk.textContent, /existing Docker credentials/); assert.match(panel.uploadRisk.textContent, /offline password guessing/);
  assert.match(panel.uploadRisk.textContent, /remote tag may be replaced/); assert.match(panel.uploadRisk.textContent, /final confirmation/);
  await panel.upload(); assert.deepEqual(calls[2], ['upload', 'main', 'main-preview']);
  assert.match(panel.status.textContent, /verified repository digest/); assert.equal(panel.buttons.upload.disabled, true);
  await panel.upload(); assert.equal(calls.length, 3);
  await panel.discard(); assert.equal(panel.preview.hidden, true); assert.equal(panel.target.disabled, false);
  assert.match(panel.discardNote.textContent, /does not delete local Docker images/);
});

test('failed or cancelled upload is never automatically retried', async () => {
  let fail = true;
  const { panel, calls } = await fixture({ overrides: { uploadVaultImage: async () => { calls.push(['upload']); if (fail) throw Error('Unknown remote outcome'); return { cancelled: true }; } } });
  panel.target.value = 'owner/vault:backup'; await panel.prepare(); await panel.build(); await panel.upload();
  assert.equal(panel.current().preview.phase, 'upload-unverified'); assert.equal(panel.buttons.upload.disabled, true);
  assert.match(panel.status.textContent, /some data may already have been sent/); assert.match(panel.status.textContent, /Do not retry blindly/);
  await panel.upload(); assert.equal(calls.filter(call => call[0] === 'upload').length, 1);
  fail = false; await panel.prepare(); await panel.build(); await panel.upload();
  assert.equal(panel.current().preview.phase, 'built'); assert.match(panel.status.textContent, /confirmation cancelled/);
  assert.equal(calls.filter(call => call[0] === 'upload').length, 2);
});

test('session switches isolate drafts, pending results, cancellation and prepared metadata', async () => {
  let complete;
  const { panel, calls, setState, snapshots } = await fixture({ overrides: { prepareVaultImage: reference => { calls.push(['prepare', 'main', reference]); return new Promise(resolve => { complete = resolve; }); } } });
  panel.target.value = 'owner/vault:backup'; const preparing = panel.prepare();
  assert.equal(panel.buttons.prepare.disabled, true); await panel.prepare(); assert.equal(calls.length, 1);
  setState(state('second')); await tick();
  assert.equal(panel.target.value, ''); assert.equal(panel.preview.hidden, true); assert.equal(panel.buttons.cancel.hidden, true);
  await panel.cancel(); assert.equal(calls.length, 1);
  complete(preview()); await preparing;
  assert.equal(panel.preview.hidden, true); assert.equal(panel.rows.vaultId.value.textContent, '');
  snapshots.set('main', preview()); setState(state()); await tick();
  assert.equal(panel.target.value, 'owner/vault:backup'); assert.equal(panel.rows.target.value.textContent, 'docker.io/owner/vault:backup');
  assert.equal(panel.buttons.build.disabled, false);
});

test('changed storage invalidates build and upload without deleting another snapshot', async () => {
  const { panel, calls, setState } = await fixture();
  panel.target.value = 'owner/vault:backup'; await panel.prepare(); await panel.build();
  setState(state('main', { storageDir: 'C:\\different-vault' }));
  assert.equal(panel.buttons.upload.disabled, true); assert.match(panel.status.textContent, /different storage/);
  await panel.upload(); assert.equal(calls.length, 2);
});

test('destroyed panels ignore late data, failed refresh clears actionable previews, and input errors stay offline', async () => {
  const first = await fixture(); first.panel.target.value = 'https://wrong/'; await first.panel.prepare();
  assert.equal(first.calls.length, 0); assert.equal(first.panel.target.focused, true);
  first.panel.target.value = 'owner/vault:backup'; await first.panel.prepare();
  first.panel.services.vaultImageStatus = async () => { throw Error('unavailable'); }; await first.panel.refresh();
  assert.equal(first.panel.preview.hidden, true); assert.equal(first.panel.buttons.build.disabled, true);
  let resolve; first.panel.services.prepareVaultImage = () => new Promise(finish => { resolve = finish; });
  const pending = first.panel.prepare(); first.panel.destroy(); resolve(preview()); await pending;
  assert.equal(first.panel.sessions.size, 0); assert.equal(first.panel.removed, true);
});

test('cancellation targets the active session once and does not claim the upload was undone', async () => {
  let finish;
  const { panel, calls } = await fixture({ overrides: { buildVaultImage: () => new Promise(resolve => { finish = resolve; }) } });
  panel.target.value = 'owner/vault:backup'; await panel.prepare(); const building = panel.build();
  await panel.cancel(); await panel.cancel();
  assert.deepEqual(calls.filter(call => call[0] === 'cancel'), [['cancel', 'main']]);
  assert.match(panel.status.textContent, /does not undo data already sent/);
  finish({ ...preview(), phase: 'build-unverified' }); await building;
  assert.equal(panel.buttons.upload.disabled, true); assert.equal(panel.buttons.cancel.hidden, true);
});

test('all panel copy supports English, Hong Kong Cantonese and bilingual labels accessibly', async () => {
  for (const [key, value] of Object.entries(VAULT_IMAGE_COPY)) { assert.ok(value.en, key); assert.ok(value['zh-HK'], key); }
  const { panel } = await fixture(); panel.setLanguage('zh-HK');
  assert.equal(panel.heading.textContent, '加密保險庫映像'); assert.equal(panel.buttons.prepare.textContent, '準備加密快照');
  assert.equal(panel.target.attributes['aria-label'], VAULT_IMAGE_COPY.destination['zh-HK']);
  panel.setLanguage('bilingual'); assert.match(panel.heading.textContent, /Encrypted vault image · 加密保險庫映像/);
  assert.equal(panel.status.attributes.role, 'status'); assert.equal(panel.error.attributes.role, 'alert');
  assert.match(panel.storageOnly.textContent, /Sync pending changes before locking/); assert.match(panel.prerequisites.textContent, /Linux-container mode/);
});

test('preload image operations bind each request to the selected session and expose no credentials', async () => {
  const calls = [], listeners = new Map(); let bridge;
  vm.runInNewContext(await fs.readFile(new URL('../src/main/preload.cjs', import.meta.url), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } }, ipcRenderer: { invoke: async (...args) => { calls.push(args); return { sessionId: 'second' }; }, on: (event, callback) => listeners.set(event, callback), removeListener: () => {} } }) });
  await bridge.selectSession('second');
  for (const [name, argument] of [['prepareVaultImage', 'owner/vault:tag'], ['buildVaultImage', 'preview-1'], ['uploadVaultImage', 'preview-1'], ['discardVaultImage'], ['cancelVaultImage'], ['vaultImageStatus']]) await bridge[name](argument);
  for (const call of calls.slice(1)) assert.equal(call[3], 'second');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), ['vault:request', 'prepareVaultImage', { reference: 'owner/vault:tag' }, 'second']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[3])), ['vault:request', 'uploadVaultImage', { previewId: 'preview-1' }, 'second']);
  bridge.onStatus(() => {}); listeners.get('vault:state')(null, { sessionId: 'third' }); await bridge.cancelVaultImage();
  assert.equal(calls.at(-1)[3], 'third'); assert.deepEqual(Object.keys(calls.at(-1)[2]), []);
});
