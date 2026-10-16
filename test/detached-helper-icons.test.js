import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {control, connectSelectSearch} from '../src/shared/surface/controls.js';

const tick = () => new Promise(resolve => queueMicrotask(resolve));
const read = relative => readFile(new URL('../' + relative, import.meta.url), 'utf8');

/** Logic-only fixture: only the parent display and a minimal insertBefore are simulated. */
function gridFixture(display) {
  const doc = createAccessDocument();
  doc.documentElement = doc.body;
  doc.defaultView = {getComputedStyle: node => ({display: node.getAttribute('data-test-display') || 'block'})};
  const parent = doc.createElement('div');
  parent.setAttribute('data-test-display', display);
  parent.insertBefore = (node, reference) => { node.remove(); node.parentNode = parent; parent.childNodes.splice(parent.childNodes.indexOf(reference), 0, node); return node; };
  const select = control('select', {id: 'language', label: 'Language', value: 'en'}, [], doc);
  select.label = 'Language';
  parent.append(select);
  doc.body.append(parent);
  return {doc, parent, select};
}

test('a choice search helper in a grid container stays in the same grid cell as its select', async () => {
  const {parent, select} = gridFixture('grid');
  await tick();
  const dispose = connectSelectSearch(select);
  const pair = select.parentNode;
  assert.notEqual(pair, parent, 'the select must be wrapped so the grid sees one item');
  assert.equal(pair.getAttribute('data-choice-search-pair'), '');
  assert.equal(pair.parentNode, parent);
  assert.deepEqual(pair.children.map(child => child.localName), ['md-outlined-select', 'md-icon-button']);
  assert.ok(pair.children[1].hasAttribute('data-choice-search'));
  assert.equal(parent.children.length, 1, 'the grid container has exactly one item for the pair');
  dispose();
  assert.equal(select.parentNode, parent);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0], select);
});

test('a choice search helper outside a grid keeps its existing sibling placement', async () => {
  const {parent, select} = gridFixture('block');
  await tick();
  const dispose = connectSelectSearch(select);
  assert.equal(select.parentNode, parent);
  assert.deepEqual(parent.children.map(child => child.localName), ['md-outlined-select', 'md-icon-button']);
  dispose();
  assert.equal(parent.children.length, 1);
});

test('the grid pair and the navigation information icon have stylesheet composition', async () => {
  const css = await read('src/renderer/modern.css');
  assert.match(css, /\[data-choice-search-pair\]\{display:inline-flex;align-items:center;gap:4px;grid-column:1\/-1;min-inline-size:0;max-inline-size:100%\}/);
  assert.match(css, /\[data-choice-search-pair\]>md-outlined-select\[data-select-search-composition="adjacent"\]\{flex:1 1 0;min-inline-size:0;min-width:0;inline-size:auto\}/);
  assert.match(css, /\.local-ux-field:has\(>mfe-control-guidance:not\(\[data-open\]\)\)>\[data-choice-search-pair\]\{grid-column:1\}/);
  assert.match(css, /\.sidebar>mfe-control-guidance\[data-info-icon\]\{position:absolute;inset-block-start:12px;inset-inline-end:8px;z-index:2\}/);
  assert.match(css, /\.sidebar>mfe-control-guidance\[data-info-icon\]\[data-open\]\{inset-inline-start:8px;inline-size:auto;flex:none/);
  const navigation = await read('src/renderer/features/shell/navigation.js');
  assert.match(navigation, /\.brand\{[^}]*padding-inline-end:56px\}/);
});
