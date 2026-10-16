// Builds the public release record shown by the documentation site from a GitHub release read back through the API.
// Usage: node scripts/generate-release-record.mjs [--input release.json] --out <file>
// Without --input the latest normal release of the repository is read with the GitHub CLI.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'Ding-Ding-Projects/material-file-encryptor';
const INSTALLER = 'MaterialFileEncryptor-Setup.exe';
const pending = Object.freeze({ status: 'pending' });

// Only a published, non-draft, non-prerelease release with an exact source commit and a checksummed installer qualifies.
// Behaviour checks (download, packaged, installed, uninstall) stay pending: this generator reads release metadata, never runs the installer.
export function buildReleaseRecord(release) {
  if (!release || release.draft !== false) throw new Error('RELEASE_NOT_PUBLISHED');
  if (release.prerelease !== false) throw new Error('RELEASE_NOT_NORMAL');
  if (!/^v[0-9A-Za-z._-]{1,80}$/.test(release.tag_name || '')) throw new Error('RELEASE_TAG_INVALID');
  if (!/^[a-f0-9]{40}$/.test(release.target_commitish || '')) throw new Error('RELEASE_SOURCE_NOT_A_COMMIT');
  if (!Number.isFinite(Date.parse(release.published_at))) throw new Error('RELEASE_NOT_PUBLISHED');
  const asset = (release.assets || []).find(item => item.name === INSTALLER);
  const sha256 = /^sha256:([a-f0-9]{64})$/.exec(asset?.digest || '')?.[1];
  if (!asset || !sha256 || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('RELEASE_INSTALLER_UNVERIFIED');
  const base = `https://github.com/${REPOSITORY}`;
  return {
    schemaVersion: 1,
    tag: release.tag_name,
    sourceCommit: release.target_commitish,
    targetCommit: release.target_commitish,
    draft: false,
    prerelease: false,
    publishedAt: new Date(release.published_at).toISOString().replace('.000Z', 'Z'),
    releaseUrl: `${base}/releases/tag/${release.tag_name}`,
    installer: { name: INSTALLER, url: `${base}/releases/download/${release.tag_name}/${INSTALLER}`, bytes: asset.size, sha256 },
    verification: { download: { ...pending }, packaged: { ...pending }, installed: { ...pending }, uninstall: { ...pending } },
  };
}

export function readLatestRelease() {
  const text = execFileSync('gh', ['api', `repos/${REPOSITORY}/releases/latest`], { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return JSON.parse(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
  const out = arg('out');
  if (!out) throw new Error('--out is required.');
  const release = arg('input') ? JSON.parse(await fs.readFile(arg('input'), 'utf8')) : readLatestRelease();
  const record = buildReleaseRecord(release);
  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.writeFile(out, JSON.stringify(record, null, 2) + '\n');
  console.log(`Release record for ${record.tag} (source ${record.sourceCommit.slice(0, 12)}) written to ${out}.`);
}
