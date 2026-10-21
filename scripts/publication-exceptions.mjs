import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const EXCEPTION_LIMITS = Object.freeze({ bytes: 8388608, snapshots: 4096, entries: 65536, setBytes: 262144 });
const fail = () => { throw Object.assign(new Error('exception-carrier-invalid'), { code: 'exception-carrier-invalid' }); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const oid = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value) && !/^0+$/u.test(value);
function validateSet(value) {
  if (!keys(value, ['schemaVersion', 'entries']) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 4096 || Buffer.byteLength(JSON.stringify(value)) > EXCEPTION_LIMITS.setBytes) fail();
  const seen = new Set();
  for (const entry of value.entries) {
    if (!keys(entry, ['path', 'line', 'sha256', 'reason']) || typeof entry.path !== 'string' || !entry.path.length || entry.path.length > 4096 || /[\x00-\x1f\x7f]/u.test(entry.path) || path.posix.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some(part => part === '..' || part === '') || !Number.isSafeInteger(entry.line) || entry.line < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !['technical-identifier', 'proper-name', 'external-quotation'].includes(entry.reason)) fail();
    const key = entry.path + ':' + entry.line; if (seen.has(key)) fail(); seen.add(key);
  }
  return value.entries.length;
}
export function validateExceptionCarrier(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > EXCEPTION_LIMITS.bytes) fail();
  if (value?.schemaVersion === 1) { validateSet(value); return value; }
  if (!keys(value, ['schemaVersion', 'default', 'revisions']) || value.schemaVersion !== 2 || !Array.isArray(value.revisions) || value.revisions.length > EXCEPTION_LIMITS.snapshots) fail();
  let count = validateSet(value.default); const seen = new Set();
  for (const snapshot of value.revisions) {
    if (!keys(snapshot, ['revision', 'exceptions']) || !oid(snapshot.revision) || seen.has(snapshot.revision)) fail();
    seen.add(snapshot.revision); count += validateSet(snapshot.exceptions); if (count > EXCEPTION_LIMITS.entries) fail();
  }
  return value;
}
export function selectRevisionExceptions(carrier, revision) {
  validateExceptionCarrier(carrier); if (!oid(revision)) fail();
  return carrier.schemaVersion === 1 ? carrier : carrier.revisions.find(item => item.revision === revision)?.exceptions ?? carrier.default;
}
export function readExceptionCarrier(file, root) {
  if (!file) return { schemaVersion: 1, entries: [] };
  try {
    const absolute = realpathSync(file); const relative = path.relative(realpathSync(root), absolute);
    if ((!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) || statSync(absolute).size > EXCEPTION_LIMITS.bytes) fail();
    return validateExceptionCarrier(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(absolute))));
  } catch { fail(); }
}
