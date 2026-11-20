import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateAppearanceRequest } from '../src/main/drive-appearance/ipc.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const SESSION = 'main';

test('the open-folder request accepts the storage or cache folder and nothing else', () => {
  assert.deepEqual(validateAppearanceRequest('openStorageFolder', { sessionId: SESSION }), { sessionId: SESSION });
  assert.deepEqual(validateAppearanceRequest('openStorageFolder', { sessionId: SESSION, which: 'storage' }), { sessionId: SESSION });
  assert.deepEqual(validateAppearanceRequest('openStorageFolder', { sessionId: SESSION, which: 'cache' }), { sessionId: SESSION, which: 'cache' });
  assert.throws(() => validateAppearanceRequest('openStorageFolder', { sessionId: SESSION, which: 'C:\\Windows' }));
  assert.throws(() => validateAppearanceRequest('openStorageFolder', { sessionId: SESSION, path: 'C:\\' }));
});

test('the main process opens the folder recorded for the drive, never a path from the renderer', async () => {
  const main = await read('src/main/main.js');
  const handler = main.slice(main.indexOf("if (method === 'openStorageFolder')"), main.indexOf("if (method === 'openStorageFolder')") + 1200);
  assert.match(handler, /params\.which === 'cache'/);
  assert.match(handler, /row\?\.state\?\.cacheDir \|\| row\?\.preferences\?\.cacheDir/);
  assert.doesNotMatch(handler, /params\.(path|folder|dir)/);
});

test('drive details show an Open button beside both encrypted folder paths', async () => {
  const list = await read('src/renderer/features/shell/drive-list.js');
  assert.match(list, /fact\('Encrypted storage', state\?\.storageDir \|\| '', 'storage'\)/);
  assert.match(list, /fact\('Encrypted cache', state\?\.cacheDir \|\| '', 'cache'\)/);
  assert.match(list, /hooks\.openStorage\(session\.sessionId, which\)/);
});

test('the New drive button opens the create choices instead of adding an empty drive', async () => {
  const [nav, app] = await Promise.all([read('src/renderer/features/shell/navigation.js'), read('src/renderer/app.js')]);
  assert.match(nav, /if\(this\.onNewDrive\)this\.onNewDrive\(event\.currentTarget,event\)/);
  assert.match(app, /onNewDrive:\(anchor,event\)=>openNewDriveMenu\(anchor,event\)/);
  const menu = app.slice(app.indexOf('function openNewDriveMenu'), app.indexOf('function openNewDriveMenu') + 1600);
  for (const run of ["openVaultDialog('create')", "openHubDrive('create-direct')", "openHubDrive('open')", "$('unlock-button')?.click()"]) assert.ok(menu.includes(run), run);
});

test('unlocking or creating a drive moves parts smaller than 80 MiB to 80 MiB', async () => {
  const main = await read('src/main/main.js');
  assert.match(main, /backend\('mount', \{ driveLetter: params\.driveLetter, driveName: preferences\.driveName \}\);\s+void ensureStandardPartSize\(\);/);
  const fn = main.slice(main.indexOf('async function ensureStandardPartSize'), main.indexOf('async function ensureStandardPartSize') + 700);
  assert.match(fn, /current >= BACKUP_PART_SIZE_BYTES\) return;/);
  assert.match(fn, /helper\.request\('startPacking', \{ partSizeBytes: BACKUP_PART_SIZE_BYTES \}\)/);
});
