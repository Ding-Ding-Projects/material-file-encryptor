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

// Regression: the article list rendered as bare centred labels because the pill, start alignment and
// current-entry rules only existed in the desktop stylesheet. The site stylesheet must carry them itself,
// using colour tokens the site actually defines.
test('documentation article list is styled as a list with a highlighted current entry', async () => {
  const css = await read();
  assert.match(css, /\.docs-nav\{[^}]*align-items:flex-start/);
  assert.match(css, /\.docs-nav>md-text-button\{[^}]*border-radius:999px/);
  const current = css.match(/\.docs-nav>md-text-button\[data-current\]\{([^}]*)\}/);
  assert.ok(current, 'the open article has a highlight rule');
  const defined = new Set([...css.matchAll(/(--md-sys-color-[a-z-]+):/g)].map(match => match[1]));
  const site = await fs.readFile('docs/site/site.css', 'utf8');
  for (const match of site.matchAll(/(--md-sys-color-[a-z-]+):/g)) defined.add(match[1]);
  for (const [, token] of current[1].matchAll(/var\((--md-sys-color-[a-z-]+)\)/g)) assert.ok(defined.has(token), token + ' must be defined for the site');
});