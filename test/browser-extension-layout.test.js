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

// The popup mark sat on a light container with the dark theme's light text colour, so it was invisible.
test('the popup app mark uses the on-container colour of its own container', async () => {
  const css = await fs.readFile('browser-extension/popup.css', 'utf8');
  const mark = rule(css, '.app-mark');
  assert.match(mark, /background:var\(--md-sys-color-secondary-container\)/);
  assert.match(mark, /color:var\(--md-sys-color-on-secondary-container\)/);
});
