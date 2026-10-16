#!/usr/bin/env node
// Destructive action guard.
//
// Every destructive action in the desktop application, the browser extension and the documentation site must pass the
// two-key super confirmation. This guard holds the source to the registry in src/shared/destructive-actions.js:
//
//   unconfirmed   a registered action whose source file no longer references its registry id next to a confirmation
//                 call, or whose handler token has disappeared (so the entry is stale)
//   unregistered  a destructive-looking request, handler or IPC name that is neither registered nor exempted in writing
//   registry      a malformed, duplicated, mis-prefixed or untranslated registry entry
//   drift         the browser extension's own copy of its entries differs from the shared registry
//
// Usage: node scripts/audit-destructive-actions.mjs [--json]
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = path => relative(root, path).split(sep).join('/');

const SOURCE_DIRS = ['src', 'browser-extension', 'docs/site'];
const SKIP_DIRS = new Set(['vendor', 'node_modules', 'icons', 'fonts', 'unicode', 'wiki']);
const SKIP_FILES = /(?:^|\/)(?:locales|copy|[a-z-]*-copy|[a-z-]*-content|language-pairs|gallery-[a-z]+|public-images|publication)\.(?:m?js|json)$|\.d\.ts$|ollama-runtime-files\.json$/;

/** Names that mean "this removes, overwrites, stops or revokes something". Matched against whole request and handler names. */
export const DESTRUCTIVE_NAME = /^(?:delete|remove|clear|reset|revoke|uninstall|forceLock|force|stop|wipe|discard|overwrite|empty|purge|erase|restart|rollback|disconnect|forget|prune|signOut|unpair)[A-Za-z]*$/;

/** The helpers that open the two-key confirmation. Each takes the registry id as its first argument, or as its second after a host. */
const CONFIRM_HELPERS = 'confirmDestructiveAction|superConfirm|confirmDestructive|confirmed|ask|confirm|confirmLogo|confirmAppearance|confirmSiteDestructive';

function walk(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const name of readdirSync(directory)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(directory, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:m?js|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const defaultFiles = () => SOURCE_DIRS.flatMap(directory => walk(join(root, directory))).map(rel).filter(file => !SKIP_FILES.test(file));
const defaultRead = file => readFileSync(join(root, file), 'utf8');

/** The id counts only as an argument of a confirmation helper, as an option named destructiveId, or as the trailing id of a confirmAction callback. */
function referencesId(text, id) {
  const q = '[\'"`]', literal = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shapes = [
    new RegExp(`destructiveId\\s*:\\s*${q}${literal}${q}`),
    new RegExp(`\\b(?:${CONFIRM_HELPERS})\\(\\s*(?:[^,'"\`()]{0,60},\\s*)?${q}${literal}${q}`),
    new RegExp(`confirmAction\\([\\s\\S]{0,4000}?\\}\\s*,\\s*${q}${literal}${q}\\s*\\)`)
  ];
  return shapes.some(shape => shape.test(text));
}

/** Names a registry entry accounts for: each invokes token, and the last segment of a dotted token. */
function coveredNames(entries) {
  const names = new Set();
  for (const entry of entries) for (const token of entry.invokes) { names.add(token); names.add(token.split('.').pop()); }
  return names;
}

/** Collect destructive-looking names used as requests, handlers or IPC channels. */
export function findDestructiveNames(text) {
  const found = new Set();
  const patterns = [
    /(?:request|invoke|featureRequest|send|call|manage|perform|backend)\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?['"`]([A-Za-z]+)['"`]/g,
    /\bapi\.([A-Za-z]+)\(/g,
    /\b(?:method|action|type)\s*===?\s*['"`]([A-Za-z]+)['"`]/g,
    /\bcase\s+['"`]([A-Za-z]+)['"`]\s*:/g,
    /ipcMain\.handle\(\s*['"`]([A-Za-z:.-]+)['"`]/g,
    /\bmodelCall\(\s*['"`]([A-Za-z]+)['"`]/g,
    /\binvoke\(\s*['"`]([A-Za-z]+)['"`]/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      // A channel such as vault:overwriteDrive is judged by its last segment.
      const name = match[1].split(/[:.-]/).pop();
      if (DESTRUCTIVE_NAME.test(name)) found.add(name);
    }
  }
  return found;
}

export async function auditDestructiveActions({read = defaultRead, files = defaultFiles(), registry} = {}) {
  const module = registry ?? await import(pathToFileURL(join(root, 'src/shared/destructive-actions.js')).href);
  const {DESTRUCTIVE_ACTIONS, EXEMPT_ACTIONS, EXEMPT_IN_FILES = []} = module;
  const findings = [];
  const add = (kind, file, message) => findings.push({kind, file, message});

  // ---- registry shape ------------------------------------------------------------------------------------------
  const seen = new Set();
  for (const entry of DESTRUCTIVE_ACTIONS) {
    if (seen.has(entry.id)) add('registry', entry.file, `duplicate id ${entry.id}`);
    seen.add(entry.id);
    const prefix = entry.id.split('.')[0];
    if (!entry.surfaces.includes(prefix)) add('registry', entry.file, `${entry.id}: the id prefix must be one of its surfaces (${entry.surfaces.join(', ')})`);
    for (const key of ['title', 'affected']) {
      const pair = entry[key];
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(part => typeof part !== 'string' || !part.trim())) add('registry', entry.file, `${entry.id}: ${key} needs an English and a Cantonese text`);
    }
    if (!entry.invokes.length) add('registry', entry.file, `${entry.id}: list the handler or request tokens it guards`);
  }
  for (const item of EXEMPT_IN_FILES) if (typeof item.reason !== 'string' || item.reason.length < 24) add('registry', item.file, `exempt name ${item.name} needs a written reason`);
  for (const [name, reason] of Object.entries(EXEMPT_ACTIONS)) if (typeof reason !== 'string' || reason.length < 24) add('registry', 'src/shared/destructive-actions.js', `exempt name ${name} needs a written reason`);

  // ---- every registered action is confirmed in its file ----------------------------------------------------------
  for (const entry of DESTRUCTIVE_ACTIONS) {
    if (entry.route !== 'super-confirmation') continue;
    let text;
    try { text = read(entry.file); } catch { add('unconfirmed', entry.file, `${entry.id}: source file is missing`); continue; }
    if (!referencesId(text, entry.id)) add('unconfirmed', entry.file, `${entry.id}: no confirmation call references this id, so the action can run without the two-key confirmation`);
    for (const token of entry.invokes) if (!text.includes(token)) add('unconfirmed', entry.file, `${entry.id}: handler token ${token} is gone from this file, so the registry entry is stale`);
  }

  // ---- every destructive-looking name is registered or exempt ---------------------------------------------------
  const covered = coveredNames(DESTRUCTIVE_ACTIONS);
  const exempt = new Set(Object.keys(EXEMPT_ACTIONS));
  for (const file of files) {
    let text;
    try { text = read(file); } catch { continue; }
    for (const name of findDestructiveNames(text)) {
      if (!covered.has(name) && !exempt.has(name) && !EXEMPT_IN_FILES.some(item => item.file === file && item.name === name)) add('unregistered', file, `${name}: destructive-looking name is neither in src/shared/destructive-actions.js nor exempted with a reason`);
    }
  }

  // ---- the extension's copy matches the registry -------------------------------------------------------------------
  try {
    const extension = await import(pathToFileURL(join(root, 'browser-extension/destructive-confirm.js')).href + '?audit=' + Date.now());
    const registered = DESTRUCTIVE_ACTIONS.filter(item => item.surfaces.includes('extension'));
    const copy = extension.EXTENSION_DESTRUCTIVE;
    for (const item of registered) {
      const local = copy[item.id];
      if (!local) { add('drift', 'browser-extension/destructive-confirm.js', `${item.id} is missing from the extension copy`); continue; }
      if (JSON.stringify(local.title) !== JSON.stringify(item.title) || JSON.stringify(local.affected) !== JSON.stringify(item.affected)) add('drift', 'browser-extension/destructive-confirm.js', `${item.id} differs from the shared registry`);
    }
    for (const id of Object.keys(copy)) if (!registered.some(item => item.id === id)) add('drift', 'browser-extension/destructive-confirm.js', `${id} is not in the shared registry`);
  } catch (error) {
    add('drift', 'browser-extension/destructive-confirm.js', 'extension copy could not be loaded: ' + error.message);
  }

  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const findings = await auditDestructiveActions();
  if (process.argv.includes('--json')) console.log(JSON.stringify(findings, null, 2));
  else if (findings.length) for (const finding of findings) console.log(`${finding.kind.padEnd(12)} ${finding.file}: ${finding.message}`);
  else console.log('Destructive action audit: 0 findings.');
  process.exit(findings.length ? 1 : 0);
}
