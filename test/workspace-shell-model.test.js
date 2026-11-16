import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPath, basename, folderKey, buildFolderTree, flattenFolderTree, ancestorFolders, fileInFolder, relativeName, breadcrumbs, sortFiles} from '../src/renderer/features/shell/folder-tree.js';
import {normalizeShellPreferences, loadShellPreferences, saveShellPreferences, applyShellPreferences, SHELL_DEFAULTS, SHELL_STORAGE_KEY} from '../src/renderer/features/shell/shell-preferences.js';
import {unlockReadiness} from '../src/renderer/features/shell/unlock-card.js';
import {SHELL_COPY} from '../src/renderer/features/shell/copy.js';
import {BREAKPOINTS, effectiveWidth, activeBreakpoints, applyViewportClasses} from '../src/renderer/features/shell/viewport.js';

const files = [
  {id: 'a', path: 'Finance\\2026\\Report.pdf', size: 300, offline: false, partCount: 2, modified: '2026-11-01T00:00:00Z'},
  {id: 'b', path: 'Finance/2026/Receipts/One.pdf', size: 10, offline: true, partCount: 1, modified: '2026-11-03T00:00:00Z'},
  {id: 'c', path: 'Finance/2025/Old.pdf', size: 900, offline: true, partCount: 9, modified: '2025-01-01T00:00:00Z'},
  {id: 'd', path: 'readme.txt', size: 5, offline: false, partCount: 1, modified: '2026-10-01T00:00:00Z'},
  {id: 'e', path: 'File 10.txt', size: 5, offline: false, partCount: 1, modified: '2026-10-02T00:00:00Z'},
  {id: 'f', path: 'File 2.txt', size: 5, offline: false, partCount: 1, modified: '2026-10-03T00:00:00Z'}
];

test('paths split on both separators and ignore empty segments', () => {
  assert.deepEqual(splitPath('a\\b//c/'), ['a', 'b', 'c']);
  assert.equal(basename('a/b/c.txt'), 'c.txt');
  assert.equal(folderKey('\\a\\b\\'), 'a/b');
  assert.deepEqual(splitPath(undefined), []);
});

test('the tree counts every file below each folder and keeps root files out of folders', () => {
  const tree = buildFolderTree(files);
  assert.equal(tree.count, 6);
  const finance = tree.children.get('Finance');
  assert.equal(finance.count, 3);
  assert.equal(finance.children.get('2026').count, 2);
  assert.equal(finance.children.get('2026').children.get('Receipts').count, 1);
  assert.equal(tree.children.has('readme.txt'), false);
});

test('flattening shows only expanded branches, in natural name order', () => {
  const tree = buildFolderTree(files);
  assert.deepEqual(flattenFolderTree(tree).map(row => row.path), ['Finance']);
  const rows = flattenFolderTree(tree, new Set(['Finance', 'Finance/2026']));
  assert.deepEqual(rows.map(row => row.path), ['Finance', 'Finance/2025', 'Finance/2026', 'Finance/2026/Receipts']);
  assert.equal(rows[0].expanded, true);
  assert.equal(rows[1].hasChildren, false);
  assert.equal(rows[3].depth, 3);
});

test('folder scope includes descendants, excludes siblings and prefix lookalikes', () => {
  const lookalike = {id: 'x', path: 'Finance2/file.txt'};
  assert.equal(fileInFolder(files[0], 'Finance/2026'), true);
  assert.equal(fileInFolder(files[2], 'Finance/2026'), false);
  assert.equal(fileInFolder(lookalike, 'Finance'), false);
  assert.equal(fileInFolder(files[3], ''), true);
  assert.equal(relativeName(files[1], 'Finance/2026'), 'Receipts/One.pdf');
  assert.equal(relativeName(files[3], ''), 'readme.txt');
  assert.deepEqual(ancestorFolders('a/b/c/file'), ['a', 'a/b', 'a/b/c']);
  assert.deepEqual(breadcrumbs('a/b'), [{name: 'a', path: 'a'}, {name: 'b', path: 'a/b'}]);
});

test('sorting is stable, natural for names and numeric for sizes, dates and parts', () => {
  const byName = sortFiles([files[4], files[5]], {key: 'name'}).map(file => file.path);
  assert.deepEqual(byName, ['File 2.txt', 'File 10.txt']);
  assert.deepEqual(sortFiles(files, {key: 'size', direction: 'desc'}).slice(0, 2).map(file => file.id), ['c', 'a']);
  assert.deepEqual(sortFiles(files, {key: 'modified', direction: 'desc'})[0].id, 'b');
  assert.deepEqual(sortFiles(files, {key: 'parts', direction: 'desc'})[0].id, 'c');
  assert.deepEqual(sortFiles(files, {key: 'availability', direction: 'desc'}).slice(0, 2).map(file => file.offline), [true, true]);
  assert.equal(sortFiles(files, {key: 'unknown'})[0].id, sortFiles(files, {key: 'name'})[0].id);
  const before = files.map(file => file.id).join();
  sortFiles(files, {key: 'size'});
  assert.equal(files.map(file => file.id).join(), before, 'the input is never reordered in place');
});

test('shell preferences accept only known values and clamp the text size', () => {
  assert.deepEqual(normalizeShellPreferences(null), SHELL_DEFAULTS);
  assert.deepEqual(normalizeShellPreferences({density: 'huge', textScale: 'x', highContrast: 'yes'}), SHELL_DEFAULTS);
  assert.equal(normalizeShellPreferences({textScale: 10}).textScale, 90);
  assert.equal(normalizeShellPreferences({textScale: 500}).textScale, 200);
  assert.equal(normalizeShellPreferences({textScale: 133}).textScale, 135);
  assert.equal(normalizeShellPreferences({density: 'comfortable'}).density, 'comfortable');
});

test('shell preferences round-trip through storage and survive damage and failures', () => {
  const store = new Map();
  const storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)};
  assert.equal(saveShellPreferences(storage, {density: 'comfortable', textScale: 150, highContrast: true}), true);
  assert.deepEqual(loadShellPreferences(storage), {density: 'comfortable', textScale: 150, highContrast: true});
  store.set(SHELL_STORAGE_KEY, '{broken');
  assert.deepEqual(loadShellPreferences(storage), SHELL_DEFAULTS);
  store.set(SHELL_STORAGE_KEY, 'x'.repeat(5000));
  assert.deepEqual(loadShellPreferences(storage), SHELL_DEFAULTS);
  assert.equal(saveShellPreferences({setItem() { throw new Error('full'); }}, SHELL_DEFAULTS), false);
  assert.deepEqual(loadShellPreferences({getItem() { throw new Error('blocked'); }}), SHELL_DEFAULTS);
});

test('applying preferences writes attributes and one scale property on the root', () => {
  const root = {dataset: {}, style: {values: {}, setProperty(name, value) { this.values[name] = value; }}};
  applyShellPreferences(root, {density: 'comfortable', textScale: 150, highContrast: true});
  assert.equal(root.dataset.density, 'comfortable');
  assert.equal(root.dataset.contrast, 'high');
  assert.equal(root.style.values['--mfe-text-scale'], '1.5');
  applyShellPreferences(root, SHELL_DEFAULTS);
  assert.equal(root.dataset.contrast, 'auto');
});

test('the unlock card asks for what is missing, in order', () => {
  assert.equal(unlockReadiness({storageDir: '', mode: 'password', password: 'x'}), 'storage');
  assert.equal(unlockReadiness({storageDir: 'C:\\s', mode: 'password', password: ''}), 'password');
  assert.equal(unlockReadiness({storageDir: 'C:\\s', mode: 'keyFile', keyFilePath: ''}), 'key');
  assert.equal(unlockReadiness({storageDir: 'C:\\s', mode: 'keyFile', keyFilePath: 'C:\\k'}), 'ready');
  assert.equal(unlockReadiness({storageDir: 'C:\\s', mode: 'password', password: 'x'}), 'ready');
});

test('shell Cantonese copy has an entry for every interpolated and fixed English key it declares', () => {
  for (const [english, cantonese] of Object.entries(SHELL_COPY)) {
    assert.ok(cantonese.length > 0, english);
    const placeholders = key => (key.match(/\{[a-z]+\}/g) || []).sort().join();
    assert.equal(placeholders(english), placeholders(cantonese), `placeholders match for ${english}`);
  }
});

test('zoomed text lays out like a narrower window, and the breakpoint list is exact', () => {
  assert.equal(effectiveWidth(1280, 2), 640);
  assert.equal(effectiveWidth(1280, 0), 1280, 'a broken scale falls back to 100%');
  assert.equal(effectiveWidth(0, 1), 0);
  assert.deepEqual(BREAKPOINTS, [1100, 960, 839, 560, 400]);
  assert.deepEqual(activeBreakpoints(1440), []);
  assert.deepEqual(activeBreakpoints(839), [1100, 960, 839]);
  assert.deepEqual(activeBreakpoints(360), [1100, 960, 839, 560, 400]);
  assert.deepEqual(activeBreakpoints(640), [1100, 960, 839]);
});

test('viewport classes toggle one attribute per breakpoint and mark the top bar narrow', () => {
  const attributes = new Set();
  const root = {toggleAttribute: (name, on) => (on ? attributes.add(name) : attributes.delete(name))};
  const top = {narrow: false, toggleAttribute(name, on) { this.narrow = on; }};
  applyViewportClasses(root, 640, [top]);
  assert.deepEqual([...attributes].sort(), ['data-max1100', 'data-max839', 'data-max960']);
  assert.equal(top.narrow, true);
  applyViewportClasses(root, 1400, [top, null]);
  assert.equal(attributes.size, 0);
  assert.equal(top.narrow, false);
});
