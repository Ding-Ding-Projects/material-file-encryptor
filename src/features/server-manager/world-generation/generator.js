import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createHash, randomUUID} from 'node:crypto';
import {resolveJavaDistribution} from '../catalog.js';
import {requiredJavaMajor} from '../flavors.js';
import {parseJavaMajor, defaultDeps} from '../target-drivers.js';
import {validateRequest, supportsWorldPresets, chunkRect, forceloadBatches, forceloadCommand, estimate, buildWorldPack, needsCustomPack, levelTypeFor, serverProperties, gameruleCommands, worldborderCommands, packMcmeta, NAMESPACE} from './plan.js';
import {generatorArguments, readExtraction, readBase, checkAgainstExtraction} from './extract.js';
import {writeZip, readZipDirectory, listTree} from './zip-writer.js';

const ACTIONS = ['worldOptions', 'pickWorldDestination', 'startWorldGeneration', 'worldGenerationStatus', 'abortWorldGeneration'];
export const WORLD_ACTIONS = Object.freeze(ACTIONS);
const EULA_URL = 'https://www.minecraft.net/en-us/eula';
const STAGES = ['download', 'extract', 'prepare', 'start', 'generate', 'save', 'copy', 'verify', 'done'];
const LOG_LIMIT = 300;

function exact(payload, keys) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Unsupported world generator request.');
  for (const key of Object.keys(payload)) if (!keys.includes(key)) throw new Error('Unsupported world generator request.');
}

/** Download the official server jar with SHA-1 and size verification, into a part file that is renamed only when it matches. */
export async function downloadVerified({url, sha1, size, destination, fetchImpl = fetch, signal, onProgress = () => {}}) {
  const response = await fetchImpl(url, {redirect: 'error', signal});
  if (!response.ok || !response.body) throw new Error('The official server download is unavailable.');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== size) throw new Error('The server download size differs from the official metadata.');
  const temporary = destination + '.part';
  const hash = createHash('sha1');
  let received = 0;
  const file = await fs.open(temporary, 'wx');
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      received += chunk.byteLength;
      if (received > size) throw new Error('The server download is larger than its official size.');
      hash.update(chunk);
      await file.write(chunk);
      onProgress(received, size);
    }
  } catch (error) { await file.close(); await fs.rm(temporary, {force: true}); throw error; }
  await file.close();
  if (received !== size || hash.digest('hex') !== sha1) { await fs.rm(temporary, {force: true}); throw new Error('The server download does not match the official SHA-1, so it was discarded.'); }
  await fs.rename(temporary, destination);
  return {bytes: received};
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fsSync.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** A console line reader over the server's stdout with awaitable patterns. */
function createConsole(child, onLine) {
  const waiters = [];
  let buffer = '';
  const feed = chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      onLine(line);
      for (const waiter of [...waiters]) if (waiter.pattern.test(line)) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(line); }
    }
  };
  child.stdout?.on?.('data', chunk => feed(String(chunk)));
  const closed = new Promise(resolve => child.once('exit', code => { for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error('The server stopped (exit code ' + code + ').')); } resolve(code); }));
  return {
    closed,
    waitFor(pattern, timeoutMs, signal) {
      return new Promise((resolve, reject) => {
        const waiter = {pattern, resolve, reject, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('The server did not answer in time.')); }, timeoutMs)};
        waiters.push(waiter);
        signal?.addEventListener('abort', () => { clearTimeout(waiter.timer); reject(signal.reason ?? new Error('Canceled.')); }, {once: true});
      });
    },
    send(command) { child.stdin.write(command + '\n'); },
    /** Register the waiter before sending, so a reply that arrives synchronously is never missed. */
    ask(command, pattern, timeoutMs, signal) { const reply = this.waitFor(pattern, timeoutMs, signal); this.send(command); return reply; }
  };
}

/**
 * The world generator. It lives beside the server manager and reuses its official catalogue, distribution resolution and Java
 * requirement table. Every file path the renderer can name comes from a native picker in the host.
 */
export function createWorldGenerator({dataDirectory, fetchImpl = fetch, deps = defaultDeps(), getRow, confirmLicense = async () => false, pickDestination = async () => null, emit = () => {}, now = () => new Date().toISOString(), forceloadTimeoutMs = 120000, startTimeoutMs = 300000}) {
  const root = path.join(path.resolve(dataDirectory), 'world-generator');
  const destinations = new Map();
  let job = null;

  const cacheOf = versionId => path.join(root, 'cache', versionId.replace(/[^A-Za-z0-9._-]/g, '_'));
  const event = () => { try { emit({type: 'world-generation'}); } catch { /* the listener is optional */ } };
  const log = (message) => { if (!job) return; job.view.log.push(message.slice(0, 300)); if (job.view.log.length > LOG_LIMIT) job.view.log.shift(); };
  const stage = (name, extra = {}) => { job.view.stage = name; Object.assign(job.view, extra); event(); };

  async function javaFor(versionId, signal) {
    const required = requiredJavaMajor(versionId);
    let found = null;
    try { const {stdout, stderr} = await deps.execFile('java', ['-version'], {timeout: 10000, signal}); found = parseJavaMajor(stderr || stdout); } catch { found = null; }
    if (!found) throw new Error('Java ' + required + ' or newer is needed to extract and generate this version, and Java was not found on this computer.');
    if (found < required) throw new Error('Java ' + required + ' or newer is needed for this version; Java ' + found + ' was found.');
    return found;
  }

  async function ensureJar(versionId, signal, report = () => {}) {
    const directory = cacheOf(versionId);
    const jar = path.join(directory, 'server.jar');
    const meta = path.join(directory, 'distribution.json');
    await fs.mkdir(directory, {recursive: true});
    try {
      const known = JSON.parse(await fs.readFile(meta, 'utf8'));
      const stat = await fs.stat(jar);
      if (stat.size === known.size && await sha1Of(jar) === known.sha1) return jar;
    } catch { /* download below */ }
    const row = getRow?.(versionId);
    if (!row) throw new Error('Load the official version list first, then choose a version from it.');
    const distribution = await resolveJavaDistribution(row, {fetchImpl, signal});
    if (distribution.state !== 'resolved') throw new Error(distribution.reason ?? 'This version has no dedicated server download.');
    await downloadVerified({url: distribution.url, sha1: distribution.sha1, size: distribution.size, destination: jar, fetchImpl, signal, onProgress: report});
    await fs.writeFile(meta, JSON.stringify({size: distribution.size, sha1: distribution.sha1}));
    return jar;
  }
  async function sha1Of(file) {
    const hash = createHash('sha1');
    for await (const chunk of fsSync.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  }

  async function extractOptions(versionId, signal, report) {
    const directory = cacheOf(versionId);
    const cached = path.join(directory, 'options.json');
    try { return JSON.parse(await fs.readFile(cached, 'utf8')); } catch { /* extract below */ }
    if (!supportsWorldPresets(versionId)) {
      return {versionId, legacy: true, worldPresets: [], biomes: [], structureSets: [], flatPresets: [], noiseSettings: [], dimensionTypes: [], gamerules: [], blocks: [], packFormat: null,
        gaps: [{key: 'all', reason: 'This version predates data-driven world presets, so only seed, level type and structures are available.'}]};
    }
    const jar = await ensureJar(versionId, signal, report);
    await javaFor(versionId, signal);
    const output = path.join(directory, 'generated');
    await fs.rm(output, {recursive: true, force: true});
    await deps.execFile('java', generatorArguments({jarPath: jar, outputDirectory: output}), {timeout: 5 * 60 * 1000, signal, cwd: directory});
    let versionJson = null;
    try { versionJson = JSON.parse(await fs.readFile(path.join(output, 'version.json'), 'utf8')); } catch { /* the pack format becomes a gap */ }
    const options = await readExtraction({outputDirectory: output, versionJson});
    options.versionId = versionId;
    await fs.writeFile(cached, JSON.stringify(options));
    return options;
  }

  async function run(request, controller) {
    const {signal} = controller;
    const staging = path.join(root, 'jobs', job.view.id);
    const serverDirectory = path.join(staging, 'server');
    let child = null, consoleReader = null, failure = null;
    try {
      stage('download');
      const options = await extractOptions(request.versionId, signal);
      stage('extract');
      const legacy = options.legacy === true;
      const rect = chunkRect(request);
      const batches = forceloadBatches(rect);
      job.view.progress = {batches: batches.length, done: 0, chunks: request.widthChunks * request.depthChunks, chunksDone: 0};
      const preset = legacy ? null : checkAgainstExtraction(request, options);
      stage('prepare');
      const jar = await ensureJar(request.versionId, signal);
      await javaFor(request.versionId, signal);
      await fs.mkdir(serverDirectory, {recursive: true});
      await fs.copyFile(jar, path.join(serverDirectory, 'server.jar'));
      const custom = !legacy && needsCustomPack(request);
      if (custom) {
        const base = await readBase({outputDirectory: path.join(cacheOf(request.versionId), 'generated'), preset});
        const pack = buildWorldPack({request, ...base});
        const packRoot = path.join(serverDirectory, request.levelName, 'datapacks', NAMESPACE);
        await fs.mkdir(packRoot, {recursive: true});
        await fs.writeFile(path.join(packRoot, 'pack.mcmeta'), packMcmeta(options.packFormat));
        for (const [relative, value] of Object.entries(pack.files)) {
          const target = path.join(packRoot, ...relative.split('/'));
          await fs.mkdir(path.dirname(target), {recursive: true});
          await fs.writeFile(target, JSON.stringify(value, null, 2));
        }
      }
      const port = await freePort();
      const levelType = legacy ? 'default' : levelTypeFor(request, custom);
      await fs.writeFile(path.join(serverDirectory, 'server.properties'), serverProperties({request, port, levelType}));
      signal.throwIfAborted();
      if (request.eulaAccepted !== true || await confirmLicense({version: request.versionId, url: EULA_URL}) !== true) throw new Error('The Minecraft license was not accepted, so no server was started. Nothing was generated.');
      await fs.writeFile(path.join(serverDirectory, 'eula.txt'), 'eula=true\n');
      stage('start');
      child = deps.spawn('java', ['-Xmx2G', '-jar', 'server.jar', 'nogui'], {cwd: serverDirectory, stdio: ['pipe', 'pipe', 'pipe']});
      child.stderr?.on?.('data', chunk => log(String(chunk).trim()));
      consoleReader = createConsole(child, line => log(line));
      const onAbort = () => { try { consoleReader.send('stop'); } catch { /* already gone */ } setTimeout(() => child.kill?.(), 5000).unref?.(); };
      signal.addEventListener('abort', onAbort, {once: true});
      await consoleReader.waitFor(/Done \(/, startTimeoutMs, signal);
      stage('generate');
      const definitions = options.gamerules ?? [];
      for (const command of [...gameruleCommands(request.gamerules, definitions), ...worldborderCommands(request, rect)]) consoleReader.send(command);
      for (const batch of batches) {
        signal.throwIfAborted();
        await consoleReader.ask(forceloadCommand(batch), /force loaded|already marked|Marked chunk/i, forceloadTimeoutMs, signal);
        await consoleReader.ask('save-all flush', /Saved the game|Saved the world/i, forceloadTimeoutMs, signal);
        consoleReader.send('forceload remove all');
        job.view.progress.done++; job.view.progress.chunksDone += batch.chunks;
        event();
      }
      stage('save');
      await consoleReader.ask('save-all flush', /Saved the game|Saved the world/i, forceloadTimeoutMs, signal);
      consoleReader.send('stop');
      let exitTimer;
      await Promise.race([consoleReader.closed, new Promise(resolve => { exitTimer = setTimeout(resolve, 60000); })]);
      clearTimeout(exitTimer);
      signal.removeEventListener('abort', onAbort);
      stage('copy');
      const levelRoot = path.join(serverDirectory, request.levelName);
      await fs.access(path.join(levelRoot, 'level.dat'));
      const destination = destinations.get(request.output.destinationId);
      if (!destination) throw new Error('Choose where to save the world again with the Browse button.');
      const files = await listTree(levelRoot, request.levelName);
      const manifest = [];
      for (const entry of files) manifest.push({name: entry.name, file: entry.file, sha256: await sha256(entry.file), size: (await fs.stat(entry.file)).size});
      let delivered;
      if (request.output.kind === 'zip') {
        if (destination.kind !== 'zip') throw new Error('Choose a ZIP file location for ZIP output.');
        await writeZip(destination.path, manifest.map(item => ({name: item.name, file: item.file})), {signal});
        delivered = destination.path;
      } else {
        if (destination.kind !== 'folder') throw new Error('Choose a folder for folder output.');
        delivered = await copyTree(levelRoot, destination.path, request.levelName, manifest);
      }
      stage('verify');
      if (request.output.kind === 'zip') {
        const written = new Map((await readZipDirectory(delivered)).map(item => [item.name, item]));
        if (written.size !== manifest.length || manifest.some(item => written.get(item.name)?.size !== item.size)) throw new Error('The ZIP does not match the generated world, so it is reported as incomplete.');
      } else {
        for (const item of manifest) { const copy = path.join(delivered, ...item.name.split('/').slice(1)); if (await sha256(copy) !== item.sha256) throw new Error('A copied file does not match the generated world: ' + item.name); }
      }
      job.view.result = {kind: request.output.kind, path: delivered, files: manifest.length, bytes: manifest.reduce((sum, item) => sum + item.size, 0)};
      stage('done', {status: 'done'});
    } catch (error) {
      const canceled = signal.aborted;
      failure = {status: canceled ? 'canceled' : 'failed', reason: canceled ? 'Generation was canceled. Nothing was delivered.' : String(error.message ?? error).slice(0, 400)};
    } finally {
      try { if (child && child.exitCode === null) child.kill?.(); } catch { /* gone */ }
      await fs.rm(staging, {recursive: true, force: true}).catch(() => {});
      if (failure) Object.assign(job.view, failure);
      job.active = false;
      event();
    }
  }

  /** Folder output never overwrites: the world goes into a new folder and a clash gets a numbered name. */
  async function copyTree(source, destinationParent, name, manifest) {
    let target = path.join(destinationParent, name), number = 0;
    for (;;) { try { await fs.access(target); number++; target = path.join(destinationParent, name + ' (' + number + ')'); } catch { break; } }
    await fs.mkdir(target);
    for (const item of manifest) {
      const relative = item.name.split('/').slice(1);
      const copy = path.join(target, ...relative);
      await fs.mkdir(path.dirname(copy), {recursive: true});
      await fs.copyFile(item.file, copy, fsSync.constants.COPYFILE_EXCL);
    }
    return target;
  }

  const handlers = {
    async worldOptions(payload) {
      exact(payload, ['versionId']);
      if (typeof payload.versionId !== 'string' || !/^[A-Za-z0-9._ -]{1,64}$/.test(payload.versionId)) throw new Error('Choose an official version.');
      if (job?.active) throw new Error('A world is being generated. Wait for it to finish.');
      const controller = new AbortController();
      const options = await extractOptions(payload.versionId, controller.signal);
      return {...options, estimate: estimate({widthChunks: 100, depthChunks: 100})};
    },
    async pickWorldDestination(payload) {
      exact(payload, ['kind']);
      if (!['folder', 'zip'].includes(payload.kind)) throw new Error('Choose folder or ZIP output.');
      const picked = await pickDestination(payload.kind);
      if (!picked) return null;
      const id = randomUUID();
      destinations.set(id, {kind: payload.kind, path: picked});
      return {destinationId: id, label: path.basename(picked)};
    },
    async startWorldGeneration(payload) {
      if (job?.active) throw new Error('A world is already being generated.');
      const request = validateRequest(payload);
      const controller = new AbortController();
      job = {controller, active: true, view: {id: randomUUID(), status: 'running', stage: 'download', versionId: request.versionId, startedAt: now(), log: [], progress: {batches: 0, done: 0, chunks: 0, chunksDone: 0}, stages: STAGES}};
      void run(request, controller);
      return structuredClone(job.view);
    },
    async worldGenerationStatus(payload) { exact(payload, []); return job ? structuredClone(job.view) : null; },
    async abortWorldGeneration(payload) { exact(payload, []); if (job?.active) { job.controller.abort(); return {requested: true}; } return {requested: false}; }
  };

  return {
    async dispatch(action, payload = {}) {
      if (!Object.hasOwn(handlers, action)) throw new Error('Unsupported world generator action.');
      return handlers[action](payload);
    },
    get pending() { return job?.active ? 1 : 0; },
    cancelAll() { if (job?.active) job.controller.abort(); }
  };
}
