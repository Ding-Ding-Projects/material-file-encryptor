import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDocumentationCatalog, documentHeadings, resolveDocumentLink, parseChangelog } from '../src/features/documentation/catalog.mjs';
import { validateFeatureDelivery } from '../src/features/documentation/feature-delivery.mjs';
import { createApplicationStatus } from '../src/features/documentation/status-service.mjs';
import { filterChanges } from '../src/renderer/features/documentation/changelog.js';
import { resolveCatalogUrl } from '../src/renderer/features/documentation/markdown.js';

test('catalog includes every nested Markdown article, full body and duplicate heading anchors', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'documentation-test-'));
  try {
    await mkdir(path.join(root, 'docs/wiki'), { recursive: true });
    await writeFile(path.join(root, 'docs/README.md'), '# Index\n[Wiki](wiki/Home.md#second)\n');
    await writeFile(path.join(root, 'docs/wiki/Home.md'), '# Home\n## Second\nComplete final paragraph.\n## Second\n');
    await writeFile(path.join(root, 'CHANGELOG.md'), '# Changes\n## Version 1 - 2026-10-10\nReleased content.\n');
    const catalog = await buildDocumentationCatalog(root);
    assert.equal(catalog.documents.length, 3);
    assert.equal(catalog.changelog[0].date, '2026-10-10');
    assert.match(catalog.documents[1].markdown, /Complete final paragraph/);
    assert.deepEqual(resolveDocumentLink(catalog, 'docs/README', 'wiki/Home.md#second'), { id: 'docs/wiki/Home', anchor: 'second' });
    assert.equal(resolveDocumentLink(catalog, 'docs/README', 'javascript:alert(1)'), null);
    assert.equal(resolveDocumentLink(catalog, 'docs/README', '../../outside.md'), null);
    assert.equal(resolveDocumentLink(catalog, 'docs/README', 'wiki/Home.md#absent'), null);
    assert.deepEqual(catalog.documents[1].headings.map(row => row.anchor), ['home', 'second', 'second-1']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('fenced code does not create headings and changelog dates remain explicit', () => {
  assert.deepEqual(documentHeadings('# A\n```\n# Hidden\n```\n# A').map(row => row.anchor), ['a', 'a-1']);
  assert.deepEqual(parseChangelog('# Changes\n## 1.0 - 2026-10-10\nReady\n## Unreleased\nPending').map(row => row.date), ['2026-10-10', null]);
});
test('changelog date and category filters exclude unknown dates only when bounded', () => {
  const entries = [{ date: null, category: 'fix' }, { date: '2026-10-09', category: 'fix' }, { date: '2026-10-10', category: 'feature' }];
  assert.equal(filterChanges(entries).length, 3);
  assert.deepEqual(filterChanges(entries, { from: '2026-10-10', to: '2026-10-10', category: 'feature' }), [entries[2]]);
  assert.deepEqual(filterChanges(entries, { to: '2026-10-09' }), [entries[1]]);
});
test('renderer URL allowlist rejects unsafe and uncatalogued targets', () => {
  const catalog = { documents: [{ id: 'docs/home', source: 'docs/home.md', headings: [{ anchor: 'ok' }] }], assets: [{ source: 'docs/bad.png', dataUrl: 'javascript:alert(1)' }] };
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'javascript:alert(1)'), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'file:///secret'), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', '../../secret.md'), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'home.md#absent'), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'bad.png', true), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'https://example.com/image.png', true), null);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', 'https://example.com/').external, true);
  assert.equal(resolveCatalogUrl(catalog, 'docs/home.md', '#ok').anchor, 'ok');
});
test('required inventory rejects omission and each missing proof dimension', async () => {
  const manifest = JSON.parse(await readFile(new URL('../contracts/feature-delivery.json', import.meta.url)));
  assert.deepEqual(validateFeatureDelivery(manifest), []);
  const omitted = structuredClone(manifest); omitted.features.shift();
  assert.ok(validateFeatureDelivery(omitted).length);
  for (const field of ['implementation', 'documentation', 'localization', 'tests', 'evidence']) {
    const candidate = structuredClone(manifest), row = candidate.features[0]; row.status = 'implemented';
    for (const key of ['implementation', 'documentation', 'localization', 'tests', 'evidence']) row[key] = ['proof'];
    row[field] = [];
    assert.ok(validateFeatureDelivery(candidate).some(error => error.includes(`missing ${field}`)), field);
  }
});
test('status without client is explicit and configured snapshots cannot expose secrets', async () => {
  const missing = await createApplicationStatus({});
  assert.equal(missing.snapshot().code, 'CLIENT_NOT_CONFIGURED');
  let checkpoint;
  const service = await createApplicationStatus({ createClient: async () => ({ status: () => ({ degraded: false, sessionKey: 'sensitive', lastError: 'private path', lastSuccessAt: '2026-10-10T00:00:00Z' }), pollAtCheckpoint: async value => { checkpoint = value; }, finish: async state => state }), collectWorktrees: async () => [{ path: 'private' }] });
  assert.deepEqual(Object.keys(service.snapshot()).sort(), ['lastSuccessAt', 'message', 'state']);
  await service.checkpoint('A step', { percent: 1 }); assert.equal(checkpoint.summary, 'A step');
  assert.equal(await service.finish('waiting'), 'waiting');
});
