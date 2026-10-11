// Private-emission v2 metadata for Status Hub agent writes.
//
// The canonical guard lives in the agent-global-memory skill catalog; this module
// resolves it, builds the version-2 metadata the hub demands, and validates the
// complete payload locally before anything leaves the process. When no guard can
// be resolved, every write fails closed with a typed result — this module never
// re-implements the vocabulary rules and never embeds the private dictionary.

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRIVATE_EMISSION_VERSION = 2;

const GUARD_RELATIVE = join('skills', 'agent-global-memory', 'scripts', 'private-emission-guard.mjs');
const PREFLIGHT_RELATIVE = join('skills', 'agent-global-memory', 'scripts', 'private-emission-preflight.mjs');
const HERE = dirname(fileURLToPath(import.meta.url));

let guardPromise = null;

function candidatePaths(relative, environmentName, includeOverride = true) {
  const home = homedir();
  const candidates = [];
  if (includeOverride && environmentName && process.env[environmentName]) candidates.push(process.env[environmentName]);
  // The library ships inside the canonical repository, so the in-tree guard wins
  // whenever the repository layout is intact.
  candidates.push(resolve(HERE, '..', '..', '..', relative));
  if (process.env.CLAUDE_CONFIG_DIR) candidates.push(join(process.env.CLAUDE_CONFIG_DIR, relative));
  candidates.push(join(home, '.claude', relative));
  candidates.push(join(home, '.agents', relative));
  if (process.env.CODEX_HOME) candidates.push(join(process.env.CODEX_HOME, relative));
  let dir = process.cwd();
  for (let depth = 0; depth < 12; depth += 1) {
    candidates.push(join(dir, relative));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates;
}

function existingPath(relative, environmentName, includeOverride = true) {
  return candidatePaths(relative, environmentName, includeOverride).find((candidate) => {
    try { return existsSync(candidate); } catch { return false; }
  }) || '';
}

/** Resolves and imports the canonical guard once per process. */
export function loadGuard() {
  if (!guardPromise) {
    guardPromise = (async () => {
      const found = existingPath(GUARD_RELATIVE, 'STATUS_HUB_PRIVATE_EMISSION_GUARD');
      if (!found) return { ok: false, code: 'GUARD_UNAVAILABLE', error: 'The private-emission guard could not be resolved from any managed skill catalog. Set STATUS_HUB_PRIVATE_EMISSION_GUARD to its path.' };
      try {
        const module = await import(pathToFileURL(found).href);
        if (typeof module.assertPrivateEmission !== 'function' || typeof module.vocabularyPassword !== 'function' || typeof module.PRIVATE_ASSISTANT_IDENTITY !== 'string') {
          return { ok: false, code: 'GUARD_INCOMPLETE', error: `The resolved guard at ${found} does not export the required interface.` };
        }
        return { ok: true, guard: module, path: found };
      } catch (error) {
        return { ok: false, code: 'GUARD_IMPORT_FAILED', error: `The resolved guard at ${found} could not be imported: ${error?.message || 'unknown import failure'}.` };
      }
    })();
  }
  return guardPromise;
}

/** Test hook: forget the cached guard so resolution runs again. */
export function resetGuardCache() { guardPromise = null; }

function identityFields(payload, guard) {
  const identity = guard.PRIVATE_ASSISTANT_IDENTITY;
  const fields = [];
  const visit = (value, path) => {
    if (typeof value === 'string') {
      if (value.includes(identity) && path !== '/agent') {
        fields.push({ path, parts: [{ text: value, owner: 'agent', subject: 'self-reference', boundary: 'agent-prose' }] });
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach((child, index) => visit(child, `${path}/${index}`)); return; }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (path === '' && key === 'privateEmission') continue;
        visit(child, `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`);
      }
    }
  };
  visit(payload, '');
  return fields;
}

function runNodeWithInput(argumentsList, input, { timeoutMs = 10000, maxOutputBytes = 128 * 1024 } = {}) {
  return new Promise((resolveResult) => {
    let child;
    try {
      child = spawn(process.execPath, argumentsList, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch {
      resolveResult({ ok: false, code: 'PREFLIGHT_SPAWN_FAILED' });
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* child may already be gone */ }
      resolveResult({ ok: false, code: 'PREFLIGHT_TIMEOUT' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxOutputBytes) {
        settled = true;
        clearTimeout(timer);
        try { child.kill(); } catch { /* child may already be gone */ }
        resolveResult({ ok: false, code: 'PREFLIGHT_OUTPUT_TOO_LARGE' });
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ ok: false, code: 'PREFLIGHT_SPAWN_FAILED' });
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ ok: code === 0, code: code === 0 ? '' : 'PREFLIGHT_REJECTED', output: Buffer.concat(chunks, size).toString('utf8') });
    });
    child.stdin.on('error', () => { /* the child may reject a bounded input after closing */ });
    try {
      child.stdin.end(input);
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { child.kill(); } catch { /* child may already be gone */ }
        resolveResult({ ok: false, code: 'PREFLIGHT_SPAWN_FAILED' });
      }
    }
  });
}

async function buildWithExternalPreflight(payload, { includeAgentIdentity = false, loaded } = {}) {
  const preflightPath = existingPath(PREFLIGHT_RELATIVE, 'STATUS_HUB_PRIVATE_EMISSION_PREFLIGHT');
  const guardPath = existingPath(GUARD_RELATIVE, 'STATUS_HUB_PRIVATE_EMISSION_GUARD', false);
  if (!preflightPath || !guardPath) return loaded;
  let serialized;
  try { serialized = JSON.stringify(payload); } catch { return { ok: false, code: 'INVALID_PAYLOAD', error: 'The private-emission payload could not be serialized.' }; }
  const helper = `import { PRIVATE_ASSISTANT_IDENTITY, vocabularyPassword } from ${JSON.stringify(pathToFileURL(guardPath).href)};\nlet input = ''; for await (const chunk of process.stdin) input += chunk; const payload = JSON.parse(input); const fields = []; const pointer = (value) => String(value).replaceAll('~', '~0').replaceAll('/', '~1'); const visit = (value, path) => { if (typeof value === 'string') { if (value.includes(PRIVATE_ASSISTANT_IDENTITY) && path !== '/agent') fields.push({ path, parts: [{ text: value, owner: 'agent', subject: 'self-reference', boundary: 'agent-prose' }] }); return; } if (Array.isArray(value)) { value.forEach((child, index) => visit(child, path + '/' + index)); return; } if (value && typeof value === 'object') { for (const [key, child] of Object.entries(value)) if (!(path === '' && key === 'privateEmission')) visit(child, path + '/' + pointer(key)); } }; ${includeAgentIdentity ? "payload.agent = PRIVATE_ASSISTANT_IDENTITY; fields.push({ path: '/agent', parts: [{ text: PRIVATE_ASSISTANT_IDENTITY, owner: 'agent', subject: 'assistant-identity', boundary: 'agent-prose' }] });" : "delete payload.agent;"} visit(payload, ''); payload.privateEmission = { version: 2, audience: 'private', producer: 'agent', vocabularyPassword: vocabularyPassword(), fields }; process.stdout.write(JSON.stringify(payload));`;
  const built = await runNodeWithInput(['--input-type=module', '-e', helper], serialized);
  if (!built.ok || typeof built.output !== 'string' || !built.output) return { ok: false, code: built.code || 'PREFLIGHT_REJECTED', error: 'The external private-emission preflight builder failed closed.' };
  const checked = await runNodeWithInput([preflightPath], built.output);
  if (!checked.ok) return { ok: false, code: checked.code || 'PREFLIGHT_REJECTED', error: 'The private-emission preflight rejected the payload.' };
  return { ok: true, body: built.output };
}

/**
 * Attaches version-2 metadata to a payload and validates it with the canonical
 * guard. Returns { ok, body } where body is the exact serialized string to send;
 * the caller must transmit that byte-identical string. Fails closed on any
 * classification the guard rejects — including free prose that only the caller
 * can rephrase — so a misclassified emission never reaches the hub.
 */
export async function buildPrivateEmission(payload, { includeAgentIdentity = false } = {}) {
  const loaded = await loadGuard();
  if (!loaded.ok) {
    const fallback = await buildWithExternalPreflight(payload, { includeAgentIdentity, loaded });
    return fallback?.ok || (fallback?.code && fallback.code !== loaded.code) ? fallback : loaded;
  }
  const { guard } = loaded;
  const enriched = { ...payload };
  const fields = [];
  if (includeAgentIdentity) {
    enriched.agent = guard.PRIVATE_ASSISTANT_IDENTITY;
    fields.push({ path: '/agent', parts: [{ text: guard.PRIVATE_ASSISTANT_IDENTITY, owner: 'agent', subject: 'assistant-identity', boundary: 'agent-prose' }] });
  } else {
    delete enriched.agent;
  }
  fields.push(...identityFields(enriched, guard));
  let vocabularyPassword;
  try {
    vocabularyPassword = guard.vocabularyPassword();
  } catch (error) {
    return { ok: false, code: 'VOCABULARY_PASSWORD_UNAVAILABLE', error: `The vocabulary password could not be derived: ${error?.message || 'unknown failure'}.` };
  }
  enriched.privateEmission = { version: PRIVATE_EMISSION_VERSION, audience: 'private', producer: 'agent', vocabularyPassword, fields };
  try {
    guard.assertPrivateEmission(enriched);
  } catch (error) {
    return { ok: false, code: error?.code || 'PRIVATE_EMISSION_REJECTED', error: error?.message || 'The private-emission guard rejected the payload.' };
  }
  return { ok: true, body: JSON.stringify(enriched) };
}
