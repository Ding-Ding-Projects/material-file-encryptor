import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The encrypted blob cache: one file per layer digest, named by its hex. Downloads are de-duplicated (two
 * visitors of an uncached link share one Docker Hub transfer), a blob being read is never evicted, and when the
 * cache passes its limit the least recently used unpinned blobs go first.
 */
export function createBlobCache({ directory, maxBytes, reader, now = Date.now }) {
  const loading = new Map(), readers = new Map(), lastUsed = new Map();
  const fileFor = layer => { if (!/^sha256:[a-f0-9]{64}$/.test(layer)) throw Error('Invalid digest.'); return path.join(directory, layer.slice(7) + '.blob'); };
  const stat = async file => { try { return await fs.stat(file); } catch { return null; } };

  async function entries() {
    let names = []; try { names = await fs.readdir(directory); } catch { return []; }
    const out = [];
    for (const name of names) {
      const full = path.join(directory, name);
      if (name.endsWith('.part')) { const info = await stat(full); if (info && now() - info.mtimeMs > 6 * 3600 * 1000) await fs.rm(full, { force: true }); continue; }
      if (!/^[a-f0-9]{64}\.blob$/.test(name)) continue;
      const info = await stat(full); if (!info) continue;
      const layer = 'sha256:' + name.slice(0, 64);
      out.push({ layer, file: full, size: info.size, used: lastUsed.get(layer) ?? info.mtimeMs });
    }
    return out;
  }
  async function trim(keep = new Set()) {
    const list = await entries();
    let total = list.reduce((sum, item) => sum + item.size, 0);
    for (const item of list.sort((a, b) => a.used - b.used)) {
      if (total <= maxBytes) break;
      if (keep.has(item.layer) || (readers.get(item.layer) ?? 0) > 0 || loading.has(item.layer)) continue;
      await fs.rm(item.file, { force: true }); lastUsed.delete(item.layer); total -= item.size;
    }
  }

  /** Makes sure the blob is cached, downloading it once. Returns its path. */
  async function ensure({ repository, digest, layer }) {
    const file = fileFor(layer);
    if (await stat(file)) { lastUsed.set(layer, now()); return file; }
    if (!loading.has(layer)) {
      const job = (async () => {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const fetched = await reader.download(repository, digest, file);
        if (fetched.digest !== layer) { await fs.rm(file, { force: true }); throw Object.assign(Error('The shared file changed on Docker Hub.'), { code: 'REGISTRY_UNVERIFIED' }); }
        lastUsed.set(layer, now());
        await trim(new Set([layer]));
        return file;
      })().finally(() => loading.delete(layer));
      loading.set(layer, job);
    }
    return loading.get(layer);
  }
  return {
    ensure,
    has: async layer => Boolean(await stat(fileFor(layer))),
    /** Marks a blob as being read until the returned release() is called. */
    pin(layer) { readers.set(layer, (readers.get(layer) ?? 0) + 1); lastUsed.set(layer, now()); let done = false; return () => { if (done) return; done = true; const left = (readers.get(layer) ?? 1) - 1; if (left > 0) readers.set(layer, left); else readers.delete(layer); }; },
    async remove(layer) { if ((readers.get(layer) ?? 0) > 0 || loading.has(layer)) return false; await fs.rm(fileFor(layer), { force: true }); lastUsed.delete(layer); return true; },
    async usage() { const list = await entries(); return { bytes: list.reduce((sum, item) => sum + item.size, 0), files: list.length, maxBytes }; },
    trim
  };
}
