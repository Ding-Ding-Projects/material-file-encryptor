// Shared helpers for driving a staged browser extension in a disposable headless browser profile.
// Nothing here touches the user's own browser profile: every launch uses a new temporary profile
// that is deleted afterwards, and only the staged extension directory is loaded.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {extensionBuildIdentity} from './build-browser-extension.mjs';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const PREFERENCES_KEY = 'mfe-extension-preferences-v1';

/** Finds a Chromium-based browser that can load an unpacked extension: an explicit path first, then Edge and Chrome. */
export function findBrowser(explicit = process.env.MFE_EXTENSION_BROWSER) {
  const candidates = [explicit,
    path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error('No supported browser was found. Set MFE_EXTENSION_BROWSER to an Edge or Chrome executable.');
  return found;
}

/**
 * Re-reads every staged output named in bundle-receipt.json and proves the bytes on disk are the bytes the receipt
 * describes, then recomputes the build identity. Throws on any difference, so evidence can never bind to a build
 * that changed after staging.
 */
export async function verifyStagedExtension(directory) {
  const receipt = JSON.parse(await fs.readFile(path.join(directory, 'bundle-receipt.json'), 'utf8'));
  if (!Array.isArray(receipt.files) || !receipt.files.length || !/^[0-9a-f]{64}$/.test(receipt.buildIdentity || '')) throw new Error('The staged bundle receipt has no build identity. Restage the extension.');
  for (const row of receipt.files) {
    const bytes = await fs.readFile(path.join(directory, row.path));
    if (sha256(bytes) !== row.sha256 || bytes.length !== row.bytes) throw new Error(`Staged file ${row.path} differs from its receipt.`);
  }
  if (extensionBuildIdentity(receipt.files) !== receipt.buildIdentity) throw new Error('The build identity does not match the staged files.');
  const provenanceText = await fs.readFile(path.join(directory, 'vendor/provenance.js'), 'utf8');
  const provenance = JSON.parse(provenanceText.replace(/^export default /, '').replace(/;\s*$/, ''));
  if (provenance.buildIdentity !== receipt.buildIdentity) throw new Error('The provenance module carries a different build identity.');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  return {receipt, provenance, manifest};
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = [];
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const waiter = this.pending.get(message.id);
      if (waiter) { this.pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); }
      else if (message.method) this.events.push(message);
    };
  }
  open() { return new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; }); }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolve, reject) => { this.pending.set(id, {resolve, reject}); setTimeout(() => { if (this.pending.delete(id)) reject(new Error(method + ' timed out')); }, 30000); });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); }); });

/** Launches the browser with only the staged extension loaded, in a new temporary profile. */
export async function launchWithExtension({browser, extensionDirectory}) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-extension-evidence-'));
  const port = await freePort();
  const absolute = path.resolve(extensionDirectory);
  const child = spawn(browser, ['--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--load-extension=${absolute}`, `--disable-extensions-except=${absolute}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--force-device-scale-factor=1', 'about:blank'], {stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  let extensionId = null;
  for (let attempt = 0; attempt < 40 && !extensionId; attempt++) {
    await sleep(500);
    try {
      const targets = await (await fetch(base + '/json/list')).json();
      const worker = targets.find(target => /^chrome-extension:\/\/[a-p]{32}\/background\.js$/.test(target.url));
      if (worker) extensionId = new URL(worker.url).host;
    } catch {}
  }
  const session = {
    child, profile, base, extensionId,
    async version() { return (await fetch(base + '/json/version')).json(); },
    async open(url) {
      const target = await (await fetch(`${base}/json/new?${url}`, {method: 'PUT'})).json();
      const page = new Cdp(target.webSocketDebuggerUrl); await page.open();
      await page.send('Runtime.enable'); await page.send('Page.enable');
      page.errors = () => page.events.filter(event => event.method === 'Runtime.exceptionThrown' || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'))
        .map(event => event.method === 'Runtime.exceptionThrown' ? (event.params.exceptionDetails?.exception?.description || event.params.exceptionDetails?.text) : event.params.args.map(arg => arg.value ?? arg.description).join(' '));
      return page;
    },
    async close() {
      try { const info = await this.version(); const browserSession = new Cdp(info.webSocketDebuggerUrl); await browserSession.open(); await browserSession.send('Browser.close').catch(() => {}); browserSession.close(); } catch {}
      for (let attempt = 0; attempt < 20; attempt++) { try { process.kill(child.pid, 0); await sleep(500); } catch { break; } }
      try { child.kill(); } catch {}
      await fs.rm(profile, {recursive: true, force: true}).catch(() => {});
    }
  };
  if (!extensionId) { await session.close(); throw new Error('The extension service worker did not start in the disposable profile.'); }
  return session;
}

/** Sets the viewport at a fixed device scale and returns a PNG capture with its hash. */
export async function capture(page, {width, height, scale = 1}) {
  // A background tab may not paint, so the captured page is brought to the front first.
  await page.send('Page.bringToFront');
  await page.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
  await sleep(150);
  const shot = await page.send('Page.captureScreenshot', {format: 'png'});
  const bytes = Buffer.from(shot.data, 'base64');
  return {bytes, sha256: sha256(bytes)};
}

/** Parses simple --name value command-line flags. */
export function flags(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    const name = argv[index].slice(2);
    result[name] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}
