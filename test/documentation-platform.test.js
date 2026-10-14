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
  for (const row of manifest.features) {
    const scope = expectedFeatureApplicability(row.id, row.surface);
    assert.equal(row.status, scope.applies ? (row.surface === 'extension' && row.behaviorVerdict === 'missing' ? 'missing' : 'unverified') : 'not-applicable');
    assert.equal(row.builtInteraction, 'unverified'); assert.equal(row.visualEvidence, 'unverified');
    for (const evidence of row.evidence) assert.match(manifest.referenceSources[evidence], /^[a-f0-9]{40}$/);
  }
  const premature = structuredClone(manifest); premature.features.find(row => row.applicability.applies).status = 'implemented';
  assert.ok(validateFeatureDelivery(premature).some(error => error.includes('verified built')));
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
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8', windowsHide: true }).trim();
  fixture.features[0].implementation = ['src/features/documentation/required-features.mjs'];
  fixture.referenceSources = { 'src/features/documentation/required-features.mjs': revision };
  for (const row of fixture.features.filter(row => row.surface === 'extension' && row.applicability.applies)) { row.implementation = row.id==='squirrel-installer' ? ['build-installer.bat','scripts/build.ps1','scripts/browser-native-registration.mjs'] : [row.completion.owner]; row.completion.targets = row.id==='context-menus' ? row.completion.targets.filter(target=>target.state==='browser-owned') : [{state:'missing',surface:null,selector:null,outcome:'Reference fixture target',nextProof:'Reference fixture verification'}]; for(const file of row.implementation) fixture.referenceSources[file] = revision; }
  const actual = await verifyFeatureDeliveryReferences(fixture, { repositoryPath });
  assert.deepEqual(actual.errors, []); assert.equal(actual.referenceVerification, 'verified');
  assert.equal(actual.checkedReferences, Object.keys(fixture.referenceSources).length);
  // Keep one reference for a small deliberate missing-blob check.
  const missing = structuredClone(fixture);
  missing.features[0].implementation = ['nonexistent-inventory-reference.md']; missing.referenceSources = { ...fixture.referenceSources, 'nonexistent-inventory-reference.md': revision }; delete missing.referenceSources['src/features/documentation/required-features.mjs'];
  const rejected = await verifyFeatureDeliveryReferences(missing, { repositoryPath });
  assert.equal(rejected.referenceVerification, 'failed'); assert.equal(rejected.checkedReferences, Object.keys(fixture.referenceSources).length - 1); assert.equal(rejected.errors.length, 1);
  const directory = structuredClone(fixture); directory.features[0].implementation = ['src']; directory.referenceSources = {...fixture.referenceSources, src: revision }; delete directory.referenceSources['src/features/documentation/required-features.mjs'];
  const notFile = await verifyFeatureDeliveryReferences(directory, { repositoryPath });
  assert.equal(notFile.referenceVerification, 'failed'); assert.match(notFile.errors[0], /not a file/);
  const parentRepository = await mkdtemp(path.join(tmpdir(), 'inventory-parent-git-'));
  const noRepository = path.join(parentRepository, 'not-a-repository');
  try {
    execFileSync('git', ['init', '--quiet', '--template=', parentRepository], { windowsHide: true, encoding: 'utf8' });
    await mkdir(noRepository);
    // An empty child alone discovers its parent, so it is not a no-repository fixture.
    const inherited = await verifyFeatureDeliveryReferences(fixture, { repositoryPath: noRepository });
    assert.equal(inherited.referenceVerification, 'failed');
    assert.equal(inherited.errors.length, Object.keys(fixture.referenceSources).length);
    // A local discovery boundary is deterministic even when the temp directory
    // itself lives inside another checkout. No process-wide Git settings change.
    await writeFile(path.join(noRepository, '.git'), 'gitdir: ./absent-owned-metadata\n');
    const unavailable = await verifyFeatureDeliveryReferences(manifest, { repositoryPath: noRepository });
    assert.equal(unavailable.referenceVerification, 'unverified');
    assert.equal(unavailable.checkedReferences, 0);
    assert.deepEqual(unavailable.errors, []);
    assert.match(unavailable.reason, /Git repository access is unavailable/);
  } finally { await rm(parentRepository, { recursive: true, force: true }); }
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

test('extension inventory rejects whole-family omission, borrowed ownership and missing completion evidence', async () => {
 const manifest = await inventory(); assert.equal(manifest.features.length,315);
 assert.equal(manifest.features.filter(row=>row.surface==='extension').length,105);
 for(const mutate of [m=>m.features=m.features.filter(row=>row.surface!=='extension'),m=>m.features.push(structuredClone(m.features.find(row=>row.surface==='extension'))),m=>delete m.features.find(row=>row.surface==='extension').completion.owner,m=>delete m.features.find(row=>row.surface==='extension').completion.targets[0].nextProof,m=>m.features.find(row=>row.surface==='extension').completion.targets[0].surface='desktop:view-settings',m=>m.extensionTargets[0].route='src/renderer/index.html',m=>m.features.find(row=>row.surface==='extension').status='implemented']) {const broken=structuredClone(manifest);mutate(broken);assert.ok(validateFeatureDelivery(broken).length);}
});

test('assessment provenance cannot disappear while independent verdicts remain admitted', async () => {
 const manifest = await inventory();
 for (const key of ['assessmentContext','assessmentHistory','currentAssessmentContext']) { const broken=structuredClone(manifest); delete broken[key]; assert.ok(validateFeatureDelivery(broken).some(error=>error.includes(key)), key); }
 for(const [key,field] of [['assessmentContext','baseline'],['assessmentContext','storageReceipt'],['currentAssessmentContext','ownership']]) {const broken=structuredClone(manifest);delete broken[key][field];assert.ok(validateFeatureDelivery(broken).some(error=>error.includes(key)));}
 const broken=structuredClone(manifest);delete broken.assessmentHistory[0].scope;assert.ok(validateFeatureDelivery(broken).some(error=>error.includes('assessmentHistory')));
 assert.deepEqual(validateFeatureDelivery(manifest),[]);
});

test('extension behavior evidence and gap verdicts reject causal contradictions', async () => {
 const manifest=await inventory();
 for(const mutate of [r=>r.evidenceVerdict='invented',r=>r.behaviorVerdict='missing',r=>r.completion.gaps=['proof'],r=>delete r.completion.persistence]) {const broken=structuredClone(manifest);mutate(broken.features.find(r=>r.surface==='extension'&&r.id==='language'));assert.ok(validateFeatureDelivery(broken).some(error=>error.startsWith('extension/language:')));}
 const missing=structuredClone(manifest);const stillMissing=missing.features.find(r=>r.surface==='extension'&&r.status==='missing');assert.ok(stillMissing,'at least one extension row is still missing');stillMissing.status='unverified';assert.ok(validateFeatureDelivery(missing).some(error=>error.includes('verdicts disagree')));
 const present=structuredClone(manifest);present.features.find(r=>r.surface==='extension'&&r.id==='build-entrypoints').completion.gaps=['behavior','proof'];assert.ok(validateFeatureDelivery(present).some(error=>error.includes('gaps contradict')));
 const borrowed=structuredClone(manifest),row=borrowed.features.find(r=>r.surface==='extension'&&r.id==='build-entrypoints');row.completion.owner='browser-extension/options.js';row.implementation.push(row.completion.owner);assert.ok(validateFeatureDelivery(borrowed).some(error=>error.includes('repository obligation')));
 assert.deepEqual(validateFeatureDelivery(manifest),[]);
});

test('extension persistence and root entrypoint ownership retain source-specific facts',async()=>{
 const manifest=await inventory(),rows=manifest.features.filter(r=>r.surface==='extension');
 const build=rows.find(r=>r.id==='build-entrypoints');assert.equal(build.completion.owner,'build.bat');assert.ok(build.implementation.includes('build-installer.bat'));assert.equal(build.behaviorVerdict,'present');assert.equal(build.status,'unverified');
 for(const row of rows.filter(r=>r.applicability.applies)){assert.ok(row.completion.action.length>40);assert.ok(row.completion.persistence.length>30);assert.ok(row.id==='context-menus' || row.completion.targets.every(t=>t.outcome===row.completion.action));}
 for(const id of ['motion','material-design','regex-search','rich-controls','notifications','context-menus','download-handoff']) assert.deepEqual(rows.find(r=>r.id===id).persistence,[],id);
 assert.match(rows.find(r=>r.id==='appearance-editor').completion.persistence,/theme selection only/);
});

test('context-menu trigger belongs to the exact browser platform action rather than observation panels',async()=>{
 const manifest=await inventory(),row=manifest.features.find(r=>r.surface==='extension'&&r.id==='context-menus');
 assert.equal(row.completion.platformEquivalent.actionId,'propose-download');assert.equal(row.completion.owner,'browser-extension/background.js');
 assert.equal(row.completion.targets.filter(t=>t.state==='browser-owned').length,1);assert.ok(row.completion.targets.filter(t=>t.state==='present').every(t=>/observations/.test(t.outcome)));
 for(const mutate of [r=>delete r.completion.platformEquivalent,r=>r.completion.targets.find(t=>t.state==='present').role='trigger',r=>r.completion.targets.find(t=>t.state==='browser-owned').role='observation',r=>r.completion.platformEquivalent.api='invented',r=>r.completion.platformEquivalent.actionId='pair',r=>r.completion.targets=r.completion.targets.filter(t=>t.state!=='browser-owned'),r=>r.completion.targets.find(t=>t.state==='browser-owned').selector='pair']){const broken=structuredClone(manifest);mutate(broken.features.find(r=>r.surface==='extension'&&r.id==='context-menus'));assert.ok(validateFeatureDelivery(broken).some(error=>error.startsWith('extension/context-menus:')));}
 assert.deepEqual(validateFeatureDelivery(manifest),[]);
});
test('installer production and registration planning do not imply an installed lifecycle',async()=>{
 const manifest=await inventory(),row=manifest.features.find(r=>r.surface==='extension'&&r.id==='squirrel-installer');
 assert.equal(row.status,'unverified');assert.equal(row.behaviorVerdict,'partial');assert.equal(row.completion.owner,'build-installer.bat');assert.match(row.reason,/installation and registry mutation not performed/);
 for(const mutate of [r=>r.completion.owner='browser-extension/options.js',r=>r.implementation=r.implementation.filter(f=>f!=='scripts/browser-native-registration.mjs'),r=>r.completion.gaps=['behavior','proof'],r=>r.behaviorVerdict='present']){const broken=structuredClone(manifest);mutate(broken.features.find(r=>r.surface==='extension'&&r.id==='squirrel-installer'));assert.ok(validateFeatureDelivery(broken).some(error=>error.startsWith('extension/squirrel-installer:')));}
 assert.deepEqual(validateFeatureDelivery(manifest),[]);
});
