import { createCipheriv, createDecipheriv, randomBytes as nodeRandomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

/**
 * The encrypted share format, version 1.
 *
 * A share is one opaque blob. It starts with a 21-byte header and continues with a sequence of AES-256-GCM chunks:
 *
 *   header  = "MFESHARE" (8) | version 0x01 (1) | reserved 0x00 (1) | chunk size, u32 big endian (4) | nonce prefix (7)
 *   chunk i = AES-256-GCM(key, nonce_i, plaintext_i, aad = header) || 16-byte tag
 *   nonce_i = nonce prefix (7) | i as u32 big endian (4) | final flag (1: 0x01 on the last chunk, 0x00 otherwise)
 *
 * Every chunk except the last holds exactly chunkSize plaintext bytes; the last holds 0 to chunkSize bytes. The
 * counter makes every nonce distinct under one key (and each share has its own fresh key), the counter in the
 * nonce stops chunks being reordered, the final flag stops the blob being truncated at a chunk boundary, and the
 * header is authenticated by every chunk. The decrypted stream is
 *
 *   metadata length, u32 big endian (4) | metadata JSON | file content
 *
 * so the file name, size and modification time are encrypted. The registry only ever sees the blob size.
 */
export const SHARE_FORMAT_VERSION = 1;
export const SHARE_KEY_BYTES = 32;
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const MAGIC = Buffer.from('MFESHARE', 'latin1');
const HEADER_BYTES = 21;
const PREFIX_BYTES = 7;
const TAG_BYTES = 16;
const MIN_CHUNK = 4096;
const MAX_CHUNK = 16 * 1024 * 1024;
const MAX_METADATA = 64 * 1024;
const MAX_CHUNKS = 0xffffffff;

// The passphrase option wraps the share key. scrypt N=2^17, r=8, p=1 needs about 128 MiB.
const WRAP_VERSION = 1;
const SALT_BYTES = 16;
const WRAP_NONCE_BYTES = 12;
export const WRAPPED_KEY_BYTES = 1 + SALT_BYTES + WRAP_NONCE_BYTES + SHARE_KEY_BYTES + TAG_BYTES;
const SCRYPT = Object.freeze({ N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const WRAP_AAD = Buffer.from('material-file-encryptor share key v1', 'utf8');

/** Errors carry a stable code and a fixed message. They never include a key, a passphrase or file content. */
export function shareError(code) {
  const messages = {
    INVALID_KEY: 'This share command does not open the file. Check that it was copied completely.',
    TAMPERED: 'The shared file failed its integrity check. It was changed or damaged after it was shared.',
    TRUNCATED: 'The shared file is incomplete. It was cut short after it was shared.',
    UNKNOWN_VERSION: 'This share was made by a newer version of the app. Update Material File Encryptor and try again.',
    INVALID_METADATA: 'The shared file description could not be read.',
    WRONG_PASSPHRASE: 'The passphrase does not open this share.',
    PASSPHRASE_REQUIRED: 'This share needs its passphrase.',
    TOO_LARGE: 'The file is larger than a share can hold.',
    SOURCE_CHANGED: 'The file changed while it was being read. Try sharing it again.',
    INVALID_NAME: 'The file name cannot be shared.',
  };
  const error = Error(messages[code] || 'The share could not be read.');
  error.code = code;
  return error;
}

function validChunkSize(value) { return Number.isSafeInteger(value) && value >= MIN_CHUNK && value <= MAX_CHUNK; }
function checkKey(key) { if (!(key instanceof Uint8Array) || key.length !== SHARE_KEY_BYTES) throw shareError('INVALID_KEY'); }

function header(chunkSize, prefix) {
  const bytes = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(bytes, 0); bytes[8] = SHARE_FORMAT_VERSION; bytes[9] = 0;
  bytes.writeUInt32BE(chunkSize, 10); Buffer.from(prefix).copy(bytes, 14);
  return bytes;
}
function nonce(prefix, index, final) {
  if (!Number.isSafeInteger(index) || index < 0 || index > MAX_CHUNKS) throw shareError('TOO_LARGE');
  const bytes = Buffer.alloc(12);
  Buffer.from(prefix).copy(bytes, 0); bytes.writeUInt32BE(index, PREFIX_BYTES); bytes[11] = final ? 1 : 0;
  return bytes;
}
function sealChunk(key, prefix, aad, index, final, plaintext) {
  const cipher = createCipheriv('aes-256-gcm', key, nonce(prefix, index, final), { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}

/** A file name a recipient can save: one path segment, no control or bidirectional override characters. */
export function cleanShareName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC');
  if (!name || [...name].length > 255 || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f\x7f‪-‮⁦-⁩]/.test(name) || /[. ]$/.test(name)) return null;
  return name;
}
function metadataBytes({ name, size, modified }) {
  const cleanName = cleanShareName(name);
  if (!cleanName) throw shareError('INVALID_NAME');
  if (!Number.isSafeInteger(size) || size < 0) throw shareError('INVALID_METADATA');
  const time = modified == null ? null : new Date(modified);
  const json = Buffer.from(JSON.stringify({ v: 1, name: cleanName, size, modified: time && !Number.isNaN(time.getTime()) ? time.toISOString() : null }), 'utf8');
  if (json.length > MAX_METADATA) throw shareError('INVALID_METADATA');
  const length = Buffer.alloc(4); length.writeUInt32BE(json.length, 0);
  return Buffer.concat([length, json]);
}
function parseMetadata(bytes) {
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw shareError('INVALID_METADATA'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== 'modified,name,size,v' || value.v !== 1 ||
      cleanShareName(value.name) !== value.name || !Number.isSafeInteger(value.size) || value.size < 0 ||
      (value.modified !== null && (typeof value.modified !== 'string' || Number.isNaN(new Date(value.modified).getTime())))) throw shareError('INVALID_METADATA');
  return Object.freeze({ name: value.name, size: value.size, modified: value.modified });
}

/** The ciphertext size of a file of plainBytes (with its metadata), used to refuse an oversized share before reading. */
export function sealedSize(plainBytes, metadataLength = 512, chunkSize = DEFAULT_CHUNK_SIZE) {
  const total = 4 + metadataLength + plainBytes;
  const chunks = Math.floor(total / chunkSize) + 1;
  return HEADER_BYTES + total + chunks * TAG_BYTES;
}

/**
 * Encrypts a file read as an async iterable of byte chunks. The plaintext is held one chunk at a time; the
 * ciphertext is collected in memory because the registry upload needs its digest before it starts.
 *   source      async iterable of Uint8Array (for example fs.createReadStream)
 *   size        the expected byte length; a source that yields a different length is refused
 *   maxBytes    the largest ciphertext allowed
 */
export async function sealShare({ key, source, name, size, modified = null, chunkSize = DEFAULT_CHUNK_SIZE, maxBytes = Infinity, randomBytes = nodeRandomBytes, signal } = {}) {
  checkKey(key);
  if (!validChunkSize(chunkSize)) throw shareError('INVALID_METADATA');
  const meta = metadataBytes({ name, size, modified });
  if (sealedSize(size, meta.length - 4, chunkSize) > maxBytes) throw shareError('TOO_LARGE');
  const prefix = randomBytes(PREFIX_BYTES);
  if (!(prefix instanceof Uint8Array) || prefix.length !== PREFIX_BYTES) throw Error('Random bytes are unavailable.');
  const aad = header(chunkSize, prefix);
  const out = [aad]; let outBytes = aad.length, index = 0, read = 0;
  // Pieces are gathered in a list and joined only once a whole chunk is available, so tiny reads stay linear.
  let parts = [Buffer.from(meta)], partBytes = meta.length;
  const take = length => {
    const joined = parts.length === 1 ? parts[0] : Buffer.concat(parts, partBytes);
    parts = [joined.subarray(length)]; partBytes = joined.length - length;
    return joined.subarray(0, length);
  };
  const flushFull = () => {
    // Keep at least one byte back so the last chunk is always produced with the final flag.
    while (partBytes > chunkSize) {
      const sealed = sealChunk(key, prefix, aad, index++, false, take(chunkSize));
      out.push(sealed); outBytes += sealed.length;
      if (outBytes > maxBytes) throw shareError('TOO_LARGE');
    }
  };
  try {
    for await (const piece of source) {
      signal?.throwIfAborted();
      if (!(piece instanceof Uint8Array)) throw shareError('SOURCE_CHANGED');
      read += piece.length;
      if (read > size) throw shareError('SOURCE_CHANGED');
      parts.push(Buffer.from(piece)); partBytes += piece.length;
      if (partBytes > chunkSize) flushFull();
    }
    if (read !== size) throw shareError('SOURCE_CHANGED');
    const last = sealChunk(key, prefix, aad, index, true, take(partBytes));
    out.push(last); outBytes += last.length;
    if (outBytes > maxBytes) throw shareError('TOO_LARGE');
    return Buffer.concat(out, outBytes);
  } finally { parts = null; }
}

function parseHeader(blob) {
  if (!(blob instanceof Uint8Array) || blob.length < HEADER_BYTES + TAG_BYTES) throw shareError('TRUNCATED');
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  if (!bytes.subarray(0, 8).equals(MAGIC)) throw shareError('TAMPERED');
  if (bytes[8] !== SHARE_FORMAT_VERSION) throw shareError('UNKNOWN_VERSION');
  if (bytes[9] !== 0) throw shareError('TAMPERED');
  const chunkSize = bytes.readUInt32BE(10);
  if (!validChunkSize(chunkSize)) throw shareError('TAMPERED');
  return { bytes, chunkSize, aad: bytes.subarray(0, HEADER_BYTES), prefix: bytes.subarray(14, HEADER_BYTES) };
}

/** Yields each authenticated plaintext chunk in order. Nothing is yielded from a chunk that fails authentication. */
function* plaintextChunks(blob, key) {
  checkKey(key);
  const { bytes, chunkSize, aad, prefix } = parseHeader(blob);
  const body = bytes.length - HEADER_BYTES, step = chunkSize + TAG_BYTES;
  const remainder = body % step;
  if (remainder !== 0 && remainder < TAG_BYTES) throw shareError('TRUNCATED');
  const count = Math.floor(body / step) + (remainder ? 1 : 0);
  if (count < 1 || count - 1 > MAX_CHUNKS) throw shareError('TRUNCATED');
  for (let index = 0, offset = HEADER_BYTES; index < count; index++) {
    const final = index === count - 1, end = final ? bytes.length : offset + step;
    const sealed = bytes.subarray(offset, end);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce(prefix, index, final), { authTagLength: TAG_BYTES });
    decipher.setAAD(aad); decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    let plain;
    try { plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]); }
    catch {
      // A blob cut at a chunk boundary leaves a non-final chunk in the final position: it is intact as a middle chunk.
      if (final && sealed.length === step && index < MAX_CHUNKS) {
        const probe = createDecipheriv('aes-256-gcm', key, nonce(prefix, index, false), { authTagLength: TAG_BYTES });
        probe.setAAD(aad); probe.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
        try { probe.update(sealed.subarray(0, sealed.length - TAG_BYTES)); probe.final(); } catch { throw index === 0 ? shareError('INVALID_KEY') : shareError('TAMPERED'); }
        throw shareError('TRUNCATED');
      }
      throw index === 0 ? shareError('INVALID_KEY') : shareError('TAMPERED');
    }
    yield plain;
    offset = end;
  }
}

/**
 * Opens a share. Returns its metadata and a generator of the file content. The content generator authenticates
 * every chunk before yielding it and checks the final length, so a caller that writes each piece must still
 * discard its output if the generator throws.
 */
export function openShare(blob, key) {
  const chunks = plaintextChunks(blob, key);
  let buffered = Buffer.alloc(0), length = null;
  for (;;) {
    if (length === null && buffered.length >= 4) {
      length = buffered.readUInt32BE(0);
      if (length < 2 || length > MAX_METADATA) throw shareError('INVALID_METADATA');
    }
    if (length !== null && buffered.length >= 4 + length) break;
    const next = chunks.next();
    if (next.done) throw shareError('INVALID_METADATA');
    buffered = Buffer.concat([buffered, next.value]);
  }
  const metadata = parseMetadata(buffered.subarray(4, 4 + length));
  const first = buffered.subarray(4 + length);
  function* content() {
    let total = 0;
    if (first.length) { total += first.length; if (total > metadata.size) throw shareError('TAMPERED'); yield first; }
    for (const piece of chunks) {
      total += piece.length;
      if (total > metadata.size) throw shareError('TAMPERED');
      if (piece.length) yield piece;
    }
    if (total !== metadata.size) throw shareError('TAMPERED');
  }
  return { metadata, content };
}

function scrypt(passphrase, salt) {
  return new Promise((resolve, reject) => scryptCallback(passphrase, salt, SHARE_KEY_BYTES, SCRYPT, (error, key) => error ? reject(error) : resolve(key)));
}
function checkPassphrase(value) {
  if (typeof value !== 'string') throw shareError('PASSPHRASE_REQUIRED');
  const text = value.normalize('NFC');
  if (!text.length || text.length > 1024) throw shareError('PASSPHRASE_REQUIRED');
  return Buffer.from(text, 'utf8');
}

/** Wraps the share key under a passphrase, so the command alone does not open the file. */
export async function wrapShareKey(key, passphrase, { randomBytes = nodeRandomBytes } = {}) {
  checkKey(key);
  const secret = checkPassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES), iv = randomBytes(WRAP_NONCE_BYTES);
  const kek = await scrypt(secret, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', kek, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.concat([Buffer.from([WRAP_VERSION]), WRAP_AAD]));
    return Buffer.concat([Buffer.from([WRAP_VERSION]), salt, iv, cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  } finally { kek.fill(0); secret.fill(0); }
}
export async function unwrapShareKey(wrapped, passphrase) {
  if (!(wrapped instanceof Uint8Array) || wrapped.length !== WRAPPED_KEY_BYTES) throw shareError('INVALID_KEY');
  if (wrapped[0] !== WRAP_VERSION) throw shareError('UNKNOWN_VERSION');
  const secret = checkPassphrase(passphrase);
  const bytes = Buffer.from(wrapped);
  const salt = bytes.subarray(1, 17), iv = bytes.subarray(17, 29), sealed = bytes.subarray(29, 29 + SHARE_KEY_BYTES), tag = bytes.subarray(29 + SHARE_KEY_BYTES);
  const kek = await scrypt(secret, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.concat([Buffer.from([WRAP_VERSION]), WRAP_AAD])); decipher.setAuthTag(tag);
    try { return Buffer.concat([decipher.update(sealed), decipher.final()]); } catch { throw shareError('WRONG_PASSPHRASE'); }
  } finally { kek.fill(0); secret.fill(0); }
}

export function sameKey(left, right) { return left instanceof Uint8Array && right instanceof Uint8Array && left.length === right.length && timingSafeEqual(left, right); }
