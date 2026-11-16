const SUFFIX = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const NAMESPACE = /^[a-z0-9][a-z0-9_-]{1,38}$/;
const SESSION = /^[A-Za-z0-9-]{1,64}$/;
const MAX_DRIVES = 100;
export const BACKUP_SCHEDULE = Object.freeze({ enabled: true, mode: 'interval', intervalMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6], times: ['02:00'], timeZone: 'UTC', missed: 'run-once', retryMinutes: 15, background: false });
const SAFE_ERRORS = new Set(['SIGN_IN_REQUIRED', 'REPOSITORY_CREATE_DENIED', 'REPOSITORY_PRIVATE', 'REPOSITORY_NOT_WRITABLE', 'PROVIDER_UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'CANCELLED', 'BUSY', 'SYNC_FAILED', 'LOCKED', 'INVALID_NAME']);
const fail = (code, message) => { const error = Error(message); error.code = code; return error; };

/** `mfe-<slug>`: a readable, registry-safe repository name derived from a drive name. */
export function backupRepositoryName(driveName) {
  const slug = String(driveName ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return `mfe-${slug || 'drive'}`;
}
/** Make every suggestion unique without ever exceeding the registry name limits. */
export function uniqueBackupNames(names) {
  const used = new Set(); return names.map(name => {
    let candidate = name, index = 2; while (used.has(candidate)) candidate = `${name}-${index++}`;
    used.add(candidate); return candidate;
  });
}
export function validBackupSuffix(value) { return typeof value === 'string' && value.length >= 1 && value.length <= 100 && SUFFIX.test(value); }

/**
 * Main-process orchestration for "back up my drives to Docker Hub". It composes the existing
 * sign-in, repository, destination and synchronization services and never touches plaintext:
 * synchronization uploads only the encrypted objects of each drive's storage folder.
 */
export function createRegistryBackupAll({ drives, docker, sync, now = Date.now }) {
  let run = null; // { phase, startedAt, finishedAt, rows, controller, cancelled }
  const rowsView = () => run ? run.rows.map(row => ({ ...row })) : [];
  const status = () => ({ phase: run?.phase ?? 'idle', startedAt: run?.startedAt ?? null, finishedAt: run?.finishedAt ?? null, namespace: run?.namespace ?? null, drives: rowsView() });

  function eligibility(drive) {
    if (drive.locked) return 'locked';
    if (!drive.storageDir) return 'no-storage';
    if (drive.transport && drive.transport !== 'folder') return 'not-folder';
    return null;
  }
  async function plan() {
    const inventory = drives().slice(0, MAX_DRIVES);
    const suggestions = uniqueBackupNames(inventory.map(drive => backupRepositoryName(drive.name)));
    const items = [];
    for (const [index, drive] of inventory.entries()) {
      let saved = null;
      try { saved = await sync.status(drive.sessionId); } catch { /* A drive without a readable status is still listed. */ }
      const configured = saved?.configured ? saved.configuration : null;
      items.push({
        sessionId: drive.sessionId, name: String(drive.name || drive.letter || '').slice(0, 80), letter: String(drive.letter || '').slice(0, 8),
        locked: Boolean(drive.locked), ineligibleReason: eligibility(drive),
        suffix: configured ? configured.repository.split('/')[1] : suggestions[index],
        configured: configured ? { repository: configured.repository, visibility: configured.visibility, enabled: configured.schedule.enabled } : null,
        lastSync: saved?.lastResult?.verifiedAt ?? null, nextSync: Number.isFinite(saved?.nextDue) ? new Date(saved.nextDue).toISOString() : null,
      });
    }
    return { drives: items, running: run?.phase === 'running' };
  }

  async function backupOne(row, drive, request, signal) {
    const set = (state, extra = {}) => { Object.assign(row, { state }, extra); };
    const saved = await sync.status(drive.sessionId);
    let repository = `${run.namespace}/${request.suffix}`, visibility = 'public', schedule = BACKUP_SCHEDULE;
    if (saved.configured) {
      // An existing destination keeps working unchanged: same repository, same visibility, schedule kept when enabled.
      ({ repository, visibility } = saved.configuration);
      if (saved.configuration.schedule.enabled) schedule = saved.configuration.schedule;
    }
    row.repository = repository; row.visibility = visibility;
    if (!saved.configured || visibility === 'public') {
      set('repository');
      try { await docker.ensurePublicRepository(repository, signal); }
      catch (error) { throw fail(SAFE_ERRORS.has(error?.code) ? error.code : 'PROVIDER_UNAVAILABLE', SAFE_ERRORS.has(error?.code) ? error.message : 'Docker Hub could not prepare the repository. Check the connection and try again.'); }
    }
    if (run.cancelled) throw fail('CANCELLED', 'Cancelled before this drive started.');
    set('configuring');
    try { await sync.configure(drive.sessionId, { repository, visibility, schedule }); }
    catch (error) { throw fail(/Wait for registry/.test(error?.message || '') ? 'BUSY' : 'SYNC_FAILED', error?.message ? String(error.message).slice(0, 300) : 'The destination could not be saved.'); }
    if (run.cancelled) throw fail('CANCELLED', 'Cancelled before this drive started.');
    set('syncing');
    let result;
    try { result = await sync.sync(drive.sessionId); }
    catch (error) { throw fail(run.cancelled ? 'CANCELLED' : 'SYNC_FAILED', run.cancelled ? 'Cancelled while this drive was uploading.' : String(error?.message || 'Synchronization is incomplete.').slice(0, 300)); }
    const after = await sync.status(drive.sessionId);
    set('done', { digest: typeof result?.digest === 'string' ? result.digest : null, published: result?.published !== false,
      lastSync: after.lastResult?.verifiedAt ?? new Date(now()).toISOString(), nextSync: Number.isFinite(after.nextDue) ? new Date(after.nextDue).toISOString() : null, error: null });
    void signal;
  }

  async function execute(requests) {
    try {
      for (const request of requests) {
        const row = run.rows.find(item => item.sessionId === request.sessionId);
        if (run.cancelled) { Object.assign(row, { state: 'cancelled' }); continue; }
        const drive = drives().find(item => item.sessionId === request.sessionId);
        try {
          if (!drive || eligibility(drive)) throw fail('LOCKED', 'Unlock this drive to include it.');
          await backupOne(row, drive, request, run.controller.signal);
        } catch (error) {
          const code = SAFE_ERRORS.has(error?.code) ? error.code : 'SYNC_FAILED';
          Object.assign(row, { state: code === 'CANCELLED' ? 'cancelled' : 'failed', error: { code, message: String(error?.message || 'Backup failed.').slice(0, 300) } });
        }
      }
    } finally {
      run.phase = run.cancelled ? 'cancelled' : 'finished'; run.finishedAt = new Date(now()).toISOString();
    }
  }

  return {
    status, plan,
    get pending() { return run?.phase === 'running'; },
    /** Start backing up the chosen drives. Sign-in must already be verified; progress is read with status(). */
    async start({ sessionIds, names = {}, namespace } = {}, signal) {
      if (run?.phase === 'running') throw fail('BUSY', 'A backup is already running.');
      if (!Array.isArray(sessionIds) || !sessionIds.length || sessionIds.length > MAX_DRIVES || new Set(sessionIds).size !== sessionIds.length || sessionIds.some(id => typeof id !== 'string' || !SESSION.test(id)))
        throw fail('INVALID_NAME', 'Choose at least one drive.');
      if (!names || typeof names !== 'object' || Array.isArray(names)) throw fail('INVALID_NAME', 'Invalid repository names.');
      const inventory = drives();
      const chosen = sessionIds.map(id => inventory.find(drive => drive.sessionId === id));
      if (chosen.some(drive => !drive)) throw fail('INVALID_NAME', 'A selected drive no longer exists.');
      const inspection = await docker.inspectRegistrySignIn(signal);
      if (inspection?.state !== 'signed-in') throw fail('SIGN_IN_REQUIRED', 'Sign in to Docker Hub first.');
      const account = namespace ?? inspection.account;
      if (typeof account !== 'string' || !NAMESPACE.test(account.toLowerCase())) throw fail('SIGN_IN_REQUIRED', 'The Docker Hub account name could not be determined. Sign in again.');
      const requests = [];
      for (const drive of chosen) {
        const suffix = names[drive.sessionId] ?? backupRepositoryName(drive.name);
        if (!validBackupSuffix(suffix)) throw fail('INVALID_NAME', 'Repository names use lowercase letters, digits, dashes, dots and underscores.');
        requests.push({ sessionId: drive.sessionId, suffix });
      }
      if (new Set(requests.map(request => request.suffix)).size !== requests.length) throw fail('INVALID_NAME', 'Each drive needs its own repository name.');
      run = { phase: 'running', startedAt: new Date(now()).toISOString(), finishedAt: null, namespace: account.toLowerCase(), cancelled: false, controller: new AbortController(),
        rows: requests.map(request => { const drive = chosen.find(item => item.sessionId === request.sessionId);
          return { sessionId: request.sessionId, name: String(drive.name || drive.letter || '').slice(0, 80), repository: `${account.toLowerCase()}/${request.suffix}`, visibility: 'public', state: 'queued', error: null, digest: null, published: null, lastSync: null, nextSync: null }; }) };
      void execute(requests);
      return status();
    },
    async cancel() {
      if (run?.phase !== 'running') return status();
      run.cancelled = true; run.controller.abort();
      const active = run.rows.find(row => row.state === 'syncing');
      if (active) { try { await sync.cancel(active.sessionId); } catch { /* The service reports the real release state. */ } }
      return status();
    },
  };
}
