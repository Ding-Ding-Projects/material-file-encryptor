import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseVersion(runNumber, runAttempt) {
  const valid = value => /^[1-9]\d*$/.test(String(value)) && BigInt(value) <= 65535n;
  if (!valid(runNumber) || !valid(runAttempt)) throw new Error('INVALID_RELEASE_VERSION');
  return `1.${runNumber}.${runAttempt}`;
}

export async function stampReleaseVersion(root, version) {
  const manifestPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  if (!lock.packages?.[''] || manifest.name !== lock.name || manifest.name !== lock.packages[''].name)
    throw new Error('RELEASE_MANIFEST_IDENTITY_MISMATCH');
  manifest.version = lock.version = lock.packages[''].version = version;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

export async function verifyReleaseVersion(root, version) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  if (!lock.packages?.[''] || manifest.name !== lock.name || manifest.name !== lock.packages[''].name)
    throw new Error('RELEASE_MANIFEST_IDENTITY_MISMATCH');
  if (typeof version !== 'string' || !version || manifest.version !== version)
    throw new Error('RELEASE_PACKAGE_VERSION_MISMATCH');
  if (lock.version !== version || lock.packages[''].version !== version)
    throw new Error('RELEASE_LOCK_VERSION_MISMATCH');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === '--verify') {
    await verifyReleaseVersion(process.cwd(), process.argv[3]);
    console.log(`Verified release package version: ${process.argv[3]}`);
  } else {
    const version = releaseVersion(process.env.GITHUB_RUN_NUMBER, process.env.GITHUB_RUN_ATTEMPT);
    await stampReleaseVersion(process.cwd(), version);
    console.log(`Release package version: ${version}`);
  }
}
