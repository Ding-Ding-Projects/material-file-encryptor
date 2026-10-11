import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Independent required inventory: adding an article requires explicit review here.
const REQUIRED = [
  'README', 'access-local', 'appearance-editor', 'local-personalization',
  'access/README', 'access/local-access', 'appearance/README', 'appearance/raster-workflows',
  'converter/README', 'converter/spreadsheets', 'converter/archive-runtime', 'converter/archive-and-data', 'converter/media-plan', 'converter/minimal-component', 'converter/minimal-runtime',
  'desktop/README', 'desktop/owned-exit-handles', 'desktop/package-integrity', 'desktop/runtime-evidence', 'drive/README',
  'interface/README', 'interface/appearance-editor', 'interface/local-personalization', 'interface/modern-fields', 'interface/personal-vocabulary', 'interface/startup-registration',
  'ollama/README', 'ollama/local-models', 'ollama/native-host', 'ollama/regression-verification', 'ollama/release-provenance',
  'performance/README', 'performance/native-helper', 'performance/native-lifecycle-performance',
  'platform/README', 'platform/current-integration', 'platform/documentation-and-status', 'platform/instruction-currency',
  'release/README', 'release/native-update-controller', 'release/preview-delivery', 'release/preview-verification',
  'schedules/README', 'schedules/external-sources', 'storage/README', 'storage/file-history-activity', 'storage/git-transport', 'storage/history-and-recycle-bin', 'storage/native-vault', 'storage/transfer-lifecycle',
  'surface-foundation/README', 'surface-foundation/coverage', 'surface-foundation/integration', 'surface-foundation/layout-and-notifications', 'surface-foundation/updates-panel', 'surface-foundation/workflow-handoffs',
].map(name => `docs/features/${name}.md`).sort();
const normalized = text => text.replace(/\r\n?/g, '\n');
const digest = text => createHash('sha256').update(normalized(text)).digest('hex');
const sorted = values => [...values].sort();
const literals = text => sorted([...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]));
const code = text => sorted([...normalized(text).matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(match => match[1]));
const links = text => sorted([...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1].replace(/\.zh-HK\.md(?=#|$)/, '.md')));
async function list(directory) {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, item.name);
    if (item.isDirectory()) files.push(...await list(file)); else if (item.name.endsWith('.md')) files.push(file);
  }
  return files;
}
function validate(manifest, texts, catalog) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceLocale, 'en'); assert.equal(manifest.targetLocale, 'zh-HK');
  assert.equal(manifest.normalization, 'UTF-8 with LF line endings');
  assert.deepEqual(sorted([...texts.keys()].filter(file => !file.endsWith('.zh-HK.md'))), REQUIRED, 'Required source inventory differs');
  assert.deepEqual(sorted(manifest.pairs.map(pair => pair.source)), REQUIRED, 'Language pair inventory differs');
  assert.equal(new Set(manifest.pairs.map(pair => pair.translation)).size, REQUIRED.length, 'Duplicate target');
  for (const pair of manifest.pairs) {
    assert.equal(pair.translation, pair.source.replace(/\.md$/, '.zh-HK.md'), 'Invalid target');
    const source = texts.get(pair.source), target = texts.get(pair.translation);
    assert.equal(typeof source, 'string', 'Missing source'); assert.equal(typeof target, 'string', 'Missing translation');
    assert.match(target, /\p{Script=Han}/u, 'Translation lacks Cantonese text');
    assert.equal(pair.sourceSha256, digest(source), `Stale source binding: ${pair.source}`);
    assert.equal(pair.translationSha256, digest(target), `Stale translation binding: ${pair.translation}`);
    assert.deepEqual(literals(target), literals(source), `Literal drift: ${pair.source}`);
    assert.deepEqual(code(target), code(source), `Code drift: ${pair.source}`);
    assert.deepEqual(links(target), links(source), `Link drift: ${pair.source}`);
    assert.ok(catalog.articles.includes(pair.source) && catalog.articles.includes(pair.translation), 'Missing publication entry');
  }
  assert.deepEqual(sorted([...texts.keys()]), sorted(manifest.pairs.flatMap(pair => [pair.source, pair.translation])), 'Unpaired article');
}
const manifest = JSON.parse(await fs.readFile('docs/site/language-pairs.json', 'utf8'));
const catalog = JSON.parse(await fs.readFile('docs/site/content-catalog.json', 'utf8'));
const texts = new Map(await Promise.all((await list('docs/features')).map(async file => [file, await fs.readFile(file, 'utf8')])));
test('every required feature article has a content-bound Cantonese pair and publication route', () => validate(manifest, texts, catalog));
test('language completeness rejects omitted pair, target, publication route and new unreviewed source', () => {
  const omitted = structuredClone(manifest); omitted.pairs.pop(); assert.throws(() => validate(omitted, texts, catalog));
  const missing = new Map(texts); missing.delete(manifest.pairs[0].translation); assert.throws(() => validate(manifest, missing, catalog));
  const routes = structuredClone(catalog); routes.articles = routes.articles.filter(file => file !== manifest.pairs[0].translation); assert.throws(() => validate(manifest, texts, routes));
  const added = new Map(texts); added.set('docs/features/unreviewed.md', '# New'); assert.throws(() => validate(manifest, added, catalog));
});
test('language completeness rejects stale hashes, changed code, missing literal and unsafe target', () => {
  const stale = structuredClone(manifest); stale.pairs[0].sourceSha256 = '0'.repeat(64); assert.throws(() => validate(stale, texts, catalog));
  const badPath = structuredClone(manifest); badPath.pairs[0].translation = '../outside.md'; assert.throws(() => validate(badPath, texts, catalog));
  const pair = manifest.pairs.find(pair => texts.get(pair.source).includes('```'));
  const changed = new Map(texts); changed.set(pair.translation, texts.get(pair.translation).replace('```', '```\nchanged'));
  const rebound = structuredClone(manifest); rebound.pairs.find(row => row.source === pair.source).translationSha256 = digest(changed.get(pair.translation));
  assert.throws(() => validate(rebound, changed, catalog));
  const literalPair = manifest.pairs.find(pair => literals(texts.get(pair.source)).length);
  const removed = new Map(texts); removed.set(literalPair.translation, texts.get(literalPair.translation).replace(/`[^`\n]+`/, 'omitted'));
  const literalRebound = structuredClone(manifest); literalRebound.pairs.find(row => row.source === literalPair.source).translationSha256 = digest(removed.get(literalPair.translation));
  assert.throws(() => validate(literalRebound, removed, catalog));
});
