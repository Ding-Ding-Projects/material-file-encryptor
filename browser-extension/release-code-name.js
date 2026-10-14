// Pure helpers for the release code name shown in the Status tab. The code name and its dish photo come from
// published release notes; nothing here touches the network or the page.

const PHOTO_PREFIX = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/';
const NAME_LIMIT = 180;
// Mirrors the release script: no control characters, brackets, angle brackets or backticks.
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f[\]<>`]/u;

const validName = value => typeof value === 'string' && value.length > 0 && value.length <= NAME_LIMIT && !UNSAFE_NAME.test(value);

/** Reads the English and Traditional Chinese names from the exact "Code name: X / Y." line, or returns null. */
export function parseReleaseCodeName(body) {
  if (typeof body !== 'string' || body.length > 200000) return null;
  const line = /^Code name: (.+?) \/ (.+?)\.(?: Photo is linked [^\r\n]*)?[ \t]*\r?$/m.exec(body);
  if (!line) return null;
  const english = line[1].trim(), chinese = line[2].trim();
  return validName(english) && validName(chinese) ? {english, chinese} : null;
}

/** Returns the dish photo address only when it is exactly a published catalogue release asset. */
export function parsePhotoUrl(body) {
  if (typeof body !== 'string' || body.length > 200000) return null;
  for (const image of body.matchAll(/!\[[^\]\r\n]*\]\(([^()\s]+)\)/g)) {
    const url = image[1];
    if (!url.startsWith(PHOTO_PREFIX)) continue;
    const rest = url.slice(PHOTO_PREFIX.length).split('/');
    if (rest.length === 2 && /^catalog-v1[A-Za-z0-9._-]*$/.test(rest[0]) && /^[-A-Za-z0-9_.]+\.(?:png|jpe?g|webp)$/.test(rest[1]) && !rest[1].includes('..')) return url;
  }
  return null;
}

const published = release => release && typeof release === 'object' && !release.draft && !release.prerelease && typeof release.tag_name === 'string';

/** The source commit named by the release notes ("release from `<sha>`"), or null. */
export function releaseSourceCommit(body) {
  const found = typeof body === 'string' ? /\brelease from `([0-9a-f]{40})`/.exec(body) : null;
  return found ? found[1] : null;
}

/**
 * Finds the published release for the staged build. A tag of v<stagedVersion> matches first; when the build is
 * a clean checkout, the commit named in the release notes matches next. Anything else is reported as unmatched,
 * with the newest published release returned separately so it is never mistaken for this build's.
 */
export function matchRelease(releases, stagedVersion, sourceCommit = null) {
  const list = (Array.isArray(releases) ? releases : []).filter(published);
  const tag = typeof stagedVersion === 'string' && /^\d+(?:\.\d+){1,3}$/.test(stagedVersion) ? 'v' + stagedVersion : null;
  const byTag = tag ? list.find(release => release.tag_name === tag) : null;
  if (byTag) return {state: 'matched', by: 'tag', release: byTag};
  const commit = typeof sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(sourceCommit) ? sourceCommit : null;
  const byCommit = commit ? list.find(release => releaseSourceCommit(release.body) === commit) : null;
  if (byCommit) return {state: 'matched', by: 'commit', release: byCommit};
  const latest = list.slice().sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))[0] || null;
  return {state: 'unmatched', latest};
}

/** The public release page address, only for a well-formed release of this project. */
export function releasePageUrl(release) {
  const tag = release?.tag_name;
  return typeof tag === 'string' && /^v?\d+(?:\.\d+){1,3}[A-Za-z0-9._-]*$/.test(tag) ? 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/' + tag : null;
}

export const RELEASES_API = 'https://api.github.com/repos/Ding-Ding-Projects/material-file-encryptor/releases?per_page=30';
