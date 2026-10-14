import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// The document tools host is a custom element, which is inline by default. Inline padding does not
// wrap its block children, so without display:block the intro and tab strip touch the screen edge.
test('the public document tools host is a block so the container padding applies to its content', async () => {
  const css = await fs.readFile('docs/site/site.css', 'utf8');
  const rule = css.match(/\.public-document-tools\{([^}]*)\}/);
  assert.ok(rule, 'site.css defines the public document tools rule');
  assert.match(rule[1], /(^|;)display:block(;|$)/);
});
