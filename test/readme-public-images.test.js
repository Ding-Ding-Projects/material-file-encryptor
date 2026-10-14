import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {publicImages} from '../docs/site/public-images.mjs';

// The documentation site renders README.md, and its build rejects any image without a reviewed
// public entry. Checking here catches a missing entry before a push reaches the site workflow.
test('every README image has a reviewed public image entry', async () => {
  const readme = await fs.readFile('README.md', 'utf8');
  const sources = new Set(publicImages.map(image => image.source));
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+\.png)\)/g)].map(match => match[1]);
  assert.ok(images.length > 0, 'README.md should show at least one capture');
  const missing = images.filter(image => !sources.has(image));
  assert.deepEqual(missing, [], 'Add these README images to docs/site/public-images.mjs');
});
