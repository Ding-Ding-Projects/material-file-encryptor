import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export const UPDATE_PROJECT = 'Ding-Ding-Projects/material-file-encryptor';
const API = `https://api.github.com/repos/${UPDATE_PROJECT}`;
const WEB = `https://github.com/${UPDATE_PROJECT}`;
const MAX_METADATA = 1024 * 1024;
const MAX_PACKAGE = 1500 * 1024 * 1024;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TAG = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const PACKAGE = /^MaterialFileEncryptor-([0-9]+\.[0-9]+\.[0-9]+)-(full|delta)\.nupkg$/i;
const READY_KEYS = ['schemaVersion', 'folder', 'name', 'tag', 'sourceCommit', 'version', 'sha256', 'sha1', 'bytes'];
function assert(value, code) { if (!value) throw new Error(code); }
function compare(a, b) {
  assert(VERSION.test(a) && VERSION.test(b), 'INVALID_PACKAGE_VERSION');
  const x = a.split('.').map(BigInt), y = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
async function hashFile(filename, expected, signal) {
  const sha256 = createHash('sha256'), sha1 = createHash('sha1');
  const info = await fs.lstat(filename);
  assert(info.isFile() && !info.isSymbolicLink() && info.size === expected.bytes, 'PACKAGE_SIZE_MISMATCH');
  let bytes = 0;
  for await (const chunk of createReadStream(filename, { signal })) {
    bytes += chunk.length;
    assert(bytes <= expected.bytes, 'PACKAGE_SIZE_MISMATCH');
    sha256.update(chunk); sha1.update(chunk);
  }
  assert(sha256.digest('hex') === expected.sha256 && sha1.digest('hex') === expected.sha1, 'PACKAGE_HASH_MISMATCH');
}

/** Main-process controller. It never starts native updating before explicit confirmation. */
export function createUpdateService({ app, autoUpdater, dialog, fetch: fetchImpl = globalThis.fetch,
  platform = process.platform, argv = process.argv, isActiveWork = () => true,
  acquireInstallLease, prepareRestart = async () => { throw new Error('RESTART_PREPARATION_REQUIRED'); },
  getLanguage = () => 'en', clock = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  intervalMs = 4 * 60 * 60 * 1000, autoSchedule = true,
  requestTimeoutMs = 30_000, nativeTimeoutMs = 10 * 60 * 1000,
} = {}) {
  const events = new EventEmitter();
  let state = { state: 'unavailable', reason: 'NOT_INITIALIZED', enabled: true,
    unsigned: true, rollbackSupported: false, nativeAcceptance: 'unverified' };
  let disposed = false, timer, pending, operation, releaseLease, candidate, staged;
  let nativeCleanup, cancelNativeObservation;
  const status = () => structuredClone(state);
  const publish = (patch) => { state = { ...state, ...patch }; events.emit('status', status()); return status(); };
  const failure = (error) => publish({ state: 'failed', reason: /^[A-Z_]+$/.test(error?.message) ? error.message : 'UPDATE_OPERATION_FAILED' });
  const cancelSchedule = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
  const stagingRoot = () => path.join(app.getPath('userData'), 'update-staging');
  async function saveReadyRecord(folder, update) {
    const record = { schemaVersion: 1, folder: path.basename(folder) };
    for (const key of READY_KEYS.slice(2)) record[key] = update[key];
    const temporary = path.join(stagingRoot(), `ready-${randomUUID()}.tmp`);
    try {
      const file = await fs.open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
      await fs.rename(temporary, path.join(stagingRoot(), 'ready.json'));
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
  async function restoreReadyRecord(update, signal) {
    // Cached fields only identify a file. Fresh remote metadata remains authoritative.
    try {
      const recordPath = path.join(stagingRoot(), 'ready.json');
      const info = await fs.lstat(recordPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) return false;
      const handle = await fs.open(recordPath, 'r');
      let buffer;
      try {
        buffer = Buffer.alloc(4097);
        const read = await handle.read(buffer, 0, buffer.length, 0);
        if (read.bytesRead > 4096) return false;
        buffer = buffer.subarray(0, read.bytesRead);
      } finally { await handle.close(); }
      const record = JSON.parse(buffer.toString('utf8'));
      if (!record || typeof record !== 'object' || Array.isArray(record) ||
          Object.keys(record).length !== READY_KEYS.length || !READY_KEYS.every(key => Object.hasOwn(record, key)) ||
          record.schemaVersion !== 1 || typeof record.folder !== 'string' || !/^package-[A-Za-z0-9_-]{1,80}$/.test(record.folder) ||
          typeof record.name !== 'string' || !PACKAGE.test(record.name) ||
          !READY_KEYS.slice(2).every(key => record[key] === update[key])) return false;
      const folder = path.join(stagingRoot(), record.folder);
      const directory = await fs.lstat(folder);
      if (!directory.isDirectory() || directory.isSymbolicLink()) return false;
      const filename = path.join(folder, record.name);
      await hashFile(filename, update, signal);
      if (signal.aborted || disposed) return false;
      staged = filename;
      return true;
    } catch { return false; }
  }
  const root = (() => {
    if (platform !== 'win32' || !app?.isPackaged || argv.some(a => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(a))) return null;
    const exe = app.getPath('exe');
    if (path.win32.basename(exe).toLowerCase() !== 'materialfileencryptor.exe' ||
        !/^app-\d+\.\d+\.\d+$/.test(path.win32.basename(path.win32.dirname(exe)))) return null;
    return path.win32.dirname(path.win32.dirname(exe));
  })();
  const schedule = (delay) => {
    cancelSchedule();
    if (disposed || !autoSchedule || !root) return;
    timer = setTimer(async () => {
      timer = undefined;
      await check();
      if (state.state === 'available') await download();
      schedule(Math.min(24 * 3600_000, Math.max(15 * 60_000, intervalMs)));
    }, delay);
    timer?.unref?.();
  };
  async function request(url, signal, asset = false) {
    let target = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const parsed = new URL(target);
      assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && !parsed.hash, 'INVALID_DOWNLOAD_URL');
      assert(target === url || (asset && ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)), 'INVALID_DOWNLOAD_REDIRECT');
      const response = await fetchImpl(target, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        assert(asset && redirects < 3 && response.headers.get('location'), 'INVALID_DOWNLOAD_REDIRECT');
        target = new URL(response.headers.get('location'), target).href; continue;
      }
      assert(response.ok, 'UPDATE_HTTP_FAILED');
      return response;
    }
    throw new Error('INVALID_DOWNLOAD_REDIRECT');
  }
  async function metadata(url, signal, json = true, asset = false) {
    const response = await request(url, signal, asset);
    let bytes = 0, chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length; assert(bytes <= MAX_METADATA, 'METADATA_TOO_LARGE'); chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
    if (!json) return text;
    try { return JSON.parse(text); } catch { throw new Error('INVALID_METADATA'); }
  }
  async function transaction(work) {
    if (disposed) return status();
    if (pending) return pending;
    operation = new AbortController();
    const current = operation;
    const timeout = setTimer(() => current.abort(), requestTimeoutMs); timeout?.unref?.();
    pending = (async () => {
      try { await work(current.signal); }
      catch (error) { if (!disposed) failure(current.signal.aborted ? new Error('UPDATE_CANCELLED_OR_TIMED_OUT') : error); }
      finally { clearTimer(timeout); pending = undefined; if (operation === current) operation = undefined; }
      return status();
    })();
    return pending;
  }
  async function check() {
    if (!root || disposed || ['ready', 'confirming', 'installing', 'restart-requested', 'downloading'].includes(state.state)) return status();
    return transaction(async signal => {
      publish({ state: 'checking', reason: null });
      const updater = await fs.lstat(path.win32.join(root, 'Update.exe')).catch(() => null);
      assert(updater?.isFile() && !updater.isSymbolicLink(), 'SQUIRREL_NOT_INSTALLED');
      const currentVersion = app.getVersion(); assert(VERSION.test(currentVersion), 'INVALID_CURRENT_VERSION');
      const release = await metadata(`${API}/releases/latest`, signal);
      assert(release.draft === false && release.prerelease === false && TAG.test(release.tag_name), 'INVALID_RELEASE');
      assert(release.html_url === `${WEB}/releases/tag/${release.tag_name}` && Array.isArray(release.assets) && release.assets.length <= 100, 'INVALID_RELEASE');
      const base = `${WEB}/releases/download/${release.tag_name}/`;
      const asset = name => {
        const matches = release.assets.filter(a => a.name === name);
        assert(matches.length === 1 && matches[0].browser_download_url === base + name && Number.isSafeInteger(matches[0].size) && matches[0].size > 0, 'INVALID_RELEASE_ASSET');
        return matches[0];
      };
      asset('build-provenance.json'); asset('RELEASES');
      const provenance = await metadata(base + 'build-provenance.json', signal, true, true);
      assert(provenance.schemaVersion === 1 && provenance.unsignedInstaller === true && provenance.tag === release.tag_name &&
        /^[a-f0-9]{40}$/.test(provenance.sourceCommit) && VERSION.test(provenance.packageVersion) && Array.isArray(provenance.assets) && provenance.assets.length <= 100, 'INVALID_PROVENANCE');
      const ref = await metadata(`${API}/git/ref/tags/${release.tag_name}`, signal);
      assert(ref.ref === `refs/tags/${release.tag_name}` && ref.object?.type === 'commit' && ref.object.sha === provenance.sourceCommit, 'SOURCE_COMMIT_MISMATCH');
      const releasesText = await metadata(base + 'RELEASES', signal, false, true);
      const releasesRecord = provenance.assets.filter(a => a.name === 'RELEASES');
      assert(releasesRecord.length === 1 && releasesRecord[0].bytes === Buffer.byteLength(releasesText) &&
        asset('RELEASES').size === releasesRecord[0].bytes &&
        releasesRecord[0].sha256 === createHash('sha256').update(releasesText).digest('hex'), 'RELEASES_HASH_MISMATCH');
      const entries = releasesText.trim().split(/\r?\n/).map(line => {
        const match = /^([a-fA-F0-9]{40})\s+([A-Za-z0-9_.-]+\.nupkg)\s+([1-9]\d*)$/.exec(line);
        assert(match && !match[2].includes('..'), 'INVALID_RELEASES');
        const packageMatch = PACKAGE.exec(match[2]);
        assert(packageMatch && packageMatch[1] === provenance.packageVersion, 'INVALID_RELEASES');
        return { name: match[2], sha1: match[1].toLowerCase(), bytes: Number(match[3]), kind: packageMatch[2].toLowerCase() };
      });
      assert(entries.length <= 20 && new Set(entries.map(e => e.name)).size === entries.length, 'INVALID_RELEASES');
      const full = entries.filter(e => e.kind === 'full'); assert(full.length === 1, 'INVALID_RELEASES');
      const selected = full[0];
      const record = provenance.assets.filter(a => a.name === selected.name);
      assert(record.length === 1 && /^[a-f0-9]{64}$/.test(record[0].sha256) && record[0].bytes === selected.bytes &&
        Number.isSafeInteger(selected.bytes) && selected.bytes <= MAX_PACKAGE && asset(selected.name).size === selected.bytes, 'INVALID_PACKAGE_METADATA');
      if (compare(provenance.packageVersion, currentVersion) <= 0) {
        candidate = undefined; publish({ state: 'current', reason: null, currentVersion, update: null, checkedAt: clock() }); return;
      }
      candidate = { ...selected, sha256: record[0].sha256, base, version: provenance.packageVersion, sourceCommit: provenance.sourceCommit,
        tag: release.tag_name, releaseUrl: release.html_url };
      publish({ state: 'available', reason: null, currentVersion, checkedAt: clock(), update: {
        version: candidate.version, tag: candidate.tag, sourceCommit: candidate.sourceCommit, releaseUrl: candidate.releaseUrl,
        bytes: candidate.bytes, unsigned: true } });
      if (await restoreReadyRecord(candidate, signal))
        publish({ state: 'ready', reason: null, deferred: false, stagedHashVerified: true, restoredFromCache: true });
    });
  }
  async function download() {
    if (!candidate || state.state !== 'available' || disposed) return status();
    return transaction(async signal => {
      publish({ state: 'downloading', reason: null });
      const directory = stagingRoot();
      await fs.mkdir(directory, { recursive: true });
      const folder = await fs.mkdtemp(path.join(directory, 'package-'));
      const filename = path.join(folder, candidate.name);
      const handle = await fs.open(filename, 'wx');
      try {
        const response = await request(candidate.base + candidate.name, signal, true);
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length; assert(bytes <= candidate.bytes, 'PACKAGE_SIZE_MISMATCH');
          await handle.writeFile(chunk);
        }
        await handle.close();
        await hashFile(filename, candidate, signal);
        await saveReadyRecord(folder, candidate);
        staged = filename;
      } catch (error) { await handle.close().catch(() => {}); await fs.rm(folder, { recursive: true, force: true }); throw error; }
      publish({ state: 'ready', reason: null, deferred: false, stagedHashVerified: true, restoredFromCache: false });
    });
  }
  async function installWhenSafe(parentWindow) {
    if (disposed || state.state !== 'ready' || pending || !staged) return status();
    if (typeof acquireInstallLease !== 'function') return publish({ reason: 'INSTALL_LEASE_UNAVAILABLE' });
    // Reserve synchronously before showing a dialog, preventing duplicate prompts.
    publish({ state: 'confirming', reason: null });
    try {
      if (await isActiveWork()) return publish({ state: 'ready', reason: 'ACTIVE_WORK', deferred: true });
      if (disposed) return status();
      const en = { title: 'Install update', message: `Restart to install version ${candidate.version}?`,
        detail: 'This update is unsigned. Save your work first. Only this application will restart; the computer will not restart.',
        buttons: ['Restart to install update', 'Later'] };
      const zh = { title: '安裝更新', message: `重新啟動以安裝 ${candidate.version} 版本？`,
        detail: '此更新未經簽署。請先儲存工作。只會重新啟動此應用程式，電腦不會重新啟動。', buttons: ['重新啟動並安裝更新', '稍後'] };
      const language = getLanguage();
      const copy = ['yue', 'zh-HK'].includes(language) ? zh : language === 'bilingual' ? {
        title: `${en.title} / ${zh.title}`, message: `${en.message}\n${zh.message}`,
        detail: `${en.detail}\n${zh.detail}`, buttons: en.buttons.map((text, i) => `${text} / ${zh.buttons[i]}`),
      } : en;
      const options = { type: 'warning', ...copy, defaultId: 1, cancelId: 1, noLink: true };
      const answer = await (parentWindow ? dialog.showMessageBox(parentWindow, options) : dialog.showMessageBox(options));
      if (disposed) return status();
      if (answer.response !== 0) return publish({ state: 'ready', reason: null, deferred: true });
      releaseLease = await acquireInstallLease();
      assert(typeof releaseLease === 'function', 'ACTIVE_WORK');
      assert(!(await isActiveWork()), 'ACTIVE_WORK');
      await hashFile(staged, candidate);
      if (disposed) { releaseLease(); releaseLease = undefined; return status(); }
      publish({ state: 'installing', reason: null }); cancelSchedule();
      // Native Squirrel can apply at next launch, so it starts only after consent.
      await new Promise((resolve, reject) => {
        let finished = false, verifying = false;
        const finish = error => { if (finished) return; finished = true; nativeCleanup(); cancelNativeObservation = undefined; error ? reject(error) : resolve(); };
        cancelNativeObservation = () => finish(new Error('NATIVE_UPDATE_OBSERVATION_CANCELLED'));
        const onError = () => finish(new Error('NATIVE_UPDATE_FAILED'));
        const onNone = () => finish(new Error('NATIVE_UPDATE_NOT_AVAILABLE'));
        const onDownloaded = async () => {
          if (verifying || finished) return;
          verifying = true;
          try {
            await hashFile(path.win32.join(root, 'packages', candidate.name), candidate);
            assert(!disposed && !(await isActiveWork()), 'ACTIVE_WORK');
            if (finished || disposed) return;
            await prepareRestart();
            if (finished || disposed) return;
            autoUpdater.quitAndInstall(); finish();
          } catch (error) { finish(error); }
        };
        const timeout = setTimer(() => finish(new Error('NATIVE_UPDATE_TIMED_OUT')), nativeTimeoutMs); timeout?.unref?.();
        nativeCleanup = () => {
          clearTimer(timeout); autoUpdater.removeListener('error', onError);
          autoUpdater.removeListener('update-not-available', onNone); autoUpdater.removeListener('update-downloaded', onDownloaded);
          nativeCleanup = undefined;
        };
        autoUpdater.on('error', onError); autoUpdater.on('update-not-available', onNone); autoUpdater.on('update-downloaded', onDownloaded);
        try { autoUpdater.setFeedURL({ url: candidate.base }); autoUpdater.checkForUpdates(); }
        catch { finish(new Error('NATIVE_UPDATE_FAILED')); }
      });
      return publish({ state: 'restart-requested', reason: null });
    } catch (error) { if (!disposed) failure(error); return status(); }
    finally { releaseLease?.(); releaseLease = undefined; }
  }
  function dispose() {
    disposed = true; cancelSchedule(); operation?.abort();
    // Native Squirrel exposes no cancellation or rollback API once started.
    publish({ state: 'disposed', reason: null });
    cancelNativeObservation?.();
  }
  if (root) { publish({ state: 'idle', reason: null }); schedule(argv.includes('--squirrel-firstrun') ? 10_000 : 0); }
  else publish({ state: 'unavailable', reason: 'INSTALLED_WINDOWS_SQUIRREL_REQUIRED' });
  return { status, check, download, installWhenSafe, cancelSchedule, dispose,
    on: (...args) => { events.on(...args); return events; }, off: (...args) => { events.off(...args); return events; } };
}
