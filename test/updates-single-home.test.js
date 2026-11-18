import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('updates has one home: the full panel lives in Settings > Updates and no separate page is registered', () => {
  const app = read('../src/renderer/app.js'), settings = read('../src/renderer/features/settings-layout/index.js');
  assert.doesNotMatch(app, /mountFeature\('updates'/, 'no separate Updates page');
  assert.match(app, /module\.mountUpdates\(settingsLayoutHandle\.updatesHost,/, 'every update control mounts inside Settings');
  assert.match(app, /embedUpdates:true/);
  assert.match(settings, /embedUpdates \? updatesHost : row\(L\('Check for updates'\)/);
  assert.match(settings, /return \{setLanguage: render, select, updatesHost,/);
  // The install confirmation, the update events and the transition notices are unchanged.
  assert.match(app, /if\(action==='install'&&!await superConfirm\('desktop\.install-update'\)\)return undefined;/);
  assert.match(app, /subscribe:callback=>api\.onFeatureEvent\?\.\('updates'/);
});

test('every route to the old Updates page lands on Settings > Updates', () => {
  const app = read('../src/renderer/app.js'), nav = read('../src/renderer/features/shell/navigation.js');
  assert.match(app, /foundation\.shell\.activate=id=>id==='updates'\?openUpdatesSettings\(\):activate\(id\);/);
  assert.match(app, /function openUpdatesSettings\(\)\{[^\n]*?const shown=foundation\.shell\.activate\('settings'\);settingsLayoutHandle\?\.select\('updates'\)/);
  assert.match(app, /label:t\('Open Updates'\),run:\(\)=>openUpdatesSettings\(\)/);
  assert.doesNotMatch(app, /openTab\(\{id:'updates'/);
  assert.match(nav, /if\(id==='updates'&&this\.labels\?\.has\('settings'\)\)\{this\.onActivate\('settings'\);/);
  // The tree keeps its Updates row under Settings although no Updates page is registered any more.
  assert.match(nav, /hasChild\(id\)\{return Boolean\(this\.labels\?\.has\(id\)\|\|\(id==='updates'&&this\.labels\?\.has\('settings'\)\)\);\}/);
  assert.match(nav, /for\(const child of GROUPS\[group\]\.slice\(1\)\)if\(this\.hasChild\(child\)\)/);
});
