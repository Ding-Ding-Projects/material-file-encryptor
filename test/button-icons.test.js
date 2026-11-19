import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES, KEY_ICONS, iconForLabel, withIcon, withKeyIcon, withLabelIcon } from '../src/renderer/icons.js';

// Every button with a text label carries an icon (design/modern-redesign/KIT.md: "Every button has an icon").
// The scan reads the renderer feature sources, finds every place a Material Web button (or a toolbox button that is
// drawn like one) is created, and requires an icon helper from icons.js in the same factory or statement.
const here = fileURLToPath(new URL('.', import.meta.url));
const FEATURES = process.env.BUTTON_ICON_FEATURES_ROOT || join(here, '..', 'src', 'renderer', 'features');
// Folders owned by other work in progress at the time this was written; they are checked by their own tests.
const SKIPPED_FOLDERS = ['storage-maintenance', 'shell', 'home-dashboard', 'settings-layout'];

const ICON_CALL = /\b(?:withIcon|withLabelIcon|withKeyIcon)\(|data-icon/;
const BUTTON_TAG = '(?:md-(?:filled|filled-tonal|outlined|text)-button|button)';
// A creation call whose first argument (possibly after a ternary condition) is a button tag literal.
const CREATE = new RegExp(`\\b(?:createElement|element|el|control|materialControl|node|named|make)\\(\\s*(?:[^'"\`()]*\\?\\s*)?['"\`]${BUTTON_TAG}['"\`]`, 'g');
const HTML_BUTTON = /<md-(?:filled|filled-tonal|outlined|text)-button\b[^>]*>([\s\S]*?)<\/md-(?:filled|filled-tonal|outlined|text)-button>/g;

// Buttons that genuinely cannot carry an icon. Each entry is [file, text that identifies the creation site, reason].
const ALLOW = [
  ['docker-hub-drive/picker.js', "element('button', { type: 'button', class: 'info'", 'Hidden "i" toggle that is itself an information glyph; its label is the letter i, not an action.'],
  ['local-tools/index.js', "el('button', {type: 'button', role: 'radio'", 'Compact 26 px segmented "Group by" radio choice (Category / Name); it is a selection state, not an action, and an icon would break the segmented layout.'],
  ['screen-recording/index.js', "el('button', { type: 'button', class: 'toolbox-card'", 'Source picker card whose content is a live thumbnail plus its name; the thumbnail is its icon.'],
  ['personalization/motion-profiles.js', "el('button', 'motion-profiles-kind')", 'Row in the list of animated element kinds; a selectable list item, not an action button.']
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!SKIPPED_FOLDERS.includes(name)) out.push(...walk(full)); } else if (/\.(?:js|mjs|html)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(FEATURES).map(path => ({ rel: relative(FEATURES, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }));

test('the scan reaches the feature sources', () => {
  assert.ok(files.length > 100, `expected the feature tree, found ${files.length} files`);
  assert.ok(files.some(file => CREATE.test(file.text) && (CREATE.lastIndex = 0, true)), 'expected button creation sites');
});

test('every button created in the feature sources gets an icon', () => {
  const missing = [];
  let sites = 0;
  for (const { rel, text } of files) {
    CREATE.lastIndex = 0;
    for (let match; (match = CREATE.exec(text));) {
      sites += 1;
      const allowed = ALLOW.some(([file, snippet]) => file === rel && text.slice(match.index, match.index + 140).includes(snippet));
      if (allowed) continue;
      const window = text.slice(Math.max(0, match.index - 250), match.index + 750);
      if (!ICON_CALL.test(window)) missing.push(`${rel}:${text.slice(0, match.index).split('\n').length} ${match[0].slice(0, 70)}`);
    }
  }
  assert.ok(sites >= 50, `expected many creation sites, found ${sites}`);
  assert.deepEqual(missing, [], `buttons without an icon:\n${missing.join('\n')}`);
});

test('files that create buttons import the icon helpers', () => {
  const bad = [];
  for (const { rel, text } of files) {
    CREATE.lastIndex = 0;
    const creates = [...text.matchAll(CREATE)].some(match => !ALLOW.some(([file, snippet]) => file === rel && text.slice(match.index, match.index + 140).includes(snippet)));
    if (creates && !/from\s+['"][./]*icons\.js['"]/.test(text)) bad.push(rel);
  }
  assert.deepEqual(bad, []);
});

test('buttons written as HTML carry a data-icon element before the label', () => {
  const bad = [];
  for (const { rel, text } of files) for (const match of text.matchAll(HTML_BUTTON)) if (!/data-icon|slot="icon"/.test(match[1])) bad.push(`${rel}: ${match[0].slice(0, 80)}`);
  assert.deepEqual(bad, []);
});

test('every allow-listed exception still points at a real creation site', () => {
  for (const [file, snippet, reason] of ALLOW) {
    const found = files.find(entry => entry.rel === file);
    assert.ok(found?.text.includes(snippet), `${file} no longer contains ${snippet}`);
    assert.ok(reason.length > 30, `${file} needs a real explanation`);
  }
});

test('icon names used by the helpers all exist in the icon set', () => {
  const names = new Set(ICON_NAMES);
  for (const [key, name] of Object.entries(KEY_ICONS)) assert.ok(names.has(name), `KEY_ICONS.${key} -> ${name}`);
  for (const label of ['Cancel', 'Delete', 'Refresh', 'Save', 'Export', 'Import JSON', 'Open', 'Copy', 'Unlock', 'Send', 'Start', 'Stop', 'Reset all', 'Add a layer', 'Mount the ISO', 'Resize', 'Whatever']) assert.ok(names.has(iconForLabel(label)), label);
  const literal = /\b(?:withIcon|withLabelIcon)\([^;\n]*?,\s*'([a-z_]+)'(?:\s*\)|\s*,)/g;
  for (const { rel, text } of files) for (const match of text.matchAll(literal)) assert.ok(names.has(match[1]), `${rel}: unknown icon ${match[1]}`);
});

test('icon helpers never throw without a document and return the button', () => {
  const stub = { prepend() { throw new Error('should not be reached without a document'); } };
  assert.equal(withIcon(stub, 'check'), stub);
  assert.equal(withLabelIcon(stub, 'Save'), stub);
  assert.equal(withKeyIcon(stub, 'Back', key => key), stub);
});
