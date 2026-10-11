import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDocumentationCatalog, documentHeadings, resolveDocumentLink, parseChangelog } from '../src/features/documentation/catalog.mjs';
import { validateFeatureDelivery, verifyFeatureDeliveryReferences, expectedFeatureApplicability } from '../src/features/documentation/feature-delivery.mjs';
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
  assert.ok(manifest.features.every(row => row.status === 'unverified' && row.builtInteraction === 'unverified' && row.visualEvidence === 'unverified' && row.evidence.length === 0));
  const omitted = structuredClone(manifest); omitted.features.shift();
  assert.ok(validateFeatureDelivery(omitted).length);
  for (const field of ['implementation', 'documentation', 'localization', 'tests', 'evidence']) {
    const candidate = structuredClone(manifest), row = candidate.features[0]; row.status = 'implemented';
    for (const key of ['implementation', 'documentation', 'localization', 'tests', 'evidence']) row[key] = ['proof'];
    row[field] = [];
    assert.ok(validateFeatureDelivery(candidate).some(error => error.includes(`missing ${field}`)), field);
  }
});
const inventory = async () => JSON.parse(await readFile(new URL('../contracts/feature-delivery.json', import.meta.url)));
test('inventory requires explicit scope and cannot exempt an unimplemented product requirement', async () => {
  const manifest = await inventory();
  for (const mutate of [
    row => { delete row.applicability; },
    row => { row.applicability.reason = '   '; },
    row => { row.applicability.scopeReference = {}; },
    row => { row.applicability.scopeReference.entry = 'different-feature'; },
    row => { row.applicability.applies = false; row.applicability.kind = 'not-applicable'; row.implementation = []; },
    row => { row.status = 'not-applicable'; }
  ]) {
    const broken = structuredClone(manifest); mutate(broken.features[0]);
    assert.ok(validateFeatureDelivery(broken).length);
  }
  assert.equal(expectedFeatureApplicability('super-confirmation', 'desktop').applies, true);
  assert.equal(expectedFeatureApplicability('build-entrypoints', 'site').kind, 'repository');
  for (const [id, scope] of [['encrypted-public-builder', 'Private repositories only'], ['discord-status-bridge', 'Status Hub server implementation only'], ['panic-webhooks', 'Status Hub server implementation only'], ['tidbyt-displays', 'Status Hub server implementation only'], ['roblox-visual-realism', 'Roblox/game projects only'], ['readme-prompt-banner', 'Canonical instruction repository only']]) {
    const row = manifest.features.find(item => item.id === id);
    assert.equal(row.applicability.applies, false);
    assert.equal(row.applicability.scopeReference.declaredScope, scope);
    const broken = structuredClone(manifest); broken.features.find(item => item.id === id).applicability.scopeReference.declaredScope = 'All applications';
    assert.ok(validateFeatureDelivery(broken).some(error => error.includes('scopeReference')));
  }
});
test('inventory bounds persistence and requires safe per-path commit references', async () => {
  const manifest = await inventory();
  for (const mutate of [
    row => { delete row.persistence; },
    row => { row.persistence = Array(65).fill('README.md'); },
    row => { row.persistence = ['../outside.md']; },
    row => { row.persistence = ['C:/outside.md']; },
    row => { row.persistence = ['README.md', 'README.md']; }
  ]) { const broken = structuredClone(manifest); mutate(broken.features[0]); assert.ok(validateFeatureDelivery(broken).length); }
  const unbound = structuredClone(manifest); delete unbound.referenceSources[unbound.features[0].implementation[0]];
  assert.ok(validateFeatureDelivery(unbound).some(error => error.includes('unbound')));
  const malformed = structuredClone(manifest); malformed.referenceSources[malformed.features[0].implementation[0]] = '--help';
  assert.ok(validateFeatureDelivery(malformed).some(error => error.includes('unbound')));
  const incomplete = structuredClone(manifest); incomplete.features[0].status = 'implemented';
  assert.ok(validateFeatureDelivery(incomplete).some(error => error.includes('verified built')));
});
test('inventory keeps exact required IDs and both independent surfaces', async () => {
  const manifest = await inventory();
  for (const mutate of [
    candidate => { candidate.features = candidate.features.filter(row => row.surface !== 'site'); },
    candidate => { candidate.features[0] = structuredClone(candidate.features[1]); },
    candidate => { candidate.surfaces = ['desktop', 'desktop']; },
    candidate => { candidate.features[0].id = 'invented-requirement'; }
  ]) { const broken = structuredClone(manifest); mutate(broken); assert.ok(validateFeatureDelivery(broken).length); }
});
test('repository-aware verifier proves blobs and reports absent Git access honestly', async () => {
  const manifest = await inventory(), offline = await verifyFeatureDeliveryReferences(manifest);
  assert.equal(offline.referenceVerification, 'unverified'); assert.equal(offline.checkedReferences, 0);
  const repositoryPath = fileURLToPath(new URL('../', import.meta.url));
  const fixture = structuredClone(manifest); for (const row of fixture.features) for (const field of ['implementation','documentation','localization','tests','evidence','persistence']) row[field] = [];
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim();
  fixture.features[0].implementation = ['src/features/documentation/required-features.mjs'];
  fixture.referenceSources = { 'src/features/documentation/required-features.mjs': revision };
  const actual = await verifyFeatureDeliveryReferences(fixture, { repositoryPath });
  assert.deepEqual(actual.errors, []); assert.equal(actual.referenceVerification, 'verified');
  assert.equal(actual.checkedReferences, 1);
  // Keep one reference for a small deliberate missing-blob check.
  const missing = structuredClone(manifest); for (const row of missing.features) for (const field of ['implementation','documentation','localization','tests','evidence','persistence']) row[field] = [];
  missing.features[0].implementation = ['nonexistent-inventory-reference.md']; missing.referenceSources = { 'nonexistent-inventory-reference.md': revision };
  const rejected = await verifyFeatureDeliveryReferences(missing, { repositoryPath });
  assert.equal(rejected.referenceVerification, 'failed'); assert.equal(rejected.checkedReferences, 0); assert.equal(rejected.errors.length, 1);
  const directory = structuredClone(fixture); directory.features[0].implementation = ['src']; directory.referenceSources = { src: revision };
  const notFile = await verifyFeatureDeliveryReferences(directory, { repositoryPath });
  assert.equal(notFile.referenceVerification, 'failed'); assert.match(notFile.errors[0], /not a file/);
  const noRepository = await mkdtemp(path.join(tmpdir(), 'inventory-no-git-'));
  try { assert.equal((await verifyFeatureDeliveryReferences(manifest, { repositoryPath: noRepository })).referenceVerification, 'unverified'); }
  finally { await rm(noRepository, { recursive: true, force: true }); }
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
