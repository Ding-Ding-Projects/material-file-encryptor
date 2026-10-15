import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Regression: the drive file table clipped its selection control to a circle plus an ellipsis
// because the column was narrower than the Material radio and its state layer.
test('drive file table selection column is wide enough and never ellipsizes its control', async () => {
  const css = await fs.readFile(new URL('../src/renderer/modern.css', import.meta.url), 'utf8');
  const rule = /\.table-scroll th\.select-column,#file-list>tr>td:first-child\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'selection column rule exists in modern.css');
  const width = Number(/(?:^|;)width:(\d+)px/.exec(rule[1])?.[1]);
  const minWidth = Number(/min-width:(\d+)px/.exec(rule[1])?.[1]);
  assert.ok(width >= 48 && minWidth >= 48, 'column holds the 48px Material radio touch target');
  assert.match(rule[1], /overflow:visible/);
  assert.match(rule[1], /text-overflow:clip/);
  const base = await fs.readFile(new URL('../src/renderer/style.css', import.meta.url), 'utf8');
  for (const narrow of base.matchAll(/\.select-column\{width:(\d+)px\}/g)) {
    assert.ok(Number(narrow[1]) < width, 'the narrow legacy width is overridden by the higher-specificity rule');
  }
});
