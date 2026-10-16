import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = await fs.readFile(new URL('../src/renderer/modern.css', import.meta.url), 'utf8');
const rule = selector => {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, selector + ' is styled');
  return css.slice(start + selector.length + 1, css.indexOf('}', start));
};

test('the Availability cell wraps its text without cutting it off', () => {
  const cell = rule('#file-list>tr>td.availability');
  assert.match(cell, /white-space:normal/);
  assert.match(cell, /overflow:visible/);
  assert.match(cell, /text-overflow:clip/);
});

test('the availability icon stays beside the wrapped text instead of on its own line', () => {
  const content = rule('#file-list>tr>td.availability .availability-content');
  assert.match(content, /flex-wrap:nowrap/);
  assert.match(content, /align-items:flex-start/);
  assert.match(rule('#file-list>tr>td.availability .availability-content>:not(span)'), /flex:none/);
  const label = rule('#file-list>tr>td.availability .availability-content>span');
  assert.match(label, /flex:1 1 auto/);
  assert.match(label, /min-width:0/);
});
