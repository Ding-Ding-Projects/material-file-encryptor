import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accentRoles, applyAccentRoles, contrastRatio, parseHex} from '../src/shared/local-ux/accent-roles.js';

const SEEDS = ['#52643f', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000', '#808080', '#7a3fd1', '#ff8800'];

test('every seed yields readable roles in both themes', () => {
  for (const seed of SEEDS) {
    for (const dark of [false, true]) {
      const roles = accentRoles(seed, dark);
      assert.ok(roles, seed);
      assert.ok(roles.passes, `${seed} dark=${dark} ratio ${roles.ratio}`);
      assert.ok(contrastRatio(parseHex(roles.primary), parseHex(roles.onPrimary)) >= 4.5);
      assert.ok(contrastRatio(parseHex(roles.primaryContainer), parseHex(roles.onPrimaryContainer)) >= 4.5);
    }
  }
});

test('different accents produce different primary tokens and the hue follows the seed', () => {
  const red = accentRoles('#d02020', false), blue = accentRoles('#2040d0', false);
  assert.notEqual(red.primary, blue.primary);
  const [r, , b] = ['r', 'g', 'b'].map(key => parseHex(red.primary)[key]);
  assert.ok(r > b, 'a red accent stays reddish');
  assert.notEqual(accentRoles('#d02020', false).primary, accentRoles('#d02020', true).primary);
});

test('invalid seeds are rejected', () => {
  assert.equal(accentRoles('red'), null);
  assert.equal(accentRoles('#12345'), null);
});

function fakeRoot() {
  const properties = new Map(), attributes = new Set();
  return {
    properties, attributes,
    style: {setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name)},
    setAttribute: name => attributes.add(name), removeAttribute: name => attributes.delete(name)
  };
}

test('applyAccentRoles writes both variants and clears them for the default seed', () => {
  const root = fakeRoot();
  const result = applyAccentRoles(root, '#2040d0', '#52643f');
  assert.ok(result.light.passes && result.dark.passes);
  assert.ok(root.attributes.has('data-local-accent'));
  assert.equal(root.properties.get('--local-ux-accent-light-primary'), result.light.primary);
  assert.equal(root.properties.get('--local-ux-accent-dark-on-primary'), result.dark.onPrimary);
  assert.equal(applyAccentRoles(root, '#52643F', '#52643f'), null);
  assert.equal(root.properties.size, 0);
  assert.ok(!root.attributes.has('data-local-accent'));
});

test('the stylesheet reads the accent custom properties for both themes', () => {
  const css = fs.readFileSync(new URL('../src/renderer/modern.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-local-accent\]\{--primary:var\(--local-ux-accent-light-primary\)/);
  assert.match(css, /:root\[data-local-accent\]\[data-theme=dark\]\{--primary:var\(--local-ux-accent-dark-primary\)/);
});

test('the personalization feature applies the accent roles', () => {
  const source = fs.readFileSync(new URL('../src/renderer/features/personalization/index.js', import.meta.url), 'utf8');
  assert.match(source, /applyAccentRoles\(root,effective\.seed,DEFAULTS\.seed\)/);
});
