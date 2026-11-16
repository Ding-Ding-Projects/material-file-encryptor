import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';

export const REGISTRY_LOGIN_PAGE = 'https://login.docker.com/activate';
const INFORMATIONAL_URL = /^https:\/\/docs\.docker\.com\/[A-Za-z0-9\-._~/?=&%#]*$/;
const MAX_DISTINCT_BYTES = 65536;
const MAX_RAW_BYTES = 8 * 1024 * 1024;
const stripTerminal = value => value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

export function registryLoginRelayPath({ packaged = false, resourcesPath = process.resourcesPath } = {}) {
  if (!packaged) return fileURLToPath(new URL('./registry-login-console.ps1', import.meta.url));
  if (typeof resourcesPath !== 'string' || !path.isAbsolute(resourcesPath) || /(?:^|[\\/])[^\\/]+\.asar(?:[\\/]|$)/i.test(resourcesPath))
    throw Error('The packaged sign-in relay is unavailable.');
  return path.join(resourcesPath, 'registry-login-console.ps1');
}

/** Only a parsed one-time code crosses this boundary. CLI diagnostics never do. */
export function createRegistryLogin({ transport, openPage, spawnProcess = spawn, platform = process.platform,
  packaged = false, resourcesPath = process.resourcesPath,
  systemRoot = process.env.SystemRoot || 'C:\\Windows', now = Date.now, deadlineMs = 600000,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof openPage !== 'function' || !transport || typeof transport.inspectRegistrySignIn !== 'function' || typeof transport.registryLoginCommand !== 'function' ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1000 || deadlineMs > 600000) throw Error('Invalid registry sign-in service.');
  let active = null;
  const retiring = new Set();
  let state = { state: 'idle', deviceCode: null, canOpenPage: false, expiresAt: null, account: null, reason: null };
  const accountOf = inspection => typeof inspection?.account === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/.test(inspection.account) ? inspection.account : null;
  const snapshot = () => structuredClone(state);
  const clearCode = () => { state.deviceCode = null; state.canOpenPage = false; state.expiresAt = null; };
  function scrub(operation) { operation.code = null; operation.officialPage = false; for (const stream of Object.values(operation.streams)) stream.pending = ''; }
  function retire(operation, next, reason = null) {
    if (active !== operation) return;
    operation.retired = true; scrub(operation); clearTimer(operation.timer); operation.controller.abort();
    state.state = next; state.reason = reason; clearCode();
    if (operation.child) { retiring.add(operation); try { operation.child.kill(); } catch { /* Retain ownership until close. */ } }
    else active = null;
  }
  function updateCode(operation) {
    if (active !== operation || operation.retired || !operation.code || !operation.officialPage) return;
    state.state = 'authorizing'; state.deviceCode = operation.code; state.canOpenPage = true;
    state.expiresAt = new Date(operation.deadline).toISOString();
  }
  function line(operation, raw) {
    if (active !== operation || operation.retired) return;
    const text = stripTerminal(raw).trim();
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(text)) return retire(operation, 'failed', 'invalid-cli-output');
    const urls = text.match(/https?:\/\/[^\s<>"']+/g) || [];
    // Only the fixed official page is ever offered to the user. Documentation links the CLI prints
    // around a stored sign-in are informational and never opened, so they are tolerated. Any other
    // address is refused until the CLI has reported success.
    const official = urls.filter(url => url === REGISTRY_LOGIN_PAGE);
    const foreign = urls.filter(url => url !== REGISTRY_LOGIN_PAGE && !INFORMATIONAL_URL.test(url));
    if (/^Login Succeeded\b/i.test(text)) operation.succeeded = true;
    if (foreign.length && !operation.succeeded) return retire(operation, 'failed', 'invalid-cli-output');
    if (official.length) operation.officialPage = true;
    if (text.includes('Your one-time device confirmation code is:')) {
      const match = text.match(/^Your one-time device confirmation code is: ([A-Z0-9]{4}-[A-Z0-9]{4})$/);
      if (!match || operation.code && operation.code !== match[1]) return retire(operation, 'failed', 'invalid-cli-output');
      operation.code = match[1];
    }
    if (/expired_token|device code (?:has )?expired|device code flow timed out/i.test(text)) return retire(operation, 'expired', 'device-login-expired');
    if (/falling back to command line login|^Username:|^Password:/i.test(text)) return retire(operation, 'unavailable', 'device-flow-unavailable');
    updateCode(operation);
  }
  function consume(operation, channel, bytes) {
    if (active !== operation || operation.retired) return;
    // Spinners and redraws repeat the same text, so only distinct lines count toward the output
    // cap. A separate generous raw cap still bounds a runaway process.
    operation.raw += bytes.length;
    if (operation.raw > MAX_RAW_BYTES) return retire(operation, 'failed', 'invalid-cli-output');
    const stream = operation.streams[channel];
    try { stream.pending += stream.decoder.decode(bytes, { stream: true }); }
    catch { return retire(operation, 'failed', 'invalid-cli-output'); }
    const lines = stream.pending.split(/\r?\n|\r/); stream.pending = lines.pop();
    if (stream.pending.length > 4096) return retire(operation, 'failed', 'invalid-cli-output');
    for (const value of lines) {
      const cleaned = stripTerminal(value).trim();
      if (cleaned && !operation.seen.has(cleaned)) {
        operation.bytes += Buffer.byteLength(cleaned);
        if (operation.seen.size < 512) operation.seen.add(cleaned);
        if (operation.bytes > MAX_DISTINCT_BYTES) return retire(operation, 'failed', 'invalid-cli-output');
      }
      line(operation, value);
      if (active !== operation || operation.retired) return;
    }
    // An older CLI asks for credentials with a prompt that never ends in a newline.
    if (/^(?:Username|Password):\s*$/i.test(stripTerminal(stream.pending).trim())) {
      const prompt = stream.pending; stream.pending = ''; line(operation, prompt);
    }
  }
  async function launch(operation) {
    try {
      const inspection = await transport.inspectRegistrySignIn(operation.controller.signal);
      if (active !== operation || operation.retired) return;
      if (inspection.state === 'signed-in') { state.state = 'signed-in'; state.reason = null; state.account = accountOf(inspection); clearCode(); clearTimer(operation.timer); active = null; return; }
      // A saved sign-in that Docker Hub no longer accepts is replaced by a fresh device sign-in.
      if (inspection.state !== 'missing' && inspection.state !== 'stale') { retire(operation, 'unavailable', inspection.reason || 'stored-sign-in-unverified'); return; }
      if (platform !== 'win32') return retire(operation, 'unavailable', 'device-flow-unavailable');
      const command = await transport.registryLoginCommand(operation.controller.signal);
      if (active !== operation || operation.retired) return;
      const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const relay = registryLoginRelayPath({ packaged, resourcesPath });
      const relayInfo = await lstat(relay);
      const resolvedRelay = await realpath(relay);
      if (!relayInfo.isFile() || relayInfo.isSymbolicLink() || path.resolve(resolvedRelay).toLowerCase() !== path.resolve(relay).toLowerCase())
        throw Error('The sign-in relay is unavailable.');
      if (active !== operation || operation.retired) return;
      operation.child = spawnProcess(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', relay,
        '-DockerExecutable', command.executable, '-ConfigurationDirectory', command.configDirectory],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: command.env });
      const child = operation.child;
      child.stdin.on('error', () => {});
      child.stdout.on('data', bytes => consume(operation, 'stdout', bytes));
      child.stderr.on('data', bytes => consume(operation, 'stderr', bytes));
      for (const stream of [child.stdout, child.stderr]) stream.on('error', () => retire(operation, 'failed', 'device-login-incomplete'));
      child.on('error', () => retire(operation, 'unavailable', 'device-flow-unavailable'));
      child.on('close', async code => {
        operation.child = null; retiring.delete(operation); operation.resolveClosed();
        if (active !== operation) return;
        if (operation.retired) { active = null; return; }
        for (const stream of Object.values(operation.streams)) {
          try { stream.pending += stream.decoder.decode(); } catch { retire(operation, 'failed', 'invalid-cli-output'); }
          if (stream.pending) line(operation, stream.pending);
        }
        if (active !== operation || operation.retired) return;
        clearCode(); scrub(operation);
        if (code !== 0) return retire(operation, now() >= operation.deadline ? 'expired' : 'failed', 'device-login-incomplete');
        state.state = 'verifying';
        try {
          const verified = await transport.inspectRegistrySignIn(operation.controller.signal);
          if (active !== operation || operation.retired) return;
          if (verified.state !== 'signed-in') return retire(operation, verified.state === 'stale' ? 'stale' : 'failed', 'stored-sign-in-unverified');
          state.state = 'signed-in'; state.reason = null; state.account = accountOf(verified); clearTimer(operation.timer); active = null;
        } catch { retire(operation, 'failed', 'stored-sign-in-unverified'); }
      });
    } catch { retire(operation, 'unavailable', 'device-flow-unavailable'); }
  }
  const service = {
    status: snapshot,
    /** Re-inspect the saved sign-in without opening a browser flow. Never interrupts an active attempt. */
    async recheck() {
      if (active) return snapshot();
      const operation = { controller: new AbortController(), child: null, retired: false, recheck: true };
      active = operation; state = { state: 'checking', deviceCode: null, canOpenPage: false, expiresAt: null, account: null, reason: null };
      try {
        const inspection = await transport.inspectRegistrySignIn(operation.controller.signal);
        if (active !== operation) return snapshot();
        state.state = inspection.state === 'signed-in' ? 'signed-in' : inspection.state === 'missing' ? 'idle' : inspection.state === 'stale' ? 'stale' : 'unavailable';
        state.reason = inspection.state === 'signed-in' || inspection.state === 'missing' ? null : inspection.reason || 'stored-sign-in-unverified';
        state.account = inspection.state === 'signed-in' ? accountOf(inspection) : null;
      } catch { if (active === operation) { state.state = 'unavailable'; state.reason = 'provider-unavailable'; } }
      finally { if (active === operation) active = null; }
      return snapshot();
    },
    start() {
      // A retired attempt may still be closing its child. It must not swallow the next click.
      if (active && !active.retired && !active.recheck) return snapshot();
      if (active?.recheck) { active.controller.abort(); active = null; }
      const operation = { controller: new AbortController(), child: null, retired: false, bytes: 0, raw: 0, seen: new Set(), succeeded: false,
        deadline: now() + deadlineMs, code: null, officialPage: false,
        streams: Object.fromEntries(['stdout', 'stderr'].map(key => [key, { decoder: new TextDecoder('utf-8', { fatal: true }), pending: '' }])) };
      operation.closed = new Promise(resolve => { operation.resolveClosed = resolve; });
      active = operation; state = { state: 'checking', deviceCode: null, canOpenPage: false, expiresAt: null, account: null, reason: null };
      operation.timer = setTimer(() => retire(operation, 'expired', 'device-login-expired'), deadlineMs); operation.timer.unref?.();
      void launch(operation); return snapshot();
    },
    cancel() { if (active && !active.retired && !active.recheck) retire(active, 'cancelled'); return snapshot(); },
    async openPage() {
      if (!active || active.retired || state.state !== 'authorizing' || !state.deviceCode || !state.canOpenPage || now() >= active.deadline) throw Error('No active device sign-in page is available.');
      await openPage(REGISTRY_LOGIN_PAGE); return snapshot();
    },
    get pending() { return Boolean(active && !active.recheck) || retiring.size > 0; },
    async close() {
      const operations = new Set(retiring); if (active) operations.add(active);
      service.cancel();
      for (const operation of operations) {
        if (!operation.child) continue;
        let timeout;
        try { await Promise.race([operation.closed, new Promise((_, reject) => { timeout = setTimer(() => reject(Error('Registry sign-in process release is unverified.')), 5000); })]); }
        finally { clearTimer(timeout); }
      }
    },
  };
  return service;
}
