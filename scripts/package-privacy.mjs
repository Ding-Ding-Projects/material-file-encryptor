import { lstat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listPackage, statFile, extractFile, uncache } from '@electron/asar';

export const isPrivateEntry = name => /(?:^|[\\/])MaterialFileEncryptor\.ServerLease\.Verifier(?:\.|[\\/]|$)/i.test(name) || /(?:^|[\\/])(?:\.agent|\.test-output)(?:[\\/]|$)/i.test(name);

const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function requireIntegrityMetadata(info) {
  const integrity = info.integrity;
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity) ||
      integrity.algorithm !== 'SHA256' || !isDigest(integrity.hash) ||
      !Number.isSafeInteger(integrity.blockSize) || integrity.blockSize <= 0 ||
      !Array.isArray(integrity.blocks) ||
      integrity.blocks.length !== Math.max(1, Math.ceil(info.size / integrity.blockSize)) ||
      !integrity.blocks.every(isDigest)) throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
  return integrity;
}

function requireContentIntegrity(content, integrity) {
  if (createHash('sha256').update(content).digest('hex') !== integrity.hash)
    throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
  for (let index = 0; index < integrity.blocks.length; index++) {
    const start = index * integrity.blockSize;
    const block = content.subarray(start, start + integrity.blockSize);
    if (createHash('sha256').update(block).digest('hex') !== integrity.blocks[index])
      throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
  }
}

// Never reflect rejected paths, archive metadata or exception messages in diagnostics.
export async function inspectPackage(root) {
  let entries = 0;
  let rejected = 0;
  try {
    const visit = async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        entries++;
        if (isPrivateEntry(entry.name)) { rejected++; continue; }
        const target = path.join(directory, entry.name);
        const info = await lstat(target);
        if (info.isSymbolicLink()) throw new Error('PACKAGE_PRIVACY_LINK_REJECTED');
        if (info.isDirectory()) await visit(target);
        else if (!info.isFile()) throw new Error('PACKAGE_PRIVACY_TYPE_REJECTED');
      }
    };
    if (!(await lstat(root)).isDirectory()) throw new Error('PACKAGE_PRIVACY_INPUT_REQUIRED');
    await visit(root);
    const archive = path.join(root, 'resources', 'app.asar');
    const archiveInfo = await lstat(archive);
    if (!archiveInfo.isFile() || archiveInfo.size === 0) throw new Error('PACKAGE_PRIVACY_ARCHIVE_REQUIRED');
    uncache(archive);
    const names = listPackage(archive);
    if (!names.length) throw new Error('PACKAGE_PRIVACY_ARCHIVE_REQUIRED');
    for (const name of names) {
      entries++;
      if (isPrivateEntry(name)) { rejected++; continue; }
      const relativeName = name.replace(/^[\\/]+/, '');
      const info = statFile(archive, relativeName, false);
      if (info.link) throw new Error('PACKAGE_PRIVACY_LINK_REJECTED');
      if (!info.files) {
        if (!Number.isSafeInteger(info.size) || info.size < 0)
          throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
        const integrity = requireIntegrityMetadata(info);
        if (info.unpacked) {
          // Extraction returns an empty buffer without reading an empty unpacked entry.
          const loose = await lstat(path.join(archive + '.unpacked', relativeName));
          if (!loose.isFile() || loose.size !== info.size)
            throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
        }
        const content = extractFile(archive, relativeName, false);
        if (content.length !== info.size) throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
        requireContentIntegrity(content, integrity);
      }
    }
    if (rejected) return { code: 'PACKAGE_PRIVACY_REJECTED', entries, rejected };
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(archive, { highWaterMark: 64 * 1024 })) digest.update(chunk);
    return { code: 'PACKAGE_PRIVACY_OK', entries, rejected, archiveSha256: digest.digest('hex') };
  } catch {
    return { code: 'PACKAGE_PRIVACY_UNREADABLE', entries, rejected };
  }
}

export async function requirePrivateFreePackage(root) {
  const receipt = await inspectPackage(root);
  if (receipt.code !== 'PACKAGE_PRIVACY_OK') throw new Error(receipt.code);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const receipt = process.argv.length === 3
    ? await inspectPackage(process.argv[2]) : { code: 'PACKAGE_PRIVACY_INPUT_REQUIRED', entries: 0, rejected: 0 };
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.code === 'PACKAGE_PRIVACY_OK' ? 0 : 1;
}
