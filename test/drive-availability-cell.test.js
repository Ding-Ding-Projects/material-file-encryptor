import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SHELL_COPY } from '../src/renderer/features/shell/copy.js';

const css = await fs.readFile(new URL('../src/renderer/modern.css', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
const rule = selector => {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, selector + ' is styled');
  return css.slice(start + selector.length + 1, css.indexOf('}', start));
};

test('the Availability cell stays on one line, so rows keep the design height', () => {
  const cell = rule('#file-list>tr>td.availability');
  assert.match(cell, /white-space:nowrap/);
  assert.match(cell, /overflow:visible/);
  assert.doesNotMatch(cell, /overflow-wrap:anywhere/);
  const content = rule('#file-list>tr>td.availability .availability-content');
  assert.match(content, /flex-wrap:nowrap/);
  assert.match(content, /align-items:center/);
  assert.match(rule('#file-list>tr>td.availability .availability-content>:not(span)'), /flex:none/);
  assert.match(rule('#file-list>tr>td.availability .availability-content>span'), /white-space:nowrap/);
});

test('the Availability label is short, has an icon, and explains itself in a tooltip and help text', () => {
  assert.match(app, /label\.textContent = t\(file\.offline \? 'On this PC' : 'Online only'\)/);
  assert.match(app, /av\.title = availabilityHelp; av\.setAttribute\('data-help-text',availabilityHelp\); av\.setAttribute\('aria-description',availabilityHelp\);/);
  assert.match(app, /av\.append\(icon\(file\.offline \? 'computer' : 'cloud'\),label\)/);
  for (const key of ['Online only', 'On this PC', 'An encrypted copy is kept on this PC, so it opens without a connection.', 'Kept only in encrypted storage. Opening it reads the storage folder.']) assert.ok(SHELL_COPY[key], key);
  for (const key of ['Online only', 'On this PC']) assert.ok(SHELL_COPY[key].length <= 6, 'the Cantonese label is short too');
});
