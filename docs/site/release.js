// Public release facts and source-bound local verdicts. Pending is fail-closed.
export const previewRelease = Object.freeze({
  schemaVersion: 1,
  tag: 'v0.1.0-preview.16.1',
  sourceCommit: '56020da6982fa03d2bbc78d15b7d1aae1ee8f846',
  targetCommit: '56020da6982fa03d2bbc78d15b7d1aae1ee8f846',
  draft: false,
  prerelease: true,
  publishedAt: '2026-10-09T19:08:25Z',
  releaseUrl: 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v0.1.0-preview.16.1',
  installer: Object.freeze({
    name: 'MaterialFileEncryptor-Setup.exe',
    url: 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/download/v0.1.0-preview.16.1/MaterialFileEncryptor-Setup.exe',
    bytes: 242572288,
    sha256: 'ce05ca27c8bdd229abc0b0984c3ba42ce12c944c366840762ceec39caf21549a',
  }),
  verification: Object.freeze({
    download: Object.freeze({ status: 'pending' }),
    packaged: Object.freeze({ status: 'pending' }),
    installed: Object.freeze({ status: 'pending' }),
    uninstall: Object.freeze({ status: 'pending' }),
  }),
});

const base = 'https://github.com/Ding-Ding-Projects/material-file-encryptor';
export function verifiedDownload(record) {
  if (record?.schemaVersion !== 1 || record.draft !== false || typeof record.prerelease !== 'boolean'
    || !/^v[0-9A-Za-z._-]{1,80}$/.test(record.tag || '') || !/^[a-f0-9]{40}$/.test(record.sourceCommit || '')
    || record.sourceCommit !== record.targetCommit || !Number.isFinite(Date.parse(record.publishedAt))) return null;
  const installer = record.installer;
  if (record.releaseUrl !== `${base}/releases/tag/${record.tag}` || installer?.name !== 'MaterialFileEncryptor-Setup.exe'
    || installer.url !== `${base}/releases/download/${record.tag}/${installer.name}`
    || !Number.isSafeInteger(installer.bytes) || installer.bytes <= 0 || !/^[a-f0-9]{64}$/.test(installer.sha256 || '')) return null;
  for (const kind of ['download', 'packaged', 'installed', 'uninstall']) {
    const proof = record.verification?.[kind];
    if (proof?.status !== 'verified' || proof.sourceCommit !== record.sourceCommit || proof.installerSha256 !== installer.sha256
      || !/^[a-f0-9]{64}$/.test(proof.receiptSha256 || '')
      || !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) < Date.parse(record.publishedAt)) return null;
  }
  if (record.verification.download.bytes !== installer.bytes) return null;
  return { url: installer.url, sha256: installer.sha256, bytes: installer.bytes, sourceCommit: record.sourceCommit, tag: record.tag };
}

export function renderReleaseDownload(document, record) {
  const eligible = verifiedDownload(record);
  const control = document.querySelector('#preview-download');
  const help = document.querySelector('#download-help');
  const state = document.querySelector('#download-state');
  if (!control || !help || !state) return false;
  if (!eligible) {
    // Keep even a previously enabled control inert if its proof is replaced.
    if (control.tagName === 'A') {
      const disabled = document.createElement('button');
      disabled.id = 'preview-download'; disabled.type = 'button'; disabled.disabled = true;
      disabled.className = 'button button-disabled'; disabled.setAttribute('aria-describedby', 'download-help');
      disabled.textContent = 'Download verified preview for Windows'; control.replaceWith(disabled);
    } else { control.disabled = true; control.removeAttribute('href'); }
    state.textContent = 'Published preview · verification pending';
    help.textContent = 'Direct download stays disabled until the downloaded installer, installed application and uninstall checks pass.';
    return false;
  }
  const link = document.createElement('a'); link.id = 'preview-download'; link.className = 'button button-primary';
  link.href = eligible.url; link.setAttribute('aria-describedby', 'download-help');
  link.textContent = 'Download verified preview for Windows'; control.replaceWith(link);
  state.textContent = 'Verified Windows preview';
  help.textContent = 'The downloaded installer, packaged application, installation and removal passed source-bound local checks.';
  return true;
}
