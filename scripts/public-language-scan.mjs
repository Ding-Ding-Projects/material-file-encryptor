#!/usr/bin/env node
/** Publication check. Policy data is runtime input, never a source dependency.
 *
 * Input: {schemaVersion:1,dictionary:{terms:[{alias,plural,proseOnly,forms:[]},...]},
 * publicSafePhrases:[]}. Preserve the complete dictionary document inside dictionary.
 * Compressed transport: {schemaVersion:1,encoding:"gzip+base64",payload:"..."}.
 * Every exceptional inflection must be supplied in forms by the private producer.
 * Optional dictionary.publicationForms supplies additional publication forms
 * without assigning them to unrelated terms (at most 16384 bounded strings).
 *
 * Exceptions are reviewed source locations, not token/Markdown/code exclusions:
 * {schemaVersion:1,entries:[{path,line,sha256,reason}]}. Hash the decoded original
 * line without its terminator as UTF-8; line 0 hashes the complete relative path.
 * The exception file must be outside the candidate checkout. CI must use its
 * pinned trusted-policy copy. Stale, unused and malformed exceptions fail closed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const LIMITS = Object.freeze({ input: 262144, decoded: 2097152, file: 16777216, total: 268435456, files: 50000, exceptions: 262144 });
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const decoder = () => new TextDecoder('utf-8', { fatal: true });
const string = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const inside = (root, value) => { const relative = path.relative(root, value); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const reasons = new Set(['technical-identifier', 'proper-name', 'external-quotation']);

function normalize(value, removeFormats = false) {
  const characters = []; const offsets = [];
  for (let offset = 0; offset < value.length;) {
    let original = String.fromCodePoint(value.codePointAt(offset));
    let consumed = original.length;
    const lead = value[offset];
    const candidate = lead === '\\' || lead === '&' ? value.slice(offset, offset + 16) : '';
    const encoded = candidate ? candidate.match(/^(?:\\u\{([a-f0-9]{1,6})\}|\\u([a-f0-9]{4})|\\x([a-f0-9]{2})|&#x([a-f0-9]{1,6});|&#([0-9]{1,7});)/iu) : null;
    if (encoded) {
      const point = encoded[5] ? Number(encoded[5]) : Number.parseInt(encoded[1] ?? encoded[2] ?? encoded[3] ?? encoded[4], 16);
      if (point <= 0x10ffff) { original = String.fromCodePoint(point); consumed = encoded[0].length; }
    } else if (candidate) {
      const simple = candidate.match(/^\\[nrtfv]/u);
      const named = candidate.match(/^&(?:nbsp|Tab|NewLine);/u);
      if (simple || named) { original = ' '; consumed = (simple ?? named)[0].length; }
    }
    // Identifier casing is not a blanket exemption for rendered inventory IDs.
    const previous = value[offset - 1] ?? '';
    if (/\p{Lu}/u.test(original) && (/[\p{Ll}\p{N}]/u.test(previous) || (/\p{Lu}/u.test(previous) && /\p{Ll}/u.test(value[offset + consumed] ?? '')))) {
      characters.push(' '); offsets.push(offset);
    }
    let part = original.normalize('NFKC').toLowerCase().replace(/\p{M}/gu, '');
    part = part.replace(/\p{Cf}/gu, removeFormats ? '' : ' ').replace(/[\p{Z}\s]/gu, ' ').replace(/\p{Pd}/gu, '-');
    for (const character of part) {
      if (character === ' ' && characters.at(-1) === ' ') continue;
      characters.push(character);
      for (let i = 0; i < character.length; i += 1) offsets.push(offset);
    }
    offset += consumed;
  }
  return { text: characters.join(''), offsets };
}
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requiredLiterals = new WeakMap();
const mayMatch = (text, pattern) => {
  const literal = requiredLiterals.get(pattern);
  return literal === undefined || text.includes(literal);
};
function matcher(value) {
  const term = normalize(value).text.trim();
  const body = term.split(' ').map(escaped).join('[ _-]*');
  const start = /^[\p{L}\p{N}_$]/u.test(term) ? '(?<![\\p{L}\\p{N}])(?:[a-f0-9]{7,64})?' : '';
  // A revision directly after a phrase must not hide that phrase.
  const end = /[\p{L}\p{N}_$]$/u.test(term) ? '(?=$|[^\\p{L}\\p{N}]|[a-f0-9]{7,64}(?:$|[^\\p{L}\\p{N}]))' : '';
  const pattern = new RegExp(start + body + end, 'gu');
  requiredLiterals.set(pattern, term.split(' ')[0]);
  return pattern;
}

export function readPolicy(bytes) {
  if (!bytes.length || bytes.length > LIMITS.input) fail('dictionary-input-invalid');
  let value;
  try { value = JSON.parse(decoder().decode(bytes)); } catch { fail('dictionary-invalid'); }
  if (value?.encoding !== undefined) {
    if (!exactKeys(value, ['schemaVersion', 'encoding', 'payload']) || value.schemaVersion !== 1 || value.encoding !== 'gzip+base64' || typeof value.payload !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.payload)) fail('dictionary-transport-invalid');
    try { value = JSON.parse(decoder().decode(gunzipSync(Buffer.from(value.payload, 'base64'), { maxOutputLength: LIMITS.decoded }))); } catch { fail('dictionary-transport-invalid'); }
  }
  if (!exactKeys(value, ['schemaVersion', 'dictionary', 'publicSafePhrases']) || value.schemaVersion !== 1 || !value.dictionary || !Array.isArray(value.dictionary.terms) || !value.dictionary.terms.length || value.dictionary.terms.length > 4096 || !Array.isArray(value.publicSafePhrases) || value.publicSafePhrases.length > 512) fail('dictionary-schema-invalid');
  if (value.dictionary.termCount !== undefined && value.dictionary.termCount !== value.dictionary.terms.length) fail('dictionary-schema-invalid');
  const forbidden = new Set(); const safe = [];
  for (const term of value.dictionary.terms) {
    if (!term || !string(term.alias) || typeof term.proseOnly !== 'boolean' || typeof term.plural !== 'string' || !Array.isArray(term.forms) || !term.forms.length || term.forms.length > 128 || !term.forms.every(form => string(form))) fail('dictionary-term-invalid');
    const forms = [...term.alias.split(' / '), ...term.forms];
    const plural = term.plural.split(/ \(| -- |; /u)[0].trim();
    if (plural && !/^(?:n\/a|not specified)\b/iu.test(plural)) forms.push(...plural.split(' / '));
    if (!forms.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-term-invalid');
    if (term.proseOnly) forms.forEach(form => forbidden.add(form.trim()));
    else safe.push(...forms);
  }
  if (!forbidden.size || forbidden.size > 16384 || !value.publicSafePhrases.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-schema-invalid');
  safe.push(...value.publicSafePhrases);
  if (value.dictionary.publicationForms !== undefined) {
    const forms = value.dictionary.publicationForms;
    if (!Array.isArray(forms) || forms.length > 16384 || !forms.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-publication-forms-invalid');
    forms.forEach(form => forbidden.add(form.trim()));
    if (forbidden.size > 16384) fail('dictionary-publication-forms-invalid');
  }
  return { forbidden: [...forbidden].sort((a, b) => b.length - a.length).map(matcher), safe: safe.map(matcher) };
}

function findingsIn(text, policy) {
  const found = new Map();
  const lineStarts = [0];
  for (const match of text.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) lineStarts.push(match.index + match[0].length);
  const lineAt = offset => {
    let low = 0; let high = lineStarts.length;
    while (low < high) { const middle = (low + high) >>> 1; if (lineStarts[middle] <= offset) low = middle + 1; else high = middle; }
    return low;
  };
  // Encoded format characters also need the format-removal normalization view.
  const views = /\p{Cf}|\\[ux]|&#/iu.test(text) ? [false, true] : [false];
  for (const removeFormats of views) {
    const normalized = normalize(text, removeFormats);
    const permitted = policy.safe.filter(pattern => mayMatch(normalized.text, pattern)).flatMap(pattern => [...normalized.text.matchAll(pattern)].map(match => [match.index, match.index + match[0].length]));
    for (const pattern of policy.forbidden) {
      if (!mayMatch(normalized.text, pattern)) continue;
      for (const match of normalized.text.matchAll(pattern)) {
        if (permitted.some(([start, end]) => match.index >= start && match.index + match[0].length <= end)) continue;
        const originalOffset = normalized.offsets[match.index] ?? 0;
        const originalEnd = (normalized.offsets[match.index + match[0].length - 1] ?? originalOffset) + 1;
        const line = lineAt(originalOffset);
        const endLine = lineAt(originalEnd);
        found.set(line, { line, endLine: Math.max(endLine, found.get(line)?.endLine ?? line) });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
  return decoder().decode(bytes);
}
// Bounded EBML header recognition (RFC 8794). Unknown sizes and unsupported header
// elements fall back to text scanning; an extension or magic prefix is insufficient.
export function hasWebmHeader(bytes) {
  if (bytes.length < 5 || bytes.subarray(0, 4).toString('hex') !== '1a45dfa3') return false;
  const vint = (offset, limit, id = false) => {
    if (offset >= limit || bytes[offset] === 0) return null;
    let width = 1, marker = 0x80;
    while (!(bytes[offset] & marker)) { width += 1; marker >>= 1; }
    if (width > (id ? 4 : 8) || offset + width > limit) return null;
    let value = BigInt(id ? bytes[offset] : bytes[offset] & (marker - 1));
    for (let index = 1; index < width; index += 1) value = value * 256n + BigInt(bytes[offset + index]);
    if (!id && value === (1n << BigInt(width * 7)) - 1n) return null;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { value: Number(value), end: offset + width };
  };
  const size = vint(4, bytes.length);
  if (!size || size.value < 7 || size.value > 4096 || size.end + size.value > bytes.length) return false;
  const end = size.end + size.value, seen = new Set();
  const defaults = new Map([[0x4286, 1], [0x42f7, 1], [0x42f2, 4], [0x42f3, 8], [0x4287, 1], [0x4285, 1]]);
  let cursor = size.end, elements = 0, docType = false;
  while (cursor < end) {
    if (++elements > 32) return false;
    const id = vint(cursor, end, true);
    if (!id) return false;
    const length = vint(id.end, end);
    if (!length || length.end + length.value > end) return false;
    cursor = length.end + length.value;
    if (id.value === 0xec) continue; // Void is permitted padding.
    if (seen.has(id.value)) return false;
    seen.add(id.value);
    if (id.value === 0x4282) {
      if (length.value !== 4 || bytes.subarray(length.end, cursor).toString('hex') !== '7765626d') return false;
      docType = true;
    } else {
      if (!defaults.has(id.value) || length.value < 1 || length.value > 8) return false;
      let value = 0n;
      for (let index = length.end; index < cursor; index += 1) value = value * 256n + BigInt(bytes[index]);
      if (value < 1n || value > 8n) return false;
      defaults.set(id.value, Number(value));
    }
  }
  return docType && defaults.get(0x4286) === 1 && defaults.get(0x42f7) === 1
    && defaults.get(0x42f2) === 4 && defaults.get(0x42f3) <= 8
    && defaults.get(0x4285) <= defaults.get(0x4287);
}
function binary(bytes) {
  const signatures = ['89504e470d0a1a0a', 'ffd8ff', '474946383761', '474946383961', '504b0304', '504b0506', '1f8b08', '377abcaf271c', '255044462d', '7f454c46', '774f4646', '774f4632', '00000100'];
  const head = bytes.subarray(0, 16).toString('hex');
  return hasWebmHeader(bytes) || signatures.some(signature => head.startsWith(signature)) || (bytes.subarray(0, 2).toString() === 'MZ' && bytes.includes(0));
}
const textExtension = /\.(?:md|txt|json|jsonl|[cm]?js|jsx|ts|tsx|py|ps1|sh|bat|cmd|ya?ml|toml|ini|conf|config|html?|css|scss|sass|less|svg|xml|csv|tsv|sql|tex|c|cc|cpp|h|hpp|cs|rs|go|java|kt|swift|rb|php|vue|svelte|map)$/iu;

function git(root, args, input, maxBuffer = LIMITS.total + 1048576) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[key] !== undefined) env[key] = process.env[key];
  // A nonexistent explicit path disables inherited global configuration portably.
  // Windows Git does not accept device names as configuration file paths.
  const nullConfig = path.join(tmpdir(), 'publication-unused-config-' + randomUUID());
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: nullConfig, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' });
  try { return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...args], { cwd: root, env, input, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { fail('tracked-scan-unavailable'); }
}

function readExceptions(file, root) {
  if (!file) return [];
  let absolute; let value;
  try {
    absolute = realpathSync(file);
    if (inside(root, absolute) || statSync(absolute).size > LIMITS.exceptions) fail('exception-source-invalid');
    value = JSON.parse(decoder().decode(readFileSync(absolute)));
  } catch { fail('exception-source-invalid'); }
  if (!exactKeys(value, ['schemaVersion', 'entries']) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 4096) fail('exception-schema-invalid');
  const seen = new Set();
  for (const entry of value.entries) {
    if (!exactKeys(entry, ['path', 'line', 'sha256', 'reason']) || !string(entry.path, 4096) || path.posix.isAbsolute(entry.path) || entry.path.split('/').some(part => part === '..' || part === '') || entry.path.includes('\\') || !Number.isSafeInteger(entry.line) || entry.line < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !reasons.has(entry.reason)) fail('exception-schema-invalid');
    const key = entry.path + ':' + entry.line;
    if (seen.has(key)) fail('exception-schema-invalid');
    seen.add(key);
  }
  return value.entries.map(entry => ({ ...entry, used: false }));
}

export function scanRepository({ root, revision = 'HEAD', policy, exceptionsFile }) {
  root = realpathSync(root);
  if (revision !== 'HEAD' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) fail('revision-invalid');
  const resolved = git(root, ['rev-parse', '--verify', revision + '^{commit}']).toString().trim();
  const listing = decoder().decode(git(root, ['ls-tree', '-rz', '--full-tree', resolved]));
  const entries = listing.split('\0').filter(Boolean).map(record => {
    const match = record.match(/^([0-7]+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/u);
    if (!match) fail('tracked-inventory-invalid');
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
  if (entries.length > LIMITS.files) fail('tracked-inventory-oversized');
  const exceptions = readExceptions(exceptionsFile, root); const findings = []; const observations = []; let textFiles = 0; let binaryFiles = 0;
  const blobs = entries.filter(entry => entry.type === 'blob');
  const sizes = git(root, ['cat-file', '--batch-check=%(objectsize)'], blobs.map(entry => entry.oid + '\n').join('')).toString().trim().split('\n').filter(Boolean).map(Number);
  if (sizes.length !== blobs.length || sizes.some(size => !Number.isSafeInteger(size) || size < 0 || size > LIMITS.file) || sizes.reduce((a, b) => a + b, 0) > LIMITS.total) fail('tracked-content-oversized');
  const contents = git(root, ['cat-file', '--batch'], blobs.map(entry => entry.oid + '\n').join('')); let position = 0; let blobIndex = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]; const pathLines = findingsIn(entry.path, policy); const reportedPath = pathLines.length ? 'tracked-entry:' + (index + 1) : entry.path;
    const accept = (line, original, category, singleLine = true) => {
      const exemption = exceptions.find(item => item.path === entry.path && item.line === line);
      if (singleLine && exemption && hash(Buffer.from(original, 'utf8')) === exemption.sha256) { exemption.used = true; observations.push({ path: reportedPath, line, category: 'reviewed-' + exemption.reason }); return; }
      findings.push({ path: reportedPath, line, category });
    };
    if (pathLines.length) accept(0, entry.path, 'private-language-path');
    if (entry.type !== 'blob') { findings.push({ path: reportedPath, line: 0, category: 'unscanned-gitlink' }); continue; }
    const newline = contents.indexOf(10, position);
    if (newline < 0) fail('tracked-content-invalid');
    const header = contents.subarray(position, newline).toString(); const size = sizes[blobIndex++];
    if (header !== entry.oid + ' blob ' + size) fail('tracked-content-invalid');
    const bytes = contents.subarray(newline + 1, newline + 1 + size); position = newline + 1 + size + 1;
    if (bytes.length !== size || contents[position - 1] !== 10) fail('tracked-content-invalid');
    if (!textExtension.test(entry.path) && binary(bytes)) { binaryFiles += 1; observations.push({ path: reportedPath, line: 0, category: 'recognized-binary' }); continue; }
    let text;
    try { text = decodeText(bytes); if (text.includes('\0')) throw new Error(); } catch { findings.push({ path: reportedPath, line: 0, category: 'text-encoding-unscanned' }); continue; }
    textFiles += 1;
    const lines = text.split(/\r\n|[\r\n\u2028\u2029]/u);
    for (const match of findingsIn(text, policy)) accept(match.line, lines[match.line - 1], match.line === match.endLine ? 'private-language' : 'private-language-spanning-lines', match.line === match.endLine);
  }
  if (position !== contents.length) fail('tracked-content-invalid');
  for (const entry of exceptions) if (!entry.used) findings.push({ path: findingsIn(entry.path, policy).length ? 'reviewed-entry' : entry.path, line: entry.line, category: 'stale-or-unused-exception' });
  return { status: findings.length ? 'failed' : 'passed', textFiles, binaryFiles, observations, findings };
}

async function inputBytes() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > LIMITS.input) fail('dictionary-input-invalid'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function main() {
  const options = { root: process.cwd() }; const args = process.argv.slice(2); let dictionaryFile;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) fail('arguments-invalid');
    if (args[i] === '--root') options.root = value;
    else if (args[i] === '--revision') options.revision = value;
    else if (args[i] === '--exceptions-file') options.exceptionsFile = value;
    else if (args[i] === '--dictionary-file') dictionaryFile = value;
    else fail('arguments-invalid');
  }
  let bytes;
  if (dictionaryFile) {
    let file;
    try { file = realpathSync(dictionaryFile); if (inside(realpathSync(options.root), file) || statSync(file).size > LIMITS.input) fail('dictionary-source-invalid'); bytes = readFileSync(file); } catch { fail('dictionary-source-invalid'); }
  } else bytes = await inputBytes();
  options.policy = readPolicy(bytes);
  const result = scanRepository(options);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stdout.write(JSON.stringify({ status: 'error', findings: [{ path: null, line: 0, category: /^[a-z-]+$/u.test(error?.code ?? '') ? error.code : 'scan-incomplete' }] }) + '\n'); process.exitCode = 2; });
}
