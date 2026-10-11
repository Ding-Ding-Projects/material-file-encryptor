import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;

export async function promoteDefaultRelease({ ref, source, readMain, promote }) {
  if (!SHA.test(source)) throw new Error('INVALID_RELEASE_SOURCE');
  if (ref !== 'refs/heads/main') return { channel: 'download-only', promoted: false, reason: 'not-main-ref' };
  const main = await readMain();
  if (!SHA.test(main)) throw new Error('INVALID_MAIN_SOURCE');
  if (main !== source) return { channel: 'download-only', promoted: false, reason: 'superseded-main-source', checkedMain: main };
  await promote();
  return { channel: 'default', promoted: true, reason: 'exact-current-main', checkedMain: main };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo, id, ref, source] = process.argv.slice(2);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') || !/^[1-9]\d*$/.test(id ?? '')) throw new Error('INVALID_RELEASE_TARGET');
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }).trim();
  const result = await promoteDefaultRelease({ ref, source,
    readMain: () => gh(['api', `repos/${repo}/git/ref/heads/main`, '--jq', 'if .ref == "refs/heads/main" and .object.type == "commit" then .object.sha else "invalid" end']),
    promote: () => {
      const updated = gh(['api', '--method', 'PATCH', `repos/${repo}/releases/${id}`, '-f', 'make_latest=true', '--jq', '.id']);
      if (updated !== id) throw new Error('RELEASE_PROMOTION_ID_MISMATCH');
    },
  });
  process.stdout.write(JSON.stringify(result));
}
