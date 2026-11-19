import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Download links, kept in one JSON file under the data directory. A link names a share (repository and manifest
 * digest), its cached layer, when it ends and how many downloads it allows. No file name, key or passphrase is
 * ever stored: the server cannot tell what it is hosting.
 */
export const LINK_ID = /^[A-Za-z0-9_-]{22}$/;
const MAX_LINKS = 2000;

const validLink = value => value && typeof value === 'object' && LINK_ID.test(value.id) && typeof value.repository === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.digest) &&
  /^sha256:[a-f0-9]{64}$/.test(value.layer) && Number.isSafeInteger(value.size) && value.size >= 0 && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.expiresAt) &&
  (value.maxDownloads === null || (Number.isSafeInteger(value.maxDownloads) && value.maxDownloads > 0)) && Number.isSafeInteger(value.downloads) && value.downloads >= 0 &&
  ['active', 'ended'].includes(value.state) && (value.endedReason === null || ['expired', 'limit', 'ended', 'missing'].includes(value.endedReason));

export function newLinkId(random = randomBytes) { return random(16).toString('base64url'); }

export async function openLinkStore({ file, now = Date.now }) {
  let links = new Map();
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value?.version === 1 && Array.isArray(value.links)) for (const link of value.links.filter(validLink)) links.set(link.id, link);
  } catch (error) { if (error.code !== 'ENOENT') throw Error('The link list could not be read. It was left unchanged; fix or remove links.json.'); }
  let writing = Promise.resolve();
  function save() {
    const text = JSON.stringify({ version: 1, links: [...links.values()] });
    // Each write runs after the previous one settles, so one failed write never blocks the next.
    const job = writing.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, text, { mode: 0o600 });
      // Windows can briefly lock the target (antivirus, indexing); retry a few times before giving up.
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(temporary, file); return; }
        catch (error) { if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error; await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1))); }
      }
    });
    writing = job;
    return job;
  }
  return {
    get: id => links.get(id) ?? null,
    all: () => [...links.values()],
    active: () => [...links.values()].filter(link => link.state === 'active'),
    async add({ repository, digest, layer, size, expiresAt, maxDownloads }) {
      if (links.size >= MAX_LINKS) {
        const ended = [...links.values()].filter(link => link.state === 'ended').sort((a, b) => a.createdAt - b.createdAt);
        if (!ended.length) throw Object.assign(Error('This server holds the most links it can. End some first.'), { code: 'FULL' });
        links.delete(ended[0].id);
      }
      let id; do id = newLinkId(); while (links.has(id));
      const link = { id, repository, digest, layer, size, createdAt: now(), expiresAt, maxDownloads, downloads: 0, state: 'active', endedReason: null };
      if (!validLink(link)) throw Object.assign(Error('The link is not valid.'), { code: 'INVALID' });
      links.set(id, link); await save();
      return link;
    },
    async countDownload(id) {
      const link = links.get(id); if (!link) return null;
      link.downloads += 1;
      if (link.maxDownloads !== null && link.downloads >= link.maxDownloads) { link.state = 'ended'; link.endedReason = 'limit'; }
      await save(); return link;
    },
    async end(id, reason = 'ended') {
      const link = links.get(id); if (!link) return null;
      if (link.state === 'active') { link.state = 'ended'; link.endedReason = reason; await save(); }
      return link;
    },
    async remove(id) { const had = links.delete(id); if (had) await save(); return had; },
    /** Ends every link past its time. Returns the ones it ended. */
    async sweep() {
      const ended = [];
      for (const link of links.values()) if (link.state === 'active' && link.expiresAt <= now()) { link.state = 'ended'; link.endedReason = 'expired'; ended.push(link); }
      if (ended.length) await save();
      return ended;
    },
    flush: () => writing
  };
}
