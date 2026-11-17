import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SPLIT_COPY } from '../src/renderer/features/split-storage/copy.js';
import { normalizeSplitStatus, sharePercents, copiesWarning, draftProblem, buildConfig, draftFromStatus, formatBytes, formatTime, jobPercent } from '../src/renderer/features/split-storage/model.js';

class Node {
  constructor(tag) { this.localName = tag; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; this.textContent = ''; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
}
globalThis.HTMLElement = Node;
globalThis.CSSStyleSheet = class { replaceSync() {} };
globalThis.customElements = { map: new Map(), get(key) { return this.map.get(key); }, define(key, value) { this.map.set(key, value); } };
globalThis.document = { createElement: tag => customElements.get(tag) ? new (customElements.get(tag))() : new Node(tag) };
const { SplitStoragePanel } = await import('../src/renderer/features/split-storage/panel.js');
const settle = async (condition, attempts = 200) => { for (let i = 0; i < attempts && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 2)); };
const panels = new Set(); test.afterEach(() => { for (const panel of panels) panel.destroy(); panels.clear(); });
const GiB = 1073741824;

const baseStatus = (extra = {}) => ({
  supported: true, enabled: true, copies: 1,
  locations: [
    { id: 'main', kind: 'folder', label: 'Main', path: 'C:\\Storage', weight: 2, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: 40 * GiB, storedBytes: 10 * GiB, storedParts: 20 },
    { id: 'usb', kind: 'folder', label: 'USB backup (E:)', path: 'E:\\Split', weight: 1, capacityBytes: 8 * GiB, enabled: true, connected: true, removable: true, freeBytes: 7 * GiB, storedBytes: 5 * GiB, storedParts: 10 },
    { id: 'hub', kind: 'registry', label: 'Hub', repository: 'me/vault', weight: 1, capacityBytes: 0, enabled: true, connected: true, removable: false, freeBytes: null, storedBytes: 5 * GiB, storedParts: 10 }
  ],
  rules: [], totals: { parts: 40, bytes: 20 * GiB }, plan: { pending: false, movesPending: 0, bytesToMove: 0, unavailableFiles: [], unavailableCount: 0 }, job: null, ...extra
});
const mirrorRow = (extra = {}) => ({ id: 'm1', role: 'mirror', kind: 'folder', label: 'Mirror disk', path: 'D:\\Mirror', weight: 1, enabled: true, connected: true, freeBytes: 30 * GiB, lastUpdated: '2026-11-16T10:30:00.000Z', upToDate: true, behindParts: 0, behindBytes: 0, ...extra });

async function fixture({ status = baseStatus(), services = {}, language = 'en', locked = false, noBackend = false } = {}) {
  const calls = [];
  const backend = noBackend ? {} : {
    splitStorageStatus: async () => status,
    chooseSplitFolder: async () => null,
    saveSplitStorage: async config => { calls.push(['save', config]); return { ...status, safetyBackup: config.safetyBackup, locations: config.locations.map(row => ({ ...row, connected: true })) }; },
    previewSplitStorage: async config => { calls.push(['preview', config]); return { ...status, plan: { pending: true, movesPending: 3, bytesToMove: 2 * GiB, unavailableFiles: ['a.txt'], unavailableCount: 1 } }; },
    applySplitStorage: async () => { calls.push(['apply']); return { started: true }; },
    cancelSplitStorage: async () => { calls.push(['cancel']); },
    disableSplitStorage: async () => { calls.push(['bringBack']); },
    verifySplitStorage: async () => { calls.push(['verify']); return {}; },
    updateMirrors: async () => { calls.push(['updateMirrors']); },
    verifyMirror: async id => { calls.push(['verifyMirror', id]); },
    openExistingDrive: () => calls.push(['openDrive'])
  };
  const panel = new SplitStoragePanel(); panels.add(panel); panel.pollMs = 5;
  panel.configure({ services: { ...backend, ...services }, language, getVaultState: () => ({ locked }) });
  await settle(() => panel.status || panel.failed || noBackend || locked); await new Promise(resolve => setImmediate(resolve));
  return { panel, calls };
}
const click = node => node.listeners.click();
const walk = (node, visit) => { visit(node); for (const child of node.children || []) if (child && typeof child === 'object') walk(child, visit); };

test('without the host methods the page says Split storage is not available in this build and shows no data', async () => {
  const { panel } = await fixture({ noBackend: true });
  assert.equal(panel.unavailableText.textContent, SPLIT_COPY.unavailable[0]);
  assert.equal(panel.body.hidden, true);
  assert.equal(panel.status, null);
});

test('a locked drive asks to unlock first and never reads the status', async () => {
  const { panel } = await fixture({ locked: true });
  assert.equal(panel.unavailableText.textContent, SPLIT_COPY.unlockFirst[0]);
  assert.equal(panel.body.hidden, true);
});

test('every location shows its share as weight divided by the sum, and the bar has one segment per used location', async () => {
  const { panel } = await fixture();
  assert.equal(panel.rows.get('main').percent.textContent, 'Share 50%');
  assert.equal(panel.rows.get('usb').percent.textContent, 'Share 25%');
  assert.equal(panel.rows.get('hub').percent.textContent, 'Share 25%');
  assert.equal(panel.bar.children.length, 3);
  assert.match(panel.bar.getAttribute('aria-label'), /Main storage folder 50%/);
  const usb = panel.rows.get('usb');
  assert.match(usb.meta.textContent, /7\.0 GiB free · 10 parts, 5\.0 GiB stored/);
  assert.equal(usb.removable.hidden, false);
  usb.weight.value = '3'; usb.weight.listeners.input();
  assert.equal(usb.percent.textContent, 'Share 50%', 'editing a weight updates the shares at once');
  assert.equal(panel.rows.get('main').percent.textContent, 'Share 33.3%');
});

test('the copies warning appears for one copy across several locations and goes away with two copies', async () => {
  const { panel } = await fixture();
  assert.equal(panel.copiesWarningNode.hidden, false);
  assert.match(panel.copiesWarningNode.textContent, /every location is needed/);
  panel.copiesInput.value = '2'; panel.copiesInput.listeners.input();
  assert.equal(panel.copiesWarningNode.hidden, true);
});

test('the plan preview lists files that would become unavailable and the bytes to move', async () => {
  const status = baseStatus({ plan: { pending: true, movesPending: 12, bytesToMove: 3 * GiB, unavailableFiles: ['Projects/a.mp4', 'b.iso'], unavailableCount: 5 } });
  const { panel } = await fixture({ status });
  assert.equal(panel.planText.textContent, '12 parts, 3.0 GiB to move');
  assert.match(panel.planUnavailable.textContent, /5 files would be unavailable/);
  assert.equal(panel.planFiles.children.length, 3, 'two paths and the "and 3 more" line');
  assert.equal(panel.planFiles.children[2].textContent, 'and 3 more');
  click(panel.buttons.preview); await settle(() => panel.previewPlan);
  assert.equal(panel.planText.textContent, '3 parts, 2.0 GiB to move');
});

test('job progress shows the copying, verifying and releasing phases and marks the current one', async () => {
  const job = { phase: 'verifying', completedParts: 5, totalParts: 20, completedBytes: GiB, totalBytes: 4 * GiB, currentLocation: 'USB backup (E:)' };
  const { panel } = await fixture({ status: baseStatus({ job }) });
  const items = panel.phaseList.children;
  assert.deepEqual(items.map(item => item.textContent), ['Copying parts', 'Verifying copies', 'Releasing space on the main disk']);
  assert.equal(items[1].getAttribute('aria-current'), 'step');
  assert.equal(items[0].getAttribute('aria-current'), null);
  assert.equal(panel.progress.value, 0.25);
  assert.match(panel.jobText.textContent, /5 of 20 parts/);
  assert.equal(panel.buttons.cancel.hidden, false);
  assert.equal(jobPercent(job), 25);
});

test('Safety backup is on by default, also for a configuration that has no such field', async () => {
  const { panel, calls } = await fixture();
  assert.equal(panel.safetySwitch.selected, true);
  assert.equal(panel.status.safetyBackup, true);
  assert.equal(panel.safetyLabel.textContent, 'Safety backup: keep everything on the main disk until the split finishes');
  assert.equal(panel.safetySwitch.getAttribute('aria-label'), panel.safetyLabel.textContent);
  click(panel.buttons.save); await settle(() => calls.length);
  assert.equal(calls[0][1].safetyBackup, true, 'saved configurations send safetyBackup');
  click(panel.buttons.preview); await settle(() => calls.length > 1);
  assert.equal(calls[1][1].safetyBackup, true, 'previewed configurations send safetyBackup');
});

test('turning Safety backup off asks for confirmation, and a refusal keeps it on', async () => {
  const asked = [];
  const { panel, calls } = await fixture({ services: { confirmDestructive: async (id, affected) => { asked.push([id, affected]); return false; } } });
  panel.safetySwitch.selected = false; await panel.safetySwitch.listeners.change();
  await settle(() => asked.length);
  assert.equal(asked[0][0], 'desktop.split-storage-safety-off');
  assert.match(asked[0][1], /no longer holds a full copy/);
  assert.equal(panel.safetySwitch.selected, true);
  assert.equal(panel.draft.safetyBackup, true);
  assert.equal(panel.messageNode.textContent, 'Safety backup stays on.');
  assert.equal(calls.length, 0);
});

test('a confirmed Safety backup change to off is sent on save, and turning it back on needs no confirmation', async () => {
  let confirms = 0;
  const { panel, calls } = await fixture({ services: { confirmDestructive: async () => { confirms++; return true; } } });
  panel.safetySwitch.selected = false; await panel.safetySwitch.listeners.change(); await settle(() => panel.draft.safetyBackup === false);
  assert.equal(panel.draft.safetyBackup, false); assert.equal(confirms, 1);
  click(panel.buttons.save); await settle(() => calls.length && !panel.pending && !panel.dirty);
  assert.equal(calls[0][1].safetyBackup, false);
  panel.safetySwitch.selected = true; await panel.safetySwitch.listeners.change();
  assert.equal(panel.draft.safetyBackup, true); assert.equal(confirms, 1);
});

test('without a confirmation route Safety backup cannot be turned off', async () => {
  const { panel } = await fixture();
  panel.safetySwitch.selected = false; await panel.safetySwitch.listeners.change(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.draft.safetyBackup, true); assert.equal(panel.safetySwitch.selected, true);
});

test('a held job says the split is not finished and files are still on the main disk, shows the reason and retries', async () => {
  const status = baseStatus({ safetyHeld: true, safetyHeldReason: 'USB backup (E:) was disconnected.', job: { phase: 'copying', completedParts: 4, totalParts: 10, completedBytes: GiB, totalBytes: 3 * GiB, currentLocation: '', safetyHeld: true } });
  const { panel, calls } = await fixture({ status });
  assert.equal(panel.heldBox.hidden, false);
  assert.equal(panel.heldTitle.textContent, 'Split not finished, your files are still all on the main disk.');
  assert.equal(panel.heldReason.textContent, 'Reason: USB backup (E:) was disconnected.');
  assert.equal(panel.retryButton.disabled, false);
  click(panel.retryButton); await settle(() => calls.length);
  assert.deepEqual(calls[0], ['apply']);
  const normal = await fixture();
  assert.equal(normal.panel.heldBox.hidden, true);
});

test('mirrors are listed apart from the shares, never counted in the split, and shown even when splitting is off', async () => {
  const status = baseStatus({ enabled: false, locations: [...baseStatus().locations, mirrorRow()] });
  const { panel } = await fixture({ status });
  assert.equal(panel.mirrorList.children.length, 1);
  assert.equal(panel.locationList.children.length, 3);
  assert.equal(panel.mirrorEmpty.hidden, true);
  assert.equal(panel.rows.get('m1').percent, null, 'a mirror has no share');
  assert.equal(panel.bar.children.length, 3);
  assert.equal(panel.addMirrorFolderButton.disabled, false);
  assert.equal(panel.updateMirrorsButton.disabled, false);
  assert.equal(panel.openMirrorButton.hidden, false);
  assert.match(panel.mirrorRestore.textContent, /opened as a drive on its own/);
  const none = await fixture({ status: baseStatus({ enabled: false }) });
  assert.equal(none.panel.mirrorEmpty.hidden, false);
  assert.equal(none.panel.updateMirrorsButton.disabled, true);
});

test('a mirror on the same disk shows the exact same-disk note and others do not', async () => {
  const status = baseStatus({ locations: [...baseStatus().locations, mirrorRow({ sameDisk: true }), mirrorRow({ id: 'm2', label: 'Other', sameDisk: false })] });
  const { panel } = await fixture({ status });
  assert.equal(panel.rows.get('m1').sameDisk.hidden, false);
  assert.equal(panel.rows.get('m1').sameDisk.textContent, 'This is on the same disk as your main storage, so it protects against mistakes but not against that disk failing.');
  assert.equal(panel.rows.get('m2').sameDisk.hidden, true);
});

test('an out of date mirror says since when and how far behind it is, and an up to date mirror says so', async () => {
  const stale = mirrorRow({ id: 'm3', upToDate: false, behindParts: 7, behindBytes: 3 * GiB, connected: false });
  const status = baseStatus({ locations: [...baseStatus().locations, mirrorRow(), stale] });
  const { panel } = await fixture({ status });
  const when = formatTime('2026-11-16T10:30:00.000Z');
  assert.match(panel.rows.get('m1').mirrorState.textContent, /^Up to date/);
  assert.equal(panel.rows.get('m1').mirrorState.dataset.upToDate, 'true');
  assert.equal(panel.rows.get('m3').mirrorState.textContent.startsWith(`Out of date since ${when} · 7 parts, 3.0 GiB behind`), true);
  assert.equal(panel.rows.get('m3').mirrorState.dataset.upToDate, 'false');
  assert.equal(panel.rows.get('m3').state.textContent, 'Not connected');
});

test('mirror actions call the host: update now saves pending edits first, verify names the mirror', async () => {
  const status = baseStatus({ locations: [...baseStatus().locations, mirrorRow()] });
  const { panel, calls } = await fixture({ status });
  click(panel.updateMirrorsButton); await settle(() => calls.length);
  assert.deepEqual(calls[0], ['updateMirrors']);
  await settle(() => !panel.pending);
  click(panel.rows.get('m1').verify); await settle(() => calls.length > 1 && !panel.pending);
  assert.deepEqual(calls[1], ['verifyMirror', 'm1']);
  click(panel.openMirrorButton); await settle(() => !panel.pending);
  assert.deepEqual(calls.at(-1), ['openDrive']);
  click(panel.addMirrorFolderButton);
  assert.equal(panel.draft.locations.filter(row => row.role === 'mirror').length, 2);
  click(panel.updateMirrorsButton); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.some(row => row[0] === 'save' || row[0] === 'updateMirrors') && calls.filter(row => row[0] === 'updateMirrors').length, 1, 'an incomplete mirror blocks the save and the update');
  assert.equal(panel.error, 'problemPath');
  panel.draft.locations.at(-1).path = 'D:\Second'; panel.updateMirrorsButton.disabled = false;
  click(panel.updateMirrorsButton); await settle(() => calls.some(row => row[0] === 'save'));
  const saved = calls.find(row => row[0] === 'save');
  assert.ok(saved, 'a draft with a new mirror is saved before updating');
});

test('mirrors are sent with role mirror and no weight or rule effect', () => {
  const draft = draftFromStatus(normalizeSplitStatus(baseStatus({ locations: [...baseStatus().locations, mirrorRow()] })));
  const config = buildConfig(draft);
  assert.equal(config.locations.find(row => row.id === 'm1').role, 'mirror');
  assert.equal(config.locations.find(row => row.id === 'usb').role, 'share');
  assert.equal(config.safetyBackup, true);
  assert.equal(sharePercents(draft.locations).get('m1'), 0);
  draft.copies = 1; draft.locations = draft.locations.filter(row => row.id === 'main' || row.role === 'mirror');
  assert.equal(copiesWarning(1, draft.locations), false, 'one share plus a mirror needs no copies warning');
  draft.rules = [{ match: '*.mp4', location: 'm1' }];
  assert.equal(draftProblem(draft), 'problemRule', 'a rule cannot target a mirror');
});

test('every control has an accessible name and none is removed from the tab order', async () => {
  const status = baseStatus({ locations: [...baseStatus().locations, mirrorRow()], rules: [{ match: '*.mp4', location: 'usb' }] });
  const { panel } = await fixture({ status });
  const interactive = [];
  walk(panel.shadowRoot, node => { if (/^md-(outlined-|filled-|text-)?(button|switch|checkbox|outlined-text-field|outlined-select)$/.test(node.localName) || /^md-.*button$/.test(node.localName) || ['md-switch', 'md-checkbox', 'md-outlined-text-field', 'md-outlined-select'].includes(node.localName)) interactive.push(node); });
  assert.ok(interactive.length > 15, 'the page has many controls');
  for (const node of interactive.filter(item => !item.hidden)) {
    const name = node.getAttribute('aria-label') || node.label || node.textContent;
    assert.ok(String(name || '').trim(), `${node.localName} needs a name`);
    assert.notEqual(node.getAttribute('tabindex'), '-1');
  }
});

test('narrow layout rules keep every control reachable at 360 px', () => {
  const source = fs.readFileSync(new URL('../src/renderer/features/split-storage/panel.js', import.meta.url), 'utf8');
  assert.match(source, /minmax\(min\(100%,170px\),1fr\)/, 'the field grid wraps instead of overflowing');
  assert.match(source, /@media\(max-width:420px\)\{\.rule\{grid-template-columns:minmax\(0,1fr\)\}\}/);
  assert.match(source, /\.actions\{display:flex;flex-wrap:wrap/);
  assert.match(source, /data-motion=reduced/);
  assert.match(source, /data-low-stimulation=true/);
});

test('Cantonese and bilingual modes translate the heading and the held message', async () => {
  const yue = await fixture({ language: 'yue', status: baseStatus({ safetyHeld: true, job: { phase: 'copying', safetyHeld: true } }) });
  assert.equal(yue.panel.heading.textContent, '分散存放');
  assert.equal(yue.panel.heldTitle.textContent, '分散未完成，你嘅檔案仍然全部喺主磁碟。');
  const both = await fixture({ language: 'bilingual' });
  assert.equal(both.panel.heading.textContent, 'Split storage · 分散存放');
});

test('the model keeps bounded, honest values', () => {
  const status = normalizeSplitStatus({ locations: [{ id: 'x', weight: -4, freeBytes: 'bad' }], plan: { unavailableFiles: new Array(80).fill('f') } });
  assert.equal(status.locations[0].weight, 0);
  assert.equal(status.locations[0].freeBytes, null);
  assert.equal(status.plan.unavailableFiles.length, 50);
  assert.equal(status.safetyBackup, true);
  assert.throws(() => normalizeSplitStatus(null));
  assert.equal(formatBytes(1536), '1.5 KiB');
  assert.equal(draftProblem({ enabled: true, copies: 3, rules: [], locations: [{ id: 'main', role: 'share', kind: 'folder', weight: 1, enabled: true, capacityBytes: 0 }] }), 'problemCopies');
  assert.equal(draftProblem({ enabled: true, copies: 1, rules: [], locations: [{ id: 'main', role: 'share', kind: 'folder', weight: 1, enabled: true, capacityBytes: 0 }, { id: 'h', role: 'share', kind: 'registry', repository: 'Bad Name', weight: 1, enabled: true, capacityBytes: 0 }] }), 'problemRepository');
});
