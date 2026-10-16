import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const rule = (css, selector) => css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))?.[1] || '';

// With overflow-wrap:anywhere and a zero minimum size the section title could be squeezed narrower than its longest
// word, so "Personalization" broke mid-word at 1280x800. The title keeps its natural width (capped by the row width) and breaks inside a word only when nothing else fits.
test('the app bar title keeps its longest word whole before the bar wraps', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  const title = rule(css, '.app-bar h1');
  assert.doesNotMatch(title, /overflow-wrap:\s*anywhere/);
  assert.match(title, /overflow-wrap:\s*break-word/);
  assert.match(title, /flex:\s*1 0 auto/);
  assert.match(title, /max-inline-size:\s*100%/);
});
