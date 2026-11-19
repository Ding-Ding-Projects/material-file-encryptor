import { scrypt } from './scrypt.js';

/**
 * Opens a Material File Encryptor share (format version 1) in the browser. It mirrors the desktop format:
 *
 *   header  = "MFESHARE" | 0x01 | 0x00 | chunk size u32 BE | nonce prefix (7)          21 bytes
 *   chunk i = AES-256-GCM(key, prefix | i u32 BE | final flag, aad = header) || tag    16-byte tag
 *   plain   = metadata length u32 BE | metadata JSON | file content
 *
 * The key comes from the link fragment, which a browser never sends to the server.
 */
export const HEADER_BYTES = 21;
const TAG_BYTES = 16, KEY_BYTES = 32, WRAPPED_BYTES = 1 + 16 + 12 + 32 + 16;
const MAGIC = [77, 70, 69, 83, 72, 65, 82, 69];
const WRAP_AAD = new TextEncoder().encode('material-file-encryptor share key v1');

export class ShareOpenError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ShareOpenError(code); };

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  try { return Uint8Array.from(atob(padded), c => c.charCodeAt(0)); } catch { return null; }
}

/** The fragment after #: the 32-byte key, or "p:" and the passphrase-wrapped key. */
export function parseSecret(fragment) {
  const text = String(fragment || '').replace(/^#/, '');
  if (text.startsWith('p:')) { const wrapped = fromBase64Url(text.slice(2)); if (!wrapped || wrapped.length !== WRAPPED_BYTES) fail('INVALID_LINK'); return { wrapped }; }
  const key = fromBase64Url(text); if (!key || key.length !== KEY_BYTES) fail('INVALID_LINK');
  return { key };
}

export async function unwrapKey(wrapped, passphrase, onProgress) {
  if (wrapped[0] !== 1) fail('UNKNOWN_VERSION');
  const text = String(passphrase || '').normalize('NFC');
  if (!text) fail('PASSPHRASE_REQUIRED');
  const kek = await scrypt(new TextEncoder().encode(text), wrapped.slice(1, 17), { N: 2 ** 17, r: 8, p: 1, length: 32 }, onProgress);
  const key = await crypto.subtle.importKey('raw', kek, 'AES-GCM', false, ['decrypt']);
  const aad = new Uint8Array([1, ...WRAP_AAD]);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wrapped.slice(17, 29), additionalData: aad, tagLength: 128 }, key, wrapped.slice(29))); }
  catch { fail('WRONG_PASSPHRASE'); }
}

function nonce(prefix, index, final) {
  const bytes = new Uint8Array(12); bytes.set(prefix, 0);
  new DataView(bytes.buffer).setUint32(7, index, false); bytes[11] = final ? 1 : 0;
  return bytes;
}

function parseHeader(header) {
  if (header.length < HEADER_BYTES || MAGIC.some((value, i) => header[i] !== value)) fail('TAMPERED');
  if (header[8] !== 1) fail('UNKNOWN_VERSION');
  if (header[9] !== 0) fail('TAMPERED');
  const chunkSize = new DataView(header.buffer, header.byteOffset).getUint32(10, false);
  if (chunkSize < 4096 || chunkSize > 16 * 1024 * 1024) fail('TAMPERED');
  return { chunkSize, prefix: header.slice(14, 21) };
}

function validName(name) {
  return typeof name === 'string' && name.length > 0 && [...name].length <= 255 && name !== '.' && name !== '..' && !/[\\/:*?"<>|\x00-\x1f\x7f‪-‮⁦-⁩]/.test(name) && !/[. ]$/.test(name);
}
function parseMetadata(bytes) {
  let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('INVALID_METADATA'); }
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join() !== 'modified,name,size,v' || value.v !== 1 || !validName(value.name) || !Number.isSafeInteger(value.size) || value.size < 0) fail('INVALID_METADATA');
  return { name: value.name, size: value.size, modified: value.modified };
}

/** Reads exactly n bytes from a ReadableStream reader, or fewer at the end. */
function byteReader(reader) {
  let queue = [], queued = 0, ended = false;
  return async function read(n) {
    while (queued < n && !ended) { const { done, value } = await reader.read(); if (done) ended = true; else { queue.push(value); queued += value.length; } }
    const take = Math.min(n, queued), out = new Uint8Array(take); let at = 0;
    while (at < take) { const head = queue[0], need = take - at; if (head.length <= need) { out.set(head, at); at += head.length; queue.shift(); } else { out.set(head.subarray(0, need), at); queue[0] = head.subarray(need); at += need; } }
    queued -= take; return out;
  };
}

/**
 * Decrypts a share stream.
 *   reader     a ReadableStream reader over the ciphertext
 *   total      the ciphertext size in bytes
 *   onMetadata called once with { name, size, modified } before any content
 *   onContent  called with each authenticated plaintext piece, in order
 *   stopAfterMetadata  read only as far as the metadata (used for the preview)
 */
export async function openShareStream({ reader, total, key, onMetadata, onContent = () => {}, onProgress = () => {}, stopAfterMetadata = false }) {
  const read = byteReader(reader);
  const header = await read(HEADER_BYTES);
  if (header.length < HEADER_BYTES) fail('TRUNCATED');
  const { chunkSize, prefix } = parseHeader(header);
  const body = total - HEADER_BYTES, step = chunkSize + TAG_BYTES, remainder = body % step;
  if (body < TAG_BYTES || (remainder !== 0 && remainder < TAG_BYTES)) fail('TRUNCATED');
  const count = Math.floor(body / step) + (remainder ? 1 : 0);
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  let pending = new Uint8Array(0), metadata = null, written = 0, consumed = HEADER_BYTES;
  for (let index = 0; index < count; index++) {
    const final = index === count - 1, size = final ? body - index * step : step;
    const sealed = await read(size);
    if (sealed.length !== size) fail('TRUNCATED');
    let plain;
    try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(prefix, index, final), additionalData: header, tagLength: 128 }, cryptoKey, sealed)); }
    catch { fail(index === 0 ? 'INVALID_KEY' : 'TAMPERED'); }
    consumed += size; onProgress(consumed / total);
    if (!metadata) {
      const joined = new Uint8Array(pending.length + plain.length); joined.set(pending); joined.set(plain, pending.length); pending = joined;
      if (pending.length < 4) continue;
      const length = new DataView(pending.buffer).getUint32(0, false);
      if (length < 2 || length > 65536) fail('INVALID_METADATA');
      if (pending.length < 4 + length) continue;
      metadata = parseMetadata(pending.subarray(4, 4 + length));
      await onMetadata?.(metadata);
      if (stopAfterMetadata) { await reader.cancel().catch(() => {}); return { metadata, complete: false }; }
      plain = pending.subarray(4 + length); pending = null;
    }
    if (plain.length) { written += plain.length; if (written > metadata.size) fail('TAMPERED'); await onContent(plain); }
  }
  if (!metadata) fail('INVALID_METADATA');
  if (written !== metadata.size) fail('TAMPERED');
  return { metadata, complete: true };
}
