import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const rule = (css, selector) => css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))?.[1] || '';

// A content-sized grid column let one wide child (the converter tabs) stretch every panel past a 360 pixel screen.
test('the workspace column may shrink below its content so panels fit narrow screens', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  assert.match(rule(css, 'main'), /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /main>\*,\[role=tabpanel\]>\*\{min-width:0\}/);
});

// Long bilingual button labels must wrap inside the panel instead of running off the screen.
test('buttons inside panels wrap their labels within the panel width', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  const buttons = css.match(/\[role=tabpanel\] :is\([^)]*md-filled-button[^)]*\)\{([^}]*)\}/)?.[1] || '';
  assert.match(buttons, /max-inline-size:100%/);
  assert.match(buttons, /white-space:normal/);
});

// The Home grid must drop to one column on a 360 pixel screen without a media query, and its cards must not push the page wider.
test('the Home grid shrinks to one column and cards keep their text inside', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  const grid = rule(css, '.home-grid');
  assert.match(grid, /grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,14rem\),1fr\)\)/);
  assert.ok(14 * 16 * 2 + 12 > 320, 'two 14rem columns do not fit the 320 pixel content width of a 360 pixel screen');
  // The shared list rule gives every later item a top margin, which would push all but the first card out of line.
  assert.match(rule(css, '.home-grid>li,.home-grid>li+li'), /min-inline-size:0;margin:0/);
  const card = rule(css, '.home-card');
  assert.match(card, /box-sizing:border-box/); assert.match(card, /inline-size:100%/); assert.match(card, /overflow:hidden/);
  assert.match(rule(css, '.home-name'), /overflow-wrap:anywhere/); assert.match(rule(css, '.home-desc'), /overflow-wrap:anywhere/);
  assert.match(rule(css, '.app-bar'), /flex-wrap:wrap/); assert.match(rule(css, '.app-bar h1'), /min-inline-size:0/);
});

// Home cards have hover, focus and pressed state layers, and every Home animation stops for people who ask for reduced motion.
test('Home cards have state layers and a visible focus ring, and motion respects reduced motion', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  assert.match(css, /\.home-card:hover::before\{opacity:\.08\}/); assert.match(css, /\.home-card:active::before\{opacity:\.12\}/);
  assert.match(rule(css, '.home-card:focus-visible'), /outline:3px solid var\(--md-sys-color-primary\)/);
  assert.match(css, /@keyframes mfe-axis-forward/); assert.match(css, /@keyframes mfe-axis-back/);
  assert.match(css, /#home-view:not\(\[hidden\]\)\{animation:mfe-axis-back 250ms var\(--md-sys-motion-easing-emphasized-decelerate\) both\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{#home-view:not\(\[hidden\]\)\{animation:none\}\.home-card,\.home-card::before\{transition:none\}\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\[role=tabpanel\]:not\(\[hidden\]\),\.changelog-entry\{animation:none\}\}/);
});

// On a phone a section's app bar keeps only back, title, a search icon and a commands icon; search opens on request.
test('a section app bar is compact on narrow screens and search opens on request', async () => {
  const css = await fs.readFile('browser-extension/options.css', 'utf8');
  const html = await fs.readFile('browser-extension/options.html', 'utf8');
  assert.match(css, /\.compact-only\{display:none\}/);
  assert.match(css, /@media\(max-width:599px\)\{html\[data-view=section\] \.app-bar\{flex-wrap:nowrap;gap:4px\}/);
  assert.match(css, /html\[data-view=section\] \.app-bar>#palette-open\{display:none\}/);
  assert.match(css, /html\[data-view=section\]:not\(\[data-searching=true\]\) \.app-bar>mfe-search\{display:none\}/);
  assert.match(html, /<md-icon-button id="search-toggle" class="compact-only" type="button" aria-expanded="false" aria-controls="search">/);
  assert.match(html, /<md-icon-button id="palette-icon" class="compact-only" type="button">/);
});

// The popup mark sat on a light container with the dark theme's light text colour, so it was invisible.
test('the popup app mark uses the on-container colour of its own container', async () => {
  const css = await fs.readFile('browser-extension/popup.css', 'utf8');
  const mark = rule(css, '.app-mark');
  assert.match(mark, /background:var\(--md-sys-color-secondary-container\)/);
  assert.match(mark, /color:var\(--md-sys-color-on-secondary-container\)/);
});
