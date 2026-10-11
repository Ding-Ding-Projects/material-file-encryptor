import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfaceModel, createMatcher, buildPattern } from '../src/shared/surface/model.js';

const tabs = [{ id: 'home', label: 'Home' }, { id: 'files', label: 'Files', group: 'Work' }];
const memory = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

test('tab lifecycle preserves active tab and rejects last or pinned closure', () => {
  const model = createSurfaceModel({ tabs });
  assert.equal(model.activateTab('files'), true);
  assert.equal(model.pinTab('files'), true);
  assert.equal(model.closeTab('files'), false);
  model.pinTab('files', false);
  assert.equal(model.closeTab('files'), true);
  assert.equal(model.getState().activeTabId, 'home');
  assert.equal(model.closeTab('home'), false);
  assert.equal(model.restoreTab(), 'files');
  assert.equal(model.getState().activeTabId, 'files');
  assert.equal(model.restoreTab(), null);
});

test('safe tab metadata persists while content and notification text do not', () => {
  const storage = memory();
  const model = createSurfaceModel({ tabs, storage });
  model.openTab({ id: 'preview', label: 'Preview', content: 'sensitive content', path: '/private/file' });
  model.groupTab('preview', 'Review');
  model.pinTab('preview');
  model.addNotification({ message: 'sensitive notification' });
  model.activateTab('home');
  const raw = storage.getItem('surface-state');
  assert.ok(!raw.includes('sensitive'));
  assert.ok(!raw.includes('/private'));
  const restored = createSurfaceModel({ tabs, storage }).getState();
  assert.deepEqual(restored.tabs[2], { id: 'preview', label: 'Preview', group: 'Review', pinned: true });
  assert.equal(restored.activeTabId, 'home');
  assert.deepEqual(restored.notifications, []);
  restored.tabs[0].label = 'Changed outside';
  assert.equal(model.getState().tabs[0].label, 'Home');
});

test('invalid storage recovers to usable defaults and closed history is bounded', () => {
  const storage = { getItem: () => '{bad', setItem: () => { throw new Error('full'); } };
  const model = createSurfaceModel({ tabs, storage });
  for (let i = 0; i < 25; i++) { model.openTab({ id: `extra-${i}`, label: 'Extra' }); model.closeTab(`extra-${i}`); }
  assert.equal(model.getState().closedTabs.length, 20);
  assert.equal(model.restoreTab(), 'extra-24');
  assert.equal(model.openTab({ id: '', label: 'Invalid' }), null);
});

test('literal search escapes syntax and regex errors are data', () => {
  assert.equal(createMatcher('a.b').test('axb'), false);
  assert.equal(createMatcher('a.b').test('A.B'), true);
  assert.equal(createMatcher('(', { regex: true }).valid, false);
  assert.equal(createMatcher('x'.repeat(513)).valid, false);
  assert.equal(createMatcher('x', { flags: 'g' }).valid, false);
  assert.equal(createMatcher('(a+)+$', { regex: true }).valid, false);
  assert.equal(createMatcher('(?=a)a', { regex: true }).valid, false);
  assert.equal(createMatcher('(a)\\1', { regex: true }).valid, false);
  assert.equal(createMatcher('a*a*', { regex: true }).valid, false);
  assert.equal(createMatcher('a{1001}', { regex: true }).valid, false);
  assert.equal(createMatcher('[a-z]+', { regex: true }).test('file'), true);
  assert.equal(createMatcher('z').test(`${'a'.repeat(4096)}z`), false);
  const model = createSurfaceModel({ tabs });
  assert.equal(model.searchTabs('work').length, 1);
  assert.deepEqual(model.searchTabs('(', { regex: true }), []);
});

test('pattern builder escapes literal alternatives and supports anchors', () => {
  const pattern = buildPattern(['file.', { type: 'alternative', values: ['txt', 'c++'] }], { anchorStart: true, anchorEnd: true });
  const matcher = createMatcher(pattern, { regex: true });
  assert.equal(matcher.test('file.c++'), true);
  assert.equal(matcher.test('fileXtxt'), false);
  assert.throws(() => buildPattern([{ type: 'unknown' }]), TypeError);
});

test('notification bounds, read filters, dismissal and safe CSV export', () => {
  const model = createSurfaceModel({ tabs });
  const old = model.addNotification({ title: 'Old' });
  for (let i = 0; i < 200; i++) model.addNotification({ title: `Notice ${i}` });
  assert.equal(model.getState().notifications.length, 200);
  assert.equal(model.readNotification(old), false);
  const id = model.addNotification({ title: '=FORMULA', message: 'Line one\n"Line two"', level: 'warning' });
  assert.equal(model.filterNotifications('formula', { unreadOnly: true }).length, 1);
  assert.equal(model.readNotification(id), true);
  assert.equal(model.filterNotifications('formula', { unreadOnly: true }).length, 0);
  const csv = model.exportNotifications('csv');
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('Line one\n""Line two""'));
  assert.equal(JSON.parse(model.exportNotifications()).length, 200);
  assert.equal(model.dismissNotification(id), true);
  assert.equal(model.dismissNotification(id), false);
});
