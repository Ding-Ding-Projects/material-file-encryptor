import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listPackage, statFile, extractFile, uncache } from '@electron/asar';

export const isPrivateEntry = name => /(?:^|[\\/])\.agent(?:[\\/]|$)/i.test(name);

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
    if (!(await lstat(archive)).isFile()) throw new Error('PACKAGE_PRIVACY_ARCHIVE_REQUIRED');
    const bytes = await readFile(archive);
    if (!bytes.length) throw new Error('PACKAGE_PRIVACY_ARCHIVE_REQUIRED');
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
        if (!Number.isSafeInteger(info.size) || info.size < 0 || extractFile(archive, relativeName, false).length !== info.size)
          throw new Error('PACKAGE_PRIVACY_ARCHIVE_INVALID');
      }
    }
    if (rejected) return { code: 'PACKAGE_PRIVACY_REJECTED', entries, rejected };
    return { code: 'PACKAGE_PRIVACY_OK', entries, rejected, archiveSha256: createHash('sha256').update(bytes).digest('hex') };
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
