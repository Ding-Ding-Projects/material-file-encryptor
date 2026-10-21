import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRegistryStorage, registryDestination } from './registry-storage.js';
import { createVaultImageSnapshot, readVaultImageSnapshotFile } from './vault-image-snapshot.js';
import { validateRegistrySchedule, nextRegistryRun, registryOccurrence } from './registry-schedule.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = stat => `${stat.dev}:${stat.ino}`;
const ERROR = 'Registry synchronization is incomplete. Local encrypted data was retained. Review the destination and retry.';
async function physical(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw Error('Choose an absolute local storage folder.');
  for (let cursor = path.resolve(root); ; cursor = path.dirname(cursor)) {
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || path.resolve(await fs.realpath(cursor)).toLowerCase() !== cursor.toLowerCase()) throw Error('Linked storage folders are not supported.');
    if (path.dirname(cursor) === cursor) break;
  }
  return path.resolve(root);
}
async function createFile(root, relative, bytes) {
  if (!/^(?:vault\.json|(?:parts|commits|activity)\/(?:[a-f0-9]{32}|[a-f0-9]{64})\.mfe)$/.test(relative)) throw Error('Invalid encrypted object path.');
  await physical(root);
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 }); await physical(path.dirname(filename));
  const temporary = path.join(path.dirname(filename), `.registry-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    // Linking an already complete owned temporary file gives atomic no-replace publication.
    await fs.link(temporary, filename);
  } finally { await fs.unlink(temporary); }
}

/** Main-process orchestration. No registry endpoint or filesystem path is accepted from a renderer. */
export function createRegistrySyncService({ root, contexts, nativeRequest, authorize, chooseRestore, backgroundRegistration = async () => {}, storageFactory = createRegistryStorage, testDestination = null, now = Date.now }) {
  let rows = {}, loaded = false, loading = null, configuring = false, ticking = false, saving = Promise.resolve(), active = null;
  const file = path.join(root, 'registry-sync.json');
  async function readState() {
    if (loaded) return;
    await fs.mkdir(root, { recursive: true, mode: 0o700 }); await physical(root);
    try {
      const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 ** 2) throw Error(ERROR);
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (value.version !== 1 || !value.rows || typeof value.rows !== 'object' || Array.isArray(value.rows) || Object.keys(value.rows).length > 100) throw Error(ERROR);
      for (const [key, row] of Object.entries(value.rows)) {
        if (!row || typeof row !== 'object' || !/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{32}$/.test(row.deviceId)) throw Error(ERROR);
        row.visibility = registryDestination({ repository: row.repository, visibility: row.visibility }).visibility; validateRegistrySchedule(row.schedule);
        if (row.nextDue !== null && !Number.isFinite(row.nextDue) || row.retryOccurrence !== undefined && !Number.isFinite(row.retryOccurrence)) throw Error(ERROR);
        row.state = row.interrupted ? 'incomplete' : 'idle'; row.lastError = row.interrupted ? ERROR : row.lastError;
        row.progress = null;
      }
      rows = value.rows;
    } catch (error) { if (error.code !== 'ENOENT') throw Error(ERROR); }
    loaded = true;
  }
  function load() {
    if (!loading) loading = readState().catch(error => { loading = null; throw error; });
    return loading;
  }
  function context(id, requireSource = true) {
    const value = contexts(id);
    if (!value || requireSource && (!value.storageDir || value.transport !== 'folder')) throw Error('Select a folder-backed vault first.');
    const source = value.storageDir || '';
    return { ...value, storageDir: source, key: hash(Buffer.from(source ? path.resolve(source).toLowerCase() : `unbound:${id}`)) };
  }
  function save() {
    saving = saving.catch(() => {}).then(async () => {
      const temporary = path.join(root, `state-${randomUUID()}.tmp`);
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        try { await handle.writeFile(JSON.stringify({ version: 1, rows })); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(temporary, file);
        if (process.platform !== 'win32') { const directory = await fs.open(root, 'r'); try { await directory.sync(); } finally { await directory.close(); } }
      } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    return saving;
  }
  function storage(row) { return storageFactory({ destination: testDestination ? { ...testDestination, repository: row.repository, visibility: row.visibility } : { repository: row.repository, visibility: row.visibility }, authorize }); }
  async function status(id) {
    await load(); const current = context(id, false), row = rows[current.key];
    return structuredClone({ activeOperation: active ? { sessionId: active.id, state: rows[active.key]?.state || 'incomplete' } : null, sessionId: id, source: current.storageDir, configured: Boolean(row), configuration: row ? { repository: row.repository, visibility: row.visibility, schedule: row.schedule } : null,
      state: row?.state || 'unconfigured', progress: row?.progress || null, nextDue: row?.nextDue || null, lastResult: row?.lastResult || null, restoreRecovery: row?.restoreRecovery || null, lastError: row?.lastError || null });
  }
  async function exclusive(id, action, requireSource = true) {
    await load(); const current = context(id, requireSource), row = rows[current.key]; if (!row) throw Error('Save a registry destination first.');
    if (active || configuring) throw Error('Wait for the current registry operation.');
    const controller = new AbortController(); active = { id, controller, key: current.key, leases: new Set(), settled: false };
    const timer = setTimeout(() => controller.abort(), 3600000); timer.unref();
    const cancelNative = () => { void nativeRequest('cancelSnapshot', {}, id).catch(() => {}); };
    controller.signal.addEventListener('abort', cancelNative, { once: true });
    row.lastError = null; row.interrupted = true; row.progress = null;
    try { await save(); return await action(current, row, controller.signal); }
    catch { row.state = controller.signal.aborted ? 'cancelled' : 'incomplete'; row.lastError = ERROR; throw Error(ERROR); }
    finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', cancelNative); row.interrupted = active.leases.size > 0;
      active.settled = true;
      if (active.leases.size) { row.state = 'native-release-unverified'; row.lastError = 'Native snapshot release is unverified. Retry Cancel before closing or starting another operation.'; }
      else active = null;
      await save();
    }
  }
  async function acquire(id, source) {
    active.controller.signal.throwIfAborted();
    const lease = await nativeRequest('beginSnapshot', { storageDir: source }, id);
    if (typeof lease?.leaseId !== 'string' || !lease.leaseId || typeof lease.storageDir !== 'string') throw Error('Invalid native snapshot lease.');
    active.leases.add(lease.leaseId); return lease;
  }
  async function release(id, lease) {
    const operation = active;
    const result = await nativeRequest('releaseSnapshot', { leaseId: lease.leaseId }, id);
    if (result?.released !== true) throw Error('Native snapshot release was not confirmed.');
    operation.leases.delete(lease.leaseId);
  }
  async function stageRevision(client, digest, signal, row) {
    const staging = await fs.mkdtemp(path.join(root, 'incoming-'));
    try {
      const revision = await client.download(digest, async (name, bytes) => {
        signal.throwIfAborted(); await createFile(staging, name, bytes);
        if (row) { row.progress.completedFiles++; row.progress.completedBytes += bytes.length; }
      }, signal);
      // Structural and content-address verification precedes activation. Normal unlock authenticates the vault key.
      const verified = await createVaultImageSnapshot({ source: staging, workRoot: path.join(root, 'validation'), signal });
      try { if (verified.manifest.vaultId !== revision.snapshot.vaultId) throw Error(ERROR); }
      finally { await fs.rm(verified.directory, { recursive: true }); }
      return { staging, revision };
    } catch (error) { await fs.rm(staging, { recursive: true }); throw error; }
  }
  async function mergeObjects(staging, source, files, signal) {
    await physical(source);
    // Objects are append-only. A differing object is a collision, never an overwrite.
    // Transaction metadata is copied last so incomplete transfers remain undiscoverable by replay.
    const ordered = [...files].sort((a, b) => Number(a.path.startsWith('commits/')) - Number(b.path.startsWith('commits/')));
    for (const entry of ordered) {
      signal.throwIfAborted(); const incoming = await fs.readFile(path.join(staging, entry.path));
      if (`sha256:${hash(incoming)}` !== entry.digest) throw Error(ERROR);
      try { await createFile(source, entry.path, incoming); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = path.join(source, entry.path); await physical(existing);
        const stat = await fs.lstat(existing); if (!stat.isFile() || stat.nlink !== 1 || stat.size !== incoming.length || hash(await fs.readFile(existing)) !== hash(incoming)) throw Error('Immutable encrypted object collision.');
      }
    }
  }
  const service = {
    status,
    async initialize() {
      await load();
      if (active || configuring) throw Error('Wait for registry synchronization.');
      configuring = true;
      try {
        const enabled = Object.values(rows).some(row => row.schedule.enabled && row.schedule.background);
        try { await backgroundRegistration(enabled); }
        catch {
          for (const row of Object.values(rows)) if (row.schedule.enabled && row.schedule.background) row.lastError = 'Background task registration is incomplete. Manual synchronization remains available.';
          await save();
        }
      } finally { configuring = false; }
    },
    async configure(id, configuration) {
      await load(); if (active || configuring || ticking) throw Error('Wait for registry synchronization.');
      const current = context(id, false); const destination = registryDestination({ repository: configuration.repository, visibility: configuration.visibility });
      const schedule = validateRegistrySchedule(configuration.schedule);
      if (schedule.enabled && (!current.storageDir || current.transport !== 'folder')) throw Error('Restore or select a folder-backed vault before enabling its schedule.');
      if (!rows[current.key] && Object.keys(rows).length >= 100) throw Error('The registry destination limit has been reached.');
      configuring = true;
      try {
        const previous = rows[current.key];
        rows[current.key] = { deviceId: previous?.deviceId || randomUUID().replaceAll('-', ''), repository: configuration.repository, visibility: destination.visibility, schedule,
          state: 'idle', nextDue: nextRegistryRun(schedule, now()), lastResult: previous?.repository === configuration.repository && previous?.visibility === destination.visibility ? previous.lastResult : null, restoreRecovery: previous?.restoreRecovery || null, lastError: null };
        await save();
        // Registration failure leaves configuration saved but explicitly incomplete.
        try { await backgroundRegistration(Object.values(rows).some(row => row.schedule.enabled && row.schedule.background)); }
        catch { rows[current.key].lastError = 'Background task registration is incomplete. Manual synchronization remains available.'; await save(); throw Error(rows[current.key].lastError); }
        return await status(id);
      } finally { configuring = false; }
    },
    sync(id) {
      return exclusive(id, async (current, row, signal) => {
        const client = storage(row); row.state = 'discovering'; let downloaded = 0;
        const revisions = await client.list(signal);
        row.progress = { phase: 'downloading', completedFiles: 0, completedBytes: 0, totalFiles: revisions.reduce((n, revision) => n + revision.snapshot.fileCount, 0) };
        // Native admission proves this session owns the selected root before any source write.
        const admission = await acquire(id, current.storageDir);
        try {
          signal.throwIfAborted();
          const vault = JSON.parse(await fs.readFile(path.join(current.storageDir, 'vault.json'), 'utf8'));
          for (const item of revisions) {
            if (item.snapshot.vaultId !== vault.VaultId) throw Error('The destination contains a different vault.');
            row.state = 'downloading';
            const staged = await stageRevision(client, item.digest, signal, row);
            try { await mergeObjects(staged.staging, current.storageDir, staged.revision.snapshot.files, signal); downloaded++; }
            finally { await fs.rm(staged.staging, { recursive: true }); }
          }
        } finally { await release(id, admission); }
        // The existing native replay owns concurrent file conflict preservation and live handles.
        signal.throwIfAborted();
        let native = await nativeRequest('sync', {}, id);
        const nativeDeadline = now() + 30 * 60000;
        while (native?.sync?.running) {
          signal.throwIfAborted(); if (now() >= nativeDeadline) throw Error('Native synchronization did not settle.');
          await new Promise(resolve => setTimeout(resolve, 200));
          native = await nativeRequest('statusSummary', {}, id);
        }
        if (native?.locked !== true && native?.sync?.error) throw Error('Native synchronization needs attention.');
        const replayDeferred = native?.locked === true;
        row.state = 'preparing'; let lease, snapshot;
        try {
          try {
            lease = await acquire(id, current.storageDir);
            signal.throwIfAborted();
            snapshot = await createVaultImageSnapshot({ source: lease.storageDir, workRoot: path.join(root, 'snapshots'), signal });
          } finally { if (lease) await release(id, lease); }
          const fingerprint = hash(Buffer.from(JSON.stringify(snapshot.manifest.files)));
          if (row.lastResult?.fingerprint === fingerprint && revisions.some(item => item.digest === row.lastResult.digest)) {
            row.state = 'verified'; return row.lastResult = { ...row.lastResult, downloaded, replayDeferred, published: false, verifiedAt: new Date(now()).toISOString() };
          }
          row.state = 'uploading';
          row.progress = { phase: 'preparing-upload', completedFiles: 0, completedBytes: 0, totalFiles: snapshot.manifest.files.length };
          const result = await client.publish({ vaultId: snapshot.manifest.vaultId, deviceId: row.deviceId,
            parents: [...new Set(revisions.map(item => item.digest))], files: snapshot.manifest.files,
            readFile: async name => { const file = snapshot.manifest.files.find(file => file.path === name); const chunks = []; for await (const bytes of readVaultImageSnapshotFile(snapshot.directory, file, { signal })) chunks.push(bytes); const bytes = Buffer.concat(chunks); row.progress.completedFiles++; row.progress.completedBytes += bytes.length; return bytes; } }, signal);
          row.state = 'verified'; return row.lastResult = { ...result, fingerprint, downloaded, replayDeferred, published: true, verifiedAt: new Date(now()).toISOString() };
        } finally { if (snapshot) await fs.rm(snapshot.directory, { recursive: true }); }
      });
    },
    list(id) { return exclusive(id, async (_current, row, signal) => { row.state = 'discovering'; const value = await storage(row).list(signal); row.state = 'idle'; return value; }, false); },
    restore(id, digest) {
      return exclusive(id, async (_current, row, signal) => {
        if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw Error('Invalid snapshot digest.');
        const selected = await chooseRestore(); if (!selected) { row.state = 'idle'; return { cancelled: true }; }
        signal.throwIfAborted(); await physical(selected); row.state = 'restoring';
        row.progress = { phase: 'downloading-restore', completedFiles: 0, completedBytes: 0, totalFiles: null };
        const staged = await stageRevision(storage(row), digest, signal, row);
        const restoredVaultId = staged.revision.snapshot.vaultId;
        const destination = path.join(selected, `restored-vault-${randomUUID().slice(0, 8)}`);
        try {
          signal.throwIfAborted();
          await fs.mkdir(destination, { mode: 0o700 });
          row.restoreRecovery = { destination, complete: false }; await save();
          const owned = identity(await fs.lstat(destination));
          const files = [...staged.revision.snapshot.files].sort((a, b) => Number(a.path === 'vault.json') - Number(b.path === 'vault.json'));
          for (const entry of files) { signal.throwIfAborted(); if (identity(await fs.lstat(destination)) !== owned) throw Error(ERROR); await createFile(destination, entry.path, await fs.readFile(path.join(staged.staging, entry.path))); }
          signal.throwIfAborted(); row.restoreRecovery.complete = true;
          row.state = 'idle'; return { restored: true, requiresUnlock: true, destination, vaultId: restoredVaultId };
        } finally { await fs.rm(staged.staging, { recursive: true }); }
      }, false);
    },
    async cancel(id) {
      if (active && active.id !== id) throw Error('This operation belongs to another vault.');
      active?.controller.abort();
      if (active?.settled) {
        const operation = active;
        if (!operation.releasing) operation.releasing = (async () => {
          try {
            for (const leaseId of [...operation.leases]) await release(id, { leaseId });
            rows[operation.key].state = 'cancelled'; rows[operation.key].interrupted = false;
            if (active === operation) active = null;
            await save();
          } finally { operation.releasing = null; }
        })();
        await operation.releasing;
      }
      return { cancelling: Boolean(active) };
    },
    async tick() {
      await load(); if (active || configuring || ticking) return;
      ticking = true;
      try {
        for (const [id] of contexts()) {
          const raw = contexts(id); if (!raw?.storageDir || raw.transport !== 'folder') continue;
          const current = context(id), row = rows[current.key]; if (!row?.schedule.enabled || !row.nextDue || row.nextDue > now()) continue;
          const due = row.retryOccurrence ?? row.nextDue;
          if (row.retryOccurrence === undefined && row.schedule.missed === 'skip' && now() - due > 5 * 60000) { row.nextDue = nextRegistryRun(row.schedule, now()); await save(); continue; }
          try { await service.sync(id); row.nextDue = nextRegistryRun(row.schedule, now(), registryOccurrence(row.schedule, due)); delete row.retryOccurrence; }
          catch { row.retryOccurrence = due; row.nextDue = now() + row.schedule.retryMinutes * 60000; }
          await save(); break;
        }
      } finally { ticking = false; }
    },
    get activeSessionId() { return active?.id ?? null; },
    get pending() { return Boolean(active) || configuring || ticking; },
    close() { if (active || configuring || ticking) throw Error('Registry synchronization or native snapshot release is still pending.'); },
  };
  return service;
}
