import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {FLAVOR_IDS, FLAVOR_NAMES, listFlavorVersions, resolveFlavorDistribution, validVersion} from '../features/server-manager/flavors.js';
import {downloadToFile} from '../features/server-manager/bounded-http.js';
import {validHost, validMemoryMb, validPort, validServerId, validUser} from '../features/server-manager/launch-plans.js';
import {applySetting, describeSettings, readSettings} from '../features/server-manager/server-properties.js';
import {extensionKind, inspectLocalExtension, resolveModrinthFile, searchExtensions, validProjectSlug, EXTENSION_HOSTS, MAX_EXTENSION_BYTES} from '../features/server-manager/extensions.js';
import {createTargetDrivers, defaultDeps} from '../features/server-manager/target-drivers.js';
import {TARGET_IDS} from '../features/server-manager/targets.js';

export const MANAGED_ACTIONS = Object.freeze(['targets', 'flavorVersions', 'chooseSshKey', 'createServer', 'cancelServer', 'acceptServerLicense', 'startServer', 'stopServer', 'restartServer', 'serverStatus', 'serverLogs', 'serverSettings', 'changeServerSetting', 'searchExtensions', 'installExtension', 'listExtensions']);
const EULA = 'https://www.minecraft.net/en-us/eula';
const LIVE = new Set(['starting', 'running', 'stopping']);
const MAX_SERVERS = 50, MAX_EXTENSIONS = 100, MAX_KEYS = 16;
const CONTAINER_JAR_FLAVORS = new Set(['vanilla', 'paper', 'purpur', 'fabric']);

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function record(payload, keys, optional = []) {
  if (!plain(payload) || Object.keys(payload).some(key => ![...keys, ...optional].includes(key)) || keys.some(key => !Object.hasOwn(payload, key))) throw Error('Invalid server request.');
}
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
const idOf = value => { if (!validServerId(value)) throw Error('Invalid server identity.'); return value; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function defaultPortProbe(port) {
  return new Promise(resolve => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen({port, host: '127.0.0.1', exclusive: true}, () => server.close(() => resolve(true))); });
}

/** The main-process owner of managed servers on all four targets.
 *
 * The renderer and the browser extension only ever name fixed identifiers (target, flavor, version, server id, setting key,
 * Modrinth project slug) and bounded plain values. File and key paths come from native file choosers that run in this process;
 * the renderer receives a label and an opaque id. SSH key paths and the records file stay here. Passwords are never accepted. */
export function createServerTargetsService({
  dataDirectory, deps = defaultDeps(), fetchImpl = fetch, confirmLicense = async () => false, chooseSshKey = async () => null,
  chooseExtensionFile = async () => null, emit = () => {}, now = () => new Date().toISOString(), portProbe = defaultPortProbe, pause = sleep,
} = {}) {
  if (typeof dataDirectory !== 'string') throw Error('Invalid managed server configuration.');
  const root = path.join(path.resolve(dataDirectory), 'server-manager', 'managed');
  const recordsFile = path.join(root, 'records.json');
  const records = new Map(), keys = new Map(), controllers = new Map(), flights = new Set();
  let loaded, closed = false, persistTail = Promise.resolve();
  const endpointOf = rec => ({host: rec.ssh.host, port: rec.ssh.port, user: rec.ssh.user, keyPath: rec.ssh.keyId ? keys.get(rec.ssh.keyId)?.path ?? null : null});
  const drivers = createTargetDrivers({deps, dataRoot: root, endpointOf});
  const ensure = () => { if (closed) throw Error('The server manager is closing.'); };
  const changed = id => { try { emit({type: 'changed', serverId: id ?? null}); } catch { /* a renderer that is gone must not break a lifecycle */ } };

  async function load() {
    loaded ??= (async () => {
      await fs.mkdir(root, {recursive: true});
      try {
        const data = JSON.parse(await fs.readFile(recordsFile, 'utf8'));
        for (const item of Array.isArray(data.servers) ? data.servers.slice(0, MAX_SERVERS) : []) if (validServerId(item?.id) && TARGET_IDS.includes(item.target) && FLAVOR_IDS.includes(item.flavor)) records.set(item.id, item);
        for (const [id, value] of Object.entries(data.keys ?? {})) if (/^key-[a-f0-9-]{36}$/.test(id) && typeof value?.path === 'string') keys.set(id, {path: value.path, label: String(value.label ?? '').slice(0, 80)});
        // A process or an SSH session that outlived the previous desktop session cannot be assumed; state is re-read on request.
        for (const item of records.values()) if (item.state === 'preparing') { item.state = 'failed'; item.error = 'Preparation was interrupted; retained files need explicit recovery.'; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    })();
    await loaded;
  }
  function persist() {
    const body = JSON.stringify({schemaVersion: 1, servers: [...records.values()], keys: Object.fromEntries(keys)}, null, 2) + '\n';
    persistTail = persistTail.catch(() => {}).then(async () => { const temporary = recordsFile + '.' + randomUUID() + '.tmp'; await fs.writeFile(temporary, body, {flag: 'wx', mode: 0o600}); await fs.rename(temporary, recordsFile); });
    return persistTail;
  }
  function view(rec) {
    return {
      serverId: rec.id, name: rec.name, target: rec.target, flavor: rec.flavor, version: rec.version, build: rec.distribution?.build ?? null, state: rec.state,
      licenseAccepted: rec.licenseAccepted === true, port: rec.port, memoryMb: rec.memoryMb, containerMode: rec.containerMode ?? null, error: rec.error ?? null, createdAt: rec.createdAt,
      distribution: rec.distribution ? {artifact: rec.distribution.artifact, integrity: rec.distribution.integrity, hashAlgorithm: rec.distribution.hashAlgorithm, hashSource: rec.distribution.hashSource, sha256: rec.jarSha256 ?? null} : {artifact: 'delegated-to-image', integrity: 'delegated-to-image', hashAlgorithm: null, hashSource: 'none', sha256: null},
      ssh: rec.ssh ? {host: rec.ssh.host, port: rec.ssh.port, user: rec.ssh.user, keyConfigured: !!rec.ssh.keyId} : null,
      extensions: (rec.extensions ?? []).map(item => ({fileName: item.fileName, directory: item.directory, source: item.source, upstreamVerified: item.upstreamVerified === true, sha256: item.sha256})),
    };
  }
  const owned = id => { const rec = records.get(idOf(id)); if (!rec) throw Error('An owned managed server is required.'); return rec; };
  const driverOf = rec => drivers[rec.target];
  function claim(id) {
    if (controllers.has(id)) throw Error('An owned server operation is already active.');
    const controller = new AbortController(); controllers.set(id, controller); return controller;
  }
  const release = (id, controller) => { if (controllers.get(id) === controller) controllers.delete(id); };
  function track(promise) { flights.add(promise); promise.finally(() => flights.delete(promise)).catch(() => {}); return promise; }
  async function withOperation(rec, work) {
    const controller = claim(rec.id);
    try { return await track(work(controller.signal)); } finally { release(rec.id, controller); }
  }

  async function probeTargets(signal) {
    const result = [];
    for (const id of TARGET_IDS) {
      let row;
      if (id === 'local-process' || id === 'local-container') row = await drivers[id].availability(signal);
      else { try { await deps.execFile('ssh', ['-V'], {timeout: 10000, signal}); row = {available: true, reason: 'An ssh client was found. Host key and key file are checked per server; passwords are never used.'}; } catch { row = {available: false, reason: 'No ssh client was found on this computer.'}; } }
      result.push({id, available: row.available === true, reason: String(row.reason ?? '').slice(0, 200)});
    }
    return result;
  }

  async function create(payload) {
    record(payload, ['target', 'flavor', 'version'], ['name', 'port', 'memoryMb', 'containerMode', 'ssh']);
    const {target, flavor, version} = payload;
    if (!TARGET_IDS.includes(target) || !FLAVOR_IDS.includes(flavor) || !validVersion(version)) throw Error('Invalid server request.');
    if (records.size >= MAX_SERVERS) throw Error('This desktop has reached its managed server limit.');
    const port = payload.port ?? 25565, memoryMb = payload.memoryMb ?? 2048;
    if (!validPort(port) || !validMemoryMb(memoryMb)) throw Error('Invalid server request.');
    const name = payload.name ?? FLAVOR_NAMES[flavor] + ' ' + version;
    if (!text(name, 80)) throw Error('Invalid server request.');
    const isContainer = target.endsWith('container');
    const containerMode = isContainer ? payload.containerMode ?? 'itzg' : null;
    if (!isContainer && payload.containerMode !== undefined) throw Error('Invalid server request.');
    if (isContainer && !['itzg', 'jar'].includes(containerMode)) throw Error('Invalid server request.');
    if (containerMode === 'jar' && (target !== 'local-container' || !CONTAINER_JAR_FLAVORS.has(flavor))) throw Error('The mounted-jar container mode is available for local vanilla, Paper, Purpur and Fabric servers only.');
    let ssh = null;
    if (target.startsWith('ssh')) {
      const given = payload.ssh;
      if (!plain(given) || Object.keys(given).some(key => !['host', 'port', 'user', 'keyId'].includes(key)) || !validHost(given.host) || !validUser(given.user) || given.port !== undefined && (!Number.isSafeInteger(given.port) || given.port < 1 || given.port > 65535) || given.keyId !== undefined && !keys.has(given.keyId)) throw Error('Invalid SSH endpoint.');
      ssh = {host: given.host, port: given.port ?? 22, user: given.user, keyId: given.keyId ?? null};
    } else if (payload.ssh !== undefined) throw Error('Invalid server request.');
    if (!target.startsWith('ssh') && !await portProbe(port)) throw Error('That port is already in use on this computer.');
    const rec = {schemaVersion: 1, id: 'managed-' + randomUUID(), name, target, flavor, version, port, memoryMb, containerMode, ssh, state: 'preparing', licenseAccepted: false, extensions: [], createdAt: now(), distribution: null, jarSha256: null, argsFile: null, error: null};
    const controller = claim(rec.id);
    records.set(rec.id, rec);
    await persist();
    const staging = path.join(root, 'staging', rec.id);
    track((async () => {
      try {
        const driver = driverOf(rec), signal = controller.signal;
        let artifactFile = null, distribution = {artifact: 'delegated-to-image'};
        if (!(isContainer && containerMode === 'itzg')) {
          distribution = await resolveFlavorDistribution(flavor, version, {fetchImpl, signal});
          await fs.mkdir(staging, {recursive: true});
          artifactFile = path.join(staging, distribution.fileName);
          const received = await downloadToFile(fetchImpl, distribution.url, distribution.hosts, artifactFile, {signal, maxBytes: distribution.maxBytes, hashAlgorithm: distribution.hashAlgorithm, hash: distribution.hash, expectedSize: distribution.size, onProgress: () => {}});
          rec.distribution = {artifact: distribution.artifact, build: distribution.build, integrity: distribution.integrity, hashAlgorithm: distribution.hashAlgorithm, hashSource: distribution.hashSource, size: received.size, sha256: received.sha256};
          await persist();
        }
        signal.throwIfAborted();
        const prepared = await driver.prepare(rec, {artifactFile, distribution, signal, port});
        rec.argsFile = prepared.argsFile ?? null; rec.jarSha256 = prepared.jarSha256 ?? null;
        rec.state = 'prepared'; rec.error = null;
      } catch (error) {
        rec.state = 'failed';
        rec.error = controller.signal.aborted ? 'Canceled; retained files need explicit recovery.' : String(error?.message ?? 'Preparation failed.').replace(/[A-Za-z]:\\[^\s'"]+/g, '<path>').slice(0, 300);
      } finally {
        await fs.rm(staging, {recursive: true, force: true}).catch(() => {});
        release(rec.id, controller);
        try { await persist(); } catch { rec.error = 'The state record could not be saved.'; }
        changed(rec.id);
      }
    })());
    return view(rec);
  }

  async function lifecycle(rec, action) {
    const driver = driverOf(rec);
    return withOperation(rec, async signal => {
      if (rec.state === 'preparing') throw Error('The server is still being prepared.');
      if (action === 'start') {
        if (rec.licenseAccepted !== true) throw Error('Exact server license acceptance is required.');
        if (rec.state === 'running') return view(rec);
        rec.state = 'starting'; changed(rec.id);
        try { rec.state = (await driver.start(rec, {signal})).state; rec.error = null; }
        catch (error) { rec.state = 'failed'; rec.error = String(error?.message ?? 'Start failed.').slice(0, 300); await persist(); changed(rec.id); throw error; }
      } else if (action === 'stop') {
        if (!LIVE.has(rec.state) && rec.state !== 'failed') return view(rec);
        rec.state = 'stopping'; changed(rec.id);
        try { rec.state = (await driver.stop(rec, {signal})).state; rec.error = null; }
        catch (error) { rec.state = 'running'; rec.error = String(error?.message ?? 'Stop failed.').slice(0, 300); await persist(); changed(rec.id); throw error; }
      } else {
        const next = (await driver.status(rec, {signal})).state;
        if (next !== rec.state) rec.state = next;
      }
      await persist(); changed(rec.id);
      return view(rec);
    });
  }

  async function dispatch(action, payload = {}) {
    ensure();
    await load();
    ensure();
    if (action === 'targets') {
      record(payload, []);
      const controller = new AbortController();
      const targets = await probeTargets(controller.signal);
      return {targets, flavors: FLAVOR_IDS.map(id => ({id, name: FLAVOR_NAMES[id], extensions: extensionKind(id)?.directory ?? null})), servers: [...records.values()].map(view), acceptedLicenseUrl: EULA};
    }
    if (action === 'flavorVersions') {
      record(payload, ['flavor']);
      if (!FLAVOR_IDS.includes(payload.flavor)) throw Error('Unsupported server flavor.');
      const controller = new AbortController(); controllers.set('catalogue', controller);
      try { return await track(listFlavorVersions(payload.flavor, {fetchImpl, signal: controller.signal})); } finally { controllers.delete('catalogue'); }
    }
    if (action === 'chooseSshKey') {
      record(payload, []);
      if (keys.size >= MAX_KEYS) throw Error('The saved SSH key limit was reached.');
      const chosen = await chooseSshKey();
      if (!chosen) return {chosen: false};
      const file = path.resolve(String(chosen));
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > 32 * 1024) throw Error('A regular private key file is required.');
      const handle = await fs.open(file, 'r');
      try { const head = Buffer.alloc(11); await handle.read(head, 0, 11, 0); if (head.toString('latin1') !== '-----BEGIN ') throw Error('The file does not look like an SSH private key.'); } finally { await handle.close(); }
      const keyId = 'key-' + randomUUID();
      keys.set(keyId, {path: file, label: path.basename(file).slice(0, 80)});
      await persist();
      return {chosen: true, keyId, label: keys.get(keyId).label};
    }
    if (action === 'createServer') return create(payload);
    if (action === 'cancelServer') { record(payload, ['serverId']); const controller = controllers.get(idOf(payload.serverId)); controller?.abort(); return {requested: !!controller}; }
    if (action === 'restartServer') {
      record(payload, ['serverId']); const rec = owned(payload.serverId);
      await lifecycle(rec, 'stop');
      for (let attempt = 0; attempt < 20 && rec.state !== 'stopped'; attempt++) { await pause(1000); await lifecycle(rec, 'status'); }
      if (rec.state !== 'stopped') throw Error('The server did not finish stopping.');
      return lifecycle(rec, 'start');
    }
    if (['startServer', 'stopServer', 'serverStatus'].includes(action)) { record(payload, ['serverId']); return lifecycle(owned(payload.serverId), action === 'startServer' ? 'start' : action === 'stopServer' ? 'stop' : 'status'); }
    if (action === 'acceptServerLicense') {
      record(payload, ['serverId']); const rec = owned(payload.serverId);
      if (!['prepared', 'stopped'].includes(rec.state)) throw Error('License acceptance needs a prepared, stopped server.');
      if (rec.licenseAccepted) return {accepted: true};
      return withOperation(rec, async () => {
        if (await confirmLicense({serverId: rec.id, flavor: rec.flavor, version: rec.version, target: rec.target, distributionSha256: rec.jarSha256 ?? 'delegated to the container image', url: EULA, requiresExplicitConsent: true}) !== true) return {accepted: false};
        ensure();
        await driverOf(rec).writeText(rec, 'eula.txt', 'eula=true\n');
        rec.licenseAccepted = true; await persist(); changed(rec.id);
        return {accepted: true};
      });
    }
    if (action === 'serverLogs') {
      record(payload, ['serverId'], ['lines']); const rec = owned(payload.serverId);
      const lines = payload.lines ?? 100;
      if (!Number.isSafeInteger(lines) || lines < 1 || lines > 500) throw Error('Invalid log request.');
      const controller = new AbortController();
      return {lines: (await driverOf(rec).logs(rec, lines, {signal: controller.signal})).slice(-lines)};
    }
    if (action === 'serverSettings') {
      record(payload, ['serverId']); const rec = owned(payload.serverId);
      const source = await driverOf(rec).readText(rec, 'server.properties').catch(() => '');
      return {descriptors: describeSettings(rec.target), values: readSettings(source), restartRequired: LIVE.has(rec.state), fileExists: source !== ''};
    }
    if (action === 'changeServerSetting') {
      record(payload, ['serverId', 'key', 'value']); const rec = owned(payload.serverId);
      if (rec.state === 'preparing') throw Error('The server is still being prepared.');
      return withOperation(rec, async () => {
        const driver = driverOf(rec);
        const source = await driver.readText(rec, 'server.properties').catch(() => '');
        await driver.writeText(rec, 'server.properties', applySetting(source, payload.key, payload.value, rec.target));
        if (payload.key === 'server-port' && !rec.target.endsWith('container')) rec.port = payload.value;
        await persist(); changed(rec.id);
        return {key: payload.key, applied: LIVE.has(rec.state) ? 'after-restart' : 'next-start'};
      });
    }
    if (action === 'searchExtensions') {
      record(payload, ['serverId', 'query']); const rec = owned(payload.serverId);
      const controller = new AbortController();
      return {results: await track(searchExtensions({flavor: rec.flavor, minecraft: rec.version, query: payload.query}, {fetchImpl, signal: controller.signal}))};
    }
    if (action === 'listExtensions') { record(payload, ['serverId']); return {extensions: view(owned(payload.serverId)).extensions}; }
    if (action === 'installExtension') {
      record(payload, ['serverId', 'source'], ['project', 'version']); const rec = owned(payload.serverId);
      if (!extensionKind(rec.flavor)) throw Error('This flavor has no plugin or mod directory.');
      if (['preparing', ...LIVE].includes(rec.state)) throw Error('Stop the server before installing extensions.');
      if ((rec.extensions ?? []).length >= MAX_EXTENSIONS) throw Error('The extension limit was reached.');
      return withOperation(rec, async signal => {
        const driver = driverOf(rec), staging = path.join(root, 'staging', rec.id + '-ext-' + randomUUID());
        await fs.mkdir(staging, {recursive: true});
        try {
          let entry, staged;
          if (payload.source === 'modrinth') {
            if (!validProjectSlug(payload.project)) throw Error('Invalid extension request.');
            const file = await resolveModrinthFile({flavor: rec.flavor, minecraft: rec.version, project: payload.project, version: payload.version ?? null}, {fetchImpl, signal});
            staged = path.join(staging, file.fileName);
            const received = await downloadToFile(fetchImpl, file.url, EXTENSION_HOSTS.cdn, staged, {signal, maxBytes: MAX_EXTENSION_BYTES, hashAlgorithm: 'sha512', hash: file.hash, expectedSize: file.size});
            entry = {fileName: file.fileName, directory: file.directory, source: 'modrinth', project: file.project, versionNumber: file.versionNumber, sha256: received.sha256, upstreamVerified: true};
          } else if (payload.source === 'file') {
            if (payload.project !== undefined || payload.version !== undefined) throw Error('Invalid extension request.');
            const chosen = await chooseExtensionFile();
            if (!chosen) return {installed: false};
            const local = await inspectLocalExtension(path.resolve(String(chosen)), rec.flavor);
            staged = path.resolve(String(chosen));
            entry = {fileName: local.fileName, directory: local.directory, source: 'local', sha256: local.sha256, upstreamVerified: false};
          } else throw Error('Invalid extension request.');
          signal.throwIfAborted();
          await driver.putFile(rec, entry.directory, entry.fileName, staged);
          rec.extensions = [...(rec.extensions ?? []).filter(item => !(item.fileName === entry.fileName && item.directory === entry.directory)), entry];
          await persist(); changed(rec.id);
          return {installed: true, fileName: entry.fileName, directory: entry.directory, source: entry.source, upstreamVerified: entry.upstreamVerified, sha256: entry.sha256};
        } finally { await fs.rm(staging, {recursive: true, force: true}).catch(() => {}); }
      });
    }
    throw Error('Unsupported managed server action.');
  }

  return {
    dispatch,
    get pending() { return flights.size; },
    /** Resolves when every in-flight preparation has finished. Used by tests and by shutdown. */
    async idle() { while (flights.size) await Promise.allSettled([...flights]); },
    cancelAll() { for (const controller of controllers.values()) controller.abort(); },
    async close() { closed = true; for (const controller of controllers.values()) controller.abort(); await Promise.allSettled([...flights]); await Promise.allSettled(Object.values(drivers).map(driver => driver.close())); await persistTail.catch(() => {}); },
  };
}
