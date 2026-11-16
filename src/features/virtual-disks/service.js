import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {COMPACT_MODES, validateCreate, validateResize, validateConvert, validateWindowsPath, formatForPath} from './limits.js';
import {encodeCommand, equivalentScript} from './scripts.js';

const ACTIONS = ['capabilities', 'list', 'inspect', 'pickDisk', 'pickNewDisk', 'create', 'attach', 'detach', 'mountIso', 'resize', 'compact', 'convert', 'script'];
const KEYS = {
  capabilities: [], list: ['elevate'], inspect: ['path'], pickDisk: ['kind'], pickNewDisk: [],
  create: ['path', 'format', 'type', 'sizeBytes', 'size', 'blockSizeBytes', 'logicalSectorSize', 'physicalSectorSize', 'initialize'],
  attach: ['path', 'readOnly'], detach: ['path'], mountIso: ['path'], resize: ['path', 'sizeBytes', 'extendPartition', 'confirmShrink'],
  compact: ['path', 'mode'], convert: ['path', 'destination', 'type'], script: ['op', 'params', 'route']
};
const TIMEOUT = {capabilities: 20000, list: 30000, inspect: 30000, default: 20 * 60 * 1000};

export class ElevationCancelled extends Error {
  constructor() { super('Administrator approval was not given. Nothing was changed.'); this.name = 'ElevationCancelled'; }
}

/** The default PowerShell runner. Elevation goes through the supported RunAs route and the person answers the native prompt. */
export function createPowerShellRunner({execFileImpl = execFile, readFile = fs.readFile, rm = fs.rm, resultDirectory = null} = {}) {
  const exec = (file, args, options) => new Promise((resolve, reject) => execFileImpl(file, args, options, (error, stdout, stderr) => error ? reject(Object.assign(error, {stdout, stderr})) : resolve({stdout, stderr})));
  return {
    async run(encoded, {elevated = false, resultFile = null, timeoutMs = 60000} = {}) {
      if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('The encoded command is invalid.');
      const base = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
      if (!elevated) {
        const {stdout} = await exec('powershell.exe', base, {windowsHide: true, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024});
        return stdout;
      }
      if (!resultFile || !resultDirectory) throw new Error('An elevated run needs a result file.');
      const list = base.map(item => "'" + item + "'").join(',');
      try {
        await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @(" + list + ')'], {windowsHide: true, timeout: timeoutMs});
      } catch (error) {
        if (/canceled by the user|cancelled by the user|1223/i.test(String(error.stderr || '') + String(error.message || ''))) throw new ElevationCancelled();
        throw error;
      }
      try { return await readFile(resultFile, 'utf8'); }
      catch { throw Object.assign(new Error('The administrator step finished without a result, so it is reported as incomplete.'), {incomplete: true}); }
      finally { await rm(resultFile, {force: true}).catch(() => {}); }
    }
  };
}

function exact(payload, keys) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Unsupported virtual disk request.');
  for (const key of Object.keys(payload)) if (!keys.includes(key)) throw new Error('Unsupported virtual disk request.');
}

export function chooseRoute(op, caps) {
  const need = reason => { throw new Error(reason); };
  switch (op) {
    case 'create': return caps.hyperv ? 'hyperv' : caps.diskpart ? 'diskpart' : need('No disk creation route is available on this computer.');
    case 'resize': return caps.hyperv ? 'hyperv' : caps.diskpart ? 'diskpart' : need('No resize route is available on this computer.');
    case 'compact': return caps.optimize ? 'hyperv' : caps.diskpart ? 'diskpart' : need('No compact route is available on this computer.');
    case 'convert': return caps.hyperv ? 'hyperv' : need('Converting a disk needs the Hyper-V PowerShell module, which this computer does not have. Turn on the Hyper-V management tools in Windows features, or use an equivalent tool.');
    default: return caps.storage ? 'storage' : need('The Storage PowerShell module is not available on this computer.');
  }
}

/**
 * Host side of the virtual disk manager. Every file path must come from a native picker in this session or from the list of
 * disks Windows reports as attached, so a renderer can never point an operation at an arbitrary path.
 */
export function createVirtualDiskService({platform = process.platform, runner, pick = {}, exists = async file => fs.access(file).then(() => true, () => false), resultDirectory, emit = () => {}} = {}) {
  const granted = new Set();
  const known = new Set();
  let caps = null, busy = false;
  const key = file => String(file).toLowerCase();
  const supported = () => { if (platform !== 'win32') throw new Error('The virtual disk manager needs Windows.'); };
  const resultPath = () => path.join(resultDirectory, 'result-' + randomUUID() + '.json');
  const need = file => { if (!granted.has(key(file)) && !known.has(key(file))) throw new Error('Choose the file again with the file picker.'); return file; };

  async function execute(names, params, {elevate = false, timeoutMs = TIMEOUT.default} = {}) {
    const elevated = elevate && caps?.elevated !== true;
    const resultFile = elevated ? resultPath() : null;
    const encoded = encodeCommand(names, resultFile ? {...params, resultFile} : params);
    let raw;
    try { raw = await runner.run(encoded, {elevated, resultFile, timeoutMs}); }
    catch (error) {
      if (error instanceof ElevationCancelled) return {status: 'incomplete', reason: error.message, elevated: true, cancelled: true};
      if (error.incomplete) return {status: 'incomplete', reason: error.message, elevated: true};
      throw new Error('The Windows command did not finish: ' + String(error.stderr || error.message).slice(0, 400));
    }
    let parsed;
    try { parsed = JSON.parse(String(raw).trim().split(/\r?\n/).filter(Boolean).pop() ?? ''); }
    catch { throw new Error('The Windows command returned an unreadable result.'); }
    if (!parsed.ok) return {status: 'failed', reason: String(parsed.error ?? 'The operation failed.').slice(0, 500), elevated};
    return {status: 'done', result: parsed.result, elevated};
  }

  async function probe() {
    supported();
    const outcome = await execute('capabilities', {}, {timeoutMs: TIMEOUT.capabilities});
    if (outcome.status !== 'done') throw new Error(outcome.reason ?? 'Capabilities are unavailable.');
    caps = outcome.result;
    return caps;
  }
  const capabilities = async () => caps ?? probe();

  async function mutate(op, names, params, {elevate = true, equivalent} = {}) {
    if (busy) throw new Error('Another virtual disk operation is running. Wait for it to finish.');
    busy = true;
    emit({type: 'busy', op});
    try {
      const outcome = await execute(names, params, {elevate});
      return {op, ...outcome, equivalent};
    } finally { busy = false; emit({type: 'idle', op}); }
  }

  const handlers = {
    async capabilities(payload) {
      exact(payload, KEYS.capabilities);
      if (platform !== 'win32') return {supported: false, reason: 'The virtual disk manager needs Windows.'};
      const fresh = await probe();
      return {supported: true, ...fresh, routes: {storage: fresh.storage, hyperv: fresh.hyperv, diskpart: fresh.diskpart}};
    },
    async list(payload) {
      exact(payload, KEYS.list);
      supported();
      await capabilities();
      const outcome = await execute('list', {}, {elevate: payload.elevate === true, timeoutMs: TIMEOUT.list});
      if (outcome.status === 'done') for (const disk of outcome.result?.disks ?? []) if (disk.path) known.add(key(disk.path));
      return outcome;
    },
    async inspect(payload) {
      exact(payload, KEYS.inspect);
      supported();
      need(validateWindowsPath(payload.path, {purpose: path.extname(payload.path).toLowerCase() === '.iso' ? 'iso' : 'disk'}));
      await capabilities();
      return execute('inspect', {path: payload.path}, {timeoutMs: TIMEOUT.inspect});
    },
    async pickDisk(payload) {
      exact(payload, KEYS.pickDisk);
      supported();
      if (payload.kind !== undefined && !['disk', 'iso'].includes(payload.kind)) throw new Error('Unsupported file kind.');
      const file = await pick.open?.(payload.kind ?? 'disk');
      if (!file) return null;
      validateWindowsPath(file, {purpose: path.extname(file).toLowerCase() === '.iso' ? 'iso' : 'disk'});
      granted.add(key(file));
      return {path: file};
    },
    async pickNewDisk(payload) {
      exact(payload, KEYS.pickNewDisk);
      supported();
      const file = await pick.save?.();
      if (!file) return null;
      validateWindowsPath(file);
      granted.add(key(file));
      return {path: file};
    },
    async create(payload) {
      exact(payload, KEYS.create);
      supported();
      const request = validateCreate(payload);
      need(request.path);
      if (await exists(request.path)) throw new Error('That file already exists. A new disk never replaces a file.');
      const current = await capabilities();
      const route = chooseRoute('create', current);
      const steps = ['create_' + route];
      if (request.initialize) { if (!current.storage) throw new Error('Formatting needs the Storage PowerShell module, which is not available.'); steps.push('initialize'); }
      const outcome = await mutate('create', steps, request, {equivalent: equivalentScript('create', request, route)});
      return {...outcome, route};
    },
    async attach(payload) {
      exact(payload, KEYS.attach);
      supported();
      validateWindowsPath(payload.path);
      need(payload.path);
      if (payload.readOnly !== undefined && typeof payload.readOnly !== 'boolean') throw new Error('Read-only is a yes or no choice.');
      await capabilities();
      return {...await mutate('attach', 'attach', {path: payload.path, readOnly: payload.readOnly === true}, {equivalent: equivalentScript('attach', payload)}), route: 'storage'};
    },
    async detach(payload) {
      exact(payload, KEYS.detach);
      supported();
      validateWindowsPath(payload.path);
      need(payload.path);
      await capabilities();
      return {...await mutate('detach', 'detach', {path: payload.path}, {equivalent: equivalentScript('detach', payload)}), route: 'storage'};
    },
    async mountIso(payload) {
      exact(payload, KEYS.mountIso);
      supported();
      validateWindowsPath(payload.path, {purpose: 'iso'});
      need(payload.path);
      await capabilities();
      return {...await mutate('mountIso', 'mountIso', {path: payload.path}, {elevate: false, equivalent: equivalentScript('mountIso', payload)}), route: 'storage'};
    },
    async resize(payload) {
      exact(payload, KEYS.resize);
      supported();
      need(validateWindowsPath(payload.path));
      const current = await capabilities();
      const info = await execute('inspect', {path: payload.path}, {timeoutMs: TIMEOUT.inspect});
      if (info.status !== 'done') throw new Error(info.reason ?? 'The disk could not be inspected.');
      const request = validateResize({path: payload.path, sizeBytes: payload.sizeBytes, currentBytes: info.result.sizeBytes, minimumBytes: info.result.minimumBytes});
      if (request.shrinking && payload.confirmShrink !== true) throw new Error('Shrinking needs an explicit confirmation naming the disk.');
      if (request.shrinking && !current.hyperv) throw new Error('Shrinking needs the Hyper-V PowerShell module, which this computer does not have.');
      const route = chooseRoute('resize', current);
      if (route === 'diskpart' && request.shrinking) throw new Error('Shrinking needs the Hyper-V PowerShell module, which this computer does not have.');
      const extend = payload.extendPartition === true && !request.shrinking && route === 'hyperv';
      const outcome = await mutate('resize', 'resize_' + route, {path: payload.path, sizeBytes: request.sizeBytes, extendPartition: extend}, {equivalent: equivalentScript('resize', {...payload, sizeBytes: request.sizeBytes}, route)});
      return {...outcome, route, shrank: request.shrinking};
    },
    async compact(payload) {
      exact(payload, KEYS.compact);
      supported();
      need(validateWindowsPath(payload.path));
      const mode = payload.mode ?? 'Full';
      if (!COMPACT_MODES.includes(mode)) throw new Error('Choose a compact mode: ' + COMPACT_MODES.join(', ') + '.');
      const current = await capabilities();
      const route = chooseRoute('compact', current);
      if (route === 'diskpart' && mode !== 'Full') throw new Error('Only the Full mode is available without the Hyper-V PowerShell module.');
      return {...await mutate('compact', 'compact_' + route, {path: payload.path, mode}, {equivalent: equivalentScript('compact', {path: payload.path, mode}, route)}), route};
    },
    async convert(payload) {
      exact(payload, KEYS.convert);
      supported();
      need(validateWindowsPath(payload.path));
      const current = await capabilities();
      const route = chooseRoute('convert', current);
      const info = await execute('inspect', {path: payload.path}, {timeoutMs: TIMEOUT.inspect});
      if (info.status !== 'done') throw new Error(info.reason ?? 'The disk could not be inspected.');
      const request = validateConvert({path: payload.path, destination: payload.destination, type: payload.type, sizeBytes: info.result.sizeBytes});
      granted.add(key(request.destination));
      if (await exists(request.destination)) throw new Error('The destination already exists. Choose a new file name.');
      return {...await mutate('convert', 'convert', request, {equivalent: equivalentScript('convert', request, route)}), route};
    },
    async script(payload) {
      exact(payload, KEYS.script);
      const params = payload.params ?? {};
      if (typeof params !== 'object' || Array.isArray(params)) throw new Error('Unsupported virtual disk request.');
      for (const value of Object.values(params)) if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new Error('Unsupported virtual disk request.');
      return equivalentScript(payload.op, params, payload.route);
    }
  };

  return {
    actions: ACTIONS,
    async dispatch(action, payload = {}) {
      if (!Object.hasOwn(handlers, action)) throw new Error('Unsupported virtual disk action.');
      return handlers[action](payload);
    },
    get busy() { return busy; },
    formatForPath
  };
}
