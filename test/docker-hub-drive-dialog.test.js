import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; this.textContent = ''; this.dispatched = []; this.className = ''; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { this.dispatched.push(event); this.listeners[event.type]?.(event); return true; }
  remove() { this.removed = true; }
  focus() {}
  showModal() { this.shown = true; }
  close() { this.closed = true; }
}
globalThis.HTMLElement = Node;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { map: new Map(), get(key) { return this.map.get(key); }, define(key, value) { this.map.set(key, value); } };
globalThis.document = { createElement: tag => customElements.get(tag) ? new (customElements.get(tag))() : new Node(tag) };
// The real dialog wraps Material Web, which needs a browser; the flow only needs open and close.
customElements.define('mfe-dialog', class extends Node {});
const { HubDriveDialog, setInfoIconFactory } = await import('../src/renderer/features/docker-hub-drive/dialog.js');
setInfoIconFactory(() => ({ destroy() {}, setLanguage() {} }));

const walk = (node, visit) => { visit(node); for (const child of node.children || []) if (child && typeof child === 'object') walk(child, visit); };
const all = (node, predicate) => { const found = []; walk(node, item => { if (predicate(item)) found.push(item); }); return found; };
const textOf = node => { let out = ''; walk(node, item => { if (item.textContent) out += item.textContent + ' '; if (item.label) out += item.label + ' '; }); return out; };
const settle = async (condition, attempts = 300) => { for (let i = 0; i < attempts && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 2)); await new Promise(resolve => setImmediate(resolve)); };
const DATA_ROOT = path.resolve('C:\\Users\\you\\AppData\\Roaming\\App\\Drives');
const drive = (char, name) => ({ id: char.repeat(64), shortId: char.repeat(8), name, lastBackup: '2026-11-17T10:00:00.000Z', snapshots: 3, bytes: 4096, devices: 1,
  revisions: [{ tag: 'new', digest: 'sha256:' + char.repeat(64), updatedAt: '2026-11-17T10:00:00.000Z', bytes: 4096 }, { tag: 'old', digest: 'sha256:' + '9'.repeat(64), updatedAt: '2026-11-10T10:00:00.000Z', bytes: 2048 }], latest: { tag: 'new', digest: 'sha256:' + char.repeat(64) } });
const catalog = () => ({ phase: 'done', reason: null, account: 'pat', namespaces: [], organizationsUnavailable: false, truncated: false, progress: { total: 1, done: 1 },
  repositories: [{ id: 'pat/material-file-encryptor-storage', namespace: 'pat', name: 'material-file-encryptor-storage', visibility: 'public', lastPushed: '2026-11-17T10:00:00.000Z', size: 4096, scan: 'done', error: null, unreadable: 0, drives: [drive('a', 'Work files')] }] });

function fixture({ overrides = {}, signedIn = true } = {}) {
  const calls = [];
  const api = {
    registryLoginStatus: async () => ({ state: signedIn ? 'signed-in' : 'idle', account: signedIn ? 'pat' : null, deviceCode: null, canOpenPage: false, expiresAt: null, reason: null }),
    recheckRegistryLogin: async () => api.registryLoginStatus(), startRegistryLogin: async () => api.registryLoginStatus(), cancelRegistryLogin: async () => api.registryLoginStatus(), openRegistryLoginPage: async () => api.registryLoginStatus(),
    chooseFolder: async () => { calls.push(['chooseFolder']); return null; }, chooseKeyFile: async () => { calls.push(['chooseKeyFile']); return 'C:\\keys\\vault.key'; },
    hubCatalogStart: async options => { calls.push(['catalogStart', options]); return catalog(); }, hubCatalogStatus: async () => catalog(), hubCatalogCancel: async () => ({}),
    hubDriveFolders: async () => { calls.push(['folders']); return { driveId: 'a1b2c3d4e5f60718', storageDir: path.join(DATA_ROOT, 'a1b2c3d4e5f60718', 'storage'), cacheDir: path.join(DATA_ROOT, 'a1b2c3d4e5f60718', 'cache') }; },
    hubDriveFoldersDiscard: async id => { calls.push(['discard', id]); return {}; },
    create: async options => { calls.push(['create', options]); return {}; },
    hubEnsureRepository: async repository => { calls.push(['ensure', repository]); return {}; },
    configureRegistryStorage: async configuration => { calls.push(['configure', configuration]); return {}; },
    syncRegistryStorage: async () => { calls.push(['sync']); return {}; },
    hubRestoreSnapshot: async selection => { calls.push(['restore', selection]); return { state: 'done', result: { driveId: 'ffffeeeeddddcccc', storageDir: path.join(DATA_ROOT, 'ffffeeeeddddcccc', 'storage'), cacheDir: path.join(DATA_ROOT, 'ffffeeeeddddcccc', 'cache'), vaultId: 'a'.repeat(64), driveName: 'Work files', visibility: 'public' } }; },
    hubRestoreStatus: async () => ({ state: 'downloading', completedFiles: 1, completedBytes: 100 }), hubRestoreCancel: async () => ({}),
    unlock: async options => { calls.push(['unlock', options]); return {}; }, hubShowFolder: async id => { calls.push(['show', id]); return {}; },
    ...overrides
  };
  const dialog = new HubDriveDialog();
  dialog.configure({ api, language: 'en', getVaultState: () => ({ availableDriveLetters: ['M', 'N'] }) });
  return { dialog, api, calls };
}
const buttons = dialog => all(dialog.dialog, node => /button|list-item/.test(node.localName));
const byText = (dialog, text) => buttons(dialog).find(node => textOf(node).trim().startsWith(text) || node.textContent === text);
const byId = (dialog, id) => all(dialog.dialog, node => node.attributes?.id === id)[0];
const type = (node, value) => { node.value = value; node.listeners.input(); };

test('the first choice offers this computer or Docker Hub and Docker Hub asks for no folder', async () => {
  const { dialog, calls } = fixture();
  dialog.open('create');
  const text = textOf(dialog.dialog);
  assert.ok(text.includes('On this computer') && text.includes('Docker Hub') && text.includes('No folder to choose'));
  assert.equal(dialog.stage, 'choose'); assert.equal(dialog.dialog.shown, true);
  byText(dialog, 'Docker Hub').listeners.click();
  await settle(() => dialog.stage === 'repository');
  assert.equal(dialog.stage, 'repository');
  assert.equal(calls.some(call => call[0] === 'chooseFolder'), false);
});

test('this computer hands over to the existing folder flow', async () => {
  const { dialog } = fixture(); dialog.open('create');
  byText(dialog, 'On this computer').listeners.click();
  assert.equal(dialog.dialog.closed, true);
  assert.equal(dialog.dispatched.at(-1).type, 'hub-use-this-computer');
});

test('signed out, the Docker Hub choice shows the guided sign-in instead of the repository list', async () => {
  const { dialog } = fixture({ signedIn: false }); dialog.open('create');
  byText(dialog, 'Docker Hub').listeners.click();
  await settle(() => dialog.stage === 'signin');
  assert.equal(dialog.stage, 'signin'); assert.ok(textOf(dialog.dialog).includes('Docker Hub sign-in'));
});

test('creating a drive: repository, details, then creation steps with no folder dialog and the host folders', async () => {
  const { dialog, calls } = fixture(); dialog.open('create');
  byText(dialog, 'Docker Hub').listeners.click(); await settle(() => dialog.stage === 'repository');
  await settle(() => dialog.picker.snapshot);
  dialog.picker.chooseSuggested(); await settle(() => dialog.stage === 'details');
  assert.equal(dialog.stage, 'details'); assert.ok(textOf(dialog.dialog).includes('This repository is public'));
  assert.ok(textOf(dialog.dialog).includes('The folder is created when you press Create drive'));
  type(byId(dialog, 'hub-drive-name'), 'Work files'); type(byId(dialog, 'hub-password'), 'correct horse battery'); type(byId(dialog, 'hub-confirm-password'), 'correct horse battery');
  byText(dialog, 'Create drive').listeners.click();
  await settle(() => dialog.stage === 'done');
  assert.equal(dialog.stage, 'done');
  assert.equal(calls.some(call => call[0] === 'chooseFolder'), false, 'no folder dialog was ever called');
  const create = calls.find(call => call[0] === 'create')[1];
  assert.equal(create.storageDir, path.join(DATA_ROOT, 'a1b2c3d4e5f60718', 'storage')); assert.equal(create.driveLetter, 'M:'); assert.equal(create.driveName, 'Work files');
  assert.deepEqual(calls.map(call => call[0]).filter(name => ['folders', 'create', 'ensure', 'configure', 'sync'].includes(name)), ['folders', 'create', 'ensure', 'configure', 'sync']);
  const text = textOf(dialog.dialog); assert.ok(text.includes('Work files is ready as M:') && text.includes('Show folder') && text.includes('Only ciphertext leaves this computer'));
  byText(dialog, 'Show folder').listeners.click(); assert.deepEqual(calls.at(-1), ['show', 'a1b2c3d4e5f60718']);
});

test('details are validated in the dialog and nothing is created until they are right', async () => {
  const { dialog, calls } = fixture(); dialog.open('create');
  byText(dialog, 'Docker Hub').listeners.click(); await settle(() => dialog.stage === 'repository'); await settle(() => dialog.picker.snapshot);
  dialog.picker.chooseSuggested(); await settle(() => dialog.stage === 'details');
  type(byId(dialog, 'hub-password'), 'one'); type(byId(dialog, 'hub-confirm-password'), 'two');
  byText(dialog, 'Create drive').listeners.click();
  assert.equal(dialog.stage, 'details'); assert.ok(textOf(dialog.dialog).includes('The passwords do not match'));
  assert.equal(calls.some(call => call[0] === 'create' || call[0] === 'folders'), false);
});

test('a failed first sync keeps the drive, names the reason and retries only that step', async () => {
  let syncs = 0;
  const { dialog, calls } = fixture({ overrides: { syncRegistryStorage: async () => { calls.push(['sync']); if (++syncs === 1) throw Object.assign(Error('down'), { code: 'PROVIDER_UNAVAILABLE' }); return {}; } } });
  dialog.open('create');
  byText(dialog, 'Docker Hub').listeners.click(); await settle(() => dialog.stage === 'repository'); await settle(() => dialog.picker.snapshot);
  dialog.picker.chooseSuggested(); await settle(() => dialog.stage === 'details');
  type(byId(dialog, 'hub-password'), 'pw'); type(byId(dialog, 'hub-confirm-password'), 'pw');
  byText(dialog, 'Create drive').listeners.click(); await settle(() => dialog.stage === 'failed');
  assert.equal(dialog.stage, 'failed');
  const text = textOf(dialog.dialog); assert.ok(text.includes('The drive exists and is mounted as M:') && text.includes('Docker Hub could not be reached'));
  byText(dialog, 'Retry').listeners.click(); await settle(() => dialog.stage === 'done');
  assert.equal(dialog.stage, 'done'); assert.equal(calls.filter(call => call[0] === 'create').length, 1);
});

test('opening: drive cards are the choice, the latest snapshot is preselected and nothing asks for a folder', async () => {
  const { dialog, calls } = fixture(); dialog.open('open');
  await settle(() => dialog.picker.snapshot); assert.equal(dialog.stage, 'repository');
  const card = all(dialog.picker.list, node => node.className === 'card')[0]; card.listeners.click();
  await settle(() => dialog.stage === 'snapshot');
  assert.equal(dialog.stage, 'snapshot');
  assert.equal(dialog.draft.digest, 'sha256:' + 'a'.repeat(64));
  const text = textOf(dialog.dialog); assert.ok(text.includes('Snapshots of Work files (aaaaaaaa)') && text.includes('Latest') && text.includes('Restore into the app') && text.includes('Advanced: choose folder'));
  byText(dialog, 'Restore').listeners.click(); await settle(() => dialog.stage === 'unlock');
  assert.equal(dialog.stage, 'unlock');
  assert.deepEqual(calls.find(call => call[0] === 'restore')[1], { repository: 'pat/material-file-encryptor-storage', digest: 'sha256:' + 'a'.repeat(64), location: 'automatic' });
  type(byId(dialog, 'hub-password'), 'correct horse'); byText(dialog, 'Unlock and mount').listeners.click(); await settle(() => dialog.stage === 'mounted');
  assert.equal(dialog.stage, 'mounted'); assert.equal(calls.some(call => call[0] === 'chooseFolder'), false);
  const unlock = calls.find(call => call[0] === 'unlock')[1]; assert.equal(unlock.storageDir, path.join(DATA_ROOT, 'ffffeeeeddddcccc', 'storage'));
  assert.deepEqual(calls.at(-1)[0] === 'configure' ? calls.at(-1)[1].schedule.enabled : 'x', false, 'the restored drive is linked with its schedule off');
  assert.ok(textOf(dialog.dialog).includes('Mounted as M:'));
});

test('choosing an older snapshot restores that one, and Advanced uses the host folder chooser', async () => {
  const { dialog, calls } = fixture(); dialog.open('open');
  await settle(() => dialog.picker.snapshot);
  all(dialog.picker.list, node => node.className === 'card')[0].listeners.click(); await settle(() => dialog.stage === 'snapshot');
  all(dialog.dialog, node => node.className === 'snap')[1].listeners.click();
  assert.equal(dialog.draft.digest, 'sha256:' + '9'.repeat(64));
  const advanced = all(dialog.dialog, node => node.localName === 'details')[0];
  all(advanced, node => textOf(node).trim() === 'Choose folder…' && node.localName.includes('button'))[0].listeners.click();
  await settle(() => dialog.stage === 'unlock');
  assert.deepEqual(calls.find(call => call[0] === 'restore')[1].location, 'choose');
  assert.equal(calls.some(call => call[0] === 'chooseFolder'), false, 'the renderer never opens a folder dialog itself');
});

test('a failed restore returns to the snapshot step with a plain message', async () => {
  const { dialog } = fixture({ overrides: { hubRestoreSnapshot: async () => ({ state: 'failed', error: { code: 'RESTORE_FAILED' } }) } }); dialog.open('open');
  await settle(() => dialog.picker.snapshot);
  all(dialog.picker.list, node => node.className === 'card')[0].listeners.click(); await settle(() => dialog.stage === 'snapshot');
  byText(dialog, 'Restore').listeners.click(); await settle(() => dialog.restoreError);
  assert.equal(dialog.stage, 'snapshot'); assert.ok(textOf(dialog.dialog).includes('could not be restored'));
});

test('the content goes in the dialog default slot, because a named slot the wrapper lacks renders nothing', () => {
  const { dialog } = fixture(); dialog.open('create');
  assert.equal(all(dialog.dialog, node => node.attributes?.slot === 'content').length, 0);
  assert.ok(dialog.dialog.children.length > 0 && textOf(dialog.dialog).includes('Create a drive'));
});

test('each field sits in a row with its information icon, and the first real control takes focus', () => {
  const { dialog } = fixture(); dialog.open('create');
  dialog.stage = 'details'; dialog.draft.repository = 'pat/x1'; dialog.render();
  const rows = all(dialog.dialog, node => node.className === 'with-info');
  assert.ok(rows.length >= 4, 'name, letter, password and confirm are wrapped');
  let focused = null; dialog.shadowRoot.querySelector = () => ({ focus() { focused = 'first'; } });
  dialog.focusFirst(); assert.equal(focused, 'first');
});

test('every new step starts at the top of the scroll area and the picker step never scrolls to focus', async () => {
  const { dialog } = fixture(); dialog.open('create');
  const scroller = { scrollTop: 500 }; dialog.shadowRoot.querySelector = () => scroller;
  dialog.stage = 'repository'; dialog.render();
  assert.equal(scroller.scrollTop, 0);
  scroller.scrollTop = 300; dialog.render();
  assert.equal(scroller.scrollTop, 300, 'a re-render of the same step keeps the position');
  let searchFocus = 0, controlFocus = 0; dialog.picker.focusSearch = () => { searchFocus++; };
  dialog.shadowRoot.querySelector = () => ({ focus: options => { controlFocus++; assert.equal(options.preventScroll, true); } });
  dialog.focusFirst(); assert.equal(searchFocus, 1); assert.equal(controlFocus, 0);
  dialog.stage = 'details'; dialog.focusFirst(); assert.equal(controlFocus, 1);
});

test('Cantonese and bilingual wording reach the dialog', async () => {
  const { dialog } = fixture(); dialog.open('create');
  dialog.setLanguage('yue'); assert.ok(textOf(dialog.dialog).includes('喺呢部電腦'));
  dialog.setLanguage('bilingual'); assert.ok(textOf(dialog.dialog).includes('On this computer · 喺呢部電腦'));
});
