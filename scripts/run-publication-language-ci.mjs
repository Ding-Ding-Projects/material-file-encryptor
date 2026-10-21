#!/usr/bin/env node
/** Trusted CI entrypoint. Candidate commits are data, never executable code.
 * History mode needs an explicit trusted event base. Manual current-tree-only
 * mode never proves history safety. Policy input is bounded standard input only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExceptionCarrier, selectRevisionExceptions } from './publication-exceptions.mjs';
import { LIMITS, readPolicy, scanRepository } from './public-language-scan.mjs';

export const CI_LIMITS = Object.freeze({ commits: 50000, records: 1000000, output: 16 * 1024 * 1024 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
function git(root, args, input, category = 'event-history-unavailable') {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(tmpdir(), 'publication-ci-unused-' + randomUUID()) });
  try { return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...args], { cwd: root, env, input, encoding: 'utf8', timeout: 30000, maxBuffer: CI_LIMITS.output, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { fail(category); }
}

export function eventRevisions({ root, tip, base, mode = 'history' }) {
  if (!['history', 'current-tree-only'].includes(mode)) fail('event-mode-invalid');
  const format = git(root, ['rev-parse', '--show-object-format']);
  const length = format === 'sha1' ? 40 : format === 'sha256' ? 64 : 0;
  if (!length) fail('event-object-format-unsupported');
  const oid = value => typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$', 'u').test(value);
  const zero = '0'.repeat(length);
  if (!oid(tip) || tip === zero) fail('event-tip-invalid');
  if (mode === 'history' && !oid(base)) fail('event-base-invalid');
  if (mode === 'history' && base === zero) fail('event-base-publication-unknown');
  if (mode === 'current-tree-only' && base !== undefined) fail('manual-base-not-permitted');
  if (git(root, ['rev-parse', '--is-shallow-repository']) !== 'false') fail('event-history-shallow');
  const grafts = path.resolve(root, git(root, ['rev-parse', '--git-path', 'info/grafts']));
  if (existsSync(grafts) && readFileSync(grafts).length) fail('event-history-grafts-unsupported');
  const requireCommit = (value, label) => {
    const type = git(root, ['cat-file', '-t', value], undefined, label + '-unavailable');
    if (type !== 'commit') fail(label + '-unsupported');
  };
  requireCommit(tip, 'event-tip');
  if (mode === 'current-tree-only') return [tip];
  requireCommit(base, 'event-base');
  const listing = git(root, ['rev-list', '--parents', '--topo-order', '--reverse', '--max-count=' + (CI_LIMITS.commits + 1), '--stdin'], tip + '\n' + base + '\n');
  const graph = new Map();
  for (const line of listing ? listing.split('\n') : []) {
    const fields = line.split(' ');
    if (fields.some(value => !oid(value)) || graph.has(fields[0])) fail('event-history-invalid');
    graph.set(fields[0], fields.slice(1));
  }
  if (graph.size > CI_LIMITS.commits) fail('event-history-oversized');
  for (const value of [tip, base]) if (!graph.has(value)) fail('event-history-incomplete');
  for (const parents of graph.values()) for (const parent of parents) if (!graph.has(parent)) fail('event-history-incomplete');
  const reachable = (start, excluded = new Set()) => {
    const found = new Set(); const pending = [start];
    while (pending.length) { const value = pending.pop(); if (found.has(value) || excluded.has(value)) continue; found.add(value); pending.push(...graph.get(value)); }
    return found;
  };
  const changed = reachable(tip, reachable(base));
  changed.add(tip); // The current tree is always checked, including equal bases.
  return [...graph.keys()].filter(value => changed.has(value));
}

async function policyInput() {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > LIMITS.input) fail('dictionary-input-invalid'); chunks.push(chunk); }
  return readPolicy(Buffer.concat(chunks));
}

async function main() {
  const options = {}; const args = process.argv.slice(2);
  if (args.length % 2) fail('arguments-invalid');
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!['--root', '--tip', '--base', '--mode', '--exceptions-file'].includes(key) || options[key] !== undefined || !value) fail('arguments-invalid');
    options[key] = value;
  }
  if (!options['--root']) fail('candidate-root-unavailable');
  let root;
  try { root = realpathSync(options['--root']); } catch { fail('candidate-root-unavailable'); }
  const ownPath = realpathSync(fileURLToPath(import.meta.url));
  const relative = path.relative(root, ownPath);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) fail('trusted-entrypoint-inside-candidate');
  const mode = options['--mode'] ?? 'history';
  const policy = await policyInput();
  const revisions = eventRevisions({ root, tip: options['--tip'], base: options['--base'], mode });
  const carrier = readExceptionCarrier(options['--exceptions-file'], root);
  const scratch = mkdtempSync(path.join(tmpdir(), 'publication-ci-exceptions-'));
  const selectedFile = path.join(scratch, 'exceptions.json');
  const findings = []; const observations = [];
  try {
  for (const revision of revisions) {
    writeFileSync(selectedFile, JSON.stringify(selectRevisionExceptions(carrier, revision)), { mode: 0o600 });
    const result = scanRepository({ root, revision, policy, exceptionsFile: selectedFile });
    if (findings.length + observations.length + result.findings.length + result.observations.length > CI_LIMITS.records) fail('event-report-oversized');
    for (const finding of result.findings) findings.push(finding);
    for (const observation of result.observations) observations.push(observation);
  }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const status = findings.length ? 'failed' : 'passed';
  const report = JSON.stringify({ status, scope: mode === 'history' ? 'event-base-relative-history' : 'current-tree-only', historyProof: mode === 'history' && status === 'passed', scannedRevisions: revisions.length, findings, observations });
  if (Buffer.byteLength(report) > CI_LIMITS.output) fail('event-report-oversized');
  process.stdout.write(report + '\n');
  process.exitCode = findings.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stdout.write(JSON.stringify({ status: 'error', historyProof: false, findings: [{ path: null, line: 0, category: /^[a-z-]+$/u.test(error?.code ?? '') ? error.code : 'event-scan-incomplete' }] }) + '\n'); process.exitCode = 2; });
}
