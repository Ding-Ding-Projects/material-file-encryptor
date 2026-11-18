import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchRows, fileRowFromPath } from '../src/renderer/file-rows.js';

// A small DOM stand-in: only what patchRows touches.
class Node {
  constructor(name) { this.localName = name; this.children = []; this.dataset = {}; this.parentNode = null; this.ownerDocument = doc; }
  get firstElementChild() { return this.children[0] ?? null; }
  get nextElementSibling() { const list = this.parentNode?.children; return list ? list[list.indexOf(this) + 1] ?? null : null; }
  insertBefore(node, before) { node.remove(); const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, node); node.parentNode = this; doc.moves++; return node; }
  append(node) { return this.insertBefore(node, null); }
  remove() { if (!this.parentNode) return; this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  replaceWith(node) { const parent = this.parentNode, index = parent.children.indexOf(this); this.remove(); parent.children.splice(index, 0, node); node.parentNode = parent; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelector() { return this.children[0] ?? null; }
  focus() { doc.activeElement = this; }
}
const doc = { activeElement: null, moves: 0 };
const build = ({ key }) => { const row = new Node('tr'); row.dataset.fileId = key; row.append(new Node('input')); return row; };
const items = (...pairs) => pairs.map(([key, signature]) => ({ key, signature }));

test('a refresh with unchanged data keeps every row node, so focus, scroll and open menus survive', () => {
  const body = new Node('tbody');
  patchRows(body, items(['a', '1'], ['b', '1'], ['c', '1']), build);
  const before = [...body.children]; before[1].children[0].focus(); doc.moves = 0;
  const result = patchRows(body, items(['a', '1'], ['b', '1'], ['c', '1']), build);
  assert.deepEqual(result, { kept: 3, built: 0, removed: 0 });
  assert.deepEqual(body.children, before); assert.equal(doc.moves, 0, 'no row moved');
  assert.equal(doc.activeElement, before[1].children[0]);
});

test('only changed rows are rebuilt, removed rows go, new rows land in order, and focus follows a rebuilt row', () => {
  const body = new Node('tbody');
  patchRows(body, items(['a', '1'], ['b', '1'], ['c', '1']), build);
  const [a, b] = body.children; b.children[0].focus();
  const result = patchRows(body, items(['a', '1'], ['b', '2'], ['d', '1']), build);
  assert.deepEqual(result, { kept: 1, built: 2, removed: 1 });
  assert.deepEqual(body.children.map(row => row.dataset.rowKey), ['a', 'b', 'd']);
  assert.equal(body.children[0], a); assert.notEqual(body.children[1], b);
  assert.equal(doc.activeElement, body.children[1].children[0], 'focus moves to the rebuilt row');
});

test('reordering moves rows without rebuilding them', () => {
  const body = new Node('tbody');
  patchRows(body, items(['a', '1'], ['b', '1'], ['c', '1']), build);
  const [a, b, c] = body.children;
  const result = patchRows(body, items(['c', '1'], ['a', '1'], ['b', '1']), build);
  assert.equal(result.built, 0); assert.deepEqual(body.children, [c, a, b]);
});

test('the keyboard menu finds the file row through the checkbox shadow root', () => {
  const row = new Node('tr'); row.dataset.fileId = 'f1';
  const inner = new Node('input'); // inside md-checkbox's shadow root: closest() cannot reach the row
  inner.closest = () => null;
  assert.equal(fileRowFromPath([inner, { localName: 'div' }, new Node('md-checkbox'), row], inner), row);
  assert.equal(fileRowFromPath([inner], inner), null);
  const cell = { closest: () => row };
  assert.equal(fileRowFromPath([cell], cell), row, 'a pointer target inside a cell still works');
});

test('the file list uses the path lookup and a refresh no longer clears the selection or the rows', () => {
  const app = readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  assert.match(app, /registerContextActions\(fileList,\(\{target,path\}\)=>\{const row=fileRowFromPath\(path,target\);/);
  assert.match(app, /patchRows\(\$\('file-list'\)/);
  assert.doesNotMatch(app, /if\(!append\)\{pagedFiles=\[\];selected=null;fileSelection\.clear\(\)/);
});
