import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRegistryStorage, registryDestination } from './registry-storage.js';
import { createVaultImageSnapshot, inspectVaultConfiguration, describeStorageObject, openStorageObject, inspectStorageObject, checkContentAddress } from './vault-image-snapshot.js';
import { planRegistrySnapshot } from './registry-snapshot-plan.js';
import { validateRegistrySchedule, nextRegistryRun, registryOccurrence } from './registry-schedule.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = stat => `${stat.dev}:${stat.ino}`;
const ERROR = 'Registry synchronization is incomplete. Local encrypted data was retained. Review the destination and retry.';
// Each step a person can see while synchronization runs. Row state and progress.step use these names.
const PHASES = { discovering: 'checking the destination', 'waiting-drive': 'waiting for the drive to be ready', downloading: 'downloading snapshots from other devices',
  applying: 'applying downloaded history to the drive', preparing: 'preparing the encrypted snapshot', uploading: 'uploading', verifying: 'verifying the upload', restoring: 'restoring' };
const STALLED = 'The drive stopped making progress while preparing the snapshot. Nothing was uploaded.';
const RELEASE_TIMEOUT = 'The drive did not confirm that it was released in time.';
const BUSY = 'The drive stayed busy with other work. Retry when it has finished.';
export const PAUSED = 'Backup paused while you used the drive; it will resume.';
const SAFE_REASONS = new Set(['The destination contains a different vault.', 'Snapshot catalogue exceeds this client limit. Narrow the repository before retrying.', 'Snapshot catalogue exceeds the metadata limit.', 'Native synchronization did not settle.', 'Native synchronization needs attention.', STALLED, RELEASE_TIMEOUT, BUSY]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms).unref?.());
/** Rejects as soon as the signal aborts. The underlying native request keeps running and is settled by its owner. */
function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : Error('Cancelled.'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}
function withTimeout(promise, ms, message) {
  let timer; const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); timer.unref?.(); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
export async function physical(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw Error('Choose an absolute local storage folder.');
  for (let cursor = path.resolve(root); ; cursor = path.dirname(cursor)) {
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || path.resolve(await fs.realpath(cursor)).toLowerCase() !== cursor.toLowerCase()) throw Error('Linked storage folders are not supported.');
    if (path.dirname(cursor) === cursor) break;
  }
  return path.resolve(root);
}
export async function createFile(root, relative, bytes) {
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
export function createRegistrySyncService({ root, contexts, nativeRequest, authorize, chooseRestore, backgroundRegistration = async () => {}, storageFactory = createRegistryStorage, testDestination = null, now = Date.now, leaseRetryMs = 60000, nativeStallMs = 10 * 60000, releaseTimeoutMs = 30000, yieldWaitMs = 30000, resumeDelayMs = 60000, lateLeaseWaitMs = 20000, progressPollMs = 500, onChanged = () => {} }) {
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
        // Destinations saved before visibility existed were private; only new destinations default to public.
        row.visibility = registryDestination({ repository: row.repository, visibility: row.visibility ?? 'private' }).visibility; validateRegistrySchedule(row.schedule);
        if (row.nextDue !== null && !Number.isFinite(row.nextDue) || row.retryOccurrence !== undefined && !Number.isFinite(row.retryOccurrence)) throw Error(ERROR);
        // A backup paused for the drive keeps its pause across a restart, so it still resumes.
        row.state = row.interrupted ? 'incomplete' : Number.isFinite(row.resumeAt) ? 'paused' : 'idle'; row.lastError = row.interrupted ? ERROR : row.lastError;
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
  async function exclusive(id, action, requireSource = true, kind = 'other') {
    await load(); const current = context(id, requireSource), row = rows[current.key]; if (!row) throw Error('Save a registry destination first.');
    if (active || configuring) throw Error('Wait for the current registry operation.');
    const controller = new AbortController(); active = { id, kind, controller, key: current.key, leases: new Set(), late: new Set(), settled: false, failure: null, yielded: false };
    const operation = active;
    const timer = setTimeout(() => controller.abort(), 3600000); timer.unref();
    const cancelNative = () => { void nativeRequest('cancelSnapshot', {}, id).catch(() => {}); };
    controller.signal.addEventListener('abort', cancelNative, { once: true });
    row.lastError = null; row.interrupted = true; row.progress = null; row.operationStartedAt = now(); delete row.resumeAt;
    try { await save(); return await action(current, row, controller.signal); }
    catch (error) {
      // Using the drive pauses a backup at a safe point instead of being refused; it resumes on its own.
      if (operation.yielded) { row.state = 'paused'; row.resumeAt = now() + resumeDelayMs; throw Error(PAUSED); }
      const failedStep = PHASES[row.state];
      // A stall or a timeout aborts the work like Cancel does, but it is reported as a failure with its plain reason.
      const cancelled = controller.signal.aborted && !operation.failure;
      const message = operation.failure || error?.message;
      row.state = cancelled ? 'cancelled' : 'incomplete';
      // Plain reasons written by this service are shown; anything else keeps the generic message.
      const reason = !cancelled && (SAFE_REASONS.has(message) || error?.nativeReason === true) ? ' ' + message : '';
      // The step name says where it stopped without exposing paths, account details or registry responses.
      const where = !cancelled && failedStep ? ` (stopped while ${failedStep})` : '';
      row.lastError = ERROR + reason + where; throw Error(ERROR + reason + where);
    }
    finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', cancelNative);
      // A lease that the drive grants after Cancel is released as soon as it arrives. Wait a little for it.
      await settleLate(operation, lateLeaseWaitMs);
      row.interrupted = operation.leases.size > 0 || operation.late.size > 0; row.progress = null;
      operation.settled = true;
      // The reason the work stopped stays visible beside the release warning.
      if (row.interrupted) { row.state = 'native-release-unverified'; row.lastError = (row.lastError ? row.lastError + ' ' : '') + 'Native snapshot release is unverified. Retry Cancel before closing or starting another operation.'; }
      else active = null;
      await save();
    }
  }
  async function settleLate(operation, ms) {
    if (!operation.late.size) return;
    await Promise.race([Promise.allSettled([...operation.late]), sleep(ms)]);
  }
  /** Describes the visible step. Counts stay null when the step has nothing to count. */
  function step(row, name, counts = {}) {
    row.state = name;
    row.progress = { step: name, phase: counts.phase || name, startedAt: row.operationStartedAt ?? now(), stepStartedAt: now(), unit: 'files',
      completedFiles: 0, totalFiles: null, completedBytes: 0, totalBytes: null, ...counts };
  }
  // Native staging reports parts and bytes; a host without that request simply leaves the counts empty.
  async function watchStaging(operation, id, row) {
    let lastKey = '', changedAt = now(), stopped = false;
    const poll = (async () => {
      while (!stopped && !operation.controller.signal.aborted) {
        await sleep(progressPollMs); if (stopped) break;
        let value = null; try { value = await withTimeout(nativeRequest('snapshotProgress', {}, id), 10000, 'progress'); } catch { /* Older host or a busy reply. */ }
        if (stopped) break;
        if (value && row.progress && Number.isSafeInteger(value.partsTotal) && value.partsTotal > 0) {
          row.progress.unit = 'parts'; row.progress.completedFiles = value.partsDone; row.progress.totalFiles = value.partsTotal;
          row.progress.completedBytes = value.bytesDone; row.progress.totalBytes = value.bytesTotal;
        }
        const key = value ? `${value.partsDone}:${value.bytesDone}:${value.partsTotal}` : 'none';
        if (key !== lastKey) { lastKey = key; changedAt = now(); }
        // Only a host that reports counts can be judged stalled; staging that is merely slow keeps moving them.
        else if (value?.preparing && now() - changedAt >= nativeStallMs) { operation.failure = STALLED; operation.controller.abort(); break; }
      }
    })();
    poll.catch(() => {});
    // The loop checks the flag after every wait, so it never writes progress for a later step.
    return () => { stopped = true; };
  }
  async function acquire(id, source, purpose = 'admission', extra = {}) {
    const operation = active, signal = operation.controller.signal, row = rows[operation.key];
    signal.throwIfAborted();
    step(row, purpose === 'snapshot' ? 'preparing' : 'waiting-drive', { phase: purpose === 'snapshot' ? 'staging' : 'waiting-drive' });
    let lease;
    const stopWatching = await watchStaging(operation, id, row);
    try {
      // Native refusals here are plain sentences meant for people, so they may be shown; anything path-like stays hidden.
      // Any in-flight native request (even a status refresh from an open page) makes the host refuse the lease
      // for a moment, so a busy refusal is retried briefly instead of failing the whole backup.
      const deadline = Date.now() + leaseRetryMs;
      for (;;) {
        const request = nativeRequest('beginSnapshot', { storageDir: source, ...(purpose === 'admission' ? { admissionOnly: true } : {}), ...extra }, id);
        try { lease = await abortable(request, signal); break; }
        catch (error) {
          if (signal.aborted) {
            // The drive may still grant this lease after Cancel; it is released the moment it arrives.
            const late = request.then(value => adoptLate(operation, id, value), () => {}).finally(() => { operation.late.delete(late); finishLate(operation); });
            operation.late.add(late);
            throw error;
          }
          const busy = /wait for synchronization to stop|still releasing native work/i.test(String(error?.message || ''));
          if (!busy || Date.now() >= deadline) { lease = error; break; }
          await abortable(sleep(250), signal);
        }
      }
    } finally { await stopWatching(); }
    if (lease instanceof Error) try { throw lease; }
    catch (error) { const shown = Error(String(error?.message || '')); const m = shown.message; if (m && m.length <= 200 && !m.includes('/') && !m.includes('\\') && !/[A-Za-z]:/.test(m)) shown.nativeReason = true; throw shown; }
    if (typeof lease?.leaseId !== 'string' || !lease.leaseId || typeof lease.storageDir !== 'string') throw Error('Invalid native snapshot lease.');
    operation.leases.add(lease.leaseId);
    // Cancel during the hand-over still releases the lease before the operation settles.
    if (signal.aborted) { await release(id, lease, operation); signal.throwIfAborted(); }
    return lease;
  }
  async function adoptLate(operation, id, lease) {
    if (typeof lease?.leaseId !== 'string' || !lease.leaseId) return;
    operation.leases.add(lease.leaseId);
    await release(id, lease, operation).catch(() => {});
  }
  function finishLate(operation) {
    // A late lease that has been released lets a settled operation end without another Cancel.
    if (!operation.settled || operation.leases.size || operation.late.size || active !== operation) return;
    const row = rows[operation.key]; row.state = 'cancelled'; row.interrupted = false; row.lastError = null; active = null; void save().catch(() => {});
  }
  async function release(id, lease, operation = active) {
    const result = await withTimeout(nativeRequest('releaseSnapshot', { leaseId: lease.leaseId }, id), releaseTimeoutMs, RELEASE_TIMEOUT);
    if (result?.released !== true) throw Error('Native snapshot release was not confirmed.');
    operation.leases.delete(lease.leaseId);
  }
  /** True when this drive already holds the registry object: same path and size, and the same bytes unless the name is its own hash. */
  async function presentLocally(source, file) {
    const filename = path.join(source, file.path);
    let stat; try { stat = await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) return false;
    // A part named by its own content hash is identical whenever the name and size match.
    if (/^parts\/[a-f0-9]{64}\.mfe$/.test(file.path)) return file.digest === `sha256:${file.path.slice(6, 70)}`;
    await physical(filename);
    return `sha256:${hash(await fs.readFile(filename))}` === file.digest;
  }
  /** Downloads one revision (or only the listed objects of it) into this service's staging and checks every object. */
  async function stageRevision(client, digest, signal, row, only = null) {
    const staging = await fs.mkdtemp(path.join(root, 'incoming-'));
    try {
      const revision = await client.download(digest, async (name, bytes) => {
        signal.throwIfAborted(); await createFile(staging, name, bytes);
        if (row?.progress) { row.progress.completedFiles++; row.progress.completedBytes += bytes.length; }
      }, signal, only ? { only } : undefined);
      const files = only ? revision.snapshot.files.filter(file => only.has(file.path)) : revision.snapshot.files;
      if (!only) {
        // Structural and content-address verification precedes activation. Normal unlock authenticates the vault key.
        const verified = await createVaultImageSnapshot({ source: staging, workRoot: path.join(root, 'validation'), signal });
        try { if (verified.manifest.vaultId !== revision.snapshot.vaultId) throw Error(ERROR); }
        finally { await fs.rm(verified.directory, { recursive: true }); }
      } else {
        // A partial download is checked object by object: structure, content address and, for vault.json, the vault identity.
        for (const file of files) {
          signal.throwIfAborted();
          if (file.path === 'vault.json') {
            if (inspectVaultConfiguration(await fs.readFile(path.join(staging, 'vault.json'))).vaultId !== revision.snapshot.vaultId) throw Error(ERROR);
            continue;
          }
          const described = await describeStorageObject(staging, file.path), handle = await openStorageObject(staging, described);
          try { await inspectStorageObject(handle, file.path, described.bytes, signal); } finally { await handle.close(); }
          checkContentAddress(file.path, file.digest.slice(7));
        }
      }
      return { staging, revision, files };
    } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
  }
  async function mergeObjects(staging, source, files, signal, row = null) {
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
      if (row?.progress) { row.progress.completedFiles++; row.progress.completedBytes += incoming.length; }
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
      const current = context(id, false);
      // A request that omits visibility keeps an existing destination's choice and otherwise defaults to public.
      const destination = registryDestination({ repository: configuration.repository, visibility: configuration.visibility ?? rows[current.key]?.visibility });
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
        const client = storage(row); step(row, 'discovering', { totalFiles: null }); let downloaded = 0;
        const ownVaultId = JSON.parse(await fs.readFile(path.join(current.storageDir, 'vault.json'), 'utf8')).VaultId;
        // Other drives may share this repository; only this drive's snapshots take part in its synchronization.
        const revisions = await client.list(signal, { vaultId: ownVaultId, includeFiles: true });
        // Every object any of this drive's snapshots holds is already on the registry and never uploaded again.
        const known = new Map();
        for (const item of revisions) for (const file of item.files || []) known.set(file.path, { size: file.size, digest: file.digest });
        // Revisions already merged here, and objects this drive already has, cost nothing to download again.
        const merged = new Set(Array.isArray(row.merged) ? row.merged : []);
        const wanted = [];
        for (const item of revisions) {
          if (item.snapshot.vaultId !== ownVaultId) throw Error('The destination contains a different vault.');
          if (merged.has(item.digest)) continue;
          if (!Array.isArray(item.files)) { wanted.push({ item, missing: null }); continue; }
          const missing = [];
          for (const file of item.files) { signal.throwIfAborted(); if (!await presentLocally(current.storageDir, file)) missing.push(file); }
          if (missing.length) wanted.push({ item, missing }); else merged.add(item.digest);
        }
        row.merged = [...merged].slice(-500);
        if (wanted.length) {
          step(row, 'downloading', { totalFiles: wanted.reduce((n, entry) => n + (entry.missing ? entry.missing.length : entry.item.snapshot.fileCount), 0),
            totalBytes: wanted.every(entry => entry.missing) ? wanted.reduce((n, entry) => n + entry.missing.reduce((m, file) => m + file.size, 0), 0) : null });
          // Downloads land in this service's own staging first; the drive is only held while verified objects are written.
          const staged = [];
          try {
            for (const entry of wanted) staged.push(await stageRevision(client, entry.item.digest, signal, row, entry.missing ? new Set(entry.missing.map(file => file.path)) : null));
            const admission = await acquire(id, current.storageDir, 'admission');
            try {
              signal.throwIfAborted();
              step(row, 'downloading', { phase: 'merging', totalFiles: staged.reduce((n, entry) => n + entry.files.length, 0) });
              for (const entry of staged) { await mergeObjects(entry.staging, current.storageDir, entry.files, signal, row); downloaded++; merged.add(entry.revision.digest); }
            } finally { await release(id, admission); }
          } finally { for (const entry of staged) await fs.rm(entry.staging, { recursive: true, force: true }); }
          row.merged = [...merged].slice(-500);
          // The existing native replay owns concurrent file conflict preservation and live handles.
          signal.throwIfAborted();
          step(row, 'applying', { unit: 'commits', completedFiles: null });
          let native = await abortable(nativeRequest('sync', {}, id), signal);
          const nativeDeadline = now() + 30 * 60000;
          while (native?.sync?.running) {
            signal.throwIfAborted(); if (now() >= nativeDeadline) throw Error('Native synchronization did not settle.');
            // Pending work counts stand in for a bar: they show the replay is moving even without a total.
            if (Number.isSafeInteger(native.sync.pendingCommits)) row.progress.pendingCommits = native.sync.pendingCommits;
            await abortable(sleep(200), signal);
            native = await abortable(nativeRequest('statusSummary', {}, id), signal);
          }
          if (native?.locked !== true && native?.sync?.error) throw Error('Native synchronization needs attention.');
          row.replayDeferred = native?.locked === true;
        } else row.replayDeferred = false;
        const replayDeferred = row.replayDeferred === true;
        let lease, plan;
        try {
          try {
            // The drive copies only parts that exist solely in its local cache; parts already in its storage folder
            // are listed instead, so temporary disk use stays at the data that is not yet in storage.
            lease = await acquire(id, current.storageDir, 'snapshot', { leaveSourceParts: true });
            signal.throwIfAborted();
            step(row, 'preparing', { phase: 'checking', unit: 'files' });
            plan = await planRegistrySnapshot({ stagedRoot: lease.storageDir, stagedIsTemporary: lease.storageOnly !== true,
              sourceRoot: typeof lease.sourceRoot === 'string' ? lease.sourceRoot : null, sourceParts: Array.isArray(lease.sourceParts) ? lease.sourceParts : [],
              known, workRoot: path.join(root, 'snapshots'), signal,
              onProgress: ({ phase, completedFiles, totalFiles, completedBytes, totalBytes }) => {
                if (row.state !== 'preparing') return;
                Object.assign(row.progress, { phase, completedFiles, totalFiles, completedBytes, totalBytes });
              } });
          } finally { if (lease) await release(id, lease); }
          if (plan.manifest.vaultId !== ownVaultId) throw Error('The destination contains a different vault.');
          const fingerprint = hash(Buffer.from(JSON.stringify(plan.manifest.files)));
          if (row.lastResult?.fingerprint === fingerprint && revisions.some(item => item.digest === row.lastResult.digest)) {
            row.state = 'verified'; return row.lastResult = { ...row.lastResult, downloaded, replayDeferred, published: false, verifiedAt: new Date(now()).toISOString() };
          }
          step(row, 'uploading', { phase: 'preparing-upload', totalFiles: plan.upload.length, totalBytes: plan.uploadBytes });
          const result = await client.publish({ vaultId: plan.manifest.vaultId, deviceId: row.deviceId, driveName: current.driveName,
            parents: [...new Set(revisions.map(item => item.digest))], files: plan.manifest.files,
            known: new Set(plan.manifest.files.filter(file => plan.reused.has(file.path)).map(file => `sha256:${file.sha256}`)),
            onVerifying: () => step(row, 'verifying', { totalFiles: null }),
            // Each new object counts once it is read; a large one the registry already had is then not sent again.
            readFile: async name => { const bytes = await plan.read(name, signal); row.progress.completedFiles++; row.progress.completedBytes += bytes.length; return bytes; } }, signal);
          row.state = 'verified'; return row.lastResult = { ...result, fingerprint, downloaded, replayDeferred, published: true, uploadedFiles: plan.upload.length, uploadedBytes: plan.uploadBytes, verifiedAt: new Date(now()).toISOString() };
        } finally { if (plan) await plan.dispose(); }
      }, true, 'sync');
    },
    /** Called before the drive itself is locked, unlocked, mounted or changed. A running backup pauses rather than holding the drive. */
    async yieldForDrive() {
      const operation = active;
      if (!operation || operation.kind !== 'sync') return { yielded: false };
      operation.yielded = true; operation.controller.abort();
      const end = Date.now() + yieldWaitMs;
      while (active === operation && Date.now() < end) await sleep(50);
      if (active === operation) throw Error('The backup is still releasing the drive. Retry in a moment.');
      return { yielded: true };
    },
    list(id) { return exclusive(id, async (_current, row, signal) => { row.state = 'discovering'; const value = await storage(row).list(signal); row.state = 'idle'; return value; }, false); },
    restore(id, digest) {
      return exclusive(id, async (_current, row, signal) => {
        if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw Error('Invalid snapshot digest.');
        const selected = await chooseRestore(); if (!selected) { row.state = 'idle'; return { cancelled: true }; }
        signal.throwIfAborted(); await physical(selected); row.state = 'restoring';
        step(row, 'restoring', { phase: 'downloading-restore' });
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
            for (const leaseId of [...operation.leases]) await release(id, { leaseId }, operation);
            // A lease still on its way from the drive is waited for briefly; if it never arrives, ownership stays explicit.
            await settleLate(operation, lateLeaseWaitMs);
            if (operation.leases.size || operation.late.size) return;
            rows[operation.key].state = 'cancelled'; rows[operation.key].interrupted = false; rows[operation.key].lastError = null;
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
          const current = context(id), row = rows[current.key];
          if (row?.state === 'paused' && Number.isFinite(row.resumeAt) && row.resumeAt <= now()) {
            // A paused backup resumes once, whatever its schedule; a new pause sets a new resume time.
            delete row.resumeAt; await save();
            try { await service.sync(id); } catch { /* The row records the outcome. */ }
            await save(); break;
          }
          if (!row?.schedule.enabled || !row.nextDue || row.nextDue > now()) continue;
          const due = row.retryOccurrence ?? row.nextDue;
          if (row.retryOccurrence === undefined && row.schedule.missed === 'skip' && now() - due > 5 * 60000) { row.nextDue = nextRegistryRun(row.schedule, now()); await save(); continue; }
          try { await service.sync(id); row.nextDue = nextRegistryRun(row.schedule, now(), registryOccurrence(row.schedule, due)); delete row.retryOccurrence; }
          catch { if (row.state !== 'paused') { row.retryOccurrence = due; row.nextDue = now() + row.schedule.retryMinutes * 60000; } }
          await save(); break;
        }
      } finally { ticking = false; }
    },
    get activeSessionId() { return active?.id ?? null; },
    get pending() { return Boolean(active) || configuring || ticking; },
    close() { if (active || configuring || ticking) throw Error('Registry synchronization or native snapshot release is still pending.'); },
  };
  // A finished synchronization may have published a snapshot, so listeners (the repository catalogue) learn about it.
  const rawSync = service.sync;
  service.sync = id => rawSync(id).finally(() => { try { onChanged(); } catch { /* A listener must never break synchronization. */ } });
  return service;
}
