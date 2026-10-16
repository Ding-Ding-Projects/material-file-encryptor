// Public release facts and source-bound local verdicts. Pending is fail-closed.
// This committed record is the fallback snapshot. The site build embeds a fresh record read back from the
// latest normal release (scripts/generate-release-record.mjs) and the page prefers that embedded record.
export const currentRelease = Object.freeze({
  schemaVersion: 1,
  tag: 'v1.800.1',
  sourceCommit: '3e4703191b414bd69a0016b7ee86999d880ef6d7',
  targetCommit: '3e4703191b414bd69a0016b7ee86999d880ef6d7',
  draft: false,
  prerelease: false,
  publishedAt: '2026-10-16T13:43:54Z',
  releaseUrl: 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.800.1',
  installer: Object.freeze({
    name: 'MaterialFileEncryptor-Setup.exe',
    url: 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/download/v1.800.1/MaterialFileEncryptor-Setup.exe',
    bytes: 433743360,
    sha256: 'db18b1c5774818d16f699013835317573322073134b9d78d0a5f841d3abf6a69',
  }),
  verification: Object.freeze({
    download: Object.freeze({ status: 'pending' }),
    packaged: Object.freeze({ status: 'pending' }),
    installed: Object.freeze({ status: 'pending' }),
    uninstall: Object.freeze({ status: 'pending' }),
  }),
});


const base = 'https://github.com/Ding-Ding-Projects/material-file-encryptor';
function releaseShape(record) {
  if (record?.schemaVersion !== 1 || record.draft !== false || record.prerelease !== false
    || !/^v[0-9A-Za-z._-]{1,80}$/.test(record.tag || '') || !/^[a-f0-9]{40}$/.test(record.sourceCommit || '')
    || record.sourceCommit !== record.targetCommit || !Number.isFinite(Date.parse(record.publishedAt))) return null;
  const installer = record.installer;
  if (record.releaseUrl !== `${base}/releases/tag/${record.tag}` || installer?.name !== 'MaterialFileEncryptor-Setup.exe'
    || installer.url !== `${base}/releases/download/${record.tag}/${installer.name}`
    || !Number.isSafeInteger(installer.bytes) || installer.bytes <= 0 || !/^[a-f0-9]{64}$/.test(installer.sha256 || '')) return null;
  return installer;
}

// A normal (non-draft, non-prerelease) published release whose installer URL, size and checksum match its release record.
export function publishedDownload(record) {
  const installer = releaseShape(record);
  if (!installer) return null;
  return { url: installer.url, sha256: installer.sha256, bytes: installer.bytes, sourceCommit: record.sourceCommit, tag: record.tag };
}

// Verified additionally requires source-bound download, packaged, installed and uninstall receipts.
export function verifiedDownload(record) {
  const installer = releaseShape(record);
  if (!installer) return null;
  for (const kind of ['download', 'packaged', 'installed', 'uninstall']) {
    const proof = record.verification?.[kind];
    if (proof?.status !== 'verified' || proof.sourceCommit !== record.sourceCommit || proof.installerSha256 !== installer.sha256
      || !/^[a-f0-9]{64}$/.test(proof.receiptSha256 || '')
      || !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) < Date.parse(record.publishedAt)) return null;
  }
  if (record.verification.download.bytes !== installer.bytes) return null;
  return { url: installer.url, sha256: installer.sha256, bytes: installer.bytes, sourceCommit: record.sourceCommit, tag: record.tag };
}

// The site build embeds the record read back from the latest normal release. An invalid or missing embed falls back to the committed snapshot.
export function loadReleaseRecord(document) {
  try {
    const embedded = JSON.parse(document.querySelector('#release-record')?.textContent || '');
    if (publishedDownload(embedded)) return embedded;
  } catch { /* fall through to the committed snapshot */ }
  return currentRelease;
}

export function renderReleaseDownload(document, record) {
  const verified = verifiedDownload(record);
  const published = verified || publishedDownload(record);
  const control = document.querySelector('#preview-download');
  const help = document.querySelector('#download-help');
  const state = document.querySelector('#download-state');
  if (!control || !help || !state) return false;
  if (!published) {
    // Keep even a previously enabled control inert if its record is replaced by an invalid one.
    if (control.tagName === 'A') {
      const disabled = document.createElement('md-filled-button');
      disabled.id = 'preview-download'; disabled.type = 'button'; disabled.disabled = true;
      disabled.className = 'button button-disabled'; disabled.setAttribute('aria-describedby', 'download-help');
      disabled.textContent = 'Download Setup.exe for Windows'; control.replaceWith(disabled);
    } else { control.disabled = true;if('href' in control)control.href='';control.removeAttribute('href'); }
    state.textContent = 'Release unavailable · verification pending';
    help.textContent = 'Direct download stays disabled until a published normal release with a checksummed installer is available.';
    return false;
  }
  const link = document.createElement('a'); link.id = 'preview-download'; link.className = 'button button-primary';
  link.href = published.url; link.setAttribute('aria-describedby', 'download-help');
  link.textContent = verified ? 'Download verified preview for Windows' : 'Download Setup.exe for Windows'; control.replaceWith(link);
  if (verified) {
    state.textContent = 'Verified Windows preview';
    help.textContent = 'The downloaded installer, packaged application, installation and removal passed source-bound local checks.';
  } else {
    state.textContent = 'Published release · verification pending';
    help.textContent = 'Unsigned installer. Its size and SHA-256 checksum come from the published release. Installation and removal checks are not yet recorded for it, so keep independent backups.';
  }
  return true;
}
