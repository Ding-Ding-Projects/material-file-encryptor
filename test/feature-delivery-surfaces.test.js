import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { discoverFeatureSurfaces, expandSurfaceFeatureDelivery, validateSurfaceRegistry, REQUIRED_CONCRETE_SURFACE_IDS, validatePublicationSurfaceCatalogue, expectedFeatureApplicability } from '../src/features/documentation/feature-delivery.mjs';
import { buildDocumentationCatalog } from '../src/features/documentation/catalog.mjs';
import { REQUIRED_FEATURE_IDS } from '../src/features/documentation/required-features.mjs';
const registry = JSON.parse(await fs.readFile(new URL('../contracts/surface-registry.json', import.meta.url), 'utf8'));
const root = new URL('../', import.meta.url);
const { fileURLToPath } = await import('node:url');
const expected = await discoverFeatureSurfaces(fileURLToPath(root));
test('extension applicability is independently scoped without capability exemptions', () => {
  for (const id of ['minecraft-server-manager', 'personal-vocabulary', 'school-mode']) assert.equal(expectedFeatureApplicability(id, 'extension').applies, true);
  for (const id of ['readme-prompt-banner', 'roblox-model-catalogue', 'discord-status-bridge']) assert.equal(expectedFeatureApplicability(id, 'extension').applies, false);
  assert.equal(expectedFeatureApplicability('landing-site', 'extension').directSurface, false);
  assert.equal(expectedFeatureApplicability('build-entrypoints', 'extension').kind, 'repository');
});
test('handwritten vault, descendants, personalization and access surfaces have exact bounded identities', () => {
  const vault = expected.find(row => row.id === 'desktop:vault-dialog');
  assert.deepEqual(vault, {id:'desktop:vault-dialog',family:'desktop',route:'src/renderer/index.html',owner:'src/renderer/index.html',selector:'#vault-dialog'});
  assert.ok(expected.every(row => !/[<>"\r\n]/.test(row.id)));
  for (const id of REQUIRED_CONCRETE_SURFACE_IDS) assert.ok(expected.some(row => row.id === id), id);
  assert.ok(expected.some(row => row.id === 'desktop:restore-descendants' && row.owner === 'src/renderer/app.js'));
});
test('vault omission is rejected even when the extracted expected inventory also omits it', () => {
  const broken = structuredClone(registry); broken.surfaces = broken.surfaces.filter(row => row.id !== 'desktop:vault-dialog');
  assert.ok(validateSurfaceRegistry(broken, expected.filter(row => row.id !== 'desktop:vault-dialog')).some(error => error === 'Missing handwritten required surface: desktop:vault-dialog.'));
});
test('publication catalogue omission of an actual feature article fails before route extraction', async () => {
  const catalog = JSON.parse(await fs.readFile(new URL('../docs/site/content-catalog.json', import.meta.url), 'utf8'));
  const bundled = await buildDocumentationCatalog(fileURLToPath(root));
  validatePublicationSurfaceCatalogue(catalog, bundled.documents);
  const omitted = catalog.articles.find(file => file.startsWith('docs/features/'));
  catalog.articles = catalog.articles.filter(file => file !== omitted);
  assert.throws(() => validatePublicationSurfaceCatalogue(catalog, bundled.documents), /Publication catalogue omits or invents concrete feature article routes/);
});
test('concrete inventory retains 105 families and independent unverified defaults', () => {
  assert.equal(REQUIRED_FEATURE_IDS.length, 105);
  assert.deepEqual(validateSurfaceRegistry(registry, expected), []);
  const rows = expandSurfaceFeatureDelivery(registry);
  assert.equal(rows.length, expected.length * 105);
  assert.ok(rows.every(row => row.status === 'unverified' && row.proof === null));
  for (const family of ['desktop', 'site', 'extension']) assert.ok(expected.some(row => row.family === family));
});
test('omitting an actual generated article and whole extension family is rejected', () => {
  for (const predicate of [row => row.id === expected.find(row => row.id.startsWith('site:article:')).id, row => row.family === 'extension']) {
    const broken = structuredClone(registry); broken.surfaces = broken.surfaces.filter(row => !predicate(row));
    assert.ok(validateSurfaceRegistry(broken, expected).some(error => error.startsWith('Missing concrete surface:')));
  }
});
test('route and component identity cannot be borrowed from a sibling', () => {
  for (const key of ['route', 'owner', 'selector', 'family']) {
    const broken = structuredClone(registry); broken.surfaces[0][key] = 'unknown';
    assert.ok(validateSurfaceRegistry(broken, expected).some(error => error.includes(`unknown ${key}`)));
  }
  assert.ok(validateSurfaceRegistry(registry).some(error => error.includes('Authoritative')));
});
test('inherited completed verdict and omitted or duplicate semantic families are rejected', () => {
  for (const mutate of [template => template.features.pop(), template => template.features[0] = template.features[1], template => template.status = 'implemented', template => template.builtInteraction = 'verified']) {
    const broken = structuredClone(registry); mutate(broken.templates['required-families']);
    assert.ok(validateSurfaceRegistry(broken, expected).length);
  }
});
test('surface proof is exact and cannot inherit completed or exempt applicable behavior', () => {
  const broken = structuredClone(registry); const surface = broken.surfaces.find(row => row.id === 'extension:popup');
  surface.proofs.language = { status: 'implemented' };
  assert.ok(validateSurfaceRegistry(broken, expected).some(error => error.includes('independent source-bound')));
  surface.proofs.language = { status: 'not-applicable' };
  assert.ok(validateSurfaceRegistry(broken, expected).some(error => error.includes('cannot be exempted')));
  surface.proofs.language = {status:'implemented',surface:surface.id,route:surface.route,selector:surface.selector,sourceCommit:'a'.repeat(40),builtSha256:'b'.repeat(64),builtInteraction:'verified',visualEvidence:'verified',evidence:['evidence/receipt.json']};
  assert.deepEqual(validateSurfaceRegistry(broken, expected), []);
  surface.proofs.language.surface = 'site:index';
  assert.ok(validateSurfaceRegistry(broken, expected).length);
});
test('unverified proof cannot replace derived identity or applicability', () => {
  const broken = structuredClone(registry), surface = broken.surfaces[0];
  surface.proofs.language = {status:'unverified',surface:'sibling-surface',id:'unknown-feature',applicability:{applies:false}};
  assert.ok(validateSurfaceRegistry(broken, expected).some(error => error.includes('unknown proof field')));
  const row = expandSurfaceFeatureDelivery(broken).find(row => row.surface === surface.id && row.id === 'language');
  assert.equal(row.applicability.applies, true);
});

test('extension options panels are exact consumers and omission cannot be hidden by extraction',()=>{for(const id of ['extension:options','extension:options:connection','extension:options:personalization','extension:options:status','extension:options:message-preview']){const row=expected.find(row=>row.id===id);assert.equal(row.route,'browser-extension/options.html');assert.equal(row.owner,'browser-extension/options.js');const broken=structuredClone(registry);broken.surfaces=broken.surfaces.filter(item=>item.id!==id);assert.ok(validateSurfaceRegistry(broken,expected.filter(item=>item.id!==id)).includes('Missing handwritten required surface: '+id+'.'));}});
