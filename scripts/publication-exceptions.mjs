import { openSync, fstatSync, readSync, closeSync, realpathSync } from 'node:fs';
import { gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';

export const EXCEPTION_LIMITS = Object.freeze({ bytes: 8388608, snapshots: 4096, entries: 65536, setBytes: 262144, transport: 65536, compressed: 49152, provisioning: 49152 });
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
// The transport is decoded only at the external-file boundary. In-memory selection
// continues to accept raw schema 1/2 carriers, never an encoded or nested envelope.
export function exceptionCarrierTransport(carrier) {
  try {
    validateExceptionCarrier(carrier);
    const compressed = gzipSync(Buffer.from(JSON.stringify(carrier), 'utf8'));
    if (compressed.length > EXCEPTION_LIMITS.compressed) fail();
    const encoded = JSON.stringify({ schemaVersion: 1, encoding: 'gzip+base64', payload: compressed.toString('base64') });
    if (Buffer.byteLength(encoded) > EXCEPTION_LIMITS.provisioning) fail();
    return encoded;
  } catch { fail(); }
}
function singleGzipMember(bytes) {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || (bytes[3] & 0xe0)) fail();
  const flags = bytes[3], boundary = bytes.length - 8;
  let cursor = 10;
  if (flags & 4) {
    if (cursor + 2 > boundary) fail();
    const length = bytes.readUInt16LE(cursor); cursor += 2 + length;
    if (cursor > boundary) fail();
  }
  for (const flag of [8, 16]) if (flags & flag) {
    while (cursor < boundary && bytes[cursor] !== 0) cursor += 1;
    if (cursor >= boundary) fail();
    cursor += 1;
  }
  if (flags & 2) { cursor += 2; if (cursor > boundary) fail(); }
  const first = inflateRawSync(bytes.subarray(cursor), { info: true, maxOutputLength: EXCEPTION_LIMITS.bytes });
  if (!Number.isSafeInteger(first.engine.bytesWritten) || first.engine.bytesWritten < 1 || cursor + first.engine.bytesWritten + 8 !== bytes.length) fail();
  // Gunzip verifies the header, CRC32 and decoded-size trailer after the explicit
  // member boundary rejects concatenation, padding and other trailing bytes.
  const decoded = gunzipSync(bytes, { maxOutputLength: EXCEPTION_LIMITS.bytes });
  if (!decoded.equals(first.buffer)) fail();
  return decoded;
}
function readBounded(file) {
  const fd = openSync(file, 'r');
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > EXCEPTION_LIMITS.bytes) fail();
    const buffer = Buffer.alloc(EXCEPTION_LIMITS.bytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(fd, buffer, total, buffer.length - total, null);
      if (!count) break;
      total += count;
    }
    if (total > EXCEPTION_LIMITS.bytes) fail();
    return buffer.subarray(0, total);
  } finally { closeSync(fd); }
}
function externalCarrier(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (value && typeof value === 'object' && (Object.hasOwn(value, 'encoding') || Object.hasOwn(value, 'payload'))) {
    if (bytes.length > EXCEPTION_LIMITS.transport || !keys(value, ['schemaVersion', 'encoding', 'payload']) || value.schemaVersion !== 1 || value.encoding !== 'gzip+base64' || typeof value.payload !== 'string' || !value.payload.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.payload)) fail();
    const compressed = Buffer.from(value.payload, 'base64');
    if (compressed.length > EXCEPTION_LIMITS.compressed || compressed.toString('base64') !== value.payload) fail();
    return validateExceptionCarrier(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(singleGzipMember(compressed))));
  }
  return validateExceptionCarrier(value);
}
export function readExceptionCarrier(file, root) {
  if (!file) return { schemaVersion: 1, entries: [] };
  try {
    const absolute = realpathSync(file); const relative = path.relative(realpathSync(root), absolute);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) fail();
    return externalCarrier(readBounded(absolute));
  } catch { fail(); }
}
