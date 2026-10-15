#!/usr/bin/env node
// Runtime Material Design 3 and motion audit.
//
// scripts/audit-material-motion.mjs proves the sources; this script proves what actually renders. It drives a
// disposable headless Edge or Chrome profile over the DevTools protocol and, in each page state, runs the page-side
// audit in scripts/runtime-motion-page.mjs:
//   * every visible interactive element (native, ARIA role, tabindex, Material Web, shadow roots included) is
//     classified as a Material control, a documented allowlisted native element, or a finding;
//   * each interactive element must show a transition, an animation, a ripple or a state layer;
//   * dialogs, panels and side sheets that open must run an enter animation;
//   * with prefers-reduced-motion: reduce emulated, no visible element may keep a transition or animation.
//
// Usage: node scripts/audit-runtime-motion.mjs [--surface extension|site|renderer|all] [--quick] [--out receipt.json]
//        [--browser <path>] [--extension out/browser-extension] [--site out/site]
// The receipt holds selector paths, kinds, reasons and counts only: no local paths and no page text beyond labels of
// at most 32 characters.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Cdp, PREFERENCES_KEY, findBrowser, flags, freePort, launchWithExtension, sleep, verifyStagedExtension} from './extension-browser.mjs';
import {pageAuditSource, probeEnterSource} from './runtime-motion-page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Native elements that genuinely cannot be Material Web components at runtime. Every entry needs a reason. This
// mirrors the static allowlist in audit-material-motion.mjs; once the documentation site upgrades its no-script
// baseline, nothing native remains there, so the site needs no entry.
export const RUNTIME_ALLOWLIST = [
  {id: 'hidden-file-input', selector: 'input[type=file]', skipMotion: true, reason: 'A file input only backs the Material button that opens the system file picker.'},
  {id: 'platform-picker-input', selector: 'input', host: 'mfe-date-field,mfe-file-picker', skipMotion: true, reason: 'The one-pixel, tab-order-free input inside mfe-date-field and mfe-file-picker is the platform date and file picker engine; the visible control is the Material outlined field and button drawn over it.'},
  {id: 'home-card', selector: 'button.home-card', reason: 'Home destination cards are tab buttons drawn as Material outlined cards with a hand-built state layer, because Material Web has no card-button component.'}
];

export const THEMES = ['light', 'dark'];
export const VIEWPORTS = [[1280, 800], [360, 780]];

const auditExpression = options => `(${pageAuditSource})(${JSON.stringify({allowlist: RUNTIME_ALLOWLIST, ...options})})`;
const probeExpression = (trigger, selector, windowMs = 600) => `(${probeEnterSource})(${JSON.stringify(trigger)},${JSON.stringify(selector)},${windowMs})`;

/** Collects results per surface, merging identical findings across states. */
export class MotionReport {
  constructor() { this.surfaces = new Map(); }
  surface(name) {
    if (!this.surfaces.has(name)) this.surfaces.set(name, {name, states: 0, interactiveChecked: 0, examined: 0, byClass: {}, findings: new Map(), reducedMotion: {states: 0, leaks: new Map(), libraryInternal: {}, runningAfterEmulation: 0}, enter: []});
    return this.surfaces.get(name);
  }
  addNormal(name, state, result) {
    const surface = this.surface(name);
    surface.states++; surface.examined += result.counts.examined; surface.interactiveChecked += result.counts.interactive;
    for (const [key, value] of Object.entries(result.counts.byClass)) surface.byClass[key] = (surface.byClass[key] || 0) + value;
    for (const finding of result.findings) {
      const key = `${finding.kind}|${finding.path}`;
      const row = surface.findings.get(key) || {...finding, states: []};
      if (row.states.length < 6) row.states.push(state);
      surface.findings.set(key, row);
    }
  }
  addReduced(name, state, result) {
    const reduced = this.surface(name).reducedMotion;
    reduced.states++; reduced.runningAfterEmulation += result.runningAnimations;
    for (const leak of result.leaks) {
      const key = `${leak.kind}|${leak.path}`;
      const row = reduced.leaks.get(key) || {...leak, states: []};
      if (row.states.length < 6) row.states.push(state);
      reduced.leaks.set(key, row);
    }
    for (const [tag, count] of Object.entries(result.libraryInternal)) reduced.libraryInternal[tag] = Math.max(reduced.libraryInternal[tag] || 0, count);
  }
  addEnter(name, state, surfaceSelector, result) {
    this.surface(name).enter.push({state, surface: surfaceSelector, found: result.found, via: result.via});
  }
  toJSON() {
    return [...this.surfaces.values()].map(surface => {
      const enterFailures = surface.enter.filter(row => !row.found);
      return {
        name: surface.name, states: surface.states, examinedElements: surface.examined, interactiveElementsChecked: surface.interactiveChecked,
        classification: surface.byClass,
        findings: [...surface.findings.values()],
        enterAnimations: {probed: surface.enter.length, animated: surface.enter.length - enterFailures.length, missing: enterFailures, probes: surface.enter},
        reducedMotion: {states: surface.reducedMotion.states, libraryInternalNote: 'Transitions inside Material Web shadow roots (state layers, ripples, field labels, switch handles) cannot be restyled by the page. They are listed by element tag in libraryInternalTags, not counted as findings, and disclosed as a limit.', leaks: [...surface.reducedMotion.leaks.values()], libraryInternalTags: surface.reducedMotion.libraryInternal, runningAnimationsAfterEmulation: surface.reducedMotion.runningAfterEmulation}
      };
    });
  }
  /** Findings that fail the audit: unclassified or motionless controls, missing enter animations and reduced-motion leaks. */
  failureCount() {
    return this.toJSON().reduce((sum, surface) => sum + surface.findings.length + surface.enterAnimations.missing.length + surface.reducedMotion.leaks.length + surface.reducedMotion.runningAnimationsAfterEmulation, 0);
  }
}

const reducedMedia = value => ({features: [{name: 'prefers-reduced-motion', value}]});

/** Runs the normal audit and then the reduced-motion audit for the current page state. */
export async function auditState(page, report, surface, state, {reduced = true} = {}) {
  report.addNormal(surface, state, await page.eval(auditExpression({mode: 'normal'})));
  if (!reduced) return;
  await page.send('Emulation.setEmulatedMedia', reducedMedia('reduce'));
  await sleep(120);
  report.addReduced(surface, state, await page.eval(auditExpression({mode: 'reduced'})));
  await page.send('Emulation.setEmulatedMedia', reducedMedia('no-preference'));
}

export async function probe(page, report, surface, state, trigger, selector, windowMs) {
  const result = await page.eval(probeExpression(trigger, selector, windowMs));
  report.addEnter(surface, state, selector, result);
  return result;
}

async function setViewport(page, width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  await sleep(150);
}
const setScheme = (page, theme) => page.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: theme}, {name: 'prefers-reduced-motion', value: 'no-preference'}]});

/** Launches a plain (extension-free) headless browser in a disposable profile. */
export async function launchPlain({browser = findBrowser()} = {}) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-runtime-motion-'));
  const port = await freePort();
  const child = spawn(browser, ['--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--force-device-scale-factor=1', 'about:blank'], {stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 40; attempt++) { await sleep(300); try { await (await fetch(base + '/json/version')).json(); break; } catch {} }
  return {
    base, profile,
    async version() { return (await fetch(base + '/json/version')).json(); },
    async open(url) {
      const target = await (await fetch(`${base}/json/new?${url}`, {method: 'PUT'})).json();
      const page = new Cdp(target.webSocketDebuggerUrl); await page.open();
      await page.send('Runtime.enable'); await page.send('Page.enable'); await page.send('Page.bringToFront');
      page.errors = () => page.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => String(event.params.exceptionDetails?.exception?.description || event.params.exceptionDetails?.text).slice(0, 160));
      return page;
    },
    async close() {
      try { const info = await this.version(); const control = new Cdp(info.webSocketDebuggerUrl); await control.open(); await control.send('Browser.close').catch(() => {}); control.close(); } catch {}
      for (let attempt = 0; attempt < 20; attempt++) { try { process.kill(child.pid, 0); await sleep(300); } catch { break; } }
      try { child.kill(); } catch {}
      await fs.rm(profile, {recursive: true, force: true}).catch(() => {});
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Browser extension
// ---------------------------------------------------------------------------------------------------------------
export async function auditExtension(report, {extension = path.join(root, 'out/browser-extension'), browser, quick = false} = {}) {
  const {receipt: bundle, manifest} = await verifyStagedExtension(extension);
  const session = await launchWithExtension({browser: browser || findBrowser(), extensionDirectory: extension});
  const meta = {buildIdentity: bundle.buildIdentity, extensionVersion: manifest.version, browser: (await session.version()).Browser};
  try {
    const origin = `chrome-extension://${session.extensionId}`;
    const page = await session.open(origin + '/options.html');
    await sleep(1800);
    const sections = [...new Set(await page.eval("[...document.querySelectorAll('[data-tab]')].map(node=>node.dataset.tab).filter(id=>/^[a-z-]+$/.test(id))"))];
    const prefsFor = (theme, tab) => ({version: 3, language: 'en', theme, tab, funnyEnglish: 5, funnyCantonese: 5, emoji: false, displayName: '', accent: ''});
    const load = async (theme, tab, url, ms = 1300) => {
      await page.eval(`localStorage.setItem(${JSON.stringify(PREFERENCES_KEY)},${JSON.stringify(JSON.stringify(prefsFor(theme, tab)))})`);
      await page.send('Page.navigate', {url}); await sleep(ms);
    };
    for (const theme of quick ? ['light'] : THEMES) for (const [width, height] of quick ? VIEWPORTS : VIEWPORTS) {
      await setViewport(page, width, height); await setScheme(page, theme);
      const tag = `${theme} ${width}x${height}`;
      await load(theme, 'home', origin + '/options.html');
      await auditState(page, report, 'extension', `home ${tag}`);
      for (const section of sections) {
        // Opening the section from Home exercises the enter animation of the revealed panel.
        await load(theme, 'home', origin + '/options.html');
        await probe(page, report, 'extension', `open ${section} ${tag}`, `document.querySelector('.home-card[data-tab=${section}]').click()`, `#panel-${section}`);
        await sleep(450);
        await auditState(page, report, 'extension', `${section} ${tag}`);
      }
      // Overlays on the Home view: palette, message preview, export and confirmation dialogs, and the note side sheet.
      await load(theme, 'home', origin + '/options.html');
      for (const [id, trigger] of [['palette', "document.getElementById('palette-open').click()"], ['message-preview', "void document.getElementById('message-preview').show()"], ['export-dialog', "void document.getElementById('export-dialog').show()"], ['confirm-dialog', "void document.getElementById('confirm-dialog').show()"]]) {
        await probe(page, report, 'extension', `${id} ${tag}`, trigger, `#${id}`, 700);
        await sleep(500);
        await auditState(page, report, 'extension', `${id} open ${tag}`);
        await page.eval(`document.getElementById('${id}').close();0`); await sleep(400);
      }
      await load(theme, 'notes', origin + '/options.html#notes');
      await probe(page, report, 'extension', `note sheet ${tag}`, "document.getElementById('note-new').click()", '#note-sheet', 700);
      await sleep(450);
      await auditState(page, report, 'extension', `note sheet open ${tag}`);
      await load(theme, 'home', origin + '/popup.html', 900);
      await auditState(page, report, 'extension', `popup ${tag}`);
    }
    meta.scriptErrors = page.errors().length;
    page.close();
  } finally { await session.close(); }
  return meta;
}

// ---------------------------------------------------------------------------------------------------------------
// Documentation site
// ---------------------------------------------------------------------------------------------------------------
const MIME = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'};
export function serveStatic(directory) {
  const base = path.resolve(directory);
  const server = createServer(async (request, response) => {
    const file = path.resolve(base, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
    try { const bytes = await fs.readFile(file); response.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream'); response.end(bytes); } catch { response.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, origin: `http://127.0.0.1:${server.address().port}`})));
}

/**
 * Waits until the page has stopped changing: the counts of native controls and Material controls are unchanged for
 * three consecutive polls and at least one Material control exists. The documentation site ships no-script baseline
 * markup that its script upgrades after load, so auditing earlier would measure the baseline, not the rendered page.
 * A page that never upgrades still reaches the timeout and is audited as it stands, so it is still reported.
 */
export async function settle(page, {timeoutMs = 12000, stableFor = 3} = {}) {
  const expression = "document.querySelectorAll('button,select,input:not([type=hidden]),textarea').length+':'+document.querySelectorAll('[class]').length+':'+[...document.querySelectorAll('*')].filter(node=>node.localName.startsWith('md-')).length";
  let last = '', stable = 0;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(400);
    let now = ''; try { now = await page.eval(expression); } catch { now = ''; }
    const materialCount = Number(now.split(':')[2] || 0);
    stable = now && now === last && materialCount > 0 ? stable + 1 : 0;
    last = now;
    if (stable >= stableFor) return true;
  }
  return false;
}

/** Evenly spaced sample of an ordered list, always including the first and last entries. */
export const sample = (list, count) => list.length <= count ? [...list] : Array.from({length: count}, (_, index) => list[Math.round(index * (list.length - 1) / (count - 1))]);

export async function auditSite(report, {site = path.join(root, 'out/site'), browser, quick = false} = {}) {
  const {server, origin} = await serveStatic(site);
  const session = await launchPlain({browser});
  const meta = {browser: (await session.version()).Browser};
  try {
    const top = ['index.html', 'library.html', 'wiki.html', 'workspace.html', 'gallery.html'];
    const categories = (await fs.readdir(path.join(site, 'categories'))).filter(name => name.endsWith('.html')).sort().map(name => 'categories/' + name);
    const articles = (await fs.readdir(path.join(site, 'articles'))).filter(name => name.endsWith('.html')).sort().map(name => 'articles/' + name);
    const sampledCategories = sample(categories, quick ? 2 : 5), sampledArticles = sample(articles, quick ? 3 : 10);
    meta.routes = {topLevel: top.length, categoriesAvailable: categories.length, categoriesSampled: sampledCategories.length, articlesAvailable: articles.length, articlesSampled: sampledArticles.length, sampling: 'evenly spaced over the sorted file list, first and last included'};
    const page = await session.open('about:blank');
    for (const [width, height] of [[1280, 800], [360, 780]]) {
      await setViewport(page, width, height);
      const routes = [...top.map(route => ({route, themes: quick ? ['light'] : THEMES})), ...[...sampledCategories, ...sampledArticles].map(route => ({route, themes: ['light']}))];
      for (const {route, themes} of routes) for (const theme of themes) {
        await setScheme(page, theme);
        await page.send('Page.navigate', {url: `${origin}/${route}`}); await settle(page);
        const state = `${route} ${theme} ${width}x${height}`;
        await auditState(page, report, 'site', state);
        if (top.includes(route)) {
          // The page-tools panel is the site's settings surface; opening it must animate and expose only Material controls.
          const hasTools = await page.eval("!!document.getElementById('page-tools-toggle')");
          if (hasTools) {
            await probe(page, report, 'site', `page tools ${state}`, "document.getElementById('page-tools-toggle').click()", '#page-tools-panel', 700);
            await sleep(500);
            await auditState(page, report, 'site', `page tools open ${state}`);
          }
        }
      }
    }
    meta.scriptErrors = page.errors().length;
    page.close();
  } finally { await session.close(); await new Promise(resolve => server.close(resolve)); }
  return meta;
}

// ---------------------------------------------------------------------------------------------------------------
// Desktop renderer, served from source with the preload bridge stubbed. This is source-fixture evidence, not
// installed-application evidence.
// ---------------------------------------------------------------------------------------------------------------
export async function auditRenderer(report, {browser, quick = false} = {}) {
  const {serveRendererFixture} = await import('./test-renderer-browser.mjs');
  const {rendererFeatureFixtureScript} = await import('../test/helpers/renderer-feature-fixture.js');
  const server = createServer(serveRendererFixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const session = await launchPlain({browser});
  const meta = {browser: (await session.version()).Browser, scope: 'source renderer with a stubbed preload bridge; the installed application is not covered'};
  try {
    const page = await session.open('about:blank');
    const stub = rendererFeatureFixtureScript(featureFixture => {
      const clone = value => JSON.parse(JSON.stringify(value));
      window.testState = {locked: true, mounted: false, storageDir: '', cacheDir: 'C:\\EncryptedCache', driveLetter: 'M:', partSizeBytes: 10485760, availableDriveLetters: ['M:', 'N:'], files: [], driver: {available: true}, startup: true, autoUnlock: false, sync: {running: false}, defaults: {cacheDir: 'C:\\EncryptedCache', driveLetter: 'M:'}};
      let subscriber = () => {};
      const change = patch => { Object.assign(window.testState, patch); subscriber(clone(window.testState)); return clone(window.testState); };
      window.pushState = change;
      window.drive = {
        ...featureFixture.bridge,
        history: async () => [{id: 'version-1', entryId: 'file-1', path: 'notes.txt', timestampUtc: '2026-01-01', length: 4096, isDirectory: false, deleted: false, isAvailable: true}],
        recycled: async () => [{id: 'deleted-1', entryId: 'file-2', path: 'deleted.txt', timestampUtc: '2026-01-01', length: 20, isDirectory: false, deleted: true, isAvailable: true}],
        status: async () => clone(window.testState), onStatus: callback => { subscriber = callback; return () => {}; },
        chooseFolder: async () => 'C:\\EncryptedStorage', chooseFiles: async () => ['C:\\Import\\notes.txt'], chooseExport: async () => 'C:\\Export\\notes.txt', chooseKeyFile: async () => 'C:\\Keys\\test.key', generateKeyFile: async () => 'C:\\Keys\\generated.key',
        create: async value => change({...value, locked: false, mounted: true}), unlock: async value => change({...value, locked: false, mounted: true}),
        lock: async () => { if (window.blockLock) throw new Error('Close open files before locking the drive.'); return change({locked: true, mounted: false, files: []}); },
        mount: async () => change({mounted: true}),
        importFiles: async () => change({files: [{id: 'file-1', path: 'notes.txt', size: 4096, modified: '2026-01-01', partCount: 1, partSizeBytes: 10485760, offline: false}]}),
        open: async () => {}, openExplorer: async () => {}, exportFile: async () => {}, keepOffline: async () => change({}), releaseOffline: async () => change({}),
        sync: async () => change({sync: {running: false, lastSync: '2026-01-01'}}), setPartSize: async value => change({partSizeBytes: value}), resplit: async () => {},
        setStartup: async value => change({startup: value}), setAutoUnlock: async value => change({autoUnlock: value}), forgetSavedCredential: async () => change({autoUnlock: false}),
        forceLock: async () => change({locked: true, mounted: false, files: []}), windowControl: async () => {}, openExternal: async () => {}, saveVersion: async () => {}, restoreVersion: async () => {}
      };
    });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {source: `window.__recordRendererFixture=async()=>{};${stub}`});
    for (const [width, height] of VIEWPORTS) for (const theme of quick ? ['light'] : THEMES) {
      await setViewport(page, width, height); await setScheme(page, theme);
      await page.send('Page.navigate', {url: origin}); await sleep(2800);
      const tag = `${theme} ${width}x${height}`;
      await auditState(page, report, 'renderer', `home ${tag}`);
      const rail = "document.querySelector('mfe-navigation-rail')";
      const destinations = await page.eval(`[...${rail}.nodes.keys()]`);
      meta.destinations = destinations;
      const menuOpen = "!!document.querySelector('mfe-context-menu')?.shadowRoot?.querySelector('md-menu[open]')";
      const visibleView = "[...document.querySelectorAll('[id^=view-]:not([hidden])')].map(node=>node.id).find(id=>/^view-[a-z-]+$/.test(id)&&!id.endsWith('heading'))||''";
      const click = destination => page.eval(`${rail}.nodes.get(${JSON.stringify(destination)}).click()`);
      const openDestination = async destination => { await click(destination); await sleep(700); };
      for (const destination of destinations) {
        await openDestination('drive');
        const before = await page.eval(visibleView);
        await click(destination); await sleep(600);
        if (await page.eval(menuOpen)) {
          // A group destination opens a context menu: it must animate in, expose only Material items, and each item opens a view.
          await page.eval("document.body.click();0"); await sleep(400);
          await openDestination('drive');
          await probe(page, report, 'renderer', `${destination} menu ${tag}`, `document.querySelector('mfe-navigation-rail').nodes.get(${JSON.stringify(destination)}).click()`, 'mfe-context-menu >>> md-menu', 700);
          await sleep(500);
          await auditState(page, report, 'renderer', `${destination} menu open ${tag}`);
          const items = await page.eval("document.querySelector('mfe-context-menu').shadowRoot.querySelectorAll('md-menu-item').length");
          for (let index = 0; index < items; index++) {
            await openDestination('drive');
            await click(destination); await sleep(600);
            await page.eval(`document.querySelector('mfe-context-menu').shadowRoot.querySelectorAll('md-menu-item')[${index}].click()`); await sleep(900);
            const view = await page.eval(visibleView);
            await auditState(page, report, 'renderer', `${destination} item ${index + 1} ${view} ${tag}`);
          }
        } else {
          if (!['drive', 'offline'].includes(destination)) {
            await openDestination('drive');
            await probe(page, report, 'renderer', `open ${destination} ${tag}`, `document.querySelector('mfe-navigation-rail').nodes.get(${JSON.stringify(destination)}).click()`, `#view-${destination}`, 700);
            await sleep(500);
          }
          await auditState(page, report, 'renderer', `${destination} ${tag}`);
        }
      }
      // Dialogs: the create-drive dialog and the confirmation dialog.
      await openDestination('drive');
      for (const [id, trigger] of [['vault-dialog', "document.getElementById('create-button').click()"], ['confirm-dialog', "void document.getElementById('confirm-dialog').showModal()"]]) {
        await probe(page, report, 'renderer', `${id} ${tag}`, trigger, `#${id}`, 800);
        await sleep(500);
        await auditState(page, report, 'renderer', `${id} open ${tag}`);
        await page.eval(`document.getElementById('${id}').close();0`); await sleep(500);
      }
      // Unlocked drive with files, so the file list, force-lock button and offline controls render.
      await page.eval("window.pushState({locked:false,mounted:true,files:[{id:'file-1',path:'notes.txt',size:4096,modified:'2026-01-01',partCount:1,partSizeBytes:10485760,offline:false}]})"); await sleep(900);
      await auditState(page, report, 'renderer', `drive unlocked ${tag}`);
    }
    meta.scriptErrors = page.errors();
    page.close();
  } finally { await session.close(); await new Promise(resolve => server.close(resolve)); }
  return meta;
}

// ---------------------------------------------------------------------------------------------------------------
export function sanitize(value) {
  const text = JSON.stringify(value);
  return JSON.parse(text.replaceAll(root.replaceAll('\\', '\\\\'), '<repo>').replaceAll(os.tmpdir().replaceAll('\\', '\\\\'), '<tmp>'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = flags(process.argv.slice(2));
  const wanted = options.surface && options.surface !== true ? options.surface : 'all';
  const browser = options.browser && options.browser !== true ? findBrowser(options.browser) : undefined;
  const quick = Boolean(options.quick);
  const report = new MotionReport();
  const meta = {};
  const run = async (name, fn) => { if (wanted === 'all' || wanted === name) { try { meta[name] = await fn(); } catch (error) { meta[name] = {error: String(error?.message || error).slice(0, 400)}; } } };
  await run('extension', () => auditExtension(report, {extension: options.extension && options.extension !== true ? options.extension : undefined, browser, quick}));
  await run('site', () => auditSite(report, {site: options.site && options.site !== true ? options.site : undefined, browser, quick}));
  await run('renderer', () => auditRenderer(report, {browser, quick}));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const surfaces = report.toJSON();
  const failures = report.failureCount();
  const errored = Object.values(meta).some(row => row?.error);
  const receipt = sanitize({schemaVersion: 1, kind: 'runtime-motion-audit', sourceCommit, quick, generatedAtUtc: new Date().toISOString(), allowlist: RUNTIME_ALLOWLIST.map(({id, selector, host, reason}) => ({id, selector, ...(host ? {host} : {}), reason})), meta, surfaces, totalFailures: failures, verdict: errored ? 'incomplete' : failures ? 'findings' : 'clean'});
  for (const surface of surfaces) console.log(`${surface.name}: ${surface.states} states, ${surface.interactiveElementsChecked} interactive elements checked, ${surface.findings.length} findings, enter ${surface.enterAnimations.animated}/${surface.enterAnimations.probed}, reduced-motion leaks ${surface.reducedMotion.leaks.length}`);
  for (const [name, row] of Object.entries(meta)) if (row?.error) console.log(`${name} ERROR: ${row.error}`);
  if (options.out && options.out !== true) { await fs.mkdir(path.dirname(path.resolve(options.out)), {recursive: true}); await fs.writeFile(options.out, JSON.stringify(receipt, null, 2) + '\n'); console.log('Receipt: ' + options.out); }
  if (options.verbose) console.log(JSON.stringify(receipt.surfaces.map(s => ({name: s.name, findings: s.findings, enterMissing: s.enterAnimations.missing, leaks: s.reducedMotion.leaks.slice(0, 20), lib: s.reducedMotion.libraryInternalTags, classification: s.classification})), null, 1));
  process.exitCode = errored ? 2 : failures ? 1 : 0;
}
