import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preferenceChangeScope} from '../src/renderer/preference-scope.js';
import {DEFAULTS} from '../src/shared/local-ux/store.js';

const clone = value => structuredClone(value);

test('a theme, accent, density or font change is appearance-only', () => {
  for (const patch of [{theme: 'dark'}, {seed: '#336699'}, {density: 'compact'}, {fontScale: 1.25}, {fontFamily: 'Arial'}, {motion: 'reduced'}, {attention: {...DEFAULTS.attention, focus: true}}]) {
    assert.equal(preferenceChangeScope(DEFAULTS, {...clone(DEFAULTS), ...patch}), 'appearance', JSON.stringify(patch));
  }
});

test('language, wording, narration and school mode need the full refresh', () => {
  for (const patch of [{language: 'yue'}, {emoji: true}, {funnyEnglish: 1}, {displayName: 'Other'}, {narrator: {...DEFAULTS.narrator, enabled: true}}, {school: {enabled: true, name: 'School mode'}}]) {
    assert.equal(preferenceChangeScope(DEFAULTS, {...clone(DEFAULTS), ...patch}), 'full', JSON.stringify(patch));
  }
  assert.equal(preferenceChangeScope(DEFAULTS, {...clone(DEFAULTS), theme: 'dark', language: 'yue'}), 'full');
});

test('identical settings need nothing and missing settings are treated as full', () => {
  assert.equal(preferenceChangeScope(DEFAULTS, clone(DEFAULTS)), 'none');
  assert.equal(preferenceChangeScope(null, DEFAULTS), 'full');
});

test('the renderer applies appearance-only changes without re-rendering the views', () => {
  const source = fs.readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /scope==='appearance'\)applyThemeOnly\(\)/);
  const body = /function applyThemeOnly\(\) \{([\s\S]*?)\n\}/.exec(source)[1];
  assert.doesNotMatch(body, /render\(|changeView|setLanguage|refresh\(/);
});
