const APP_TAG = /^mfe-([a-f0-9]{32})-[a-f0-9]{32}$/;
const NAMESPACE = /^[a-z0-9][a-z0-9_-]{1,38}$/;
const REPOSITORY = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
export const HUB_CATALOG_LIMITS = Object.freeze({
  namespaces: 10, repositoryPages: 5, pageSize: 50, repositories: 200, tagPages: 6, devicesPerRepository: 25,
  concurrency: 3, repositoryTimeoutMs: 30000, totalTimeoutMs: 180000, revisionsPerDrive: 100,
});
const CODES = new Set(['SIGN_IN_REQUIRED', 'AUTHENTICATION_REQUIRED', 'NOT_FOUND', 'PROVIDER_UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'UNREADABLE_SNAPSHOTS']);
const codeOf = error => CODES.has(error?.code) ? error.code : 'PROVIDER_UNAVAILABLE';
const iso = value => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null; };
const size = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Lists the repositories of the signed-in Docker Hub account and its readable organizations, then
 * looks inside each one for this app's snapshot tags and groups them per drive. Every step is bounded
 * (pages, repositories, tags, devices, concurrency, time), results appear as they arrive, a failing
 * repository only marks its own row, and finished results are cached for the session until refreshed.
 *
 *   hub.get(pathname, signal)            authenticated Docker Hub API read, JSON
 *   reader.snapshotInfo(request, signal) one verified snapshot's identity: { vaultId, deviceId, driveName, bytes, fileCount }
 *   account(signal)                      the signed-in account name, or throws { code: 'SIGN_IN_REQUIRED' }
 */
export function createHubCatalog({ hub, reader, account, now = Date.now, limits = {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof hub?.get !== 'function' || typeof reader?.snapshotInfo !== 'function' || typeof account !== 'function') throw Error('Invalid Docker Hub catalog service.');
  const bounds = { ...HUB_CATALOG_LIMITS, ...limits };
  let state = blank(), run = null;
  function blank() { return { phase: 'idle', reason: null, account: null, namespaces: [], organizationsUnavailable: false, repositories: [], progress: { total: 0, done: 0 }, truncated: false, startedAt: null, finishedAt: null }; }
  const snapshot = () => structuredClone(state);

  async function listNamespaces(name, signal) {
    const names = [name];
    try {
      const body = await hub.get('/v2/repositories/namespaces', signal);
      const listed = Array.isArray(body) ? body : Array.isArray(body?.namespaces) ? body.namespaces : [];
      for (const item of listed) { const value = typeof item === 'string' ? item : item?.namespace ?? item?.name; if (typeof value === 'string' && NAMESPACE.test(value) && !names.includes(value)) names.push(value); }
    } catch (error) { if (signal.aborted) throw error; state.organizationsUnavailable = true; }
    if (names.length > bounds.namespaces) { names.length = bounds.namespaces; state.truncated = true; }
    return names;
  }

  async function listRepositories(namespace, signal) {
    const found = [];
    for (let page = 1; page <= bounds.repositoryPages; page++) {
      const body = await hub.get(`/v2/namespaces/${namespace}/repositories?page_size=${bounds.pageSize}&page=${page}`, signal);
      for (const item of Array.isArray(body.results) ? body.results : []) {
        if (typeof item?.name !== 'string' || !REPOSITORY.test(item.name) || found.length >= bounds.repositories) { if (found.length >= bounds.repositories) state.truncated = true; continue; }
        found.push({ id: `${namespace}/${item.name}`, namespace, name: item.name, visibility: item.is_private === true ? 'private' : 'public', lastPushed: iso(item.last_updated), size: size(item.storage_size),
          scan: 'pending', error: null, tags: { scanned: 0, truncated: false }, drives: [], unreadable: 0 });
      }
      if (!body.next) return found;
      if (page === bounds.repositoryPages) state.truncated = true;
    }
    return found;
  }

  async function scanRepository(repository, signal) {
    repository.scan = 'scanning';
    const tags = [];
    for (let page = 1; page <= bounds.tagPages; page++) {
      const body = await hub.get(`/v2/namespaces/${repository.namespace}/repositories/${repository.name}/tags?page_size=${bounds.pageSize}&page=${page}`, signal);
      for (const item of Array.isArray(body.results) ? body.results : []) {
        const match = typeof item?.name === 'string' ? APP_TAG.exec(item.name) : null; if (!match) continue;
        const digest = DIGEST.test(item.digest) ? item.digest : DIGEST.test(item.images?.[0]?.digest) ? item.images[0].digest : null;
        tags.push({ tag: item.name, deviceId: match[1], digest, updatedAt: iso(item.last_updated), bytes: size(item.full_size) });
      }
      repository.tags.scanned = tags.length;
      if (!body.next) break;
      if (page === bounds.tagPages) repository.tags.truncated = true;
    }
    // One device belongs to one drive, so each device's newest snapshot identifies it.
    const devices = new Map();
    for (const tag of tags) { const list = devices.get(tag.deviceId) ?? []; list.push(tag); devices.set(tag.deviceId, list); }
    const drives = new Map();
    let readCount = 0;
    for (const [deviceId, list] of devices) {
      list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      if (readCount >= bounds.devicesPerRepository) { repository.tags.truncated = true; break; }
      readCount++;
      const head = list.find(item => item.digest); let info;
      try {
        if (!head) throw Error();
        info = await reader.snapshotInfo({ repository: repository.id, visibility: repository.visibility, digest: head.digest }, signal);
        if (!info || !/^[a-f0-9]{32,64}$/.test(info.vaultId)) throw Error();
      } catch (error) { if (signal.aborted) throw error; repository.unreadable++; continue; }
      const drive = drives.get(info.vaultId) ?? { id: info.vaultId, shortId: info.vaultId.slice(0, 8), name: null, lastBackup: null, snapshots: 0, bytes: 0, devices: 0, revisions: [], latest: null };
      drives.set(info.vaultId, drive);
      drive.devices++; drive.snapshots += list.length;
      if (info.driveName && (!drive.name || (head.updatedAt ?? '') > (drive.nameAt ?? ''))) { drive.name = info.driveName; drive.nameAt = head.updatedAt; }
      for (const item of list) drive.revisions.push({ tag: item.tag, digest: item.digest, updatedAt: item.updatedAt, bytes: item.bytes });
      void deviceId;
    }
    repository.drives = [...drives.values()].map(drive => {
      drive.revisions.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')); drive.revisions.length = Math.min(drive.revisions.length, bounds.revisionsPerDrive);
      const newest = drive.revisions.find(item => item.digest) ?? null;
      drive.lastBackup = drive.revisions[0]?.updatedAt ?? null; drive.bytes = newest?.bytes ?? 0; drive.latest = newest && { tag: newest.tag, digest: newest.digest };
      delete drive.nameAt; return drive;
    }).sort((a, b) => (b.lastBackup ?? '').localeCompare(a.lastBackup ?? ''));
    repository.scan = 'done';
    if (repository.unreadable && !repository.drives.length) repository.error = { code: 'UNREADABLE_SNAPSHOTS' };
  }

  async function execute(current) {
    const { signal } = current.controller;
    try {
      let name;
      try { name = await account(signal); } catch (error) { if (signal.aborted) throw error; const failure = Error('signed out'); failure.code = codeOf(error) === 'PROVIDER_UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'SIGN_IN_REQUIRED'; throw failure; }
      if (typeof name !== 'string' || !NAMESPACE.test(name.toLowerCase())) { const failure = Error('signed out'); failure.code = 'SIGN_IN_REQUIRED'; throw failure; }
      state.account = name.toLowerCase(); state.phase = 'listing';
      const namespaces = await listNamespaces(state.account, signal);
      state.namespaces = namespaces.map(value => ({ name: value, organization: value !== state.account, error: null }));
      for (const entry of state.namespaces) {
        try { const repositories = await listRepositories(entry.name, signal); state.repositories.push(...repositories); }
        catch (error) { if (signal.aborted) throw error; entry.error = { code: codeOf(error) }; }
        state.repositories.sort((a, b) => (b.lastPushed ?? '').localeCompare(a.lastPushed ?? ''));
      }
      state.phase = 'scanning'; state.progress = { total: state.repositories.length, done: 0 };
      const queue = [...state.repositories];
      await Promise.all(Array.from({ length: Math.min(bounds.concurrency, queue.length) }, async () => {
        for (let repository = queue.shift(); repository; repository = queue.shift()) {
          const own = new AbortController(), forward = () => own.abort();
          signal.addEventListener('abort', forward, { once: true });
          const timer = setTimer(() => { repository.timedOut = true; own.abort(); }, bounds.repositoryTimeoutMs); timer.unref?.();
          try { await scanRepository(repository, own.signal); }
          catch (error) {
            if (signal.aborted) { repository.scan = 'pending'; throw error; }
            repository.scan = 'error'; repository.error = { code: repository.timedOut ? 'TIMEOUT' : codeOf(error) };
          } finally { clearTimer(timer); signal.removeEventListener('abort', forward); delete repository.timedOut; state.progress.done++; }
        }
      }));
      state.phase = 'done';
    } catch (error) {
      if (current.controller.signal.aborted) { state.phase = current.timedOut ? 'failed' : 'cancelled'; state.reason = current.timedOut ? 'TIMEOUT' : 'CANCELLED'; }
      else { state.phase = 'failed'; state.reason = codeOf(error); }
    } finally {
      clearTimer(current.timer); state.finishedAt = new Date(now()).toISOString(); run = null;
    }
  }

  return {
    snapshot,
    get pending() { return Boolean(run); },
    /** Starts a scan unless one is running or a finished result is cached. Progress is read with snapshot(). */
    start({ force = false } = {}) {
      if (run) return snapshot();
      if (!force && state.phase === 'done') return snapshot();
      state = blank(); state.phase = 'listing'; state.startedAt = new Date(now()).toISOString();
      const controller = new AbortController();
      run = { controller, timedOut: false };
      run.timer = setTimer(() => { run.timedOut = true; controller.abort(); }, bounds.totalTimeoutMs); run.timer.unref?.();
      run.done = execute(run);
      return snapshot();
    },
    cancel() { run?.controller.abort(); return snapshot(); },
    /** Resolves when the running scan settles. */
    async settled() { await run?.done; return snapshot(); },
    forget() { if (!run) state = blank(); },
  };
}
