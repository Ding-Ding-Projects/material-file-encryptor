import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
await fs.mkdir('out/evidence', { recursive: true });
const packagedExecutable = process.platform === 'win32' ? path.resolve('out/material-file-encryptor-win32-x64/MaterialFileEncryptor.exe') : undefined;
if (packagedExecutable) await fs.access(packagedExecutable);
const launchArgs = packagedExecutable ? ['--desktop-check'] : ['.', '--desktop-check'];
if (process.platform === 'linux') launchArgs.push('--no-sandbox'); // Isolated development capture only; packaged Windows sandbox stays enabled.
const application = await electron.launch({ executablePath: packagedExecutable, args: launchArgs, cwd: process.cwd(), timeout: 60000, recordVideo: { dir: 'out/evidence/video', size: { width: 1180, height: 850 }, fps: 15 } });
const errors = [];
let fixtureRoot, video, originalStartup;
let startupRegistration = null;
const packagedEvidence = { launchedBuiltArtifact: Boolean(packagedExecutable), asar: false, nativeHelperPresent: false, driverInstallerPresent: false };
try {
  const page = await application.firstWindow();
  video = page.video();
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#create-button');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.drive.status), 'function');
  const security = await application.evaluate(({ BrowserWindow }) => { const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration }; });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  if (packagedExecutable) {
    const runtime = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(), resources: process.resourcesPath }));
    assert.equal(runtime.packaged, true, 'Windows checks must exercise the packaged application.');
    assert.equal(path.resolve(runtime.executable).toLowerCase(), packagedExecutable.toLowerCase());
    assert.equal(path.basename(runtime.appPath), 'app.asar', 'The renderer and preload must run from the packaged ASAR.');
    await fs.access(runtime.appPath);
    await fs.access(path.join(runtime.resources, 'native', 'MaterialFileEncryptor.Host.exe'));
    const manifest = JSON.parse(await fs.readFile(path.join(runtime.resources, 'dependencies.json'), 'utf8'));
    await fs.access(path.join(runtime.resources, 'driver', `winfsp-${manifest.winfsp.version}.msi`));
    Object.assign(packagedEvidence, { asar: true, nativeHelperPresent: true, driverInstallerPresent: true });
    const readStartup = () => application.evaluate(({ app }) => app.getLoginItemSettings({ path: process.execPath, args: ['--startup'] }).openAtLogin);
    originalStartup = (await page.evaluate(() => window.drive.status())).preferences.startup;
    assert.equal(await readStartup(), originalStartup, 'Windows registration must match the saved preference.');
    await page.evaluate(() => window.drive.setStartup(false));
    assert.equal(await readStartup(), false, 'Disabling startup must remove its Windows registration.');
    await page.evaluate(() => window.drive.setStartup(true));
    assert.equal(await readStartup(), true, 'Enabling startup must create its Windows registration.');
    await page.evaluate(value => window.drive.setStartup(value), originalStartup);
    assert.equal(await readStartup(), originalStartup, 'Restore the original startup preference and registration.');
    startupRegistration = { initial: originalStartup, disabledReadback: false, enabledReadback: true, restored: originalStartup, signInTested: false };
  }
  await settle();
  await page.screenshot({ path: 'out/evidence/desktop-locked.png', fullPage: true });
  await page.click('#create-button');
  await page.waitForSelector('#vault-dialog[open]');
  await page.fill('#cache-input', ''); // Capture the real empty form without a machine-specific default path.
  await settle();
  await page.screenshot({ path: 'out/evidence/desktop-create.png', fullPage: true });
  await page.click('#dialog-cancel');
  await page.click('[data-view="settings"]');
  await page.selectOption('#theme-setting', 'dark');
  await settle();
  await page.screenshot({ path: 'out/evidence/desktop-settings-dark.png', fullPage: true });
  await page.selectOption('#theme-setting', 'light');
  await page.click('[data-view="help"]');
  await settle();
  await page.screenshot({ path: 'out/evidence/desktop-help.png', fullPage: true });
  const status = await page.evaluate(() => window.drive.status());
  if (process.platform === 'win32') assert.equal(status.driver.available, true, status.driver.error || 'WinFsp must be installed for the Windows desktop check.');
  if (process.platform === 'win32') {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-desktop-'));
    const storageDir = path.join(fixtureRoot, 'encrypted-storage'); const cacheDir = path.join(fixtureRoot, 'encrypted-cache');
    await fs.mkdir(storageDir); await fs.mkdir(cacheDir);
    const driveLetter = status.availableDriveLetters.includes('M:') ? 'M:' : status.availableDriveLetters[0];
    assert.ok(driveLetter, 'A free drive letter is required.');
    await page.click('[data-view="drive"]'); await page.click('#create-button');
    await page.fill('#storage-input', storageDir); await page.fill('#cache-input', cacheDir); await page.selectOption('#drive-letter', driveLetter.replace(':', ''));
    const password = randomBytes(24).toString('base64url');
    await page.fill('#password-input', password); await page.fill('#confirm-password', password); await page.click('#dialog-submit');
    await page.waitForFunction(async () => (await window.drive.status()).mounted, null, { timeout: 60000 });
    const mountedRoot = driveLetter + '\\';
    await fs.writeFile(path.join(mountedRoot, 'Welcome.txt'), 'A real Windows mounted drive.\n');
    await page.evaluate(() => window.drive.sync());
    assert.equal(await fs.readFile(path.join(mountedRoot, 'Welcome.txt'), 'utf8'), 'A real Windows mounted drive.\n');
    await page.waitForFunction(() => document.querySelector('#file-list').textContent.includes('Welcome.txt'));
    await settle();
    await page.screenshot({ path: 'out/evidence/desktop-mounted.png', fullPage: true });
    await page.evaluate(() => window.drive.lock());
    assert.equal((await page.evaluate(() => window.drive.status())).locked, true);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.resolve('out/evidence/desktop-check.json'), JSON.stringify({ platform: process.platform, packagedArtifact: packagedEvidence, startupRegistration, security, driverAvailable: status.driver.available, pageErrors: errors, recording: `desktop-${process.platform}.webm`, mountedFilesystemChecked: process.platform === 'win32', checked: ['locked screen', 'create dialog', 'settings theme', 'help', 'preload isolation', ...(process.platform === 'win32' ? ['packaged ASAR and resources', 'startup registration toggle and restore', 'create and mount', 'mounted file write/read', 'lock'] : [])] }, null, 2));
  console.log('Electron checks passed: real app window, create dialog, settings theme, help and sandbox.');
} finally {
  if (originalStartup !== undefined) {
    const page = await application.firstWindow();
    await page.evaluate(value => window.drive.setStartup(value), originalStartup);
  }
  await application.close();
  if (video) {
    const recording = `out/evidence/desktop-${process.platform}.webm`;
    await video.saveAs(recording); await video.delete();
    assert.ok((await fs.stat(recording)).size > 0, 'The real Electron recording must contain data.');
  }
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
}
