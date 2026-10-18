import { readVaultImageSnapshotFile, verifyVaultImageSnapshot } from './vault-image-snapshot.js';

const BLOCK = 512;
const CHUNK = 65536;
const DOCKERFILE = 'FROM scratch\nCOPY vault/ /vault/\nCOPY manifest.json /manifest.json\n';
const OBJECT = /^(?:parts|commits|activity)\/(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{64})\.mfe$/;

function header(name, size, directory = false) {
  const allowed = name === 'Dockerfile' || name === 'manifest.json' || name === 'vault/' ||
    ['vault/parts/', 'vault/commits/', 'vault/activity/'].includes(name) || name === 'vault/vault.json' || (name.startsWith('vault/') && OBJECT.exec(name.slice(6))?.[0] === name.slice(6));
  if (!allowed || Buffer.byteLength(name) > 100 || !Number.isSafeInteger(size) || size < 0 || size > 0o77777777777)
    throw Error('Invalid encrypted image archive entry.');
  const block = Buffer.alloc(BLOCK);
  const octal = (value, offset, length) => block.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
  block.write(name, 0, 100, 'ascii'); octal(directory ? 0o700 : 0o600, 100, 8);
  octal(0, 108, 8); octal(0, 116, 8); octal(size, 124, 12); octal(0, 136, 12);
  block.fill(0x20, 148, 156); block[156] = directory ? 0x35 : 0x30;
  block.write('ustar\0', 257, 6, 'ascii'); block.write('00', 263, 2, 'ascii');
  const sum = block.reduce((total, byte) => total + byte, 0);
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return block;
}
function* manifestText(manifest) {
  yield '{\n';
  const entries = Object.entries(manifest);
  for (let index = 0; index < entries.length; index++) {
    const [key, value] = entries[index];
    yield `  ${JSON.stringify(key)}: `;
    if (key === 'files') {
      yield '[\n';
      for (let fileIndex = 0; fileIndex < value.length; fileIndex++) {
        yield JSON.stringify(value[fileIndex], null, 2).replace(/^/gm, '    ');
        yield fileIndex + 1 === value.length ? '\n' : ',\n';
      }
      yield '  ]';
    } else yield JSON.stringify(value);
    yield index + 1 === entries.length ? '\n' : ',\n';
  }
  yield '}\n';
}
function* textChunks(pieces) {
  let buffer = Buffer.alloc(CHUNK), offset = 0;
  for (const piece of pieces) {
    const length = Buffer.byteLength(piece);
    if (length > CHUNK) throw Error('Encrypted image metadata exceeds its field limit.');
    if (offset + length > CHUNK) { yield buffer.subarray(0, offset); buffer = Buffer.alloc(CHUNK); offset = 0; }
    offset += buffer.write(piece, offset, length, 'utf8');
  }
  if (offset) yield buffer.subarray(0, offset);
}
function* padding(length) {
  const remainder = length % BLOCK;
  if (remainder) yield Buffer.alloc(BLOCK - remainder);
}

/** Explicit ustar entries only: no directory traversal, shell, source metadata, credentials, or decryption. */
export async function* createVaultImageBuildContext(snapshot, { signal } = {}) {
  // Capture authority before awaiting IO; callers cannot add paths while a context is being streamed.
  const expected = structuredClone(snapshot);
  signal?.throwIfAborted();
  await verifyVaultImageSnapshot(expected, { signal });
  for await (const bytes of contextEntries(expected, signal)) { signal?.throwIfAborted(); yield bytes; }
}

async function* contextEntries(expected, signal) {
  const dockerfile = Buffer.from(DOCKERFILE);
  yield header('Dockerfile', dockerfile.length); yield dockerfile; yield* padding(dockerfile.length);
  let manifestBytes = 0;
  for (const piece of manifestText(expected.manifest)) manifestBytes += Buffer.byteLength(piece);
  yield header('manifest.json', manifestBytes);
  for (const bytes of textChunks(manifestText(expected.manifest))) { signal?.throwIfAborted(); yield bytes; }
  yield* padding(manifestBytes);
  yield header('vault/', 0, true);
  const folders = new Set(expected.manifest.files.filter(file => file.path.includes('/')).map(file => file.path.split('/')[0]));
  for (const folder of [...folders].sort()) yield header(`vault/${folder}/`, 0, true);
  for (const file of expected.manifest.files) {
    signal?.throwIfAborted(); yield header(`vault/${file.path}`, file.bytes);
    yield* readVaultImageSnapshotFile(expected.directory, file, { signal });
    yield* padding(file.bytes);
  }
  signal?.throwIfAborted();
  // Missing end blocks or any producer error must fail the build, even if Docker consumed earlier bytes.
  yield Buffer.alloc(2 * BLOCK);
}
