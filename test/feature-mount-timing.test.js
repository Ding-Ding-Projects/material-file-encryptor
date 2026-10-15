import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRendererTiming} from '../src/renderer/performance-timing.js';

// Regression: the "Pair a browser" destination rendered blank because its id was missing from the
// timing view allow-list, so the feature-mount timer threw before the view was ever mounted.
test('every mounted feature id is accepted by the feature-mount timer', async () => {
  const app = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  const ids = [...app.matchAll(/mountFeature\('([a-z-]+)'/g)].map(match => match[1]);
  assert.ok(ids.includes('browser-pairing'));
  const timing = createRendererTiming({now: () => 1});
  for (const id of ids) {
    assert.doesNotThrow(() => timing.begin('feature-mount', id), `${id} must be an accepted timing view`);
  }
});
