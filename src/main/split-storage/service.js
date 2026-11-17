import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectVaultConfiguration } from '../vault-image-snapshot.js';
import { createRegistryStorage } from '../registry-storage.js';
import { MAIN, PART, SPLIT_FOLDER, SplitStorageError, emptyPlacement, normalizeSplitConfig, readPlacement, writePlacement, writeJsonAtomic, within } from './config.js';
import { planPlacement, diffPlan, unavailableParts, holdersOf } from './planner.js';
import { runRebalance } from './mover.js';
import { mainParts, shareParts, sameVolume } from './folder-location.js';
import { createRegistryParts } from './registry-location.js';
import { allParts, folderMirrorState, updateFolderMirror, updateRegistryMirror, verifyFolderMirror } from './mirror.js';

const MIRROR_IDLE_MS = 2 * 60 * 1000;
const FETCH_NAME = /^([0-9a-f]{32}|[0-9a-f]{64})\.mfe\.[0-9a-f]{32}\.fetch\.tmp$/;
const LOCKED_ONLY = 'Lock the drive before moving encrypted parts. Moves run only while the drive is locked, so nothing else can touch the storage folder.';

/**
 * Main-process split storage service. No folder path reaches it from the renderer except through the
 * native folder picker (chooseFolder) and validated settings. The engine reads placement.json; this service
 * is its only writer.
 *
 * contexts(sessionId) returns { storageDir, cacheDir, transport, locked, mountedDrive, busy } for a session,
 * or every session's context when called without an id.
 */
export function createSplitStorageService({ contexts, nativeRequest, pickFolder, authorize, storageFactory = createRegistryStorage, registryDestination = null, now = Date.now, idleDelayMs = MIRROR_IDLE_MS }) {
  const jobs = new Map(), finished = new Map(), timers = new Map(), chosen = new Set();
  const mirroring = new Set();

  async function context(id) {
    const value = contexts(id);
    if (!value?.storageDir) throw new SplitStorageError('Choose an encrypted storage folder first.');
    let vaultId = null;
    try { vaultId = inspectVaultConfiguration(await fs.readFile(path.join(value.storageDir, 'vault.json'))).vaultId; } catch { vaultId = null; }
    return { ...value, storageDir: path.resolve(value.storageDir), cacheDir: value.cacheDir ? path.resolve(value.cacheDir) : null, vaultId, supported: value.transport !== 'privateGit' && Boolean(vaultId) };
  }
  async function placementOf(current) { return (await readPlacement(current.storageDir)) ?? emptyPlacement(current.vaultId); }

  function adapterFor(current, placement, location) {
    if (location.id === MAIN) return mainParts(current.storageDir, location.label);
    if (location.kind === 'folder') return shareParts(location, current.vaultId);
    placement.registryObjects[location.id] ??= {};
    return createRegistryParts({ location, vaultId: current.vaultId, storageDir: current.storageDir, objects: placement.registryObjects[location.id], authorize, storageFactory, destination: registryDestination });
  }
  async function adapters(current, placement) {
    const map = new Map(), connected = new Set();
    for (const location of placement.locations.filter(item => item.role !== 'mirror')) {
      const adapter = adapterFor(current, placement, location); map.set(location.id, adapter);
      if (await adapter.connected()) connected.add(location.id);
    }
    return { map, connected };
  }
  /** Reads a part from any connected holder, then any connected folder mirror. */
  async function readAnywhere(current, placement, part, signal) {
    const { map, connected } = await adapters(current, placement);
    for (const id of holdersOf(placement, part)) if (connected.has(id)) try { if (await map.get(id).has(part)) return await map.get(id).read(part, signal); } catch { /* try the next copy */ }
    throw new SplitStorageError(`No connected location holds a copy of an encrypted part. Connect ${holdersOf(placement, part).map(id => map.get(id)?.label || id).join(' or ')}.`);
  }

  /** Parts with sizes and path-rule pins. Unlocked drives ask the engine; locked drives use the saved pins. */
  async function inventory(id, current, placement, rules) {
    const sizes = { ...placement.sizes };
    if (current.locked === false) {
      const result = await nativeRequest('splitStorageInventory', { rules }, id);
      if (!Array.isArray(result?.parts)) throw new SplitStorageError('The drive did not report its encrypted parts.');
      const pins = {};
      const parts = result.parts.map(([part, size, pin]) => { if (!PART.test(part) || !Number.isSafeInteger(size)) throw new SplitStorageError('The drive reported an invalid part.'); if (pin) pins[part] = pin; if (size > 0) sizes[part] = size; return { id: part, size: size || sizes[part] || 0 }; });
      return { parts, pins, sizes, pinsCurrent: true };
    }
    const parts = [];
    for (const part of await allParts(current.storageDir, placement)) {
      let size = sizes[part];
      if (size === undefined) { try { size = (await fs.stat(path.join(current.storageDir, 'parts', `${part}.mfe`))).size; sizes[part] = size; } catch { size = 0; } }
      parts.push({ id: part, size });
    }
    const pinsCurrent = JSON.stringify(rules) === JSON.stringify(placement.rules ?? []);
    return { parts, pins: pinsCurrent ? placement.pins : {}, sizes, pinsCurrent };
  }

  async function computePlan(id, current, placement, settings) {
    const { parts, pins, sizes, pinsCurrent } = await inventory(id, current, placement, settings.rules);
    const plan = planPlacement({ parts, locations: settings.locations, copies: settings.copies, enabled: settings.enabled, pins });
    const diff = diffPlan(placement, plan.targets, sizes);
    const { connected } = await adapters(current, placement);
    const disconnected = placement.locations.filter(location => location.role !== 'mirror' && !connected.has(location.id)).map(location => location.id);
    const away = unavailableParts(placement, disconnected);
    let unavailableFiles = [], unavailableCount = 0;
    if (away.length && current.locked === false) {
      try { const result = await nativeRequest('splitStorageAffected', { disconnected, limit: 50 }, id); unavailableFiles = result?.paths ?? []; unavailableCount = result?.count ?? 0; } catch { /* the plan still reports the part count */ }
    }
    return { plan, diff, sizes, pins, pinsCurrent, parts, unavailable: { unavailableFiles, unavailableCount, unavailableParts: away.length } };
  }

  function settingsOf(placement) {
    return { enabled: Boolean(placement.enabled), copies: placement.copies ?? 1, safetyBackup: placement.safetyBackup !== false, locations: placement.locations, rules: placement.rules ?? [] };
  }

  async function locationStatus(current, placement, location, connectedSet, map, sizes) {
    const row = { id: location.id, kind: location.kind, role: location.role ?? 'share', label: location.label, weight: location.weight ?? 0,
      capacityBytes: location.capacityBytes ?? 0, enabled: location.enabled !== false, removable: Boolean(location.removableHint),
      connected: false, freeBytes: null, storedBytes: 0, storedParts: 0, lastError: placement.locationErrors?.[location.id] ?? null };
    if (location.kind === 'folder') row.path = location.path;
    if (location.kind === 'registry') { row.repository = location.repository; row.visibility = location.visibility ?? 'public'; }
    if (location.kind === 'folder') row.sameDisk = await sameVolume(location.path, current.storageDir).catch(() => false);
    if (location.role === 'mirror') {
      const state = placement.mirrors?.[location.id] ?? {};
      row.lastUpdated = state.lastUpdated ?? null;
      if (location.kind === 'folder') {
        const behind = await folderMirrorState({ storageDir: current.storageDir, vaultId: current.vaultId, location, placement, sizes });
        Object.assign(row, { connected: behind.connected, upToDate: behind.upToDate, behindParts: behind.behindParts, behindBytes: behind.behindBytes });
        if (behind.connected) row.freeBytes = await shareParts(location, current.vaultId).freeBytes();
      } else Object.assign(row, { connected: true, upToDate: Boolean(state.digest) && state.fingerprint === await mirrorFingerprint(current, placement), behindParts: null, behindBytes: null });
      return row;
    }
    row.connected = connectedSet.has(location.id);
    if (row.connected) row.freeBytes = await map.get(location.id)?.freeBytes?.() ?? null;
    return row;
  }
  async function mirrorFingerprint(current, placement) {
    const names = ['vault.json'];
    for (const folder of ['commits', 'activity']) try { for (const name of (await fs.readdir(path.join(current.storageDir, folder))).sort()) names.push(`${folder}/${name}`); } catch { /* empty folder */ }
    for (const part of await allParts(current.storageDir, placement)) names.push(`parts/${part}.mfe`);
    return createHash('sha256').update(names.join('\n')).digest('hex');
  }

  async function buildStatus(id, current, placement, computed) {
    const settings = settingsOf(placement);
    const { map, connected } = await adapters(current, placement);
    const locations = [];
    for (const location of placement.locations) locations.push(await locationStatus(current, placement, location, connected, map, computed.sizes));
    const counted = new Map(locations.map(row => [row.id, row]));
    for (const part of computed.parts.map(item => item.id)) for (const holder of holdersOf(placement, part)) {
      const row = counted.get(holder); if (!row) continue; row.storedParts++; row.storedBytes += computed.sizes[part] ?? 0;
    }
    const running = jobs.get(current.storageDir.toLowerCase());
    const job = running?.job ?? finished.get(current.storageDir.toLowerCase()) ?? placement.job ?? null;
    return { supported: current.supported, locked: current.locked !== false, enabled: settings.enabled, copies: settings.copies, safetyBackup: settings.safetyBackup,
      locations, rules: settings.rules,
      totals: { parts: computed.parts.length, bytes: computed.parts.reduce((sum, part) => sum + (computed.sizes[part.id] ?? part.size ?? 0), 0) },
      plan: { pending: computed.diff.pending, movesPending: computed.diff.movesPending, bytesToMove: computed.diff.bytesToMove, overflowParts: computed.plan.overflowParts,
        rulesNeedUnlock: !computed.pinsCurrent, ...computed.unavailable },
      job: job ? { ...job, errors: undefined, running: Boolean(running) } : null,
      safetyHeld: Boolean(job?.safetyHeld), safetyHeldReason: job?.safetyHeldReason ?? null };
  }

  async function status(id) {
    const current = await context(id);
    if (!current.supported) return { supported: false, enabled: false, copies: 1, safetyBackup: true, locations: [], rules: [], totals: { parts: 0, bytes: 0 }, plan: { pending: false, movesPending: 0, bytesToMove: 0, unavailableFiles: [], unavailableCount: 0 }, job: null, safetyHeld: false, safetyHeldReason: null,
      reason: current.transport === 'privateGit' ? 'Split storage works with folder storage, not private repository storage.' : 'Create or open a drive first.' };
    const placement = await placementOf(current);
    return buildStatus(id, current, placement, await computePlan(id, current, placement, settingsOf(placement)));
  }

  function validate(current, input) {
    return normalizeSplitConfig(input, { storageDir: current.storageDir, cacheDir: current.cacheDir, mountedDrive: current.mountedDrive });
  }
  function requireIdle(current) {
    const key = current.storageDir.toLowerCase();
    if (jobs.has(key)) throw new SplitStorageError('Wait for the current split storage job to finish.');
    if (mirroring.has(key)) throw new SplitStorageError('Wait for the mirrors to finish updating.');
  }
  function knownFolders(placement) { return new Set(placement.locations.filter(item => item.kind === 'folder').map(item => item.path.toLowerCase())); }
  function checkFolders(placement, settings) {
    // A folder path is accepted only when it came from the folder picker or is already configured.
    const known = knownFolders(placement);
    for (const location of settings.locations) if (location.kind === 'folder' && !chosen.has(location.path.toLowerCase()) && !known.has(location.path.toLowerCase())) throw new SplitStorageError('Choose each folder with the folder picker.');
  }
  function merged(placement, settings) {
    return { ...placement, enabled: settings.enabled, copies: settings.copies, safetyBackup: settings.safetyBackup, locations: settings.locations, rules: settings.rules };
  }

  async function preview(id, input) {
    const current = await context(id); if (!current.supported) throw new SplitStorageError('Split storage is not available for this drive.');
    const placement = await placementOf(current), settings = validate(current, input); checkFolders(placement, settings);
    const next = merged(placement, settings);
    return (await buildStatus(id, current, next, await computePlan(id, current, next, settings))).plan;
  }

  async function save(id, input) {
    const current = await context(id); if (!current.supported) throw new SplitStorageError('Split storage is not available for this drive.');
    requireIdle(current);
    const placement = await placementOf(current), settings = validate(current, input); checkFolders(placement, settings);
    const removed = placement.locations.filter(old => !settings.locations.some(item => item.id === old.id));
    for (const old of removed) if (Object.values(placement.parts).some(holders => holders.includes(old.id) && holders.length === 1))
      throw new SplitStorageError(`${old.label} still holds the only copy of some files. Apply a plan without it first, then remove it.`);
    const next = merged(placement, settings);
    const computed = await computePlan(id, current, next, settings);
    if (computed.pinsCurrent) next.pins = computed.pins;
    next.sizes = computed.sizes;
    // Removed locations drop out of the manifest only when another copy is recorded.
    for (const [part, holders] of Object.entries(next.parts)) { const kept = holders.filter(holder => next.locations.some(item => item.id === holder)); if (kept.length === 1 && kept[0] === MAIN) delete next.parts[part]; else next.parts[part] = kept; }
    await writePlacement(current.storageDir, next);
    return buildStatus(id, current, next, computed);
  }

  async function chooseFolder(id) {
    const current = await context(id);
    const picked = await pickFolder(); if (!picked) return null;
    const folder = path.resolve(picked);
    if (within(folder, current.storageDir) || within(current.storageDir, folder)) throw new SplitStorageError('Choose a folder outside the main storage folder.');
    if (current.cacheDir && (within(folder, current.cacheDir) || within(current.cacheDir, folder))) throw new SplitStorageError('Choose a folder outside the cache folder.');
    if (current.mountedDrive && folder.slice(0, 2).toUpperCase() === current.mountedDrive.slice(0, 2).toUpperCase()) throw new SplitStorageError('Choose a folder that is not on the encrypted drive itself.');
    chosen.add(folder.toLowerCase());
    const drive = folder.slice(0, 2).toUpperCase(), mainDrive = current.storageDir.slice(0, 2).toUpperCase();
    let freeBytes = null;
    try { const stat = await fs.statfs(folder); freeBytes = Number(stat.bavail) * Number(stat.bsize); } catch { freeBytes = null; }
    const sameDisk = await sameVolume(folder, current.storageDir).catch(() => false);
    // Without a native drive-type query, any drive other than the system and main drives is treated as removable.
    const removable = /^[A-Z]:$/.test(drive) && drive !== mainDrive && drive !== (process.env.SystemDrive || 'C:').toUpperCase();
    return { path: folder, label: `${path.basename(folder) || 'Folder'} (${drive})`, removable, freeBytes, sameDisk };
  }

  /** Holds the locked storage folder through the native snapshot lease for the whole job. */
  async function withLease(id, current, task) {
    if (current.locked === false) throw new SplitStorageError(LOCKED_ONLY);
    const lease = await nativeRequest('beginSnapshot', { storageDir: current.storageDir }, id);
    if (typeof lease?.leaseId !== 'string') throw new SplitStorageError('The storage folder could not be reserved.');
    try {
      if (lease.storageOnly !== true) throw new SplitStorageError(LOCKED_ONLY);
      return await task();
    } finally {
      const released = await nativeRequest('releaseSnapshot', { leaseId: lease.leaseId }, id).catch(() => null);
      if (released?.released !== true) throw new SplitStorageError('The storage folder reservation could not be released. Retry before unlocking.');
    }
  }

  async function start(id, enabledOverride) {
    const current = await context(id); if (!current.supported) throw new SplitStorageError('Split storage is not available for this drive.');
    requireIdle(current);
    if (current.locked === false) throw new SplitStorageError(LOCKED_ONLY);
    const key = current.storageDir.toLowerCase();
    const controller = new AbortController(), job = { phase: 'preparing', kind: enabledOverride === false ? 'bringBack' : 'apply', startedAt: now(), completedParts: 0, totalParts: 0, completedBytes: 0, totalBytes: 0, currentLocation: null, safetyHeld: false, safetyHeldReason: null };
    const entry = { controller, job, done: null }; jobs.set(key, entry);
    entry.done = (async () => {
      try {
        await withLease(id, current, async () => {
          const placement = await placementOf(current);
          if (enabledOverride === false) placement.enabled = false;
          const settings = settingsOf(placement);
          const computed = await computePlan(id, current, placement, settings);
          placement.sizes = computed.sizes;
          const { map, connected } = await adapters(current, placement);
          const persist = () => writePlacement(current.storageDir, placement);
          await runRebalance({ placement, targets: computed.plan.targets, adapters: map, connected, safetyBackup: enabledOverride === false ? false : settings.safetyBackup, signal: controller.signal, persist, job, sizes: computed.sizes });
          job.finishedAt = now(); placement.job = { ...job, errors: undefined };
          await persist();
          // Each folder location keeps a copy of the manifest so it describes itself.
          for (const location of placement.locations) if (location.kind === 'folder' && location.role !== 'mirror' && connected.has(location.id))
            await writeJsonAtomic(path.join(location.path, SPLIT_FOLDER, current.vaultId, 'placement.json'), placement).catch(() => {});
          if (job.phase === 'done') await mirrorAll(id, current, placement, controller.signal).catch(() => {});
        });
      } catch (error) {
        Object.assign(job, { phase: 'stopped', reason: error.message, message: error.message, finishedAt: now() });
      } finally { finished.set(key, { ...job, errors: undefined }); jobs.delete(key); }
    })();
    return status(id);
  }

  async function mirrorAll(id, current, placement, signal) {
    const key = current.storageDir.toLowerCase();
    if (mirroring.has(key)) return;
    mirroring.add(key);
    try {
      for (const location of placement.locations.filter(item => item.role === 'mirror' && item.enabled !== false)) {
        placement.mirrors[location.id] ??= {};
        const state = placement.mirrors[location.id];
        try {
          const readPart = part => readAnywhere(current, placement, part, signal);
          if (location.kind === 'folder') await updateFolderMirror({ storageDir: current.storageDir, vaultId: current.vaultId, location, placement, readPart, signal });
          else {
            const storage = storageFactory({ destination: registryDestination ? { ...registryDestination, repository: location.repository, visibility: location.visibility } : { repository: location.repository, visibility: location.visibility ?? 'public' }, authorize });
            Object.assign(state, await updateRegistryMirror({ storageDir: current.storageDir, vaultId: current.vaultId, location, placement, readPart, storage, state, deviceId: createHash('sha256').update(`mirror:${current.vaultId}:${location.id}`).digest('hex').slice(0, 32), signal }));
          }
          state.lastUpdated = now(); state.lastError = null;
        } catch (error) { state.lastError = error.message; }
      }
      // Merge only mirror state into the current manifest; never write back a stale copy of the part holders.
      const fresh = (await readPlacement(current.storageDir)) ?? placement;
      fresh.mirrors = { ...fresh.mirrors, ...placement.mirrors };
      await writePlacement(current.storageDir, fresh);
    } finally { mirroring.delete(key); }
  }

  async function updateMirrors(id) {
    const current = await context(id); if (!current.supported) throw new SplitStorageError('Mirrors are not available for this drive.');
    if (jobs.has(current.storageDir.toLowerCase())) throw new SplitStorageError('Mirrors update after the current split storage job.');
    if (current.locked === false && current.busy) throw new SplitStorageError('Mirrors update when the drive has finished saving changes.');
    await mirrorAll(id, current, await placementOf(current));
    return status(id);
  }
  async function verifyMirror(id, mirrorId) {
    const current = await context(id), placement = await placementOf(current);
    const location = placement.locations.find(item => item.id === mirrorId && item.role === 'mirror');
    if (!location) throw new SplitStorageError('Choose a mirror.');
    if (location.kind !== 'folder') {
      const state = placement.mirrors?.[location.id];
      if (!state?.digest) return { id: mirrorId, verified: false, reason: 'This mirror has not been uploaded yet.' };
      const storage = storageFactory({ destination: registryDestination ? { ...registryDestination, repository: location.repository, visibility: location.visibility } : { repository: location.repository, visibility: location.visibility ?? 'public' }, authorize });
      await storage.readRevision(state.digest); return { id: mirrorId, verified: true, digest: state.digest };
    }
    const result = await verifyFolderMirror({ storageDir: current.storageDir, vaultId: current.vaultId, location, placement });
    return { id: mirrorId, verified: result.missingParts === 0 && result.damagedParts === 0, ...result };
  }

  /** Re-reads every recorded copy and reports missing and damaged parts per location. Never deletes. */
  async function verify(id) {
    const current = await context(id), placement = await placementOf(current);
    const { map, connected } = await adapters(current, placement);
    const report = Object.fromEntries([...map.keys()].map(key => [key, { id: key, label: map.get(key).label, connected: connected.has(key), checkedParts: 0, missingParts: 0, damagedParts: 0 }]));
    for (const part of await allParts(current.storageDir, placement)) for (const holder of holdersOf(placement, part)) {
      const row = report[holder]; if (!row?.connected) continue;
      row.checkedParts++;
      try {
        if (!await map.get(holder).has(part)) { row.missingParts++; continue; }
        const digest = await map.get(holder).hash(part);
        if (placement.hashes?.[part] && placement.hashes[part] !== digest) row.damagedParts++;
      } catch { row.missingParts++; }
    }
    return { locations: Object.values(report), healthy: Object.values(report).every(row => row.missingParts === 0 && row.damagedParts === 0) };
  }

  function cancel(id) {
    const value = contexts(id); const entry = value?.storageDir && jobs.get(path.resolve(value.storageDir).toLowerCase());
    if (!entry) return { cancelled: false };
    entry.controller.abort(); return { cancelled: true };
  }

  /** Answers the engine's hydratePart event: fetches a registry-held part into the cache path it named. */
  async function hydrate({ storageDir, part, location, destination }, signal) {
    const all = contexts() ?? [];
    const match = all.find(item => item?.storageDir && path.resolve(item.storageDir).toLowerCase() === path.resolve(storageDir).toLowerCase());
    if (!match?.cacheDir) throw new SplitStorageError('The requesting drive is not open in this application.');
    const target = path.resolve(destination), partsFolder = path.join(path.resolve(match.cacheDir), 'parts');
    const name = FETCH_NAME.exec(path.basename(target));
    if (path.dirname(target).toLowerCase() !== partsFolder.toLowerCase() || !name || name[1] !== part) throw new SplitStorageError('The requested destination is not a cache part.');
    const current = { ...match, storageDir: path.resolve(match.storageDir) };
    current.vaultId = inspectVaultConfiguration(await fs.readFile(path.join(current.storageDir, 'vault.json'))).vaultId;
    const placement = await placementOf(current);
    const held = placement.locations.find(item => item.id === location && item.kind === 'registry');
    if (!held || !holdersOf(placement, part).includes(location)) throw new SplitStorageError('That location does not hold the requested part.');
    const bytes = await adapterFor(current, placement, held).read(part, signal);
    const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  }

  /** Drive activity schedules a mirror update once the drive has been idle for two minutes. */
  function noteActivity(id) {
    clearTimeout(timers.get(id));
    const timer = setTimeout(async () => {
      timers.delete(id);
      try {
        const current = await context(id); if (!current.supported) return;
        const placement = await readPlacement(current.storageDir); if (!placement?.locations.some(item => item.role === 'mirror')) return;
        if (current.busy) { noteActivity(id); return; }
        if (!jobs.has(current.storageDir.toLowerCase())) await mirrorAll(id, current, placement);
      } catch { /* the status shows the mirror as behind */ }
    }, idleDelayMs);
    timer.unref?.(); timers.set(id, timer);
  }

  return {
    status, preview, save, chooseFolder, verify, updateMirrors, verifyMirror, cancel, hydrate, noteActivity,
    apply: id => start(id, undefined), disable: id => start(id, false),
    get pending() { return jobs.size > 0 || mirroring.size > 0; },
    async settle() { await Promise.all([...jobs.values()].map(entry => entry.done)); },
    close() { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); for (const entry of jobs.values()) entry.controller.abort(); },
  };
}
