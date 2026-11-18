import { backupRepositoryName } from '../registry-backup-all.js';
import { DEFAULT_REGISTRY_SCHEDULE } from '../registry-schedule.js';

/** After a failure a drive waits 1, 5 and 15 minutes, then once an hour. */
export const RETRY_MINUTES = Object.freeze([1, 5, 15, 60]);
export const SHARED_REPOSITORY = 'material-file-encryptor-storage';
const SIGN_IN_CACHE_MS = 5 * 60000;
const NAMESPACE = /^[a-z0-9][a-z0-9_-]{1,38}$/;
const PAUSED = /paused while you used the drive/i;

/**
 * Automatic backup. It decides WHEN a drive backs up and leaves HOW to the registry sync service, which already
 * owns snapshots, incremental upload, yielding to the drive and pruning. Triggers:
 *   - changes: a backup about idleDelay after the drive's last change
 *   - a periodic check every intervalMinutes, which also catches anything missed
 *   - lock (and app close) when changes are pending
 *   - reconnect, for drives that were waiting for a connection
 * One drive backs up at a time. Nothing is uploaded until the person is signed in and has acknowledged the
 * public-repository notice once. A drive whose row switch is off is never backed up automatically.
 *
 *   sync      createRegistrySyncService instance: status, configure, sync, pending
 *   docker    inspectRegistrySignIn, ensurePublicRepository
 *   drives()  [{ sessionId, name, storageDir, transport }]
 *   settings  createAutoBackupSettings instance
 *   online()  false while the computer has no network
 */
export function createAutoBackup({ sync, docker, drives, settings, online = () => true, busy = () => false, now = Date.now, onChanged = () => {} }) {
  const state = new Map(); // sessionId -> { dirty, dueAt, failures, retryAt, phase, lastError, lastAttempt }
  let running = null, ticking = false, signIn = { at: 0, value: null }, wasOnline = true;
  const drive = id => { if (!state.has(id)) state.set(id, { dirty: false, dueAt: null, failures: 0, retryAt: null, phase: 'idle', lastError: null, lastAttempt: null }); return state.get(id); };
  const changed = () => { try { onChanged(); } catch { /* a listener never changes backup */ } };

  async function account(force = false) {
    if (!force && signIn.value && now() - signIn.at < SIGN_IN_CACHE_MS) return signIn.value;
    let value = null;
    try { const inspection = await docker.inspectRegistrySignIn(); if (inspection?.state === 'signed-in' && typeof inspection.account === 'string' && NAMESPACE.test(inspection.account.toLowerCase())) value = inspection.account.toLowerCase(); }
    catch { value = null; }
    signIn = { at: now(), value }; return value;
  }
  function eligible(item) { return item && item.storageDir && (!item.transport || item.transport === 'folder'); }

  /** Picks the repository for a drive that has no destination yet, and makes sure it exists as public. */
  async function destination(item, name, layout) {
    const repository = layout === 'per-drive' ? `${name}/${backupRepositoryName(item.name)}` : `${name}/${SHARED_REPOSITORY}`;
    await docker.ensurePublicRepository(repository);
    return repository;
  }

  async function backUp(item, current, name) {
    const entry = drive(item.sessionId);
    running = item.sessionId; entry.phase = 'backing-up'; entry.lastAttempt = now(); entry.lastError = null; changed();
    try {
      let saved = await sync.status(item.sessionId);
      if (!saved.configured) {
        const repository = await destination(item, name, current.settings.repositoryLayout);
        // Automatic backup decides the timing itself, so the saved interval schedule stays off.
        await sync.configure(item.sessionId, { repository, visibility: 'public', schedule: { ...DEFAULT_REGISTRY_SCHEDULE, enabled: false } });
        saved = await sync.status(item.sessionId);
      } else if (saved.configuration.visibility === 'public') await docker.ensurePublicRepository(saved.configuration.repository);
      await sync.sync(item.sessionId);
      Object.assign(entry, { dirty: false, dueAt: null, failures: 0, retryAt: null, phase: 'idle', lastError: null });
    } catch (error) {
      const message = String(error?.message || 'The backup did not finish.').slice(0, 300);
      // Using the drive pauses a backup; the sync service resumes it, and the change stays pending meanwhile.
      if (PAUSED.test(message)) { entry.phase = 'paused'; entry.dueAt = now() + current.settings.idleDelaySeconds * 1000; return; }
      entry.failures++;
      entry.retryAt = now() + RETRY_MINUTES[Math.min(entry.failures, RETRY_MINUTES.length) - 1] * 60000;
      entry.phase = online() ? 'needs-attention' : 'waiting-connection';
      entry.lastError = message;
    } finally { running = null; changed(); }
  }

  function due(entry, saved, current) {
    const time = now();
    if (entry.retryAt) return entry.retryAt <= time;
    if (entry.dirty && entry.dueAt !== null && entry.dueAt <= time) return true;
    const last = Date.parse(saved?.lastResult?.verifiedAt ?? '');
    const attempted = entry.lastAttempt ?? 0;
    return !Number.isFinite(last) ? attempted + current.settings.intervalMinutes * 60000 <= time || !entry.lastAttempt
      : Math.max(last, attempted) + current.settings.intervalMinutes * 60000 <= time;
  }

  const service = {
    /** The drive wrote something. A backup follows once it has been quiet for the idle delay. */
    async noteChange(sessionId) {
      const current = await settings.get(); const entry = drive(sessionId);
      entry.dirty = true; entry.dueAt = now() + current.settings.idleDelaySeconds * 1000;
      if (entry.phase === 'idle') entry.phase = 'waiting-idle';
      changed();
    },
    /** The drive locked. With changes pending and back-up-on-lock on, it backs up at the next check. */
    async noteLock(sessionId) {
      const current = await settings.get(); const entry = drive(sessionId);
      if (current.settings.onLock && entry.dirty) { entry.dueAt = now(); changed(); }
    },
    /** Drives with changes not yet backed up, for the close flow. */
    pendingChanges() { return [...state].filter(([, entry]) => entry.dirty).map(([id]) => id); },
    async tick() {
      if (ticking || running) return;
      ticking = true;
      try {
        const isOnline = online();
        if (isOnline && !wasOnline) for (const entry of state.values()) if (entry.phase === 'waiting-connection') entry.retryAt = now();
        wasOnline = isOnline;
        const current = await settings.get();
        if (!current.settings.enabled || !current.settings.noticeAcknowledged || !isOnline || busy() || sync.pending) return;
        const name = await account(); if (!name) return;
        for (const item of drives()) {
          if (!eligible(item) || current.drives[item.sessionId]?.enabled === false) continue;
          let saved = null; try { saved = await sync.status(item.sessionId); } catch { continue; }
          // A drive backing up to a private repository keeps working only through its own schedule.
          if (saved?.configured && saved.configuration.visibility === 'private') continue;
          if (!due(drive(item.sessionId), saved, current)) continue;
          await backUp(item, current, name);
          break;
        }
      } finally { ticking = false; }
    },
    /**
     * Backs up drives with pending changes before the app closes, when back-up-on-lock is on. It stops starting new
     * drives once the deadline passes; the caller decides what to do with a backup still running then.
     */
    async flush(deadline) {
      const current = await settings.get();
      if (!current.settings.enabled || !current.settings.onLock || !current.settings.noticeAcknowledged || !online()) return { started: 0 };
      const name = await account(); if (!name) return { started: 0 };
      let started = 0;
      for (const id of service.pendingChanges()) {
        if (now() >= deadline || running || sync.pending) break;
        const item = drives().find(value => value.sessionId === id);
        if (!eligible(item) || current.drives[id]?.enabled === false) continue;
        started++; await backUp(item, current, name);
      }
      return { started };
    },
    /** Runs one drive now, whatever its schedule. Sign-in and the notice are still required. */
    async backUpNow(sessionId) {
      const current = await settings.get();
      if (!current.settings.noticeAcknowledged) throw Error('Read the public repository notice first.');
      const name = await account(true); if (!name) throw Error('Sign in to Docker Hub first.');
      const item = drives().find(value => value.sessionId === sessionId);
      if (!eligible(item)) throw Error('This drive has no encrypted storage folder to back up.');
      if (running || sync.pending) throw Error('Wait for the current backup to finish.');
      await backUp(item, current, name);
      const entry = drive(sessionId); if (entry.lastError) throw Error(entry.lastError);
      return service.status();
    },
    /** Points a drive at its own repository. Its next backup goes there; earlier snapshots stay where they were. */
    async moveToOwnRepository(sessionId) {
      const name = await account(true); if (!name) throw Error('Sign in to Docker Hub first.');
      const item = drives().find(value => value.sessionId === sessionId);
      if (!eligible(item)) throw Error('This drive has no encrypted storage folder to back up.');
      const repository = `${name}/${backupRepositoryName(item.name)}`;
      await docker.ensurePublicRepository(repository);
      const saved = await sync.status(sessionId);
      await sync.configure(sessionId, { repository, visibility: 'public', schedule: saved.configuration?.schedule ?? { ...DEFAULT_REGISTRY_SCHEDULE, enabled: false } });
      const entry = drive(sessionId); entry.dirty = true; entry.dueAt = now(); changed();
      return service.status();
    },
    async status() {
      const current = await settings.get();
      const name = await account();
      const list = [];
      for (const item of drives()) {
        let saved = null; try { saved = await sync.status(item.sessionId); } catch { saved = null; }
        const entry = drive(item.sessionId);
        const enabled = current.drives[item.sessionId]?.enabled !== false;
        const phase = !eligible(item) ? 'unavailable' : !enabled ? 'off' : running === item.sessionId ? 'backing-up' : entry.phase;
        list.push({ sessionId: item.sessionId, name: item.name || '', enabled, phase, dirty: entry.dirty, dueAt: entry.dueAt, retryAt: entry.retryAt, failures: entry.failures,
          lastError: entry.lastError ?? saved?.lastError ?? null, lastBackup: saved?.lastResult?.verifiedAt ?? null,
          repository: saved?.configuration?.repository ?? null, visibility: saved?.configuration?.visibility ?? null, deviceId: saved?.deviceId ?? null,
          progress: saved?.progress ?? null, syncState: saved?.state ?? null,
          snapshots: saved?.snapshotCount ?? null, tagCount: saved?.tagCount ?? null, lastPrune: saved?.lastPrune ?? null });
      }
      return { settings: current.settings, signedIn: Boolean(name), account: name, online: online(), noticeRequired: !current.settings.noticeAcknowledged, running, drives: list };
    },
    async update(patch) { await settings.update(patch); changed(); return service.status(); },
    async setDrive(sessionId, enabled) { await settings.setDrive(sessionId, enabled); if (!enabled) { const entry = drive(sessionId); Object.assign(entry, { retryAt: null, phase: 'idle' }); } changed(); return service.status(); },
    get running() { return running; },
    get pending() { return Boolean(running) || ticking; },
  };
  return service;
}
