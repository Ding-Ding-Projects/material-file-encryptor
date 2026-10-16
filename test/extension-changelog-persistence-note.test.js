import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// The options workspace opens on Home (or on the section named in the address), so a stored section is not restored
// on reload. The changelog row must not say that the selected tab persists.
test('the changelog persistence note matches the Home-first startup behaviour', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../contracts/feature-delivery.json', import.meta.url), 'utf8'));
  const row = manifest.features.find(item => item.surface === 'extension' && item.id === 'changelog');
  const note = row.completion.persistence;
  assert.doesNotMatch(note, /tab persists/i);
  assert.match(note, /opens on Home/i);
  assert.match(note, /filter is not stored/i);
  const options = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8');
  assert.ok(options.includes('const start=hashTab();if(start!==null&&start!==prefs.tab)'));
});
