import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchStore } from '../src/shared/surface/regex-workbench.js';
import { listParameters, applyParameters } from '../src/shared/surface/regex/library.js';
import { createEditHistory } from '../src/shared/surface/regex/edit-history.js';

const memory = () => { const map = new Map(); return { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }; };

test('saved expressions keep description, replacement and flavor and survive a reload', () => {
  const disk = memory();
  const store = createWorkbenchStore(disk, 'field-a');
  assert.equal(store.add('Dates', '(\\d{4})-(\\d{2})', 'u', { description: 'ISO year and month', replacement: '$2/$1', flavor: 'python' }), true);
  const again = createWorkbenchStore(disk, 'field-a').get().snippets[0];
  assert.deepEqual(again, { name: 'Dates', pattern: '(\\d{4})-(\\d{2})', flags: 'u', description: 'ISO year and month', replacement: '$2/$1', flavor: 'python' });
  assert.equal(createWorkbenchStore(disk, 'field-b').get().snippets.length, 0, 'each search field owns its own library');
});

test('library search, update and rejection of invalid entries', () => {
  const store = createWorkbenchStore(memory(), 'a');
  store.add('Email', '\\w+@\\w+', '', { description: 'simple address' });
  store.add('Digits', '\\d+', '');
  assert.deepEqual(store.search('addr').map(e => e.name), ['Email']);
  assert.deepEqual(store.search('').map(e => e.name), ['Email', 'Digits']);
  assert.equal(store.update(1, { name: 'Numbers', description: 'integers' }), true);
  assert.equal(store.get().snippets[1].name, 'Numbers');
  assert.equal(store.update(1, { pattern: '[' }), false);
  assert.equal(store.add('Broken', '(', ''), false);
  assert.equal(store.get().snippets.length, 2);
});

test('import and export round-trip without losing extra fields and reject bad documents', () => {
  const source = createWorkbenchStore(memory(), 'a');
  source.add('One', 'a+', 'i', { description: 'letters', flavor: 'dotnet' });
  const target = createWorkbenchStore(memory(), 'b');
  target.import(JSON.parse(source.export()));
  assert.deepEqual(target.get().snippets, source.get().snippets);
  assert.throws(() => target.import({ version: 2, snippets: [] }));
  assert.throws(() => target.import({ version: 1, snippets: [{ name: 'x', pattern: '(', flags: '' }] }));
  assert.equal(target.get().snippets.length, 1, 'a rejected import leaves the library unchanged');
});

test('parameters are listed with defaults and substituted as escaped literals', () => {
  const pattern = '^{{prefix|ID}}-\\d{2}$|{{word}}';
  assert.deepEqual(listParameters(pattern).map(p => [p.name, p.default]), [['prefix', 'ID'], ['word', '']]);
  assert.equal(applyParameters('{{prefix|ID}}-\\d+', {}), 'ID-\\d+');
  assert.equal(applyParameters('{{prefix|ID}}-\\d+', { prefix: 'A.B' }), 'A\\.B-\\d+');
  const injected = applyParameters('^{{x}}$', { x: '(a|b)*' });
  assert.equal(new RegExp(injected).test('(a|b)*'), true);
  assert.equal(new RegExp(injected).test('ab'), false, 'a value can never change the expression structure');
});

test('undo and redo walk the edit history and branch on new edits', () => {
  const history = createEditHistory({ initial: { pattern: '', flags: '', replacement: '' } });
  assert.equal(history.canUndo(), false);
  assert.equal(history.push({ pattern: 'a', flags: '', replacement: '' }), true);
  assert.equal(history.push({ pattern: 'a', flags: '', replacement: '' }), false, 'identical states are not recorded twice');
  history.push({ pattern: 'ab', flags: 'i', replacement: '$1' });
  assert.deepEqual(history.undo(), { pattern: 'a', flags: '', replacement: '' });
  assert.deepEqual(history.redo(), { pattern: 'ab', flags: 'i', replacement: '$1' });
  history.undo(); history.undo();
  history.push({ pattern: 'z', flags: '', replacement: '' });
  assert.equal(history.canRedo(), false);
  assert.deepEqual(history.recent().map(s => s.pattern), ['z', '']);
});

test('history is capped and one instance never affects another', () => {
  const a = createEditHistory({ limit: 5 }), b = createEditHistory({ limit: 5 });
  for (let i = 0; i < 20; i++) a.push({ pattern: 'p' + i, flags: '', replacement: '' });
  assert.equal(a.recent(100).length, 5);
  assert.equal(b.canUndo(), false);
});
