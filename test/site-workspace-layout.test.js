import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = () => fs.readFile('docs/site/workspace.css', 'utf8');

// Material web components resolve their label font from the typeface reference tokens and fall back
// to a bare "Roboto" with no generic family. Without a loaded Roboto, the browser then draws every
// documentation list entry in its default serif font. The workspace must define the tokens itself.
test('the workspace stylesheet gives Material list entries the site font stack', async () => {
  const css = await read();
  for (const token of ['--md-ref-typeface-plain', '--md-ref-typeface-brand', '--md-sys-typescale-label-large-font']) {
    assert.match(css, new RegExp(token + ':var\\(--workspace-font\\)'), token + ' must point at the workspace font');
  }
  const stack = css.match(/--workspace-font:var\(--local-ux-font,([^)]*)\)/);
  assert.ok(stack, 'the workspace font token must be defined');
  assert.match(stack[1], /"MFE Noto Sans Regular"/);
  assert.match(stack[1], /sans-serif/, 'the stack ends in a generic family');
  assert.match(css, /font:14px\/1\.5 var\(--workspace-font\)/, 'the root uses the workspace font');
});

test('documentation list entries stay inside their column', async () => {
  const css = await read();
  assert.match(css, /\.docs-nav>md-text-button[^{]*\{[^}]*min-width:0;[^}]*max-width:100%/);
});

test('no workspace rule forces a minimum width above the narrowest supported viewport', async () => {
  const css = await read();
  for (const [, value, unit] of css.matchAll(/(?:^|[;{])min-width:\s*(\d+(?:\.\d+)?)(px|rem|em)\b/g)) {
    const pixels = unit === 'px' ? Number(value) : Number(value) * 16;
    assert.ok(pixels <= 320, 'min-width ' + value + unit + ' exceeds 320px');
  }
  // The only fixed widths used by the stylesheet are wrapped in min() so they never exceed the viewport.
  for (const [, value] of css.matchAll(/(?:^|[;{])min-width:\s*(min\([^)]*\))/g)) assert.match(value, /100%/);
});
