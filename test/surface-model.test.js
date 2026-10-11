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

test('safe tab metadata and notification state persist without arbitrary content', () => {
  const storage = memory();
  const model = createSurfaceModel({ tabs, storage });
  model.openTab({ id: 'preview', label: 'Preview', content: 'sensitive content', path: '/private/file' });
  model.groupTab('preview', 'Review');
  model.pinTab('preview');
  const notificationId = model.addNotification({ message: 'Finished operation', secret: 'sensitive arbitrary property' });
  model.readNotification(notificationId);
  model.activateTab('home');
  const raw = storage.getItem('surface-state');
  assert.ok(!raw.includes('sensitive'));
  assert.ok(!raw.includes('/private'));
  const restored = createSurfaceModel({ tabs, storage }).getState();
  assert.deepEqual(restored.tabs[2], { id: 'preview', label: 'Preview', group: 'Review', pinned: true });
  assert.equal(restored.activeTabId, 'home');
  assert.equal(restored.notifications[0].message, 'Finished operation');
  assert.equal(restored.notifications[0].read, true);
  restored.tabs[0].label = 'Changed outside';
  assert.equal(model.getState().tabs[0].label, 'Home');
});

test('groups persist rename and collapse state and removal ungroups open and closed tabs', () => {
  const storage = memory();
  const model = createSurfaceModel({ tabs, storage });
  assert.equal(model.createGroup({ id: 'review', label: 'Review' }), 'review');
  assert.equal(model.createGroup({ id: 'review', label: 'Duplicate' }), null);
  assert.equal(model.groupTab('home', 'review'), true);
  model.groupTab('files', 'review');
  model.closeTab('files');
  model.renameGroup('review', 'Later');
  model.collapseGroup('review', true);
  const restored = createSurfaceModel({ tabs, storage });
  assert.deepEqual(restored.getState().groups.find(group => group.id === 'review'), { id: 'review', label: 'Later', collapsed: true });
  assert.equal(restored.removeGroup('review', { ungroup: false }), false);
  assert.equal(restored.removeGroup('review', { ungroup: true }), true);
  restored.restoreTab();
  assert.ok(restored.getState().tabs.every(tab => tab.group === ''));
  assert.equal(restored.getState().groups.some(group => group.id === 'review'), false);
});

test('tab movement and bulk close respect ordering pinned tabs and final tab', () => {
  const model = createSurfaceModel({ tabs });
  model.openTab({ id: 'third', label: 'Third' });
  model.openTab({ id: 'fourth', label: 'Fourth' });
  assert.equal(model.moveTab('fourth', 1), true);
  assert.deepEqual(model.getState().tabs.map(tab => tab.id), ['home', 'fourth', 'files', 'third']);
  assert.equal(model.moveTab('missing', 0), false);
  model.pinTab('third');
  assert.deepEqual(model.closeTabsToRight('fourth'), ['files']);
  assert.deepEqual(model.closeOtherTabs('fourth'), ['home']);
  assert.deepEqual(model.closeTabs(['fourth', 'third', 'fourth']), ['fourth']);
  assert.deepEqual(model.getState().tabs.map(tab => tab.id), ['third']);
  model.pinTab('third', false);
  assert.deepEqual(model.closeTabs(['third']), []);
});

test('notification reload sanitizes malformed entries and preserves unique identifiers', () => {
  const storage = memory();
  storage.setItem('surface-state', JSON.stringify({ version: 1, notificationFormat: 2, tabs, notifications: [
    { id: 'notification-1', title: 'Done', message: 'password=hidden token:abc', createdAt: '2026-10-10T12:00:00Z', read: true, arbitrary: 'excluded' },
    { id: 'notification-1', title: 'Duplicate', createdAt: '2026-10-10T12:00:00Z' },
    { id: 'invalid-date', createdAt: 'invalid' },
    { id: 7, createdAt: '2026-10-10T12:00:00Z' }
  ] }));
  const model = createSurfaceModel({ tabs, storage });
  assert.equal(model.getState().notifications.length, 1);
  assert.equal(model.getState().notifications[0].message, 'password=[redacted] token=[redacted]');
  const id = model.addNotification({ title: 'Another', message: 'api_key="hidden value"' });
  assert.notEqual(id, 'notification-1');
  assert.ok(!storage.getItem('surface-state').includes('hidden'));
  assert.ok(!storage.getItem('surface-state').includes('arbitrary'));
  model.dismissNotification('notification-1');
  assert.equal(createSurfaceModel({ tabs, storage }).getState().notifications.length, 1);
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


test('legacy notification messages are dropped once while custom groups survive',()=>{
 const storage=memory();storage.setItem('surface-state',JSON.stringify({version:1,tabs,groups:[{id:'custom',label:'User named group'}],notifications:[{id:'old',title:'Synthetic mapped title',message:'Synthetic mapped text',createdAt:'2026-10-10T12:00:00Z'}]}));
 const model=createSurfaceModel({storage,tabs});
 assert.equal(model.getState().notificationFormat,2);
 assert.equal(model.getState().droppedLegacyNotifications,1);
 assert.deepEqual(model.getState().notifications,[]);
 assert.equal(model.getState().groups[0].label,'User named group');
 assert.ok(!storage.getItem('surface-state').includes('Synthetic mapped'));
 model.addNotification({title:'Canonical title',message:'Canonical message'});
 const restored=createSurfaceModel({storage,tabs});
 assert.equal(restored.getState().droppedLegacyNotifications,0);
 assert.equal(restored.getState().notifications[0].message,'Canonical message');
});

test('trusted tab registration repairs open and closed labels without renaming groups',()=>{
 const model=createSurfaceModel({tabs});model.renameGroup('Work','Custom group');
 model.openTab({id:'extra',label:'Synthetic mapped label',group:'Work'});model.closeTab('extra');
 assert.equal(model.registerCanonicalTab('extra','Canonical extra'),true);
 assert.equal(model.getState().closedTabs[0].label,'Canonical extra');
 model.restoreTab();assert.equal(model.getState().tabs.find(tab=>tab.id==='extra').label,'Canonical extra');
 model.registerCanonicalTab('home','Canonical home');
 assert.equal(model.getState().tabs[0].label,'Canonical home');
 model.closeTab('extra');model.openTab({id:'extra',label:'Synthetic mapped label'});
 assert.equal(model.getState().tabs.find(tab=>tab.id==='extra').label,'Canonical extra');
 assert.equal(model.getState().groups[0].label,'Custom group');
});

test('progress and recovery updates are bounded canonical records with bulk actions',()=>{
 const model=createSurfaceModel({tabs});
 const first=model.addNotification({title:'Task',progress:{value:300,label:'Canonical progress'},recovery:[{id:'retry',label:'Try again'},{id:'invalid action',label:'Rejected'}]});
 const second=model.addNotification({title:'Second'});
 assert.equal(model.getState().notifications[0].progress.value,100);
 assert.deepEqual(model.getState().notifications[0].recovery,[{id:'retry',label:'Try again'}]);
 assert.equal(model.updateNotification(first,{progress:{value:35,label:'Working'}}),true);
 assert.equal(model.getState().notifications[0].progress.value,35);
 assert.equal(model.readNotifications([first,second]),2);assert.ok(model.getState().notifications.every(item=>item.read));
 assert.equal(model.dismissNotifications([first]),1);assert.equal(model.getState().notifications[0].id,second);
});
