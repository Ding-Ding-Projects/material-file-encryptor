// Recaptures the browser extension and documentation website screenshots from the current source, and imports desktop
// application captures from a capture manifest, all into one folder bound to the source commit.
//
// Usage: node scripts/refresh-screenshots.mjs capture [--out docs/images/captures/refresh-<short>] [--extension out/browser-extension]
//                                                      [--site out/site] [--browser <path>] [--only extension|site]
//        node scripts/refresh-screenshots.mjs desktop --desktop-manifest <manifest.json> [--out <same folder>]
//
// `capture` stages nothing itself: run `node scripts/build-browser-extension.mjs` and `node scripts/build-site.mjs` first. It
// loads the staged extension into a disposable headless browser profile, serves the staged site from loopback, drives each
// state through the DevTools protocol, and writes PNG files plus manifest.json (hash, size, tuple, source commit).
// Model-server states use a fake loopback server; no media or screen-capture flags are passed and no real profile is touched.
//
// `desktop` copies desktop captures named by a manifest into <out>/desktop, verifying each file's SHA-256 against the
// manifest, and records them in manifest.json. Desktop images are never captured by this script.
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Cdp, PREFERENCES_KEY, capture, findBrowser, flags, freePort, launchWithExtension, sleep, verifyStagedExtension} from './extension-browser.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();
const pngSize = bytes => ({width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)});

/** The extension states, one row per image. `page` is options or popup; `section` is the workspace section when set. */
export const EXTENSION_STATES = [
  {name: 'home-1280x900-light-en', page: 'options', section: 'home', theme: 'light', language: 'en', width: 1280, height: 900},
  {name: 'home-360x780-dark-bilingual', page: 'options', section: 'home', theme: 'dark', language: 'bilingual', width: 360, height: 780},
  {name: 'popup-380-light-en', page: 'popup', theme: 'light', language: 'en', width: 380, height: 760},
  {name: 'popup-380-dark-bilingual', page: 'popup', theme: 'dark', language: 'bilingual', width: 380, height: 760},
  {name: 'section-connection-1280x900-light-en', page: 'options', section: 'connection', theme: 'light', language: 'en', width: 1280, height: 900},
  {name: 'section-personalization-360x780-dark-bilingual', page: 'options', section: 'personalization', theme: 'dark', language: 'bilingual', width: 360, height: 780},
  {name: 'section-publishing-1280x900-light-en', page: 'options', section: 'publishing', theme: 'light', language: 'en', width: 1280, height: 900},
  {name: 'section-servers-1280x900-light-en', page: 'options', section: 'servers', theme: 'light', language: 'en', width: 1280, height: 900},
  {name: 'models-connected-light-en', page: 'options', section: 'models', theme: 'light', language: 'en', width: 1100, height: 1000, step: 'models-connected'},
  {name: 'models-chat-light-en', page: 'options', section: 'models', theme: 'light', language: 'en', width: 1100, height: 1300, step: 'models-chat'},
  {name: 'status-release-light-en', page: 'options', section: 'status', theme: 'light', language: 'en', width: 1100, height: 1100, step: 'status-release'},
  {name: 'status-coverage-narrow-light-en', page: 'options', section: 'status', theme: 'light', language: 'en', width: 360, height: 900, step: 'status-coverage'},
  {name: 'status-installer-link-light-en', page: 'options', section: 'status', theme: 'light', language: 'en', width: 1100, height: 900, step: 'status-installer'},
  {name: 'status-desktop-unpaired-light-en', page: 'options', section: 'status', theme: 'light', language: 'en', width: 1100, height: 900, step: 'status-desktop'},
  {name: 'offline-documentation-search-light-en', page: 'options', section: 'docs', theme: 'light', language: 'en', width: 1100, height: 900, step: 'offline-docs', offline: true},
  {name: 'matrix-options-connection_minimum_1x_light_yue', page: 'options', section: 'connection', theme: 'light', language: 'yue', width: 360, height: 640},
  {name: 'matrix-options-models_minimum_2x_dark_bilingual', page: 'options', section: 'models', theme: 'dark', language: 'bilingual', width: 360, height: 640, scale: 2},
  {name: 'matrix-popup_minimum_2x_dark_bilingual', page: 'popup', theme: 'dark', language: 'bilingual', width: 360, height: 640, scale: 2},
];

/** The website states: each opens a page of the staged site at one viewport. */
export const SITE_STATES = [
  {name: 'home-1280x900-light-en', url: '/index.html', width: 1280, height: 900},
  {name: 'library-1280x900-light-en', url: '/library.html', width: 1280, height: 900},
  {name: 'home-320x800-dpr2-light-en', url: '/index.html', width: 320, height: 800, scale: 2},
  {name: 'article-local-models-360x800-light-en', url: '/articles/docs--features--workflows--browser-extension-local-models.html', width: 360, height: 800},
];

/** A fake local model server on loopback so the Models states never depend on a real model runtime. */
export function startFakeModelServer() {
  const models = [{name: 'llama3.2:3b', size: 2019393189}, {name: 'qwen2.5:7b', size: 4683087332}, {name: 'phi3:mini', size: 2176178913}];
  const reply = ['A **virtual drive** keeps your files ', 'encrypted on disk.\n\n', '- Unlock it with a password or key file\n', '- Files stay as ciphertext at rest\n\n', 'Read the [project page](https://github.com/Ding-Ding-Projects/material-file-encryptor) or ', '[this link](javascript:alert(1)) which stays plain text.'];
  const server = http.createServer((request, response) => {
    const headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'};
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return; }
    const url = new URL(request.url, 'http://x').pathname;
    const json = value => { response.writeHead(200, {...headers, 'content-type': 'application/json'}); response.end(JSON.stringify(value)); };
    if (url === '/api/version') return json({version: '0.5.7'});
    if (url === '/api/tags') return json({models});
    if (url === '/api/ps') return json({models: [{name: 'llama3.2:3b'}]});
    if (url === '/api/chat') {
      request.resume();
      response.writeHead(200, {...headers, 'content-type': 'application/x-ndjson'});
      let index = 0;
      const timer = setInterval(() => {
        if (index < reply.length) response.write(JSON.stringify({message: {role: 'assistant', content: reply[index++]}, done: false}) + '\n');
        else { response.write(JSON.stringify({message: {role: 'assistant', content: ''}, done: true}) + '\n'); response.end(); clearInterval(timer); }
      }, 40);
      return;
    }
    response.writeHead(404, headers); response.end('{}');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port})));
}

const setField = (id, value) => `(()=>{const f=document.getElementById(${JSON.stringify(id)});f.value=${JSON.stringify(value)};f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`;
const click = id => `document.getElementById(${JSON.stringify(id)}).click()`;
const scrollTo = (id, block = 'start') => `(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:${JSON.stringify(block)}});return true;})()`;

/** Runs a state's scripted step after its page loaded and returns once the page settled. */
async function runStep(page, state, fake) {
  const wait = ms => sleep(ms);
  if (state.step === 'models-connected' || state.step === 'models-chat') {
    await page.eval('chrome.permissions.request=async()=>true;true');
    await page.eval(setField('models-port', String(fake.port)));
    await page.eval(click('models-connect'));
    await wait(1800);
    if (state.step === 'models-chat') {
      await page.eval(`(()=>{const s=document.getElementById('chat-model');s.value='llama3.2:3b';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      await page.eval(setField('chat-prompt', 'In two short lines, what does the virtual drive do with my files?'));
      await page.eval(click('chat-send'));
      await wait(2500);
    }
  } else if (state.step === 'status-release' || state.step === 'status-installer') {
    await page.eval(click('release-check'));
    for (let attempt = 0; attempt < 30; attempt++) { await wait(500); if (await page.eval("!document.getElementById('release-result').hidden")) break; }
    await wait(500);
    await page.eval(scrollTo(state.step === 'status-release' ? 'release-result' : 'release-installer', state.step === 'status-release' ? 'start' : 'center'));
  } else if (state.step === 'status-coverage') {
    await page.eval(setField('coverage-search', 'language'));
    await wait(600);
    await page.eval(scrollTo('coverage-search'));
  } else if (state.step === 'status-desktop') {
    await page.eval(click('desktop-refresh'));
    await wait(1200);
    await page.eval(scrollTo('desktop-state', 'center'));
  } else if (state.step === 'offline-docs') {
    await page.eval(setField('docs-search', 'Local access'));
    await wait(900);
  }
  await wait(300);
}

async function captureExtension({extension, browser, directory, record, sourceCommit}) {
  const {receipt, manifest} = await verifyStagedExtension(extension);
  const fake = await startFakeModelServer();
  const sessions = {}, pages = new Map();
  try {
    sessions.main = await launchWithExtension({browser, extensionDirectory: extension});
    sessions.offline = await launchWithExtension({browser, extensionDirectory: extension, extraArgs: ['--proxy-server=127.0.0.1:9']});
    for (const state of EXTENSION_STATES) {
      const session = state.offline ? sessions.offline : sessions.main;
      const origin = `chrome-extension://${session.extensionId}`;
      const url = state.page === 'popup' ? origin + '/popup.html' : origin + '/options.html' + (state.section === 'home' ? '' : '#' + state.section);
      // One page per session: a page opened per state can rewrite the stored preferences on unload and override the ones just set.
      const page = pages.get(session) || await session.open(origin + '/options.html');
      pages.set(session, page);
      try {
        const prefs = {version: 3, language: state.language, theme: state.theme, tab: state.section || 'home', funnyEnglish: 5, funnyCantonese: 5, emoji: false, displayName: '', accent: ''};
        await page.send('Emulation.setDeviceMetricsOverride', {width: state.width, height: state.height, deviceScaleFactor: state.scale || 1, mobile: false});
        // A hash-only change keeps the old document, which would write its stale preferences back. Set them from a neutral page.
        await page.send('Page.navigate', {url: origin + (state.page === 'popup' ? '/options.html' : '/popup.html')});
        await sleep(900);
        await page.eval(`localStorage.setItem(${JSON.stringify(PREFERENCES_KEY)},${JSON.stringify(JSON.stringify(prefs))})`);
        await page.send('Page.navigate', {url});
        await sleep(state.page === 'popup' ? 1100 : 1500);
        const before = page.errors().length;
        await runStep(page, state, fake);
        const checks = await page.eval(`(()=>{const r=document.documentElement;return {language:r.lang,theme:r.dataset.theme||null,view:r.dataset.view||null,overflow:r.scrollWidth>innerWidth+1,version:chrome.runtime.getManifest().version};})()`);
        const shot = await capture(page, {width: state.width, height: state.height, scale: state.scale || 1});
        const file = path.join(directory, 'extension', state.name + '.png');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, shot.bytes);
        record.push({kind: 'extension', name: state.name, file: path.relative(directory, file).replaceAll('\\', '/'), sha256: shot.sha256, bytes: shot.bytes.length, ...pngSize(shot.bytes),
          surface: state.page === 'popup' ? 'popup' : 'options: ' + (state.section || 'home'), theme: state.theme, language: state.language, scale: state.scale || 1,
          viewport: [state.width, state.height], sourceCommit, buildIdentity: receipt.buildIdentity, extensionVersion: manifest.version, checks, errors: page.errors().slice(before)});
      } catch (error) { throw new Error(`${state.name}: ${error.message}`); }
    }
  } finally {
    for (const page of pages.values()) page.close();
    for (const session of Object.values(sessions)) await session.close();
    fake.server.close();
  }
}

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff'};
function serveDirectory(root) {
  const server = http.createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.join(root, pathname);
      if (!file.startsWith(root)) throw new Error('outside');
      const bytes = await fs.readFile(file);
      response.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream'}); response.end(bytes);
    } catch { response.writeHead(404); response.end('not found'); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, origin: 'http://127.0.0.1:' + server.address().port})));
}

async function captureSite({site, browser, directory, record, sourceCommit}) {
  const root = path.resolve(site);
  const provenance = JSON.parse(await fs.readFile(path.join(root, 'site-provenance.json'), 'utf8'));
  const {server, origin} = await serveDirectory(root);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-site-refresh-'));
  const port = await freePort();
  const child = spawn(browser, ['--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--force-device-scale-factor=1', 'about:blank'], {stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 40; attempt++) { await sleep(500); try { await fetch(base + '/json/version'); break; } catch {} }
    for (const state of SITE_STATES) {
      const target = await (await fetch(`${base}/json/new?about:blank`, {method: 'PUT'})).json();
      const page = new Cdp(target.webSocketDebuggerUrl); await page.open();
      try {
        await page.send('Runtime.enable'); await page.send('Page.enable');
        await page.send('Emulation.setDeviceMetricsOverride', {width: state.width, height: state.height, deviceScaleFactor: state.scale || 1, mobile: false});
        await page.send('Page.navigate', {url: origin + state.url});
        await sleep(2600);
        const checks = await page.eval('({title:document.title,overflow:document.documentElement.scrollWidth>innerWidth+1,language:document.documentElement.lang})');
        await page.send('Page.bringToFront');
        const shot = await page.send('Page.captureScreenshot', {format: 'png'});
        const bytes = Buffer.from(shot.data, 'base64');
        const file = path.join(directory, 'site', state.name + '.png');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, bytes);
        record.push({kind: 'site', name: state.name, file: path.relative(directory, file).replaceAll('\\', '/'), sha256: digest(bytes), bytes: bytes.length, ...pngSize(bytes),
          surface: 'documentation site: ' + state.url, theme: 'light', language: 'en', scale: state.scale || 1, viewport: [state.width, state.height], sourceCommit,
          siteBuiltFrom: provenance.sourceCommit, siteSourceDirty: provenance.sourceDirty, checks});
      } finally { page.close(); }
    }
  } finally {
    try { const info = await (await fetch(base + '/json/version')).json(); const b = new Cdp(info.webSocketDebuggerUrl); await b.open(); await b.send('Browser.close').catch(() => {}); b.close(); } catch {}
    await sleep(1500);
    try { child.kill(); } catch {}
    server.close();
    await fs.rm(profile, {recursive: true, force: true}).catch(() => {});
  }
}

async function readManifest(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function writeManifest(file, manifest) { await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n'); }

/** Imports desktop captures from another lane's manifest, proving each file against the hash the manifest records. */
export async function importDesktop({manifestPath, directory}) {
  const source = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const rows = source.captures || source.images || source.records;
  if (!Array.isArray(rows) || !rows.length) throw new Error('The desktop manifest lists no captures.');
  const baseDirectory = path.dirname(path.resolve(manifestPath));
  const manifestFile = path.join(directory, 'manifest.json');
  const manifest = (await readManifest(manifestFile)) || {schemaVersion: 1, sourceCommit: git('rev-parse', 'HEAD'), captures: []};
  manifest.captures = manifest.captures.filter(row => row.kind !== 'desktop');
  for (const row of rows) {
    const from = path.resolve(baseDirectory, row.file || row.path);
    const bytes = await fs.readFile(from);
    const expected = row.sha256 || row.captureSha256;
    if (expected && digest(bytes) !== expected) throw new Error(`Desktop capture ${row.file || row.path} differs from its manifest hash.`);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Desktop capture ${row.file || row.path} is not a PNG.`);
    const name = path.basename(from);
    const target = path.join(directory, 'desktop', name);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, bytes);
    manifest.captures.push({kind: 'desktop', name: name.replace(/\.png$/, ''), file: 'desktop/' + name, sha256: digest(bytes), bytes: bytes.length, ...pngSize(bytes), theme: row.theme ?? null, language: row.language ?? null, scale: row.scale ?? row.dpiScale ?? null, state: row.state ?? row.id ?? null, sourceManifest: path.basename(manifestPath)});
  }
  manifest.desktopSource = {manifest: path.basename(manifestPath), sourceCommit: source.sourceCommit ?? null, executableSha256: source.executableSha256 ?? source.buildSha256 ?? null};
  await writeManifest(manifestFile, manifest);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...rest] = process.argv.slice(2);
  const options = flags(rest);
  const sourceCommit = git('rev-parse', 'HEAD');
  const directory = path.resolve(options.out || `docs/images/captures/refresh-${sourceCommit.slice(0, 7)}`);
  await fs.mkdir(directory, {recursive: true});
  if (command === 'capture') {
    const browser = options.browser ? findBrowser(options.browser) : findBrowser();
    const record = [];
    if (options.only !== 'site') await captureExtension({extension: options.extension || 'out/browser-extension', browser, directory, record, sourceCommit});
    if (options.only !== 'extension') await captureSite({site: options.site || 'out/site', browser, directory, record, sourceCommit});
    const manifestFile = path.join(directory, 'manifest.json');
    const previous = (await readManifest(manifestFile)) || {schemaVersion: 1, captures: []};
    const kept = previous.captures.filter(row => !record.some(item => item.kind === row.kind));
    await writeManifest(manifestFile, {...previous, schemaVersion: 1, sourceCommit, captures: [...kept, ...record].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))});
    console.log(`${record.length} captures written under ${directory}`);
    for (const row of record) console.log(`- ${row.file} ${row.width}x${row.height} ${row.sha256.slice(0, 12)}${row.errors?.length ? ' ERRORS: ' + row.errors.join(' | ') : ''}`);
  } else if (command === 'desktop') {
    if (!options['desktop-manifest']) throw new Error('--desktop-manifest <path> is required.');
    const manifest = await importDesktop({manifestPath: options['desktop-manifest'], directory});
    console.log(`${manifest.captures.filter(row => row.kind === 'desktop').length} desktop captures imported into ${directory}/desktop`);
  } else {
    console.log('Usage: refresh-screenshots.mjs capture|desktop [options]');
    process.exitCode = 2;
  }
}
