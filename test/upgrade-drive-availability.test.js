import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('function renderAvailability()'), source.indexOf('\nfunction render()'));
const normalize = source.match(/^const normalizedDriveLetter = .*;$/m)[0];

// Exercise the actual availability function without launching a desktop or claiming native proof.
function fixture() {
 const elements = new Map();
 const $ = id => {
  if (!elements.has(id)) elements.set(id, {value: '', setCustomValidity(value) { this.validationMessage = value; }, querySelectorAll: () => []});
  return elements.get(id);
 };
 const context = vm.createContext({$, document: {querySelectorAll: () => []}, t: value => value, api: {}, selected: null, busy: false, dialogMode: 'upgrade', recycledSelection: new Set(), state: {locked: false, mounted: true, storageFormat: 1, driveLetter: 'M:', availableDriveLetters: ['N:'], driver: {checking: false}}});
 vm.runInContext(normalize + '\n' + render, context);
 return {context, check(letter, enabled, valid = enabled) {
  $('drive-letter').value = letter;
  vm.runInContext('renderAvailability()', context);
  assert.equal($('dialog-submit').disabled, !enabled);
  assert.equal($('drive-letter').validationMessage === '', valid);
 }};
}

test('copy upgrade permits only the currently owned mounted legacy letter', () => {
 const f = fixture();
 f.check('m:', true);
 f.check('N:', true);
 for (const letter of ['L:', 'A:', 'M:\\', '', 'MM']) f.check(letter, false);
});

test('current-letter exception disappears when mode or original ownership changes', () => {
 for (const patch of [{dialogMode: 'create'}, {dialogMode: 'unlock'}, {state: {locked: true}}, {state: {mounted: false}}, {state: {locked: undefined}}, {state: {mounted: undefined}}, {state: {storageFormat: 2}}, {state: {driveLetter: 'L:'}}, {state: {driver: {checking: true}}}]) {
  const f = fixture(); f.check('M:', true);
  if (patch.state) Object.assign(f.context.state, patch.state); else Object.assign(f.context, patch);
  f.check('M:', false);
 }
});

test('busy upgrade stays disabled and free letters retain normal create and unlock behavior', () => {
 const f = fixture(); f.context.busy = true;
 f.check('M:', false, true);
 f.context.busy = false;
 for (const mode of ['create', 'unlock']) {
  f.context.dialogMode = mode;
  f.check('N:', true); f.check('M:', false);
 }
});
