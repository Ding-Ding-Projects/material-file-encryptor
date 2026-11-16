import {CATALOG_URL, RELEASES_URL, PHOTO_FILE, normaliseCatalog, photoMap} from '../features/dimsum/catalogue.mjs';

const DAY = 86400000, MAX_JSON = 16 * 1024 * 1024, MAX_IMAGE = 4 * 1024 * 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Loads the public dim sum catalogue on request, never at start-up. Metadata is cached in memory for a day; an
 * illustration is fetched one at a time, must be a PNG of at most 4 MB and is returned as a data address so the
 * renderer never needs network access. Only the two fixed public addresses and the release download address that the
 * release list itself names are ever requested.
 */
export function createDimsumCatalogueService({fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15000} = {}) {
  let cached = null, inflight = null;
  async function get(url, limit, asText) {
    if (typeof fetchImpl !== 'function') throw Error('Network access is unavailable.');
    const response = await fetchImpl(url, {credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: {Accept: asText ? 'application/json' : 'image/png'}});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > limit) throw Error('The public source is larger than allowed.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw Error('The public source is larger than allowed.');
    return asText ? bytes.toString('utf8') : bytes;
  }
  async function loadFresh() {
    const catalog = normaliseCatalog(JSON.parse(await get(CATALOG_URL, MAX_JSON, true)));
    if (!catalog || !catalog.dishes.length) throw Error('The catalogue is empty.');
    let photos = new Map(), photosAvailable = true;
    try { photos = photoMap(JSON.parse(await get(RELEASES_URL, MAX_JSON, true))); } catch { photosAvailable = false; }
    cached = {fetchedAt: now(), catalog, photos};
    return cached;
  }
  const view = (value, fromCache) => ({
    ok: true, cached: fromCache, fetchedAt: new Date(value.fetchedAt).toISOString(), catalog: value.catalog,
    photoFiles: [...value.photos.entries()].map(([file, info]) => [file, info.release]), photosAvailable: value.photos.size > 0
  });
  return {
    /** `force` bypasses the one-day copy. A failed refresh keeps the previous copy and says so. */
    async catalogue({force = false} = {}) {
      if (!force && cached && now() - cached.fetchedAt < DAY) return view(cached, true);
      inflight ??= loadFresh().finally(() => { inflight = null; });
      try { return view(await inflight, false); }
      catch (error) {
        if (cached) return {...view(cached, true), refreshError: String(error?.message || error)};
        throw error;
      }
    },
    async photo({file}) {
      if (typeof file !== 'string' || !PHOTO_FILE.test(file)) throw Error('Unsupported illustration name.');
      const entry = cached?.photos.get(file);
      if (!entry) throw Error('This illustration is not published.');
      const bytes = await get(entry.url, MAX_IMAGE, false);
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG)) throw Error('The illustration is not a PNG image.');
      return {file, release: entry.release, dataUrl: `data:image/png;base64,${bytes.toString('base64')}`};
    },
    clear() { cached = null; }
  };
}
