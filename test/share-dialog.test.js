import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.selected = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; this.textContent = ''; this.className = ''; this.open = false; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); return true; }
  remove() { this.removed = true; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.({ type: 'close' }); }
}
globalThis.HTMLElement = Node;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { map: new Map(), get(key) { return this.map.get(key); }, define(key, value) { this.map.set(key, value); } };
globalThis.document = { createElement: tag => customElements.get(tag) ? new (customElements.get(tag))() : new Node(tag) };
customElements.define('mfe-dialog', class extends Node {});
const { ShareDialog, setInfoIconFactory } = await import('../src/renderer/features/share/dialog.js');
const { shareErrorKey, passphraseProblems } = await import('../src/renderer/features/share/model.js');
const { SHARE_COPY } = await import('../src/renderer/features/share/copy.js');
const { SHARE_INFO_ICON_INVENTORY } = await import('../src/shared/local-ux/info-icon-share.js');
setInfoIconFactory(() => ({ destroy() {}, setLanguage() {} }));

const walk = (node, visit) => { visit(node); for (const child of node.children || []) if (child && typeof child === 'object') walk(child, visit); };
const all = (node, predicate) => { const found = []; walk(node, item => { if (predicate(item)) found.push(item); }); return found; };
const textOf = node => { let out = ''; walk(node, item => { if (item.textContent) out += item.textContent + ' '; if (item.label) out += item.label + ' '; }); return out; };
const button = (dialog, text) => all(dialog.dialog, node => /button$/.test(node.localName) && node.textContent === text)[0];
const byId = (dialog, id) => all(dialog.dialog, node => node.id === id || node.attributes.id === id)[0];
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const COMMAND = 'mfe-share:v1:registry-1.docker.io/pat/material-file-encryptor-shares@sha256:' + 'a'.repeat(64) + '#' + 'k'.repeat(43);

function fixture(overrides = {}, vault = { locked: false, mounted: true }) {
  const calls = [], copied = [];
  const api = {
    registryLoginStatus: async () => ({ state: 'signed-in', account: 'Pat', deviceCode: null, canOpenPage: false, expiresAt: null, reason: null }),
    recheckRegistryLogin: async () => api.registryLoginStatus(), startRegistryLogin: async () => api.registryLoginStatus(), cancelRegistryLogin: async () => api.registryLoginStatus(), openRegistryLoginPage: async () => api.registryLoginStatus(),
    shareCreate: async (id, passphrase) => { calls.push(['create', id, passphrase]); return { command: COMMAND, link: 'material-file-encryptor://receive/v1/x', commandLine: '"x.exe" --receive "y"', entry: { name: 'a.txt', passphrase: Boolean(passphrase) }, persistent: true, listSaved: true }; },
    shareStatus: async () => ({ state: 'uploading' }), shareCancel: async () => ({}),
    shareReceive: async request => { calls.push(['receive', request]); return { receiveId: '0123abcd-0123-4abc-8def-0123456789ab', name: 'a.txt', size: 10, modified: null }; },
    shareReceiveSave: async (id, destination) => { calls.push(['save', id, destination]); return { saved: true, name: 'a.txt', size: 10 }; },
    shareReceiveDiscard: async id => { calls.push(['discard', id]); return {}; },
    shareList: async () => ({ entries: [{ id: '1', name: 'a.txt', size: 10, createdAt: '2026-11-17T00:00:00.000Z', state: 'active', passphrase: false }, { id: '2', name: 'b.txt', size: 1, createdAt: '2026-11-16T00:00:00.000Z', state: 'revoked', passphrase: true }], persistent: true }),
    shareCommand: async id => { calls.push(['command', id]); return { command: COMMAND }; },
    shareRevoke: async id => { calls.push(['revoke', id]); return { revoked: true }; },
    shareRevokeAll: async () => { calls.push(['revokeAll']); return { results: [{ id: '1', revoked: true }] }; },
    shareForget: async id => { calls.push(['forget', id]); return {}; },
    ...overrides
  };
  const dialog = new ShareDialog();
  dialog.configure({ api, language: 'en', getVaultState: () => vault, clipboard: () => ({ writeText: async value => { copied.push(value); } }), confirm: async () => true });
  return { dialog, api, calls, copied };
}

test('every share copy entry has English and Cantonese text, and every information icon id is built by the dialog', () => {
  for (const [key, pair] of Object.entries(SHARE_COPY)) assert.ok(Array.isArray(pair) && pair.length === 2 && pair[0] && pair[1], key);
  const source = String(ShareDialog);
  for (const row of SHARE_INFO_ICON_INVENTORY.descriptors) assert.ok(source.includes(`'${row.selector.slice(1)}'`), row.selector);
});

test('sharing a file shows the command with the private-sending warning and copies each form', async () => {
  const h = fixture();
  h.dialog.openShare({ id: 'e1', path: 'docs\\a.txt', size: 10 }); await settle(); h.dialog.render();
  button(h.dialog, 'Share').listeners.click(); await settle(); await settle();
  assert.deepEqual(h.calls[0], ['create', 'e1', null]);
  assert.ok(textOf(h.dialog.dialog).includes('Anyone with this command can open the file. Send it privately.'));
  assert.equal(byId(h.dialog, 'share-command').textContent, COMMAND);
  for (const label of ['Copy command', 'Copy link', 'Copy command line']) { button(h.dialog, label).listeners.click(); await settle(); }
  assert.deepEqual(h.copied, [COMMAND, 'material-file-encryptor://receive/v1/x', '"x.exe" --receive "y"']);
  h.dialog.dialog.close();
  assert.equal(h.dialog.result, null, 'the command is forgotten when the dialog closes');
});

test('the passphrase must be long enough and confirmed before sharing', async () => {
  assert.deepEqual(passphraseProblems({ enabled: true, passphrase: 'short', confirm: 'short' }), ['passphraseShort']);
  assert.deepEqual(passphraseProblems({ enabled: true, passphrase: 'long enough', confirm: 'different!' }), ['passphraseMismatch']);
  const h = fixture();
  h.dialog.openShare({ id: 'e1', path: 'a.txt', size: 10 }); await settle(); h.dialog.render();
  const toggle = byId(h.dialog, 'share-passphrase-switch'); toggle.selected = true; toggle.listeners.change();
  h.dialog.draft.passphrase = 'long enough'; h.dialog.draft.confirm = 'nope';
  button(h.dialog, 'Share').listeners.click(); await settle();
  assert.equal(h.calls.length, 0);
  assert.ok(textOf(h.dialog.dialog).includes('The two passphrases do not match.'));
  h.dialog.draft.confirm = 'long enough'; button(h.dialog, 'Share').listeners.click(); await settle(); await settle();
  assert.deepEqual(h.calls[0], ['create', 'e1', 'long enough']);
  assert.equal(h.dialog.draft.passphrase, '', 'the passphrase is cleared after use');
});

test('a locked drive cannot share and says why', async () => {
  const h = fixture({}, { locked: true, mounted: false });
  h.dialog.openShare({ id: 'e1', path: 'a.txt', size: 10 }); await settle(); h.dialog.render();
  assert.equal(button(h.dialog, 'Share').disabled, true);
  assert.ok(textOf(h.dialog.dialog).includes('Unlock and mount the drive to share a file.'));
});

test('receiving asks for the passphrase when needed, then saves the verified file', async () => {
  let asked = 0;
  const h = fixture({ shareReceive: async request => { h.calls.push(['receive', request]); if (!request.passphrase && asked++ === 0) return { needsPassphrase: true }; return { receiveId: '0123abcd-0123-4abc-8def-0123456789ab', name: 'a.txt', size: 10, modified: null }; } });
  h.dialog.openReceive();
  h.dialog.draft.command = '  ' + COMMAND + ' ';
  button(h.dialog, 'Download').listeners.click(); await settle();
  assert.equal(h.dialog.stage, 'passphrase');
  h.dialog.draft.receivePassphrase = 'long enough'; button(h.dialog, 'Open').listeners.click(); await settle();
  assert.deepEqual(h.calls[1], ['receive', { command: COMMAND, passphrase: 'long enough' }]);
  assert.equal(h.dialog.stage, 'ready');
  button(h.dialog, 'Save into the drive').listeners.click(); await settle();
  assert.deepEqual(h.calls.at(-1), ['save', '0123abcd-0123-4abc-8def-0123456789ab', 'drive']);
  assert.ok(textOf(h.dialog.dialog).includes('Saved a.txt'));
});

test('a receive error shows fixed wording and never the pasted command', async () => {
  const h = fixture({ shareReceive: async () => { throw Error("Error invoking remote method 'vault:request': Error: The shared file failed its integrity check. It was changed or damaged after it was shared."); } });
  h.dialog.openReceive(); h.dialog.draft.command = COMMAND;
  button(h.dialog, 'Download').listeners.click(); await settle();
  const text = textOf(h.dialog.dialog);
  assert.ok(text.includes(SHARE_COPY.error_TAMPERED[0]));
  assert.equal(text.includes('k'.repeat(43)), false);
  assert.equal(shareErrorKey(Error('something odd ' + COMMAND)), 'error_OTHER');
});

test('a link from outside the app is received by id, without any pasted text', async () => {
  const h = fixture();
  h.dialog.openReceive({ incomingId: 'abcdefab-0123-4abc-8def-0123456789ab' });
  assert.ok(textOf(h.dialog.dialog).includes('A share link was opened. Download it?'));
  button(h.dialog, 'Download').listeners.click(); await settle();
  assert.deepEqual(h.calls[0], ['receive', { incomingId: 'abcdefab-0123-4abc-8def-0123456789ab', passphrase: null }]);
});

test('the shared files list copies, revokes, revokes all and forgets', async () => {
  const h = fixture();
  h.dialog.openList(); await settle();
  const text = textOf(h.dialog.dialog);
  assert.ok(text.includes('a.txt') && text.includes('Revoked') && text.includes('Copies that were already downloaded cannot be recalled.'));
  button(h.dialog, 'Copy command').listeners.click(); await settle();
  assert.deepEqual(h.copied, [COMMAND]);
  button(h.dialog, 'Revoke').listeners.click(); await settle(); await settle();
  button(h.dialog, 'Revoke all').listeners.click(); await settle(); await settle();
  button(h.dialog, 'Remove from list').listeners.click(); await settle();
  assert.deepEqual(h.calls.map(call => call[0]), ['command', 'revoke', 'revokeAll', 'forget']);
});
