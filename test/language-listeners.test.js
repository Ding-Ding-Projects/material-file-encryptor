import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('views that cache text are relabelled after the preferences hold the new language', () => {
  assert.match(source, /function subscribeLanguage\(listener\)/);
  const apply = /function applyPreferences\(\) \{([\s\S]*?)\n\}\ncolorQuery/.exec(source)[1];
  assert.match(apply, /notifyLanguageListeners\(\)/);
  assert.ok(apply.indexOf('preferences.language') < apply.indexOf('notifyLanguageListeners()'));
});

test('browser pairing, server preparation and the setup guide use the shared language subscription', () => {
  assert.equal((source.match(/subscribeLanguage,/g) || []).length, 3);
  assert.doesNotMatch(source, /subscribeLanguage:callback=>localSettings\.subscribe/);
});
