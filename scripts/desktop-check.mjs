import { _electron as electron } from 'playwright';
import { waitForDesktopState } from './desktop-state.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
const evidenceDirectory = path.resolve(process.env.MFE_DESKTOP_EVIDENCE_DIR || 'out/evidence');
const evidencePath = name => path.join(evidenceDirectory, name);
await fs.mkdir(evidenceDirectory, { recursive: true });
const packagedExecutable = process.platform === 'win32' ? path.resolve(process.env.MFE_DESKTOP_EXECUTABLE || 'out/material-file-encryptor-win32-x64/MaterialFileEncryptor.exe') : undefined;
if (packagedExecutable) await fs.access(packagedExecutable);
const launchArgs = packagedExecutable ? ['--desktop-check'] : ['.', '--desktop-check'];
if (process.platform === 'linux') launchArgs.push('--no-sandbox'); // Isolated development capture only; packaged Windows sandbox stays enabled.
let application, page, phase = 'launch', failure, checkReceipt;
const milestones = [];
const checkpoint = async name => {
  phase = name; milestones.push(name); console.log(`Desktop check: ${name}.`);
  await fs.writeFile(evidencePath('desktop-progress.json'), JSON.stringify({ platform: process.platform, phase, milestones }));
};
const bounded = async (promise, name, milliseconds = 30000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out during ${name}.`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};
const errorType = error => ['Error', 'TimeoutError', 'AssertionError', 'TypeError'].includes(error?.name) ? error.name : 'Error';
const evaluatePage = (...args) => bounded(page.evaluate(...args), phase);
const evaluateApplication = (...args) => bounded(application.evaluate(...args), phase);
const watchdog = setTimeout(() => { console.error(`Desktop check exceeded its four-minute limit during ${phase}.`); process.exit(1); }, 240000);
watchdog.unref();
const errors = [];
let fixtureRoot, fixtureDriveRoot, video, originalStartup;
let startupRegistration = null, mountEvidence = null;
const packagedEvidence = { launchedBuiltArtifact: Boolean(packagedExecutable), asar: false, nativeHelperPresent: false, driverInstallerPresent: false };
try {
  await checkpoint('launch');
  application = await electron.launch({ executablePath: packagedExecutable, args: launchArgs, cwd: process.cwd(), timeout: 60000, recordVideo: { dir: evidencePath('video'), size: { width: 1180, height: 850 }, fps: 15 } });
  application.context().setDefaultTimeout(30000);
  page = await application.firstWindow({ timeout: 30000 });
  await checkpoint('window-ready');
  video = page.video();
  const settle = () => evaluatePage(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  const capture = async name => {
    await evaluatePage(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await settle();
    await page.screenshot({ path: evidencePath(name), fullPage: false });
  };
  page.on('pageerror', error => errors.push(errorType(error)));
  await page.waitForSelector('#create-button');
  assert.equal(await evaluatePage(() => typeof window.require), 'undefined');
  assert.equal(await evaluatePage(() => typeof window.drive.status), 'function');
  const security = await evaluateApplication(({ BrowserWindow }) => { const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration }; });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  if (packagedExecutable) {
    await checkpoint('packaged-resources-and-startup');
    const runtime = await evaluateApplication(({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(), resources: process.resourcesPath }));
    assert.equal(runtime.packaged, true, 'Windows checks must exercise the packaged application.');
    assert.equal(path.resolve(runtime.executable).toLowerCase(), packagedExecutable.toLowerCase());
    assert.equal(path.basename(runtime.appPath), 'app.asar', 'The renderer and preload must run from the packaged ASAR.');
    await fs.access(runtime.appPath);
    await fs.access(path.join(runtime.resources, 'native', 'MaterialFileEncryptor.Host.exe'));
    const manifest = JSON.parse(await fs.readFile(path.join(runtime.resources, 'dependencies.json'), 'utf8'));
    await fs.access(path.join(runtime.resources, 'driver', `winfsp-${manifest.winfsp.version}.msi`));
    Object.assign(packagedEvidence, { asar: true, nativeHelperPresent: true, driverInstallerPresent: true });
    const readStartup = () => evaluateApplication(({ app }) => app.getLoginItemSettings({ path: process.execPath, args: ['--startup'] }).openAtLogin);
    originalStartup = (await evaluatePage(() => window.drive.status())).preferences.startup;
    assert.equal(await readStartup(), originalStartup, 'Windows registration must match the saved preference.');
    await evaluatePage(() => window.drive.setStartup(false));
    assert.equal(await readStartup(), false, 'Disabling startup must remove its Windows registration.');
    await evaluatePage(() => window.drive.setStartup(true));
    assert.equal(await readStartup(), true, 'Enabling startup must create its Windows registration.');
    await evaluatePage(value => window.drive.setStartup(value), originalStartup);
    assert.equal(await readStartup(), originalStartup, 'Restore the original startup preference and registration.');
    startupRegistration = { initial: originalStartup, disabledReadback: false, enabledReadback: true, restored: originalStartup, signInTested: false };
  }
  if (process.platform === 'win32') {
    await checkpoint('drive-discovery');
    await waitForDesktopState(page, state => !state.driver.checking);
  }
  await checkpoint('locked-and-settings-captures');
  await settle();
  await capture('desktop-locked.png');
  await page.click('#create-button');
  await page.waitForSelector('#vault-dialog[open]');
  await page.fill('#storage-input', '');
  await page.fill('#cache-input', ''); // Clear previous fixture/default paths through the actual form before capture.
  await settle();
  await capture('desktop-create.png');
  await page.locator('.credential-selector label').filter({ has: page.locator('input[value="keyFile"]') }).click();
  await settle();
  await capture('desktop-keyfile-choice.png');
  await page.click('#dialog-cancel');
  await page.click('[data-view="settings"]');
  await page.selectOption('#theme-setting', 'dark');
  await settle();
  await capture('desktop-settings-dark.png');
  await page.selectOption('#theme-setting', 'light');
  await page.click('[data-view="help"]');
  await settle();
  await capture('desktop-help.png');
  const status = await evaluatePage(() => window.drive.status());
  if (process.platform === 'win32') assert.equal(status.driver.available, true, status.driver.error || 'WinFsp must be installed for the Windows desktop check.');
  if (process.platform === 'win32') {
    await checkpoint('create-and-mount');
    const fixturePrefix = process.env.GITHUB_ACTIONS === 'true'
      ? path.join(path.parse(os.tmpdir()).root, 'MaterialFileEncryptor-Capture-')
      : path.join(os.tmpdir(), 'mfe-desktop-');
    fixtureRoot = await fs.mkdtemp(fixturePrefix);
    const storageDir = path.join(fixtureRoot, 'encrypted-storage'); const cacheDir = path.join(fixtureRoot, 'encrypted-cache');
    await fs.mkdir(storageDir); await fs.mkdir(cacheDir);
    const driveLetter = status.availableDriveLetters.includes('M:') ? 'M:' : status.availableDriveLetters[0];
    assert.ok(driveLetter, 'A free drive letter is required.');
    await page.click('[data-view="drive"]'); await page.click('#create-button');
    await page.fill('#storage-input', storageDir); await page.fill('#cache-input', cacheDir); await page.click('#drive-letter-toggle'); await page.getByRole('option', { name: driveLetter, exact: true }).click();
    const password = randomBytes(24).toString('base64url');
    await page.fill('#password-input', password); await page.fill('#confirm-password', password); await page.click('#dialog-submit');
    await page.waitForSelector('#vault-dialog', { state: 'hidden', timeout: 60000 });
    await waitForDesktopState(page, state => state.mounted && !state.operation, 60000);
    const completedMount = await evaluatePage(() => window.drive.status());
    mountEvidence = { requestedDriveMatchesActual: completedMount.driveLetter === driveLetter, actualDriveLetter: /^[A-Z]:$/.test(completedMount.driveLetter || '') ? completedMount.driveLetter : null };
    const namespace = completedMount.mountDiagnostic;
    if (namespace) mountEvidence.helperNamespace = {
      requestedDriveLetter: /^[A-Z]:$/.test(namespace.requestedDriveLetter || '') ? namespace.requestedDriveLetter : null,
      registeredDriveLetter: /^[A-Z]:$/.test(namespace.registeredDriveLetter || '') ? namespace.registeredDriveLetter : null,
      dosDeviceFound: namespace.dosDeviceFound === true,
      win32Error: Number.isInteger(namespace.win32Error) ? namespace.win32Error : null,
    };
    assert.equal(mountEvidence.requestedDriveMatchesActual, true, 'Completed mount must use the selected drive letter.');
    await checkpoint('mounted-file-write');
    const mountedRoot = driveLetter + '\\';
    fixtureDriveRoot = mountedRoot;
    await fs.writeFile(path.join(mountedRoot, 'Welcome.txt'), 'A real Windows mounted drive.\n');
    await checkpoint('mounted-file-sync');
    await page.click('#sync-button');
    await page.waitForFunction(() => !document.querySelector('#sync-button').disabled);
    assert.equal(await page.locator('#main-error').isVisible(), false, 'The real Sync action must finish without an application error.');
    await checkpoint('mounted-file-read');
    assert.equal(await fs.readFile(path.join(mountedRoot, 'Welcome.txt'), 'utf8'), 'A real Windows mounted drive.\n');
    await page.waitForFunction(() => document.querySelector('#file-list').textContent.includes('Welcome.txt'));
    await settle();
    await capture('desktop-mounted.png');
    await checkpoint('encrypted-offline-pin');
    await page.getByRole('radio', { name: 'Select Welcome.txt', exact: true }).check();
    await page.click('#offline-button');
    await waitForDesktopState(page, state => !state.operation && state.files.some(file => file.path === 'Welcome.txt' && file.offline));
    await page.click('[data-view="offline"]');
    await settle();
    await capture('desktop-offline.png');
    await checkpoint('lock');
    await page.click('#lock-button');
    await waitForDesktopState(page, state => state.locked && !state.mounted && !state.operation);
    assert.equal((await evaluatePage(() => window.drive.status())).locked, true);
  }
  assert.deepEqual(errors, []);
  checkReceipt = { platform: process.platform, packagedArtifact: packagedEvidence, startupRegistration, security, driverAvailable: status.driver.available, pageErrors: errors, recording: `desktop-${process.platform}.webm`, screenshots: { viewportOnly: true, scrollPosition: 'top' }, mountedFilesystemChecked: process.platform === 'win32', checked: ['locked screen', 'create dialog', 'key-file choice', 'settings theme', 'help', 'preload isolation', ...(process.platform === 'win32' ? ['packaged ASAR and resources', 'startup registration toggle and restore', 'create and mount', 'mounted file write/read', 'encrypted offline pin and pane', 'lock'] : [])] };
  await checkpoint('checks-passed');
} catch (error) {
  failure = { phase, errorType: errorType(error), code: typeof error.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? error.code : null, syscall: ['open', 'write', 'read', 'stat', 'mkdir', 'unlink', 'rename'].includes(error.syscall) ? error.syscall : null };
  if (['mounted-file-write', 'mounted-file-sync', 'mounted-file-read'].includes(phase) && application && fixtureDriveRoot) {
    try { failure.driveVisibility = await bounded(application.evaluate(async (_electron, root) => { const io = process.getBuiltinModule('fs').promises; try { await io.stat(root); return { electronMainCanStatDrive: true }; } catch (error) { return { electronMainCanStatDrive: false, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : null }; } }, fixtureDriveRoot), 'drive visibility diagnostic', 5000); } catch { failure.driveVisibility = { probeFailed: true }; }
  }
  console.error(`Desktop check failed during ${phase} (${failure.errorType}).`);
} finally {
  const cleanupErrors = [];
  let closed = false, safeToRemoveFixture = !fixtureRoot;
  if (application) {
    await checkpoint('graceful-cleanup');
    try {
      const lastState = await waitForDesktopState(page, state => !state.operation, 20000);
      if (!lastState.locked) await bounded(page.evaluate(() => window.drive.lock()), 'cleanup lock', 20000);
      const locked = await bounded(page.evaluate(() => window.drive.status()), 'cleanup lock verification', 5000);
      safeToRemoveFixture = locked.locked && !locked.mounted;
      if (!safeToRemoveFixture) throw new Error('Drive cleanup is still busy.');
    } catch (error) { cleanupErrors.push({ phase: 'lock', errorType: errorType(error) }); }
    if (originalStartup !== undefined) {
      try { await bounded(page.evaluate(value => window.drive.setStartup(value), originalStartup), 'restore startup', 5000); }
      catch (error) { cleanupErrors.push({ phase: 'startup-restore', errorType: errorType(error) }); }
    }
    try { await bounded(application.close(), 'application graceful close', 15000); closed = true; }
    catch (error) { cleanupErrors.push({ phase: 'application-close', errorType: errorType(error) }); }
    if (video && closed) {
      try {
        const recording = evidencePath(`desktop-${process.platform}.webm`);
        await bounded(video.saveAs(recording), 'recording finalization', 10000); await video.delete();
        assert.ok((await fs.stat(recording)).size > 0, 'The real Electron recording must contain data.');
      } catch (error) { cleanupErrors.push({ phase: 'recording', errorType: errorType(error) }); }
    }
  }
  if (fixtureRoot && safeToRemoveFixture && closed) {
    try { await bounded(fs.rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }), 'remove owned fixture', 5000); }
    catch (error) { cleanupErrors.push({ phase: 'fixture-removal', errorType: errorType(error) }); }
  }
  const passed = Boolean(checkReceipt) && !failure && cleanupErrors.length === 0;
  await fs.writeFile(evidencePath('desktop-check.json'), JSON.stringify({ ...checkReceipt, platform: process.platform, packagedArtifact: packagedEvidence, startupRegistration, mountEvidence, passed, failure, cleanupErrors, milestones, fixtureRetained: Boolean(fixtureRoot && (!safeToRemoveFixture || !closed)) }, null, 2));
  clearTimeout(watchdog);
  if (!passed) { console.error('Desktop verification failed; see the safe phase receipt. No busy drive was force-unmounted.'); process.exit(1); }
  console.log('Electron checks and graceful cleanup passed.');
}
