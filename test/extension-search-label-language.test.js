import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// The shared search control builds its input label when setLanguage runs, so the localized label attribute must be
// assigned first. Assigning it afterwards leaves the field one render behind and stuck in English.
for (const page of ['options', 'popup']) {
  test(`${page} sets the localized search label before asking the search control to render`, async () => {
    const source = await fs.readFile(new URL(`../browser-extension/${page}.js`, import.meta.url), 'utf8');
    const label = source.search(/\$\('search'\)\.setAttribute\('label'/);
    const render = source.search(/\$\('search'\)\.setLanguage\(/);
    assert.ok(label >= 0 && render >= 0, 'both search calls are present');
    assert.ok(label < render, 'label attribute is assigned before setLanguage renders the field');
  });
}
