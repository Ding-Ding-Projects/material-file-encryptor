/**
 * scrypt (RFC 7914) for the browser, used only to unwrap a passphrase-protected share key. PBKDF2-HMAC-SHA256
 * comes from WebCrypto; the memory-hard part (ROMix with Salsa20/8) is plain JavaScript. With the share
 * format's parameters (N = 2^17, r = 8, p = 1) it allocates 128 MiB once and takes a few seconds.
 */
const subtle = () => globalThis.crypto.subtle;

async function pbkdf2(password, salt, length) {
  const key = await subtle().importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1 }, key, length * 8));
}

function salsa208(B) {
  const x = new Uint32Array(B);
  const R = (a, b) => (a << b) | (a >>> (32 - b));
  for (let i = 0; i < 8; i += 2) {
    x[4] ^= R(x[0] + x[12], 7); x[8] ^= R(x[4] + x[0], 9); x[12] ^= R(x[8] + x[4], 13); x[0] ^= R(x[12] + x[8], 18);
    x[9] ^= R(x[5] + x[1], 7); x[13] ^= R(x[9] + x[5], 9); x[1] ^= R(x[13] + x[9], 13); x[5] ^= R(x[1] + x[13], 18);
    x[14] ^= R(x[10] + x[6], 7); x[2] ^= R(x[14] + x[10], 9); x[6] ^= R(x[2] + x[14], 13); x[10] ^= R(x[6] + x[2], 18);
    x[3] ^= R(x[15] + x[11], 7); x[7] ^= R(x[3] + x[15], 9); x[11] ^= R(x[7] + x[3], 13); x[15] ^= R(x[11] + x[7], 18);
    x[1] ^= R(x[0] + x[3], 7); x[2] ^= R(x[1] + x[0], 9); x[3] ^= R(x[2] + x[1], 13); x[0] ^= R(x[3] + x[2], 18);
    x[6] ^= R(x[5] + x[4], 7); x[7] ^= R(x[6] + x[5], 9); x[4] ^= R(x[7] + x[6], 13); x[5] ^= R(x[4] + x[7], 18);
    x[11] ^= R(x[10] + x[9], 7); x[8] ^= R(x[11] + x[10], 9); x[9] ^= R(x[8] + x[11], 13); x[10] ^= R(x[9] + x[8], 18);
    x[12] ^= R(x[15] + x[14], 7); x[13] ^= R(x[12] + x[15], 9); x[14] ^= R(x[13] + x[12], 13); x[15] ^= R(x[14] + x[13], 18);
  }
  for (let i = 0; i < 16; i++) B[i] = (B[i] + x[i]) >>> 0;
}

function blockMix(B, Y, r) {
  const X = B.slice((2 * r - 1) * 16, 2 * r * 16);
  for (let i = 0; i < 2 * r; i++) {
    for (let k = 0; k < 16; k++) X[k] ^= B[i * 16 + k];
    salsa208(X);
    Y.set(X, i * 16);
  }
  for (let i = 0; i < r; i++) { B.set(Y.subarray(2 * i * 16, 2 * i * 16 + 16), i * 16); B.set(Y.subarray((2 * i + 1) * 16, (2 * i + 1) * 16 + 16), (i + r) * 16); }
}

async function roMix(X, r, N, onProgress) {
  const words = 32 * r, V = new Uint32Array(words * N), Y = new Uint32Array(words);
  for (let i = 0; i < N; i++) { V.set(X, i * words); blockMix(X, Y, r); if ((i & 8191) === 0) { onProgress?.(i / (2 * N)); await new Promise(resolve => setTimeout(resolve, 0)); } }
  for (let i = 0; i < N; i++) {
    const j = X[(2 * r - 1) * 16] & (N - 1);
    for (let k = 0; k < words; k++) X[k] ^= V[j * words + k];
    blockMix(X, Y, r);
    if ((i & 8191) === 0) { onProgress?.(0.5 + i / (2 * N)); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
}

export async function scrypt(password, salt, { N, r, p, length }, onProgress) {
  if (!Number.isSafeInteger(N) || N < 2 || (N & (N - 1)) !== 0) throw Error('N must be a power of two.');
  const B = await pbkdf2(password, salt, p * 128 * r);
  const words = 32 * r;
  for (let i = 0; i < p; i++) {
    const X = new Uint32Array(words), view = new DataView(B.buffer, B.byteOffset + i * 128 * r, 128 * r);
    for (let k = 0; k < words; k++) X[k] = view.getUint32(k * 4, true);
    await roMix(X, r, N, onProgress);
    for (let k = 0; k < words; k++) view.setUint32(k * 4, X[k], true);
  }
  return pbkdf2(password, B, length);
}
