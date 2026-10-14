import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {extensionGalleryRecords, renderExtensionGallery} from '../docs/site/publication.mjs';

const inventory = JSON.parse(await fs.readFile('docs/site/extension-gallery.json', 'utf8'));

// Copies the inventory and its images into a scratch root, optionally changing the inventory first.
async function scratch(change = value => value) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-extension-gallery-'));
  await fs.mkdir(path.join(root, 'docs/site'), {recursive: true});
  for (const record of inventory.records) {
    const target = path.join(root, 'docs', record.path);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.copyFile(path.join('docs', record.path), target);
  }
  await fs.writeFile(path.join(root, 'docs/site/extension-gallery.json'), JSON.stringify(change(structuredClone(inventory))));
  return root;
}

test('the reviewed extension captures validate against their files', async () => {
  const result = await extensionGalleryRecords(process.cwd());
  assert.equal(result.records.length, inventory.records.length);
  assert.ok(result.records.length > 0);
});

test('a changed hash, an extra field, a desktop path or an invented capture time is rejected', async () => {
  const cases = [
    [value => { value.records[0].sha256 = 'f'.repeat(64); return value; }, /hash mismatch/],
    [value => { value.records[0].note = 'extra'; return value; }, /fields differ/],
    [value => { value.records[0].path = 'images/captures/desktop-locked.png'; return value; }, /Invalid extension gallery asset/],
    [value => { value.records[0].capturedAt = '2026-10-14T12:00:00Z'; return value; }, /validated provenance/],
  ];
  for (const [change, pattern] of cases) {
    const root = await scratch(change);
    try { await assert.rejects(extensionGalleryRecords(root), pattern); }
    finally { await fs.rm(root, {recursive: true, force: true}); }
  }
});

test('the extension section is labelled and never claims a desktop gallery role', async () => {
  const html = renderExtensionGallery(await extensionGalleryRecords(process.cwd()));
  assert.match(html, /<h2 id="browser-extension-captures-title">Browser extension captures<\/h2>/);
  assert.doesNotMatch(html, /data-gallery-role/);
  assert.match(html, /Capture time<\/dt><dd>Unavailable/);
});
