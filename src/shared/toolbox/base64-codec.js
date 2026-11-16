// Pure Base64 codec used by the renderer and the main process. No DOM or Node-only APIs.
const STANDARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const VARIANTS = Object.freeze(['standard', 'url', 'mime']);
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;

export class Base64Error extends Error {
  constructor(code, message, offset = null) { super(message); this.name = 'Base64Error'; this.code = code; this.offset = offset; }
}

const alphabetFor = variant => variant === 'url' ? URLSAFE : STANDARD;
const reverse = new Map();
for (const [index, char] of [...STANDARD].entries()) reverse.set(char, index);
reverse.set('-', 62); reverse.set('_', 63);

export function normalizeOptions(options = {}) {
  const variant = VARIANTS.includes(options.variant) ? options.variant : 'standard';
  const pad = options.pad === undefined ? variant !== 'url' : options.pad !== false;
  let lineLength = variant === 'mime' ? 76 : 0;
  if (options.lineLength !== undefined) {
    const asked = Math.max(0, Math.min(1024, Math.floor(Number(options.lineLength) || 0)));
    lineLength = asked > 0 ? Math.max(4, asked - (asked % 4)) : 0;
  }
  const lineEnding = options.lineEnding === 'lf' ? '\n' : '\r\n';
  return { variant, pad, lineLength, lineEnding };
}

function encodeRaw(bytes, alphabet, pad) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) { const n = bytes[i] << 16; out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + (pad ? '==' : ''); }
  else if (rest === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += alphabet[n >> 18] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + (pad ? '=' : ''); }
  return out;
}

export function wrapLines(text, lineLength, lineEnding = '\r\n') {
  if (!lineLength || text.length <= lineLength) return text;
  const lines = [];
  for (let i = 0; i < text.length; i += lineLength) lines.push(text.slice(i, i + lineLength));
  return lines.join(lineEnding);
}

export function encodeBytes(bytes, options = {}) {
  const o = normalizeOptions(options);
  return wrapLines(encodeRaw(bytes, alphabetFor(o.variant), o.pad), o.lineLength, o.lineEnding);
}

export function encodeText(text, options = {}) { return encodeBytes(new TextEncoder().encode(String(text)), options); }

/**
 * Strict decoding rejects whitespace, mixed alphabets and bad padding with the exact offset.
 * Lenient decoding skips whitespace and accepts either alphabet.
 */
export function decodeToBytes(input, options = {}) {
  const strict = options.strict === true;
  const variant = VARIANTS.includes(options.variant) ? options.variant : 'standard';
  const text = String(input);
  const values = [];
  let padStart = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '=') { if (padStart < 0) padStart = i; continue; }
    if (padStart >= 0) throw new Base64Error('DATA_AFTER_PADDING', `Data after padding at offset ${i}.`, i);
    if (/\s/.test(char)) {
      if (strict && variant !== 'mime') throw new Base64Error('WHITESPACE', `Whitespace is not allowed in strict mode (offset ${i}).`, i);
      continue;
    }
    const value = reverse.get(char);
    if (value === undefined) throw new Base64Error('INVALID_CHARACTER', `Invalid character at offset ${i}.`, i);
    if (strict) {
      if (variant === 'url' && (char === '+' || char === '/')) throw new Base64Error('WRONG_ALPHABET', `Standard-alphabet character in URL-safe input at offset ${i}.`, i);
      if (variant !== 'url' && (char === '-' || char === '_')) throw new Base64Error('WRONG_ALPHABET', `URL-safe character in standard input at offset ${i}.`, i);
    }
    values.push(value);
  }
  const padCount = padStart >= 0 ? text.slice(padStart).replace(/\s/g, '').length : 0;
  if (values.length % 4 === 1) throw new Base64Error('BAD_LENGTH', 'The input length is not valid Base64 (one dangling character).', text.length);
  if (strict) {
    if (variant !== 'url' && padStart < 0 && values.length % 4 !== 0) throw new Base64Error('MISSING_PADDING', 'Padding is required in strict mode.', text.length);
    if (padStart >= 0 && variant === 'url') throw new Base64Error('BAD_PADDING', `URL-safe strict input must be unpadded (offset ${padStart}).`, padStart);
    if (padStart >= 0 && (values.length + padCount) % 4 !== 0) throw new Base64Error('BAD_PADDING', `Padding is wrong at offset ${padStart}.`, padStart);
  }
  const out = new Uint8Array(Math.floor(values.length * 6 / 8));
  let buffer = 0, bits = 0, index = 0;
  for (const value of values) {
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; out[index++] = (buffer >> bits) & 255; buffer &= (1 << bits) - 1; }
  }
  if (strict && bits > 0 && buffer !== 0) throw new Base64Error('NONZERO_TRAILING_BITS', 'Trailing bits are not zero.', text.length);
  return out;
}

export function decodeToText(input, options = {}) {
  const bytes = decodeToBytes(input, options);
  try { return new TextDecoder(options.encoding || 'utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Base64Error('NOT_TEXT', 'The decoded bytes are not valid text in the selected encoding.'); }
}

export function toHexView(bytes, { width = 16, limit = 4096 } = {}) {
  const lines = [];
  const end = Math.min(bytes.length, limit);
  for (let i = 0; i < end; i += width) {
    const row = bytes.subarray(i, Math.min(i + width, end));
    const hex = [...row].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(width * 3 - 1, ' ');
    const ascii = [...row].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
  }
  if (bytes.length > end) lines.push(`... ${bytes.length - end} more bytes`);
  return lines.join('\n');
}

export function buildDataUri(bytes, mime = 'application/octet-stream') {
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)) throw new Base64Error('BAD_MIME', 'The media type is not valid.');
  return `data:${mime};base64,${encodeBytes(bytes, { variant: 'standard' })}`;
}

export function parseDataUri(uri) {
  const match = /^data:([^,;]*)((?:;[^,;]*)*),(.*)$/s.exec(String(uri).trim());
  if (!match) throw new Base64Error('BAD_DATA_URI', 'This is not a data: URL.', 0);
  const params = match[2].split(';').filter(Boolean);
  const isBase64 = params.includes('base64');
  const mime = match[1] || 'text/plain';
  const payload = match[3];
  let bytes;
  try { bytes = isBase64 ? decodeToBytes(payload, { strict: false }) : new TextEncoder().encode(decodeURIComponent(payload)); }
  catch (error) { if (error instanceof Base64Error) throw error; throw new Base64Error('BAD_DATA_URI', 'The data: URL payload could not be decoded.'); }
  return { mime, base64: isBase64, bytes };
}

/** Streaming encoder: feed chunks of any size, collect text pieces, call finish(). Carries up to two bytes between chunks. */
export function createStreamEncoder(options = {}) {
  const o = normalizeOptions(options);
  const alphabet = alphabetFor(o.variant);
  let carry = new Uint8Array(0), column = 0;
  const emit = text => {
    if (!o.lineLength) return text;
    let result = '';
    for (let i = 0; i < text.length;) {
      const take = Math.min(o.lineLength - column, text.length - i);
      result += text.slice(i, i + take); column += take; i += take;
      if (column === o.lineLength) { result += o.lineEnding; column = 0; }
    }
    return result;
  };
  return {
    write(chunk) {
      const merged = new Uint8Array(carry.length + chunk.length); merged.set(carry); merged.set(chunk, carry.length);
      const usable = merged.length - (merged.length % 3);
      carry = merged.slice(usable);
      return emit(encodeRaw(merged.subarray(0, usable), alphabet, o.pad));
    },
    finish() {
      const tail = emit(encodeRaw(carry, alphabet, o.pad)); carry = new Uint8Array(0);
      // A full final line leaves a dangling line ending; drop it so output matches the one-shot encoder.
      return o.lineLength && column === 0 && tail.endsWith(o.lineEnding) ? tail.slice(0, -o.lineEnding.length) : tail;
    },
  };
}

/** Streaming decoder: strips whitespace, keeps a 0-3 character tail between chunks. */
export function createStreamDecoder(options = {}) {
  let tail = '', done = false, position = 0;
  const decode = text => decodeToBytes(text, { strict: false, variant: options.variant });
  return {
    write(text) {
      const clean = (tail + String(text)).replace(/\s+/g, '');
      if (done && clean.length) throw new Base64Error('DATA_AFTER_PADDING', 'Data after padding.', position);
      const padIndex = clean.indexOf('=');
      if (padIndex >= 0) { done = true; const out = decode(clean); tail = ''; position += clean.length; return out; }
      const usable = clean.length - (clean.length % 4);
      tail = clean.slice(usable); position += usable;
      return decode(clean.slice(0, usable));
    },
    finish() { const out = tail ? decode(tail) : new Uint8Array(0); tail = ''; return out; },
  };
}

export function sniffType(bytes) {
  const sig = (...values) => values.every((v, i) => bytes[i] === v);
  if (sig(0x89, 0x50, 0x4e, 0x47)) return { mime: 'image/png', extension: 'png' };
  if (sig(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', extension: 'jpg' };
  if (sig(0x47, 0x49, 0x46, 0x38)) return { mime: 'image/gif', extension: 'gif' };
  if (sig(0x25, 0x50, 0x44, 0x46)) return { mime: 'application/pdf', extension: 'pdf' };
  if (sig(0x50, 0x4b, 0x03, 0x04)) return { mime: 'application/zip', extension: 'zip' };
  if (sig(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return { mime: 'image/webp', extension: 'webp' };
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, 4096)); return { mime: 'text/plain', extension: 'txt' }; } catch { return { mime: 'application/octet-stream', extension: 'bin' }; }
}

/** name.ext becomes name.ext.base64.txt and back. Returns null when the name is not a Base64 text file. */
export function base64NameFor(name) { return `${name}.base64.txt`; }
export function originalNameFrom(name) { const match = /^(.+\.[^.]+)\.base64\.txt$/i.exec(name) || /^(.+)\.base64\.txt$/i.exec(name); return match ? match[1] : null; }
