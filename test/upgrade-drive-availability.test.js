import {CONTROL_SELECTOR} from '../src/shared/surface/controls.js';
import {DRIVE_NAME_MAX_LENGTH,normalizeDriveName} from '../src/shared/drive-name.js';
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
 $('drive-name').value = 'Material Files';
 const context = vm.createContext({CONTROL_SELECTOR,normalizeDriveName,DRIVE_NAME_MAX_LENGTH,DRIVE_NAME_ERROR:'Invalid drive name',setText(id,text) { $(id).textContent = text; },historySelection:null,$, document: {querySelectorAll: () => []}, t: value => value, api: {}, pagedFiles: null, selected: null, busy: false, dialogMode: 'upgrade', recycledSelection: new Set(), state: {locked: false, mounted: true, storageFormat: 1, driveLetter: 'M:', availableDriveLetters: ['N:'], driver: {checking: false}}});
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

test('an invalid drive name blocks submit and shows the inline error, a valid one restores it', () => {
 const f = fixture(); f.context.dialogMode = 'create';
 const name = f.context.$('drive-name');
 for (const bad of ['', '   ', 'x'.repeat(33), 'a|b', 'a:b', 'a\u0001b']) {
  name.value = bad; f.check('N:', false, true);
  assert.equal(name.validationMessage, 'Invalid drive name');
  assert.equal(f.context.$('drive-name-error').hidden, false);
 }
 name.value = 'x'.repeat(32); f.check('N:', true);
 assert.equal(f.context.$('drive-name-error').hidden, true);
 assert.equal(f.context.$('drive-name-count').textContent, '32 / 32');
});
