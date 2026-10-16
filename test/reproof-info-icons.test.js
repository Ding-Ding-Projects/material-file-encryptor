import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const guidance = await fs.readFile(new URL('../src/shared/surface/control-guidance.js', import.meta.url), 'utf8');
const modern = await fs.readFile(new URL('../src/renderer/modern.css', import.meta.url), 'utf8');
const onboarding = await fs.readFile(new URL('../src/renderer/features/onboarding/index.js', import.meta.url), 'utf8');

function guidanceStylesheet() {
  const start = guidance.indexOf("host.initialize('") + "host.initialize('".length;
  const end = guidance.indexOf("');", start);
  return vm.runInNewContext("'" + guidance.slice(start, end) + "'");
}

function rule(css, selector) {
  const match = css.match(new RegExp('(?:^|[}\\s])' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(match, 'Missing rule ' + selector);
  return match[1];
}

test('the information entry is a compact, low emphasis glyph with an unchanged 44 pixel target', () => {
  const css = guidanceStylesheet();
  const entry = rule(css, '.entry');
  assert.match(entry, /--md-icon-button-icon-size:18px/);
  assert.match(entry, /--md-icon-button-state-layer-width:28px/);
  assert.match(entry, /--md-icon-button-state-layer-height:28px/);
  assert.match(entry, /--md-icon-button-icon-color:var\(--md-sys-color-on-surface-variant/);
  assert.match(entry, /width:28px;height:28px;flex:0 0 28px/);
  assert.match(rule(css, '.entry>svg'), /width:18px;height:18px/);
  // The invisible hit area extends the 28 pixel control to at least 44 by 44 without taking layout space.
  const inset = Number(rule(css, '.entry::after').match(/inset:-(\d+)px/)?.[1]);
  assert.ok(28 + 2 * inset >= 44, 'hit area is only ' + (28 + 2 * inset) + ' pixels');
  assert.match(rule(css, '.entry::after'), /position:absolute/);
  assert.match(guidance, /'touch-target':'none',class:'entry'/);
  // Other icon buttons inside the panel (Close information) keep the full size.
  assert.match(css, /(?:^|\})md-icon-button\{width:48px;height:48px/);
});

test('an entry sits next to its control with a tight gap that leaves its hit area clear', () => {
  const gap = Number(rule(modern, '[data-info-icon-pair]').match(/gap:(\d+)px/)?.[1]);
  assert.ok(gap >= 8, 'the gap must not let the 44 pixel hit area overlap its neighbour');
  assert.ok(gap <= 8, 'the gap must stay tight');
});

test('the setup guide look step names the chosen option instead of its stored value', () => {
  assert.match(onboarding, /LOOK_CHOICE_LABELS = Object\.freeze\(\{en: 'English', yue: 'Cantonese', bilingual: 'English and Cantonese'/);
  assert.match(onboarding, /id === 'look' && Object\.hasOwn\(LOOK_CHOICE_LABELS, value\.detail\) \? t\(LOOK_CHOICE_LABELS\[value\.detail\]\)/);
});

test('an open explanation in a page header never squeezes the page heading', () => {
  const wrap = rule(modern, '.page-header:has(mfe-control-guidance[data-open])');
  assert.match(wrap, /flex-wrap:wrap/);
  const heading = rule(modern, '.page-header:has(mfe-control-guidance[data-open])>:first-child');
  assert.match(heading, /flex:0 0 auto/);
  const actions = rule(modern, '.page-header:has(mfe-control-guidance[data-open])>.header-actions');
  assert.match(actions, /flex:1 1 100%/);
  assert.match(actions, /min-inline-size:0/);
});
