import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; this.textContent = ''; this.dispatched = []; this.className = ''; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { this.dispatched.push(event); return true; }
  remove() { this.removed = true; }
  focus() { this.focused = true; Node.focused = this; }
}
globalThis.HTMLElement = Node;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { map: new Map(), get(key) { return this.map.get(key); }, define(key, value) { this.map.set(key, value); } };
globalThis.document = { createElement: tag => customElements.get(tag) ? new (customElements.get(tag))() : new Node(tag) };
const { HubRepositoryPicker } = await import('../src/renderer/features/docker-hub-drive/picker.js');

const walk = (node, visit) => { visit(node); for (const child of node.children || []) if (child && typeof child === 'object') walk(child, visit); };
const all = (node, predicate) => { const found = []; walk(node, item => { if (predicate(item)) found.push(item); }); return found; };
const textOf = node => { let out = ''; walk(node, item => { if (item.textContent) out += item.textContent + ' '; }); return out; };
const drive = (char, name = null, extra = {}) => ({ id: char.repeat(64), shortId: char.repeat(8), name, lastBackup: '2026-11-17T10:00:00.000Z', snapshots: 3, bytes: 4096, devices: 1, revisions: [{ tag: 't', digest: 'sha256:' + char.repeat(64), updatedAt: '2026-11-17T10:00:00.000Z', bytes: 4096 }], latest: { tag: 't', digest: 'sha256:' + char.repeat(64) }, ...extra });
const repo = (id, drives = [], extra = {}) => ({ id, namespace: id.split('/')[0], name: id.split('/')[1], visibility: 'public', lastPushed: '2026-11-10T10:00:00.000Z', size: 5 * 1024 * 1024, scan: 'done', error: null, drives, unreadable: 0, tags: { scanned: 0, truncated: false }, ...extra });
const done = (repositories, extra = {}) => ({ phase: 'done', reason: null, account: 'pat', namespaces: [{ name: 'pat', organization: false, error: null }], organizationsUnavailable: false, repositories, progress: { total: repositories.length, done: repositories.length }, truncated: false, ...extra });
const sample = () => [repo('pat/material-file-encryptor-storage', [drive('a', 'Work files'), drive('b')]), repo('pat/notes', [], { visibility: 'private', size: null, lastPushed: null }), repo('acme/shared', [drive('c', 'Photos')]), repo('pat/broken', [], { scan: 'error', error: { code: 'PROVIDER_UNAVAILABLE' } })];

const pickers = new Set(); test.afterEach(() => { for (const picker of pickers) picker.destroy(); pickers.clear(); });
async function fixture({ snapshot = done(sample()), mode = 'open', services = {}, language = 'en' } = {}) {
  const calls = [];
  const picker = new HubRepositoryPicker(); pickers.add(picker);
  picker.configure({ mode, account: 'pat', language, services: { hubCatalogStart: async options => { calls.push(['start', options]); return snapshot; }, hubCatalogStatus: async () => snapshot, hubCatalogCancel: async () => { calls.push(['cancel']); }, ...services } });
  await picker.load(false);
  await new Promise(resolve => setImmediate(resolve));
  return { picker, calls };
}
const names = picker => all(picker.list, node => node.className === 'name').map(node => node.textContent);
const chip = (picker, label) => all(picker.chipsGroup, node => node.className === 'chip' && node.label.startsWith(label))[0];
const search = (picker, query, regex = false) => { picker.search.listeners['search-change']({ detail: { query, regex, flags: 'iu' } }); return new Promise(resolve => setImmediate(resolve)); };

test('each repository row shows visibility, last pushed, size and how many drives were found', async () => {
  const { picker } = await fixture();
  assert.deepEqual(names(picker), ['pat/material-file-encryptor-storage', 'pat/notes', 'acme/shared', 'pat/broken']);
  const text = textOf(picker.list);
  for (const expected of ['Public', 'Private', '2 drives found', '1 drive found', 'No drives', '5.0 MiB', 'Size unknown', 'Never pushed', 'Last pushed 20']) assert.ok(text.includes(expected), expected);
});

test('detected drives are shown as cards under their repository with name, id, last backup, snapshots and size', async () => {
  const { picker } = await fixture();
  const cards = all(picker.list, node => node.className === 'card');
  assert.equal(cards.length, 3);
  const first = textOf(cards[0]);
  assert.ok(first.includes('Work files') && first.includes('Drive aaaaaaaa') && first.includes('3 snapshots') && first.includes('4.0 KiB') && first.includes('Open latest snapshot'), first);
  assert.ok(textOf(cards[1]).includes('Unnamed drive'));
});

test('in open mode a drive card is the choice and carries the drive and its repository', async () => {
  const { picker } = await fixture();
  const card = all(picker.list, node => node.className === 'card')[0];
  card.listeners.click();
  const event = picker.dispatched.at(-1);
  assert.equal(event.type, 'hub-repository-choose');
  assert.equal(event.detail.repository, 'pat/material-file-encryptor-storage');
  assert.equal(event.detail.drive.name, 'Work files');
  assert.equal(event.detail.drive.latest.digest, 'sha256:' + 'a'.repeat(64));
  assert.equal(card.attributes['aria-pressed'] === 'true' || all(picker.list, node => node.className === 'card')[0].attributes['aria-pressed'] === 'true', true);
});

test('filter chips narrow the list and show counts', async () => {
  const { picker } = await fixture();
  assert.ok(chip(picker, 'All').label.includes('(4)')); assert.ok(chip(picker, 'Has drives').label.includes('(2)')); assert.ok(chip(picker, 'Private').label.includes('(1)'));
  chip(picker, 'Has drives').listeners.click(); assert.deepEqual(names(picker), ['pat/material-file-encryptor-storage', 'acme/shared']);
  chip(picker, 'Empty').listeners.click(); assert.deepEqual(names(picker), ['pat/notes', 'pat/broken']);
  chip(picker, 'Private').listeners.click(); assert.deepEqual(names(picker), ['pat/notes']);
  chip(picker, 'Public').listeners.click(); assert.deepEqual(names(picker), ['pat/material-file-encryptor-storage', 'acme/shared', 'pat/broken']);
  assert.equal(chip(picker, 'Public').selected, true);
  chip(picker, 'All').listeners.click(); assert.equal(names(picker).length, 4);
});

test('search matches repository names and drive names, and combines with a chip', async () => {
  const { picker } = await fixture();
  await search(picker, 'photos'); assert.deepEqual(names(picker), ['acme/shared']);
  await search(picker, 'work files'); assert.deepEqual(names(picker), ['pat/material-file-encryptor-storage']);
  await search(picker, 'pat/'); chip(picker, 'Empty').listeners.click(); assert.deepEqual(names(picker), ['pat/notes', 'pat/broken']);
  await search(picker, ''); chip(picker, 'All').listeners.click(); assert.equal(names(picker).length, 4);
  await search(picker, 'zzzz'); assert.deepEqual(names(picker), []); assert.ok(picker.empty.textContent.includes('No repository matches'));
});

test('the regex builder setting filters with a pattern and an invalid pattern matches nothing', async () => {
  const { picker } = await fixture();
  await search(picker, '^pat/(notes|broken)$', true); assert.deepEqual(names(picker), ['pat/notes', 'pat/broken']);
  await search(picker, '\\bPHOTOS\\b', true); assert.deepEqual(names(picker), ['acme/shared']);
  await search(picker, '(unclosed', true); assert.deepEqual(names(picker), []);
});

test('the shared search control does the filtering when it provides filter()', async () => {
  const { picker } = await fixture();
  picker.search.filter = async rows => rows.filter(row => row.id === 'pat/notes');
  await search(picker, 'anything'); assert.deepEqual(names(picker), ['pat/notes']);
});

test('arrow keys, Home and End move through repository names and drive cards', async () => {
  const { picker } = await fixture();
  const stops = picker.focusStops(); assert.ok(stops.length >= 7);
  picker.list.listeners.keydown({ key: 'ArrowDown', target: stops[0], preventDefault() {} }); assert.equal(Node.focused, stops[1]);
  picker.list.listeners.keydown({ key: 'End', target: stops[1], preventDefault() {} }); assert.equal(Node.focused, stops.at(-1));
  picker.list.listeners.keydown({ key: 'ArrowUp', target: stops.at(-1), preventDefault() {} }); assert.equal(Node.focused, stops.at(-2));
  picker.list.listeners.keydown({ key: 'Home', target: stops.at(-2), preventDefault() {} }); assert.equal(Node.focused, stops[0]);
  picker.list.listeners.keydown({ key: 'ArrowUp', target: stops[0], preventDefault() {} }); assert.equal(Node.focused, stops[0], 'stops at the first entry');
});

test('a failing repository shows its own reason and the rest of the list stays usable', async () => {
  const { picker } = await fixture();
  const broken = all(picker.list, node => node.localName === 'li' && node.attributes['data-key'] === 'pat/broken')[0];
  assert.ok(textOf(broken).includes('Docker Hub could not be reached for this repository'));
  assert.equal(broken.attributes['data-error'], 'true');
  assert.equal(names(picker).length, 4);
});

test('create mode proposes the account repository first and says when it already holds drives', async () => {
  const { picker } = await fixture({ mode: 'create' });
  assert.equal(names(picker)[0], 'pat/material-file-encryptor-storage');
  const first = all(picker.list, node => node.localName === 'li')[0];
  assert.ok(textOf(first).includes('Already holds 2 drives'));
  first.children[0].children[0].listeners.click();
  assert.equal(picker.dispatched.at(-1).detail.repository, 'pat/material-file-encryptor-storage');
  const fresh = await fixture({ mode: 'create', snapshot: done([repo('pat/other')]) });
  assert.ok(textOf(all(fresh.picker.list, node => node.localName === 'li')[0]).includes('new public repository'));
});

test('signed out and offline states are truthful, offer sign-in, and never show a list', async () => {
  const signedOut = await fixture({ snapshot: { phase: 'failed', reason: 'SIGN_IN_REQUIRED', account: null, repositories: [], namespaces: [], progress: { total: 0, done: 0 } }, mode: 'open' });
  assert.equal(signedOut.picker.problem.hidden, false); assert.ok(signedOut.picker.problemText.textContent.includes('signed out of Docker Hub'));
  assert.equal(signedOut.picker.signInButton.hidden, false);
  signedOut.picker.signInButton.listeners.click(); assert.equal(signedOut.picker.dispatched.at(-1).type, 'hub-sign-in-needed');
  assert.equal(names(signedOut.picker).length, 0);
  const offline = await fixture({ snapshot: { phase: 'failed', reason: 'PROVIDER_UNAVAILABLE', account: null, repositories: [], namespaces: [], progress: { total: 0, done: 0 } }, mode: 'open' });
  assert.ok(offline.picker.problemText.textContent.includes('could not be reached')); assert.equal(offline.picker.signInButton.hidden, true);
});

test('progress and partial results are shown while the scan runs, and Refresh forces a new scan', async () => {
  let status = { ...done([repo('pat/a', [drive('a')]), repo('pat/b')]), phase: 'scanning', progress: { total: 2, done: 1 } };
  const { picker, calls } = await fixture({ snapshot: status, services: { hubCatalogStatus: async () => status } });
  assert.ok(picker.status.textContent.includes('1 of 2 repositories scanned'));
  assert.equal(picker.progress.hidden, false); assert.equal(picker.refreshButton.disabled, true);
  assert.equal(names(picker).length, 2, 'partial results are already listed');
  status = done(status.repositories); picker.snapshot = status; picker.render();
  assert.equal(picker.progress.hidden, true); assert.ok(picker.status.textContent.includes('Scan finished: 2 repositories, 1 drives found'));
  picker.refreshButton.listeners.click(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.at(-1), ['start', { force: true }]);
});

test('notes explain truncated scans and unavailable organizations, and Cantonese and bilingual copy render', async () => {
  const { picker } = await fixture({ snapshot: done(sample(), { truncated: true, organizationsUnavailable: true }) });
  const text = textOf(picker.notes); assert.ok(text.includes('scan limits')); assert.ok(text.includes('Organization repositories could not be listed'));
  picker.setLanguage('yue'); assert.ok(textOf(picker.list).includes('搵到')); assert.ok(chip(picker, '有磁碟'));
  picker.setLanguage('bilingual'); assert.ok(chip(picker, 'Has drives · 有磁碟'));
  assert.ok(picker.search.attributes.label.includes('Search repositories') && picker.search.attributes.label.includes('搜尋'));
});

test('without host support the picker says so instead of inventing repositories', async () => {
  const picker = new HubRepositoryPicker(); pickers.add(picker);
  picker.configure({ services: {}, mode: 'open' }); await picker.load();
  assert.equal(picker.refreshButton.disabled, true); assert.deepEqual(names(picker), []);
});
