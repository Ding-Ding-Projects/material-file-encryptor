import { REQUIRED_FEATURE_IDS } from './required-features.mjs';

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
