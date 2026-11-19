import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULTS} from '../src/shared/local-ux/store.js';
import {COPY, SETTING_LABELS} from '../src/shared/local-ux/language.js';
import {FIELD_HELP} from '../src/shared/local-ux/settings-field-help.js';
import {cantonese} from '../src/renderer/i18n.js';
import {SHELL_COPY} from '../src/renderer/features/shell/copy.js';
import {CONTROL_SELECTOR} from '../src/shared/surface/controls.js';
import {PERSONALIZATION_SETTINGS, PERSONALIZATION_TABS, personalizationSettingCommands} from '../src/renderer/features/personalization/settings-index.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// Hand-written. Deleting a setting from the markup or the index turns these red, and so does adding a stored default
// without deciding where it is shown.
const SETTINGS_VIEW = [
  ['md-switch', 'startup-setting', 'Start with Windows'],
  ['md-switch', 'auto-unlock-setting', 'Automatically unlock this drive'],
  ['md-outlined-button', 'forget-credential', 'Forget saved credential'],
  ['md-outlined-select', 'theme-setting', 'Appearance'],
  ['md-outlined-select', 'language-setting', 'Language'],
  ['md-outlined-select', 'performance-mode-setting', 'Background work priority'],
  ['md-switch', 'emoji-setting', 'Emoji in dialogs'],
  ['md-slider', 'funnyEnglish-setting', 'English playfulness'],
  ['md-slider', 'funnyCantonese-setting', 'Cantonese playfulness'],
  ['md-outlined-button', 'vocabulary-label', 'Import vocabulary JSON'],
  ['md-text-button', 'reset-vocabulary', 'Reset vocabulary'],
  ['md-switch', 'soundEffects-setting', 'Sound effects'],
  ['md-slider', 'soundVolume-setting', 'Sound volume'],
  ['md-outlined-button', 'sound-test', 'Play sample'],
  ['md-text-button', 'sound-reset', 'Reset sounds'],
  ['md-outlined-text-field', 'split-value', 'Part size'],
  ['md-outlined-select', 'split-unit', 'Part size unit'],
  ['md-filled-tonal-button', 'split-apply', 'Apply'],
  ['md-outlined-select', 'density-setting', 'Row density'],
  ['md-slider', 'text-scale-setting', 'Text size'],
  ['md-switch', 'high-contrast-setting', 'High contrast']
];

// Stored defaults that are deliberately not one editable field in the index, each with the reason.
const NOT_A_FIELD = {
  version: 'schema version of the stored record, not a user setting',
  school: 'School mode has its own controls on the Language and voice tab (mode name and credential)',
  narrator: 'its fields (Narrator, language, voices, rate, pitch) are indexed one by one',
  attention: 'its fields are indexed one by one on the Attention tab',
  schedules: 'rule editing is the Schedules tab, indexed as a tab'
};

const hasCantonese = (label, app) => Boolean(cantonese[label] || COPY[label] || SHELL_COPY[label] || app.includes(`'${label}':'`));

function viewSettings(html) { return html.match(/<mfe-content-panel id="view-settings"[\s\S]*?<\/mfe-content-panel>/)?.[0] ?? ''; }

test('every setting in the Settings view exists, has an accessible name, and is a control the palette and the settings search scan', async () => {
  const html = viewSettings(await read('src/renderer/index.html'));
  assert.ok(html.length > 1000, 'the Settings view was found');
  const selectors = new Set(CONTROL_SELECTOR.split(','));
  for (const [tag, id, label] of SETTINGS_VIEW) {
    // A button may lead with its icon and keep its translated label in its own span.
    const control = html.match(new RegExp(`<${tag}[^>]*\\bid="${id}"[^>]*>(?:<span data-icon="[^"]*"></span>)?(?:<span data-i18n>)?([^<]*)`))?.[0];
    assert.ok(control, `${id} is in the Settings view`);
    assert.ok(selectors.has(tag), `${tag} is in CONTROL_SELECTOR, so ${id} is indexed by the palette and searched by Settings search`);
    const named = control.includes(`aria-label="${label}"`) || new RegExp(`>\\s*${label}\\s*$`).test(control);
    assert.ok(named, `${id} is named "${label}"`);
  }
});

test('no control in the Settings view is missing from the hand-written list', async () => {
  const html = viewSettings(await read('src/renderer/index.html'));
  const found = [...html.matchAll(/<(md-[a-z-]+|input|select|button)\b[^>]*\bid="([^"]+)"/g)].map(match => match[2]).filter(id => id !== 'export-vocabulary');
  const listed = new Set(SETTINGS_VIEW.map(row => row[1]));
  assert.deepEqual(found.filter(id => !listed.has(id)), [], 'a new Settings control needs an entry in this inventory and a palette check');
});

test('Settings search and the palette scan the rendered Settings view', async () => {
  const app = await read('src/renderer/app.js');
  assert.match(app, /attachEnhancedSearch\(settingsSearch,\$\('view-settings'\)\)/);
  assert.match(app, /querySelectorAll\('mfe-main-workspace > \.view'\)/);
  assert.match(app, /personalizationSettingCommands\(/);
  // The search matches control labels and values, not only headings.
  assert.match(app, /querySelectorAll\('\.local-ux-field,\.appearance-property,\.local-ux-section,'\+CONTROL_SELECTOR\)/);
});

test('every Settings view control name and every personalization setting has a Cantonese pair', async () => {
  const app = await read('src/renderer/app.js');
  const missing = [];
  for (const [, id, label] of SETTINGS_VIEW) if (!hasCantonese(label, app)) missing.push(`${id}: ${label}`);
  for (const {label} of PERSONALIZATION_SETTINGS) if (!hasCantonese(label, app)) missing.push(`personalization: ${label}`);
  for (const title of Object.values(PERSONALIZATION_TABS)) if (!hasCantonese(title, app) && title !== 'Private local history') missing.push(`tab: ${title}`);
  assert.deepEqual(missing, []);
});

test('every stored setting is indexed by label or carries an explicit reason', () => {
  const indexed = new Set(PERSONALIZATION_SETTINGS.map(row => row.label));
  for (const key of Object.keys(DEFAULTS)) {
    if (Object.hasOwn(NOT_A_FIELD, key)) { assert.ok(NOT_A_FIELD[key].length > 20, key); continue; }
    const label = SETTING_LABELS[key];
    assert.ok(label, `${key} has a label in the label table`);
    assert.ok(indexed.has(label), `${key} (${label}) is in the personalization settings index`);
  }
  for (const label of ['Focus', 'Low stimulation', 'Time awareness', 'One thing at a time', 'Momentum', 'Next action', 'Narrator', 'Narration language', 'English voice', 'Cantonese voice', 'Rate', 'Pitch', 'Mode name']) assert.ok(indexed.has(label), label);
});

test('every indexed setting has field help and sits on a real tab', () => {
  for (const {tab, label} of PERSONALIZATION_SETTINGS) {
    assert.ok(Object.hasOwn(PERSONALIZATION_TABS, tab), `${label} names tab ${tab}`);
    assert.ok(FIELD_HELP.has(label), `${label} has field help`);
  }
  assert.equal(new Set(PERSONALIZATION_SETTINGS.map(row => row.label)).size, PERSONALIZATION_SETTINGS.length, 'a label appears once');
});

test('the palette gets one command per setting and per tab, each opening the right tab with a Cantonese label', () => {
  const opened = [];
  const commands = personalizationSettingCommands({open: (tab, label) => opened.push([tab, label]), translate: text => COPY[text] ?? text});
  assert.equal(commands.length, PERSONALIZATION_SETTINGS.length + Object.keys(PERSONALIZATION_TABS).length);
  assert.equal(new Set(commands.map(command => command.id)).size, commands.length, 'identities are unique');
  const low = commands.find(command => command.id === 'personalization:setting:low-stimulation');
  assert.equal(low.label.yue, '減少刺激');
  low.run();
  assert.deepEqual(opened.at(-1), ['attention', 'Low stimulation']);
  commands.find(command => command.id === 'personalization:tab:appearance').run();
  assert.deepEqual(opened.at(-1), ['appearance', 'Appearance']);
  assert.throws(() => personalizationSettingCommands({}), /open\(tab, label\) is required/);
});
