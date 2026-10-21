import { REQUIRED_FEATURE_IDS } from './required-features.mjs';

// Handwritten expectations are independent of source extraction.
export const REQUIRED_CONCRETE_SURFACE_IDS = Object.freeze([
  'desktop:vault-dialog', 'desktop:confirm-dialog', 'desktop:restore-descendants',
  'extension:popup', 'extension:options', 'extension:options:connection', 'extension:options:personalization', 'extension:options:changelog', 'extension:options:notes', 'extension:options:docs', 'extension:options:support', 'extension:options:dimsum', 'extension:options:models', 'extension:options:status', 'extension:options:message-preview', 'extension:options:note-reader', 'extension:options:external-editor', 'extension:options:note-sheet', 'extension:options:note-step-1', 'extension:options:note-step-2', 'extension:options:note-step-3', 'extension:options:converter', 'extension:options:converter:source', 'extension:options:converter:formats', 'extension:options:converter:review', 'extension:options:converter:jobs', 'site:index', 'site:library', 'site:wiki', 'site:gallery', 'site:workspace',
  ...['desktop', 'site:workspace'].flatMap(host => [
    ...['language', 'appearance', 'schedules', 'attention', 'history'].map(panel => `${host}:personalization:${panel}`),
    `${host}:personalization:home-assistant-credential`,
    ...['profile', 'locks', 'authenticator', 'support', 'history', 'unlock', 'waiting', 'wizard', 'confirmation', 'qr-preview'].map(panel => `${host}:access:${panel}`)
  ])
]);

export function validatePublicationSurfaceCatalogue(catalog, bundledDocuments) {
  const actual = prefix => bundledDocuments.filter(row => row.source.startsWith(prefix)).map(row => prefix === 'docs/site/wiki/' ? row.source.slice(prefix.length) : row.source).sort();
  if (JSON.stringify(actual('docs/features/')) !== JSON.stringify(catalog.articles.filter(file => file.startsWith('docs/features/')).sort())) throw new Error('Publication catalogue omits or invents concrete feature article routes.');
  if (JSON.stringify(actual('docs/site/wiki/')) !== JSON.stringify([...catalog.wiki.files].sort())) throw new Error('Publication catalogue omits or invents concrete wiki article routes.');
}

/** Concrete routes supplement, and never rewrite, the historical two-surface assessment. */
export async function discoverFeatureSurfaces(repositoryPath) {
  const { readFile } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  const { buildDocumentationCatalog } = await import('./catalog.mjs');
  const { route } = await import('../../../docs/site/publication.mjs');
  const read = file => readFile(path.join(repositoryPath, file), 'utf8');
  const catalog = JSON.parse(await read('docs/site/content-catalog.json'));
  const bundled = await buildDocumentationCatalog(repositoryPath);
  validatePublicationSurfaceCatalogue(catalog, bundled.documents);
  const surfaces = [];
  const add = (id, family, target, owner, selector = '') => surfaces.push({ id, family, route: target, owner, selector });
  for (const name of ['index', 'library', 'wiki', 'gallery', 'workspace']) add(`site:${name}`, 'site', `${name}.html`, name === 'workspace' ? 'docs/site/workspace.js' : name === 'index' ? 'docs/site/index.html' : 'docs/site/publication.mjs');
  for (const source of catalog.articles) add(`site:article:${source}`, 'site', route(source), 'docs/site/publication.mjs');
  for (const file of catalog.wiki.files) add(`site:wiki:${file}`, 'site', route(`wiki/${file}`), 'docs/site/publication.mjs');
  for (const category of catalog.categories) add(`site:category:${category}`, 'site', `categories/${category}.html`, 'docs/site/publication.mjs');
  const desktop = await read('src/renderer/index.html');
  for (const tag of desktop.matchAll(/<(section|mfe-dialog)\b[^<>]*>/g)) {
    const id = /\bid="([A-Za-z][A-Za-z0-9_-]{0,127})"/.exec(tag[0])?.[1];
    if (id && (id.startsWith('view-') || tag[1] === 'mfe-dialog')) add(`desktop:${id}`, 'desktop', 'src/renderer/index.html', 'src/renderer/index.html', `#${id}`);
  }
  const app = await read('src/renderer/app.js');
  const labels = /const canonicalViewLabels=\{([^}]+)\}/.exec(app)?.[1];
  if (!labels) throw new Error('Desktop route declarations unavailable.');
  for (const match of labels.matchAll(/(?:^|,)([a-z]+):/g)) if (!surfaces.some(row => row.id === `desktop:view-${match[1]}`)) add(`desktop:view-${match[1]}`, 'desktop', 'src/renderer/index.html', 'src/renderer/app.js', `#view-${match[1]}`);
  const workspace = await read('docs/site/workspace.js');
  const definitions = /const definitions=\[([^;]+)\];/.exec(workspace)?.[1];
  if (!definitions) throw new Error('Workspace route declarations unavailable.');
  for (const match of definitions.matchAll(/\['([a-z]+)'/g)) add(`site:workspace:${match[1]}`, 'site', 'workspace.html', 'docs/site/workspace.js', `view:${match[1]}`);
  add('desktop:restore-descendants', 'desktop', 'src/renderer/index.html', 'src/renderer/app.js', 'dialog[aria-labelledby="descendant-dialog-title"]');
  for (const [host, family, target] of [['desktop', 'desktop', 'src/renderer/index.html'], ['site:workspace', 'site', 'workspace.html']]) {
    const personalizationOwner = 'src/renderer/features/personalization/index.js';
    for (const panel of ['language', 'appearance', 'schedules', 'attention', 'history']) add(`${host}:personalization:${panel}`, family, target, personalizationOwner, `personalization:active=${panel};role=tabpanel`);
    add(`${host}:personalization:home-assistant-credential`, family, target, personalizationOwner, 'personalization:Home Assistant credential dialog');
    const accessOwner = 'src/renderer/features/access/index.js';
    for (const panel of ['profile', 'locks', 'authenticator', 'support', 'history']) add(`${host}:access:${panel}`, family, target, panel === 'history' ? 'src/renderer/features/access/history-view.js' : accessOwner, `access:active=${panel}`);
    for (const [panel, selector] of [['unlock', '[data-access-unlock]'], ['waiting', '[data-access-waiting]'], ['wizard', '[data-access-wizard]'], ['confirmation', '[data-access-confirmation]'], ['qr-preview', '[data-access-qr-preview]']]) add(`${host}:access:${panel}`, family, target, accessOwner, selector);
  }
  for (const document of bundled.documents) {
    add(`desktop:document:${document.id}`, 'desktop', 'src/renderer/index.html', 'src/renderer/features/documentation/index.js', `document:${document.id}`);
    add(`site:workspace:document:${document.id}`, 'site', 'workspace.html', 'src/renderer/features/documentation/index.js', `document:${document.id}`);
  }
  add('extension:popup', 'extension', 'browser-extension/popup.html', 'browser-extension/popup.js');
  const extensionManifest=JSON.parse(await read('browser-extension/manifest.json'));
  if(extensionManifest.options_ui?.page!=='options.html')throw new Error('Extension options route is unavailable.');
  add('extension:options','extension','browser-extension/options.html','browser-extension/options.js');
  const options=await read('browser-extension/options.html');
  if(!options.includes('id="message-preview"'))throw new Error('Extension message preview is unavailable.');
  add('extension:options:message-preview','extension','browser-extension/options.html','browser-extension/options.js','#message-preview');
  for(const panel of ['connection','personalization','changelog','notes','docs','support','dimsum','models','status']){if(!options.includes('id="panel-'+panel+'"')||!options.includes('aria-controls="panel-'+panel+'"'))throw new Error('Extension panel ownership is unavailable: '+panel);add('extension:options:'+panel,'extension','browser-extension/options.html','browser-extension/options.js','#panel-'+panel);}
  for(const [id,selector] of [['note-reader','note-reader'],['external-editor','editor-open'],['note-sheet','note-sheet'],['note-step-1','note-step-1'],['note-step-2','note-step-2'],['note-step-3','note-step-3']]){if(!options.includes('id="'+selector+'"'))throw new Error('Extension workflow surface is unavailable: '+id);add('extension:options:'+id,'extension','browser-extension/options.html','browser-extension/options.js','#'+selector);}

  if(!options.includes('id="browser-converter"'))throw new Error('Extension converter root is unavailable.');
  const converter=await read('browser-extension/converter.js');
  if(!converter.includes('panels=[0,1,2,3]')||!converter.includes("'browser-converter-panel-'+index"))throw new Error('Extension converter states are unavailable.');
  add('extension:options:converter','extension','browser-extension/options.html','browser-extension/options.js','#browser-converter');
  for(const [index,stage]of ['source','formats','review','jobs'].entries())add('extension:options:converter:'+stage,'extension','browser-extension/options.html','browser-extension/converter.js','#browser-converter-panel-'+index);

  // Preferences are independently addressable on every generated publication route.
  for (const row of [...surfaces].filter(row => row.family === 'site' && !row.selector && row.route !== 'workspace.html')) add(`${row.id}:preferences`, 'site', row.route, 'docs/site/preferences.js', '#preferences-dialog');
  return surfaces.sort((a, b) => a.id.localeCompare(b.id));
}

/** Templates inherit declarations only. Every surface/family verdict defaults to unverified. */
export function expandSurfaceFeatureDelivery(registry) {
  return registry.surfaces.flatMap(surface => (registry.templates[surface.template]?.features || []).map(id => ({
    surface: surface.id, id, applicability: expectedFeatureApplicability(id, surface.family),
    status: surface.proofs?.[id]?.status || 'unverified', proof: surface.proofs?.[id] || null
  })));
}

export function validateSurfaceRegistry(registry, expectedSurfaces) {
  const errors = [];
  if (!object(registry) || registry.schemaVersion !== 1 || !object(registry.templates) || !Array.isArray(registry.surfaces) || registry.surfaces.length > 10000) return ['Invalid concrete surface registry.'];
  if (!Array.isArray(expectedSurfaces) || !expectedSurfaces.length) return ['Authoritative concrete surface inventory required.'];
  const expected = new Map(expectedSurfaces.map(row => [row.id, row]));
  const seen = new Set();
  for (const surface of registry.surfaces) {
    if (!object(surface)) { errors.push('Invalid concrete surface.'); continue; }
    const original = expected.get(surface.id);
    if (!original) errors.push(`Unknown surface: ${surface.id}.`);
    if (seen.has(surface.id)) errors.push(`Duplicate surface: ${surface.id}.`);
    seen.add(surface.id);
    if (original) for (const key of ['family', 'route', 'owner', 'selector']) if (surface[key] !== original[key]) errors.push(`${surface.id}: unknown ${key} ownership.`);
    const template = registry.templates[surface.template];
    if (!object(template) || !Array.isArray(template.features)) { errors.push(`${surface.id}: missing capability template.`); continue; }
    if (Object.keys(template).some(key => key !== 'features')) errors.push(`${surface.id}: inherited verdict prohibited.`);
    if (template.features.length !== REQUIRED_FEATURE_IDS.length || new Set(template.features).size !== REQUIRED_FEATURE_IDS.length || REQUIRED_FEATURE_IDS.some(id => !template.features.includes(id))) errors.push(`${surface.id}: omitted or unknown semantic family.`);
    if (!object(surface.proofs)) { errors.push(`${surface.id}: independent proof map required.`); continue; }
    for (const [id, proof] of Object.entries(surface.proofs)) {
      if (!REQUIRED_FEATURE_IDS.includes(id) || !object(proof)) { errors.push(`${surface.id}: invalid proof family.`); continue; }
      if (Object.keys(proof).some(key => !['status', 'surface', 'route', 'selector', 'sourceCommit', 'builtSha256', 'builtInteraction', 'visualEvidence', 'evidence', 'reason'].includes(key))) errors.push(`${surface.id}/${id}: unknown proof field.`);
      for (const key of ['surface', 'route', 'selector']) if (Object.hasOwn(proof, key) && proof[key] !== (key === 'surface' ? surface.id : surface[key])) errors.push(`${surface.id}/${id}: mismatched proof ${key}.`);
      const scope = expectedFeatureApplicability(id, surface.family);
      if (!['implemented', 'unverified', 'missing', 'not-applicable'].includes(proof.status)) errors.push(`${surface.id}/${id}: invalid proof status.`);
      if (proof.status === 'not-applicable' && scope.applies) errors.push(`${surface.id}/${id}: applicable family cannot be exempted.`);
      if (proof.status === 'implemented') {
        if (!scope.applies || proof.surface !== surface.id || proof.route !== surface.route || proof.selector !== surface.selector || !commitId(proof.sourceCommit) || !/^[a-f0-9]{64}$/.test(proof.builtSha256 || '') || proof.builtInteraction !== 'verified' || proof.visualEvidence !== 'verified' || !Array.isArray(proof.evidence) || !proof.evidence.length || proof.evidence.some(file => !sourcePath(file))) errors.push(`${surface.id}/${id}: independent source-bound built and visual proof required.`);
      }
    }
  }
  for (const id of expected.keys()) if (!seen.has(id)) errors.push(`Missing concrete surface: ${id}.`);
  for (const id of REQUIRED_CONCRETE_SURFACE_IDS) if (!seen.has(id)) errors.push(`Missing handwritten required surface: ${id}.`);
  return errors;
}

// Independent scope rules: missing implementation never grants an exemption.
const REPOSITORY_IDS = new Set('design-folder build-entrypoints fresh-build-run-command dependency-fetcher self-signing release-workflow release-timing release-line-counts release-dim-sum-photo ci-bootstrap runner-selection encrypted-public-builder tabbed-readme human-time-estimate sanitized-instruction-copy agents-md-vocabulary-block vocabulary-hash-lock roadmap-checklist feature-docs postman-collections handoff-record closeout-prompt discussion-records project-board operational-skill'.split(' '));
const CANONICAL_ONLY = new Set(['readme-prompt-banner', 'uh-single-file-editions', 'project-profile']);
const GAME_ONLY = new Set(['roblox-model-catalogue', 'roblox-visual-realism']);
const HUB_SERVER_ONLY = new Set(['discord-status-bridge', 'panic-webhooks', 'tidbyt-displays']);
const APPLICATIONS_ONLY = new Set(['vocabulary-drop-apply']);
const DESKTOP_ONLY = new Set(['onboarding-wizard']);
const SITE_ONLY = new Set(['landing-site', 'mobile-site', 'installer-download-button', 'feature-articles']);
const APP_ONLY = new Set(['display-name', 'offline-docs', 'external-editor', 'download-handoff', 'forge-publishing', 'screen-recording', 'bundled-dependencies', 'auto-updates']);
const SURFACES = ['desktop', 'site', 'extension'];
const PATH_FIELDS = ['implementation', 'documentation', 'localization', 'tests', 'evidence', 'persistence'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value, maximum = 2048) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
const sourcePath = value => typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9._/-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');
const commitId = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

export function expectedFeatureApplicability(id, surface) {
  if (CANONICAL_ONLY.has(id)) return { kind: 'canonical-only', applies: false, directSurface: false, declaredScope: 'Canonical instruction repository only' };
  if (GAME_ONLY.has(id)) return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Roblox/game projects only' };
  if (HUB_SERVER_ONLY.has(id)) return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Status Hub server implementation only' };
  // The encrypted-public-builder heading is expressly limited to private repositories.
  // This product is a public desktop application and a Status Hub client, not the server.
  if (id === 'encrypted-public-builder') return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Private repositories only' };
  // The setup wizard belongs to the desktop application. A website or an extension page cannot substitute for it,
  // and adding it never removes the separate public website requirement.
  if (DESKTOP_ONLY.has(id) && surface !== 'desktop') return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Desktop application only' };
  // Dropping a wording file applies to applications (desktop and extension), never to a documentation site.
  if (APPLICATIONS_ONLY.has(id) && surface === 'site') return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Applications only' };
  // Private repositories package their documentation site as an offline application; this repository is public.
  if (id === 'private-site-app-delivery') return { kind: 'not-applicable', applies: false, directSurface: false, declaredScope: 'Private repositories only' };
  if (REPOSITORY_IDS.has(id)) return { kind: 'repository', applies: true, directSurface: false, declaredScope: 'Repository obligation supporting the product' };
  if ((SITE_ONLY.has(id) && surface !== 'site') || (APP_ONLY.has(id) && surface === 'site')) return { kind: 'product', applies: true, directSurface: false, declaredScope: 'Named product surface with companion support' };
  return { kind: 'product', applies: true, directSurface: true, declaredScope: 'User-facing product surface' };
}

/**
 * Rows that claim delivery without the evidence validateFeatureDelivery demands for a delivered row: an
 * "implemented" (or "verified") status needs verified built interaction, verified visual evidence, listed evidence
 * files and a "present" behavior verdict. Returns one message per unsupported claim.
 */
export function unsupportedCompletionClaims(rows) {
  const problems = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!object(row) || !['implemented', 'verified'].includes(row.status)) continue;
    const label = `${row.surface}/${row.id}`;
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) problems.push(`${label}: completion claimed without evidence files.`);
    if (row.builtInteraction !== 'verified' || row.visualEvidence !== 'verified') problems.push(`${label}: completion claimed without verified built and visual evidence.`);
    if (!['present', 'verified', 'complete'].includes(row.behaviorVerdict)) problems.push(`${label}: completion claimed while the behavior verdict is ${String(row.behaviorVerdict)}.`);
    if (row.evidenceVerdict === 'current-runtime-unverified') problems.push(`${label}: completion claimed while the evidence verdict says runtime is unverified.`);
  }
  return problems;
}


/**
 * Full completion rule for an implemented row, joining the manifest to the concrete surface registry. A row may be
 * implemented only with verified built interaction and visual evidence, existing evidence files, a "present" behavior
 * verdict, an evidence verdict that is not runtime-unverified, and a matching implemented surface proof that carries a
 * source commit and a built artifact hash. Every other row must remain unverified, missing or not-applicable with
 * unverified built evidence. Returns one message per problem; an empty list means the claims are exactly supported.
 */
export function implementedClaimProblems(manifest, registry, exists) {
  const problems = [];
  const rows = Array.isArray(manifest?.features) ? manifest.features : [];
  const surfaces = Array.isArray(registry?.surfaces) ? registry.surfaces : [];
  const proven = (family, id) => surfaces.filter(surface => surface?.family === family && object(surface.proofs?.[id]) && surface.proofs[id].status === 'implemented');
  for (const row of rows) {
    if (!object(row)) continue;
    const label = `${row.surface}/${row.id}`;
    if (row.status !== 'implemented') {
      if (!['unverified', 'missing', 'not-applicable'].includes(row.status)) problems.push(`${label}: unexpected status ${String(row.status)}.`);
      if (row.builtInteraction !== 'unverified' || row.visualEvidence !== 'unverified') problems.push(`${label}: built evidence is recorded on a row that is not implemented.`);
      continue;
    }
    if (row.builtInteraction !== 'verified' || row.visualEvidence !== 'verified') problems.push(`${label}: implemented without verified built and visual evidence.`);
    if (!Array.isArray(row.evidence) || !row.evidence.length) problems.push(`${label}: implemented without evidence files.`);
    else if (typeof exists === 'function') for (const file of row.evidence) if (!exists(file)) problems.push(`${label}: evidence file is absent: ${file}.`);
    if (row.behaviorVerdict !== 'present') problems.push(`${label}: implemented while the behavior verdict is ${String(row.behaviorVerdict)}.`);
    if (!boundedText(row.evidenceVerdict) || row.evidenceVerdict === 'current-runtime-unverified') problems.push(`${label}: implemented while the evidence verdict is runtime-unverified.`);
    const matches = proven(row.surface, row.id).filter(surface => {
      const proof = surface.proofs[row.id];
      return proof.surface === surface.id && proof.route === surface.route && proof.selector === surface.selector && commitId(proof.sourceCommit) && /^[a-f0-9]{64}$/.test(proof.builtSha256 || '') && proof.builtInteraction === 'verified' && proof.visualEvidence === 'verified';
    });
    if (!matches.length) problems.push(`${label}: implemented without a matching surface proof carrying a source commit and built hash.`);
  }
  for (const surface of surfaces) {
    if (!object(surface) || !object(surface.proofs)) continue;
    for (const [id, proof] of Object.entries(surface.proofs)) {
      if (object(proof) && proof.status === 'implemented' && !rows.some(row => row?.surface === surface.family && row.id === id && row.status === 'implemented')) problems.push(`${surface.id}/${id}: implemented surface proof without an implemented feature row.`);
    }
  }
  return problems;
}
/** Structural validation only. This function never claims to have queried Git objects. */
export function validateFeatureDelivery(manifest, exists) {
  const errors = [];
  if (!object(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.features)) return ['Invalid feature delivery schema.'];
  if (manifest.features.length > REQUIRED_FEATURE_IDS.length * SURFACES.length) return ['Feature row count exceeds the required inventory.'];
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length !== 3 || !SURFACES.every(surface => manifest.surfaces.includes(surface))) errors.push('Expected exactly the desktop, site and extension surfaces.');
  if (manifest.features.length !== REQUIRED_FEATURE_IDS.length * SURFACES.length) errors.push('Feature row count differs from the required inventory.');
  const context = manifest.assessmentContext;
  const current = manifest.currentAssessmentContext;
  if (!object(context) || !commitId(context.baseline) || context.families !== REQUIRED_FEATURE_IDS.length || context.rows !== REQUIRED_FEATURE_IDS.length * 2 || !object(context.originalBaseline) || context.originalBaseline.families !== 104 || context.originalBaseline.rows !== 208 || ['scope', 'guiMatrix', 'builtCandidate', 'installedLifecycle', 'storageReceipt', 'pendingIntegration', 'externalLimits', 'accessReceipt'].some(key => !boundedText(context[key]))) errors.push('Complete historical assessmentContext required.');
  if (!object(current) || !commitId(current.baseline) || ['scope', 'ownership', 'gaps'].some(key => !boundedText(current[key]))) errors.push('Complete currentAssessmentContext required.');
  if (!Array.isArray(manifest.assessmentHistory) || !manifest.assessmentHistory.length || manifest.assessmentHistory.length > 64 || manifest.assessmentHistory.some(item => !object(item) || !commitId(item.baseline) || item.families !== 105 || item.rows !== 210 || ['scope', 'guiMatrix', 'installedLifecycle', 'storageReceipt'].some(key => !boundedText(item[key])))) errors.push('Complete assessmentHistory required.');
  const extensionIdentities = ['popup', 'options', 'options:connection', 'options:personalization', 'options:changelog', 'options:notes', 'options:docs', 'options:support', 'options:dimsum', 'options:models', 'options:status', 'options:message-preview', 'options:note-reader', 'options:external-editor', 'options:note-sheet', 'options:note-step-1', 'options:note-step-2', 'options:note-step-3', 'options:converter'].map(name => ({id:`extension:${name}`,family:'extension',route:`browser-extension/${name === 'popup' ? 'popup' : 'options'}.html`,owner:`browser-extension/${name === 'popup' ? 'popup' : 'options'}.js`,selector:name.includes(':') ? ({'message-preview':'#message-preview','note-reader':'#note-reader','external-editor':'#editor-open','note-sheet':'#note-sheet','note-step-1':'#note-step-1','note-step-2':'#note-step-2','note-step-3':'#note-step-3','converter':'#browser-converter'}[name.split(':')[1]] || `#panel-${name.split(':')[1]}`) : ''}));
  extensionIdentities.push(...['source','formats','review','jobs'].map((stage,index)=>({id:'extension:options:converter:'+stage,family:'extension',route:'browser-extension/options.html',owner:'browser-extension/converter.js',selector:'#browser-converter-panel-'+index})));
  if (!Array.isArray(manifest.extensionTargets) || manifest.extensionTargets.length !== extensionIdentities.length || extensionIdentities.some(identity => manifest.extensionTargets.filter(target => JSON.stringify(target) === JSON.stringify(identity)).length !== 1)) errors.push('Exact independent extension target inventory required.');
  const expectedIds = new Set(REQUIRED_FEATURE_IDS), seen = new Map(), referenced = new Set();
  const references = object(manifest.referenceSources) ? manifest.referenceSources : {};
  if (!object(manifest.referenceSources)) errors.push('referenceSources must be an object.');
  if (Object.keys(references).length > 2048) return ['Too many source references.'];
  for (const row of manifest.features) {
    if (!object(row)) { errors.push('Invalid feature row.'); continue; }
    const label = `${row.surface}/${row.id}`;
    if (!expectedIds.has(row.id) || !SURFACES.includes(row.surface)) { errors.push('Unknown feature or surface.'); continue; }
    seen.set(label, (seen.get(label) || 0) + 1);
    if (!['implemented', 'unverified', 'missing', 'not-applicable'].includes(row.status)) errors.push(`${label}: invalid status.`);
    if (!boundedText(row.reason)) errors.push(`${label}: reason required.`);
    const scope = row.applicability, required = expectedFeatureApplicability(row.id, row.surface);
    if (!object(scope)) errors.push(`${label}: applicability required.`);
    else {
      for (const key of ['kind', 'applies', 'directSurface']) if (scope[key] !== required[key]) errors.push(`${label}: inappropriate applicability ${key}.`);
      if (!boundedText(scope.reason) || !boundedText(scope.source)) errors.push(`${label}: applicability reason and source required.`);
      if (!object(scope.scopeReference) || scope.scopeReference.entry !== row.id || scope.scopeReference.declaredScope !== required.declaredScope) errors.push(`${label}: malformed scopeReference.`);
    }
    if (!required.applies && ['implemented', 'missing'].includes(row.status)) errors.push(`${label}: excluded scope cannot claim implemented or missing product behavior.`);
    if (required.applies && row.status === 'not-applicable') errors.push(`${label}: required scope cannot be exempted.`);
    if (row.surface === 'extension' && !required.applies && (row.status !== 'not-applicable' || row.behaviorVerdict !== 'not-applicable' || row.evidenceVerdict !== 'current-runtime-unverified' || Object.hasOwn(row, 'completion'))) errors.push(`${label}: excluded extension scope requires an explicit independent verdict without a completion claim.`);
    if (row.surface === 'extension' && required.applies) {
      const completion = row.completion;
      const completionKeys = row.id === 'context-menus' ? 'action,gaps,owner,persistence,platformEquivalent,targets' : 'action,gaps,owner,persistence,targets';
      if (!object(completion) || Object.keys(completion).sort().join(',') !== completionKeys) errors.push(`${label}: bounded completion ownership required.`);
      else {
        if (!sourcePath(completion.owner) || !row.implementation?.includes(completion.owner)) errors.push(`${label}: completion owner must be a bound implementation reference.`);
        if (!boundedText(completion.action) || !boundedText(completion.persistence) || !Array.isArray(completion.gaps) || (row.status === 'implemented' ? completion.gaps.length !== 0 : !completion.gaps.length) || new Set(completion.gaps).size !== completion.gaps.length || completion.gaps.some(gap => !['behavior', 'wiring', 'proof'].includes(gap))) errors.push(`${label}: explicit behavior, persistence, wiring or proof gaps required.`);
        if (required.kind === 'repository' && completion.owner.startsWith('browser-extension/')) errors.push(`${label}: repository obligation cannot borrow a browser control owner.`);
        if (row.id === 'context-menus') {
          const equivalent = completion.platformEquivalent;
          if (!object(equivalent) || Object.keys(equivalent).sort().join(',') !== 'actionId,api,owner,trigger' || equivalent.api !== 'chrome.contextMenus' || equivalent.actionId !== 'propose-download' || equivalent.owner !== 'browser-extension/background.js' || equivalent.trigger !== 'Browser-owned HTTPS link context-menu action' || completion.owner !== equivalent.owner || (!Array.isArray(completion.targets) || completion.targets.filter(target => target?.state === 'browser-owned').length !== 1)) errors.push(`${label}: exact browser-owned context-menu equivalent required.`);
        }
        if (row.id === 'squirrel-installer' && (completion.owner !== 'build-installer.bat' || !['build-installer.bat', 'scripts/build.ps1', 'scripts/browser-native-registration.mjs'].every(file => row.implementation.includes(file)) || row.behaviorVerdict !== 'partial' || !completion.gaps.includes('wiring'))) errors.push(`${label}: installer production and unfinished registration must retain their actual sources and gaps.`);
        if (!Array.isArray(completion.targets) || !completion.targets.length || completion.targets.length > 16) errors.push(`${label}: bounded completion targets required.`);
        else for (const target of completion.targets) {
          const targetKeys = row.id === 'context-menus' ? 'nextProof,outcome,role,selector,state,surface' : 'nextProof,outcome,selector,state,surface';
          if (!object(target) || Object.keys(target).sort().join(',') !== targetKeys || !boundedText(target.outcome) || !boundedText(target.nextProof)) { errors.push(`${label}: complete target evidence dimensions required.`); continue; }
          if (row.id === 'context-menus' && target.role !== (target.state === 'browser-owned' ? 'trigger' : 'observation')) errors.push(`${label}: browser trigger and observation roles cannot be exchanged.`);
          if (target.state === 'missing') {
            if (target.surface !== null || target.selector !== null) errors.push(`${label}: missing targets cannot invent routes.`);
          } else if (target.state === 'present') {
            const identity = manifest.extensionTargets?.find(item => item.id === target.surface);
            if (!identity || identity.family !== 'extension' || target.selector !== identity.selector || !row.implementation.includes(identity.owner)) errors.push(`${label}: unknown or borrowed extension target identity.`);
          } else if (target.state === 'browser-owned') {
            if (row.id !== 'context-menus' || target.surface !== 'chrome.contextMenus' || target.selector !== 'propose-download' || !row.implementation.includes('browser-extension/background.js')) errors.push(`${label}: unknown browser-owned platform target.`);
          } else errors.push(`${label}: invalid target state.`);
        }
      }
      if (!['partial', 'present', 'missing'].includes(row.behaviorVerdict)) errors.push(`${label}: independent behavior verdict required.`);
      // An implemented row carries its own runtime evidence verdict; every other row stays runtime-unverified.
      if (row.status === 'implemented' ? (!boundedText(row.evidenceVerdict) || row.evidenceVerdict === 'current-runtime-unverified') : row.evidenceVerdict !== 'current-runtime-unverified') errors.push(`${label}: invalid independent evidence verdict.`);
      if ((row.behaviorVerdict === 'missing' && row.status !== 'missing') || (row.behaviorVerdict === 'partial' && row.status !== 'unverified') || (row.behaviorVerdict === 'present' && !['unverified', 'implemented'].includes(row.status)) || (row.status === 'implemented' && row.behaviorVerdict !== 'present')) errors.push(`${label}: behavior and delivery verdicts disagree.`);
      if (object(completion) && Array.isArray(completion.gaps)) {
        if (row.status === 'implemented' ? completion.gaps.length > 0 : !completion.gaps.includes('proof')) errors.push(`${label}: gaps contradict behavior or evidence verdict.`);
        else if ( (['partial', 'missing'].includes(row.behaviorVerdict) && !completion.gaps.includes('behavior')) || (row.behaviorVerdict === 'present' && completion.gaps.includes('behavior'))) errors.push(`${label}: gaps contradict behavior or evidence verdict.`);
      }
    }
    for (const key of ['builtInteraction', 'visualEvidence']) if (!['verified', 'unverified'].includes(row[key])) errors.push(`${label}: invalid ${key}.`);
    if (row.status === 'implemented' && (row.builtInteraction !== 'verified' || row.visualEvidence !== 'verified')) errors.push(`${label}: implemented claim requires verified built and visual evidence.`);
    for (const field of PATH_FIELDS) {
      const files = row[field];
      if (!Array.isArray(files) || files.length > 64) { errors.push(`${label}: ${field} must be a bounded array.`); continue; }
      if (row.status === 'implemented' && field !== 'persistence' && files.length === 0) errors.push(`${label}: missing ${field}.`);
      if (new Set(files).size !== files.length) errors.push(`${label}: duplicate ${field} path.`);
      for (const file of files) {
        if (!sourcePath(file)) { errors.push(`${label}: invalid ${field} path.`); continue; }
        referenced.add(file);
        if (!Object.hasOwn(references, file) || !commitId(references[file])) errors.push(`${label}: unbound ${field} reference.`);
        if (typeof exists === 'function') { try { if (!exists(file)) errors.push(`${label}: absent ${field} file.`); } catch { errors.push(`${label}: ${field} existence check failed.`); } }
      }
    }
  }
  for (const surface of SURFACES) for (const id of REQUIRED_FEATURE_IDS) if (seen.get(`${surface}/${id}`) !== 1) errors.push(`${surface}/${id}: expected exactly one row.`);
  for (const [file, commit] of Object.entries(references)) {
    if (!sourcePath(file) || !commitId(commit)) errors.push('Invalid source reference.');
    else if (!referenced.has(file)) errors.push(`Unused source reference: ${file}.`);
  }
  return errors;
}

/** Optional repository-aware check. No Git access produces an explicit unverified result. */
export async function verifyFeatureDeliveryReferences(manifest, { repositoryPath, timeoutMs = 10000, totalTimeoutMs = 60000 } = {}) {
  const errors = validateFeatureDelivery(manifest);
  if (errors.length) return { errors, referenceVerification: 'unverified', checkedReferences: 0, reason: 'Structural validation failed.' };
  if (!repositoryPath || typeof repositoryPath !== 'string') return { errors: [], referenceVerification: 'unverified', checkedReferences: 0, reason: 'No repository was supplied; Git object existence was not checked.' };
  let execute;
  const timeout = Number.isFinite(timeoutMs) ? Math.min(10000, Math.max(1, timeoutMs)) : 10000;
  const deadline = Date.now() + (Number.isFinite(totalTimeoutMs) ? Math.min(60000, Math.max(1, totalTimeoutMs)) : 60000);
  try {
    const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); execute = promisify(execFile);
    await execute('git', ['rev-parse', '--git-dir'], { cwd: repositoryPath, timeout, maxBuffer: 1024, windowsHide: true });
  } catch { return { errors: [], referenceVerification: 'unverified', checkedReferences: 0, reason: 'Git repository access is unavailable; source references were not verified.' }; }
  let checkedReferences = 0;
  for (const [file, commit] of Object.entries(manifest.referenceSources)) {
    if (Date.now() >= deadline) return { errors, referenceVerification: 'unverified', checkedReferences, reason: 'The bounded verification deadline expired before every reference was checked.' };
    try {
      const result = await execute('git', ['cat-file', '-t', `${commit}:${file}`], { cwd: repositoryPath, timeout: Math.min(timeout, Math.max(1, deadline - Date.now())), maxBuffer: 1024, windowsHide: true });
      if (result.stdout.trim() !== 'blob') errors.push(`Reference is not a file: ${file}.`); else checkedReferences++;
    } catch { errors.push(`Git file reference is unavailable: ${file}.`); }
  }
  return { errors, referenceVerification: errors.length ? 'failed' : 'verified', checkedReferences, reason: errors.length ? 'One or more recorded files could not be resolved.' : 'Every recorded path resolves to a Git blob at its declared commit.' };
}
