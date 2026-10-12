import { REQUIRED_FEATURE_IDS } from './required-features.mjs';

// Handwritten expectations are independent of source extraction.
export const REQUIRED_CONCRETE_SURFACE_IDS = Object.freeze([
  'desktop:vault-dialog', 'desktop:confirm-dialog', 'desktop:restore-descendants',
  'extension:popup', 'extension:options', 'extension:options:connection', 'extension:options:personalization', 'extension:options:status', 'site:index', 'site:library', 'site:wiki', 'site:gallery', 'site:workspace',
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
  for(const panel of ['connection','personalization','status']){if(!options.includes('id="panel-'+panel+'"')||!options.includes('aria-controls="panel-'+panel+'"'))throw new Error('Extension panel ownership is unavailable: '+panel);add('extension:options:'+panel,'extension','browser-extension/options.html','browser-extension/options.js','#panel-'+panel);}

  // Preferences are independently addressable on every generated publication route.
  for (const row of [...surfaces].filter(row => row.family === 'site' && !row.selector && row.route !== 'workspace.html')) add(`${row.id}:preferences`, 'site', row.route, 'docs/site/preferences.js', '#preferences-dialog');
  return surfaces.sort((a, b) => a.id.localeCompare(b.id));
}

/** Templates inherit declarations only. Every surface/family verdict defaults to unverified. */
export function expandSurfaceFeatureDelivery(registry) {
  return registry.surfaces.flatMap(surface => (registry.templates[surface.template]?.features || []).map(id => ({
    surface: surface.id, id, applicability: expectedFeatureApplicability(id, surface.family === 'extension' ? 'desktop' : surface.family),
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
      const scope = expectedFeatureApplicability(id, surface.family === 'extension' ? 'desktop' : surface.family);
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
const SITE_ONLY = new Set(['landing-site', 'deen-wah-site', 'installer-download-button', 'feature-articles']);
const APP_ONLY = new Set(['display-name', 'offline-docs', 'external-editor', 'download-handoff', 'forge-publishing', 'screen-recording', 'bundled-dependencies', 'auto-updates']);
const SURFACES = ['desktop', 'site'];
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
  if (REPOSITORY_IDS.has(id)) return { kind: 'repository', applies: true, directSurface: false, declaredScope: 'Repository obligation supporting the product' };
  if ((SITE_ONLY.has(id) && surface === 'desktop') || (APP_ONLY.has(id) && surface === 'site')) return { kind: 'product', applies: true, directSurface: false, declaredScope: 'Named product surface with companion support' };
  return { kind: 'product', applies: true, directSurface: true, declaredScope: 'User-facing product surface' };
}

/** Structural validation only. This function never claims to have queried Git objects. */
export function validateFeatureDelivery(manifest, exists) {
  const errors = [];
  if (!object(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.features)) return ['Invalid feature delivery schema.'];
  if (manifest.features.length > REQUIRED_FEATURE_IDS.length * SURFACES.length) return ['Feature row count exceeds the required inventory.'];
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length !== 2 || !SURFACES.every(surface => manifest.surfaces.includes(surface))) errors.push('Expected exactly the desktop and site surfaces.');
  if (manifest.features.length !== REQUIRED_FEATURE_IDS.length * SURFACES.length) errors.push('Feature row count differs from the required inventory.');
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
