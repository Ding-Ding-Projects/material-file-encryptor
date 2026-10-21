/** Resolve outgoing commit trees using fresh evidence from one named destination.
 * No fetch, reference update, index write or configuration mutation is performed.
 * Missing destination objects require an authorized fetch before another attempt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const HISTORY_LIMITS = Object.freeze({ input: 1048576, rows: 4096, refs: 20000, commits: 50000, output: 16 * 1024 * 1024 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const identity = value => value.replace(/\.git$/u, '').replace(/\/$/u, '');

function git(root, args, input, category = 'history-command-unavailable', destinationTransport = false) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[key] !== undefined) env[key] = process.env[key];
  // Only destination advertisement needs network routing and configured CA trust.
  // Never forward credentials, Git configuration injection, askpass or TLS-disable flags.
  if (destinationTransport) for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH']) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' });
  try {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...args], { cwd: root, env, input, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: HISTORY_LIMITS.output, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { fail(category); }
}

function validRef(value) {
  return typeof value === 'string' && value.length <= 1024 && value.startsWith('refs/') &&
    !/[\x00-\x20\x7f~^:?*\[\\]/u.test(value) && !value.includes('..') && !value.includes('@{') &&
    !value.endsWith('.') && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

export function outgoingRevisions({ root, remoteName, remoteLocation, expectedRepository, input }) {
  try { if (typeof root !== 'string' || !root) fail('history-root-unavailable'); root = realpathSync(root); } catch { fail('history-root-unavailable'); }
  if (typeof remoteName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(remoteName) ||
      typeof remoteLocation !== 'string' || !remoteLocation || /[\x00-\x20\x7f]/u.test(remoteLocation) ||
      typeof expectedRepository !== 'string' || !expectedRepository || identity(remoteLocation) !== identity(expectedRepository)) fail('destination-identity-invalid');
  const configured = git(root, ['remote', 'get-url', '--push', '--all', remoteName], undefined, 'destination-configuration-unavailable').split('\n');
  if (configured.length !== 1 || configured[0] !== remoteLocation) fail('destination-configuration-mismatch');
  const format = git(root, ['rev-parse', '--show-object-format']);
  const length = format === 'sha1' ? 40 : format === 'sha256' ? 64 : 0;
  if (!length) fail('history-object-format-unsupported');
  const oid = value => typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$', 'u').test(value);
  const zero = '0'.repeat(length);
  if (git(root, ['rev-parse', '--is-shallow-repository']) !== 'false') fail('history-shallow');
  const grafts = git(root, ['rev-parse', '--git-path', 'info/grafts']);
  // Grafts can conceal parents even when replacement references are disabled.
  const resolvedGrafts = path.resolve(root, grafts);
  if (existsSync(resolvedGrafts) && readFileSync(resolvedGrafts).length) fail('history-grafts-unsupported');
  let text;
  try {
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? '', 'utf8');
    if (bytes.length > HISTORY_LIMITS.input) fail('history-input-oversized');
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) { if (error?.code === 'history-input-oversized') throw error; fail('history-input-invalid'); }
  const lines = text ? text.replace(/\r\n/gu, '\n').split('\n') : [];
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > HISTORY_LIMITS.rows) fail('history-input-oversized');
  const rows = []; const seen = new Set();
  for (const line of lines) {
    const fields = line.split(' ');
    if (fields.length !== 4 || fields.some(field => !field)) fail('history-row-invalid');
    const [localRef, localOid, destinationRef, destinationOid] = fields;
    if (!oid(localOid) || !oid(destinationOid) || !validRef(destinationRef) || seen.has(destinationRef)) fail('history-row-invalid');
    if (localOid === zero ? localRef !== '(delete)' || destinationOid === zero : !(validRef(localRef) || localRef === 'HEAD' || oid(localRef))) fail('history-row-invalid');
    seen.add(destinationRef); rows.push({ localOid, destinationRef, destinationOid });
  }
  const advertised = new Map();
  const listing = git(root, ['ls-remote', '--refs', '--', remoteLocation], undefined, 'destination-advertisement-unavailable', true);
  for (const line of listing ? listing.split('\n') : []) {
    const fields = line.split('\t');
    if (fields.length !== 2 || !oid(fields[0]) || fields[0] === zero || !validRef(fields[1]) || advertised.has(fields[1])) fail('destination-advertisement-invalid');
    advertised.set(fields[1], fields[0]);
  }
  if (advertised.size > HISTORY_LIMITS.refs) fail('destination-advertisement-oversized');
  for (const row of rows) if ((advertised.get(row.destinationRef) ?? zero) !== row.destinationOid) fail('destination-state-mismatch');
  const localTips = rows.filter(row => row.localOid !== zero).map(row => row.localOid);
  if (!localTips.length) return [];
  const peel = (value, prefix) => {
    let type;
    try { type = git(root, ['cat-file', '-t', value]); } catch { fail(prefix + '-object-unavailable'); }
    if (type !== 'commit' && type !== 'tag') fail(prefix + '-object-unsupported');
    try { const result = git(root, ['rev-parse', '--verify', value + '^{commit}']); if (!oid(result)) fail(prefix + '-target-unavailable-or-unsupported'); return result; }
    catch { fail(prefix + '-target-unavailable-or-unsupported'); }
  };
  const local = [...new Set(localTips.map(value => peel(value, 'local')))];
  const published = [...new Set([...advertised.values()].map(value => peel(value, 'destination')))];
  const roots = [...new Set([...local, ...published])];
  const graphText = git(root, ['rev-list', '--parents', '--topo-order', '--reverse', '--max-count=' + (HISTORY_LIMITS.commits + 1), '--stdin'], roots.join('\n') + '\n', 'history-graph-unavailable');
  const graph = new Map();
  for (const line of graphText ? graphText.split('\n') : []) {
    const fields = line.split(' ');
    if (!fields.length || fields.some(value => !oid(value)) || graph.has(fields[0])) fail('history-graph-invalid');
    graph.set(fields[0], fields.slice(1));
  }
  if (graph.size > HISTORY_LIMITS.commits) fail('history-graph-oversized');
  for (const value of roots) if (!graph.has(value)) fail('history-graph-incomplete');
  for (const parents of graph.values()) for (const parent of parents) if (!graph.has(parent)) fail('history-graph-incomplete');
  const reachable = (tips, excluded = new Set()) => {
    const found = new Set(); const pending = [...tips];
    while (pending.length) { const value = pending.pop(); if (found.has(value) || excluded.has(value)) continue; found.add(value); pending.push(...graph.get(value)); }
    return found;
  };
  const transmitted = reachable(local, reachable(published));
  return [...graph.keys()].filter(value => transmitted.has(value));
}
