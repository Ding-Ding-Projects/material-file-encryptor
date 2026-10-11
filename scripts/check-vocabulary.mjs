import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_LOCK_BYTES = 4096;
const opening = /^##[ \t]+Vocabulary and locations[ \t]*$/gm;

function fail() { throw new Error('PRIVATE_INSTRUCTIONS_CHECK_FAILED'); }
function outside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

/** Hash only the normalized, heading-delimited dictionary section. */
export function dictionaryDigest(source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(opening)];
  if (headings.length !== 1) fail();
  const start = headings[0].index;
  const afterHeading = start + headings[0][0].length;
  const next = /^#{1,2}[ \t]+[^\n]+$/m.exec(normalized.slice(afterHeading));
  const end = next ? afterHeading + next.index : normalized.length;
  const section = normalized.slice(start, end).replace(/\n*$/, '\n');
  if (!section.slice(headings[0][0].length).trim()) fail();
  return createHash('sha256').update(section, 'utf8').digest('hex');
}

async function boundedText(filename, limit) {
  const handle = await fs.open(filename, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) fail();
    const bytes = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < bytes.length) {
      const result = await handle.read(bytes, total, bytes.length - total, total);
      if (!result.bytesRead) break;
      total += result.bytesRead;
    }
    if (total > limit) fail();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total));
  } finally { await handle.close(); }
}

export async function checkVocabulary({ source = process.env.PRIVATE_INSTRUCTIONS_SOURCE, repositoryRoot = root } = {}) {
  if (source === undefined) return { code: 0, message: 'Private instruction check skipped: no external source configured.' };
  try {
    if (typeof source !== 'string' || !source.trim() || !path.isAbsolute(source)) fail();
    const [sourcePath, repositoryPath] = await Promise.all([fs.realpath(source), fs.realpath(repositoryRoot)]);
    if (!outside(repositoryPath, sourcePath) || !outside(repositoryPath, path.resolve(source))) fail();
    const text = await boundedText(sourcePath, MAX_SOURCE_BYTES);
    // The sidecar follows the exact explicitly configured filename, including symlinks.
    const lockPath = await fs.realpath(`${source}.lock.json`);
    if (!outside(repositoryPath, lockPath)) fail();
    const lock = JSON.parse(await boundedText(lockPath, MAX_LOCK_BYTES));
    if (!lock || typeof lock !== 'object' || Array.isArray(lock) || Object.keys(lock).length !== 2 ||
        lock.version !== 1 || typeof lock.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(lock.sha256)) fail();
    if (dictionaryDigest(text) !== lock.sha256) fail();
    return { code: 0, message: 'Private instruction check passed.' };
  } catch {
    return { code: 1, message: 'Private instruction check failed: source or lock is missing, invalid, or stale.' };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkVocabulary();
  (result.code ? console.error : console.log)(result.message);
  process.exitCode = result.code;
}
