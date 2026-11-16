// Source-fixture page for the workspace shell. It serves the renderer from source and replaces the preload bridge
// with a small in-page stub, so it proves layout and reachability, not installed-application behavior.
import http from 'node:http';
import {rendererFeatureFixtureScript} from './renderer-feature-fixture.js';
import {serveRendererFixture} from '../../scripts/test-renderer-browser.mjs';

const DAY = 86400000;
export function shellFiles(now = Date.parse('2026-11-16T14:00:00Z')) {
  const row = (id, path, size, offline, partCount, days) => ({id, path, size, offline, partCount, partSizeBytes: 4194304, modified: new Date(now - days * DAY).toISOString()});
  return [
    row('f1', 'Finance/2026/Quarterly report Q3.pdf', 4400000, false, 2, 0),
    row('f2', 'Finance/2026/Budget forecast.xlsx', 880000, true, 1, 0),
    row('f3', 'Finance/2026/Receipts/Invoice 2026-118.pdf', 312000, false, 1, 1),
    row('f4', 'Finance/2025/Tax summary.pdf', 2000000, true, 1, 20),
    row('f5', 'Contracts/Supplier contract.docx', 1100000, true, 1, 1),
    row('f6', 'Whiteboard.png', 2900000, false, 1, 4),
    row('f7', 'Meeting notes.md', 12000, false, 1, 6),
    row('f8', 'Archive 2025.zip', 86400000, false, 22, 14),
    row('f9', 'Product demo.mov', 214000000, false, 54, 22)
  ];
}

export function shellState(overrides = {}) {
  const sessions = [
    {sessionId: 'main', driveName: 'Work vault', driveLetter: 'M:', locked: false, mounted: true},
    {sessionId: 's2', driveName: 'Family photos', driveLetter: 'P:', locked: false, mounted: false},
    {sessionId: 's3', driveName: 'Tax records', driveLetter: 'T:', locked: true, mounted: false}
  ];
  return {
    sessionId: 'main', sessions, locked: false, mounted: true, driveName: 'Work vault', driveLetter: 'M:',
    storageDir: 'C:\\Encrypted\\Storage', cacheDir: 'C:\\Encrypted\\Cache', partSizeBytes: 4194304,
    availableDriveLetters: ['M:', 'N:', 'P:'], files: shellFiles(), driver: {available: true}, startup: true, autoUnlock: false,
    sync: {running: false, lastSync: '2026-11-16T14:08:00Z'}, defaults: {cacheDir: 'C:\\Encrypted\\Cache', driveLetter: 'M:'},
    history: {versionCount: 3, pendingVersionCount: 0}, transport: {mode: 'folder'}, operations: [],
    ...overrides
  };
}

/** Starts the fixture server. The caller closes it. */
export async function startShellServer() {
  const server = http.createServer(serveRendererFixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {server, origin: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve))};
}

/** Launches a Chromium-family browser, trying the installed channels first. Returns null when none can start. */
export async function launchBrowser() {
  const {chromium} = await import('playwright');
  const candidates = [process.env.MFE_TEST_BROWSER_CHANNEL, 'chrome', 'msedge', undefined].filter((value, index, list) => (value !== null) && list.indexOf(value) === index);
  for (const channel of candidates) {
    try { return await chromium.launch(channel ? {channel} : {}); } catch { /* try the next channel */ }
  }
  return null;
}

/** Opens the renderer at a viewport with the stubbed bridge. `state` is the vault state the stub reports. */
export async function openShellPage({browser, origin, width, height, state = shellState(), colorScheme = 'light', preferences = null, forcedColors = 'none', contrast = 'no-preference'}) {
  const context = await browser.newContext({viewport: {width, height}, colorScheme, forcedColors, contrast});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message || error)));
  const stub = rendererFeatureFixtureScript(featureFixture => {
    const clone = value => JSON.parse(JSON.stringify(value));
    window.testState = window.__shellState;
    let subscriber = () => {};
    const change = patch => { Object.assign(window.testState, patch); subscriber(clone(window.testState)); return clone(window.testState); };
    window.pushState = change;
    const select = async sessionId => {
      const session = window.testState.sessions.find(row => row.sessionId === sessionId);
      return change({sessionId, driveName: session.driveName, driveLetter: session.driveLetter, locked: session.locked, mounted: session.mounted, files: session.locked ? [] : window.testState.files});
    };
    window.drive = {
      ...featureFixture.bridge,
      status: async () => clone(window.testState), onStatus: callback => { subscriber = callback; return () => {}; },
      listFiles: async () => ({items: clone(window.testState.locked ? [] : window.testState.files), nextCursor: null}),
      listVersions: async id => [{id: id + '-v3', timestampUtc: '2026-11-16T13:42:00Z', length: 4400000, isAvailable: true}, {id: id + '-v2', timestampUtc: '2026-11-15T09:30:00Z', length: 4300000, isAvailable: true}],
      registryStorageStatus: async () => ({configured: true, state: 'idle', sessionId: window.testState.sessionId, configuration: {repository: 'docker.io/example/work-vault'}}),
      history: async () => [], recycled: async () => [],
      addSession: async () => change({}), selectSession: select, removeSession: async () => change({}),
      chooseFolder: async () => 'C:\\Encrypted', chooseFiles: async () => [], chooseExport: async () => 'C:\\Export\\a.txt', chooseKeyFile: async () => 'C:\\Keys\\test.key',
      unlock: async value => { if (value.password === 'wrong') throw new Error('The password or key file is not correct.'); return change({locked: false, mounted: true, files: window.testState.files}); },
      lock: async () => change({locked: true, mounted: false}), mount: async () => change({mounted: true}),
      open: async () => {}, openExplorer: async () => {}, exportFile: async () => {}, keepOffline: async () => change({}), releaseOffline: async () => change({}), deleteFile: async () => change({}),
      sync: async () => change({}), setPartSize: async () => change({}), resplit: async () => change({}), importFiles: async () => change({}), startImport: async () => change({}),
      setStartup: async () => change({}), setAutoUnlock: async () => change({}), forgetSavedCredential: async () => change({}),
      forceLock: async () => change({locked: true, mounted: false}), windowControl: async () => {}, openExternal: async () => {}, saveVersion: async () => {}, restoreVersion: async () => {},
      operations: async () => []
    };
  });
  await page.addInitScript(`window.__shellState=${JSON.stringify(state)};window.__recordRendererFixture=async()=>{};${stub}`);
  // A finished setup guide keeps the first-run wizard from opening over the workspace.
  await page.addInitScript(`try{localStorage.setItem('mfe.startup.completed.v1','1');localStorage.setItem('mfe.onboarding.v1',JSON.stringify({version:1,status:'skipped',step:'welcome',done:[],skipped:[],choices:{},updatedAt:1}))}catch{}`);
  if (preferences) await page.addInitScript(`try{localStorage.setItem('mfe.shell.v1',${JSON.stringify(JSON.stringify(preferences))})}catch{}`);
  await page.goto(origin);
  await page.waitForSelector('#drive-tabs [role=tab]', {timeout: 15000});
  await page.waitForTimeout(600);
  // Close the first-run guide when it opened, then return to the drive view.
  await page.evaluate(async () => {
    const skip = [...document.querySelectorAll('md-text-button')].find(button => /Skip setup/.test(button.textContent));
    if (skip) { skip.click(); await new Promise(resolve => setTimeout(resolve, 300)); }
    document.querySelector('mfe-navigation-rail')?.nodes.get('drive')?.click();
  });
  await page.waitForTimeout(500);
  return {page, errors, close: () => context.close()};
}
