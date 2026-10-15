import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRequest } from '../src/main/validation.js';
import { DEFAULT_DRIVE_NAME, normalizeDriveName } from '../src/shared/drive-name.js';
import { cantonese } from '../src/renderer/i18n.js';

const base = { storageDir: 'storage', cacheDir: 'cache', driveLetter: 'M:', password: 'test' };

test('drive name accepts 1 to 32 characters and trims', () => {
  assert.equal(DEFAULT_DRIVE_NAME, 'Material Files');
  assert.equal(normalizeDriveName('A'), 'A');
  assert.equal(normalizeDriveName('x'.repeat(32)), 'x'.repeat(32));
  assert.equal(normalizeDriveName('  Work Vault  '), 'Work Vault');
  assert.equal(normalizeDriveName('Tax 2026 (private)'), 'Tax 2026 (private)');
  assert.equal(normalizeDriveName('我喺磁磟'), '我喺磁磟');
});

test('drive name rejects empty, long, control and forbidden characters', () => {
  for (const bad of ['', '   ', 'x'.repeat(33), ' ' + 'x'.repeat(33) + ' ', 'a\u0000b', 'a\u0001b', 'a\nb', 'a\tb', 'a\u007fb', null, undefined, 5]) {
    assert.equal(normalizeDriveName(bad), null, JSON.stringify(bad));
  }
  for (const character of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
    assert.equal(normalizeDriveName(`a${character}b`), null, character);
  }
});

test('requests carry driveName only when valid and never trust the renderer', () => {
  for (const method of ['createVault', 'unlockVault', 'upgradeVault']) {
    const extra = method === 'unlockVault' ? {} : { partSizeBytes: 80 * 1024 * 1024 };
    assert.equal('driveName' in validateRequest(method, { ...base, ...extra }), false);
    assert.equal(validateRequest(method, { ...base, ...extra, driveName: '  Work  ' }).driveName, 'Work');
    assert.equal(validateRequest(method, { ...base, ...extra, driveName: 'x'.repeat(32) }).driveName.length, 32);
    for (const bad of ['', 'x'.repeat(33), 'a\u0000b', 'a|b', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 7]) {
      assert.throws(() => validateRequest(method, { ...base, ...extra, driveName: bad }), /Invalid driveName/, JSON.stringify(bad));
    }
  }
  assert.equal(validateRequest('mount', { driveLetter: 'z:', driveName: 'Scratch' }).driveName, 'Scratch');
  assert.throws(() => validateRequest('mount', { driveName: 'a|b' }));
  assert.equal('driveName' in validateRequest('mount', {}), false);
});

test('dialog has the drive name field, its default, bilingual copy and a live count', async () => {
  const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
  assert.match(html, /<md-outlined-text-field id="drive-name"[^>]*required[^>]*value="Material Files"/);
  assert.match(html, /<label for="drive-name" data-i18n>Drive name<\/label>/);
  assert.match(html, /id="drive-name-help" data-i18n>Shown in File Explorer\.<\/p>/);
  assert.match(html, /id="drive-name-count"/);
  assert.match(html, /id="drive-name-error" role="alert" hidden/);
  const app = await readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  assert.match(app, /options\.driveName = driveName;/);
  assert.match(app, /if \(driveName === null\) return showError/);
  assert.match(app, /DRIVE_NAME_MAX_LENGTH/);
  for (const key of ['Drive name', 'Shown in File Explorer.', 'Use 1 to 32 characters. Slashes, colons, asterisks, question marks, quotes, angle brackets, vertical bars and control characters are not allowed.']) {
    assert.ok(cantonese[key], key);
  }
});

test('native controller and file system use the validated name', async () => {
  const controller = await readFile(new URL('../native/MaterialFileEncryptor.Host/VaultController.cs', import.meta.url), 'utf8');
  assert.match(controller, /ValidateDriveName\(OptionalString\(args, "driveName"\) \?\? driveName\)/);
  assert.match(controller, /new VaultFileSystem\(Engine, gate, selectedName\)/);
  const system = await readFile(new URL('../native/MaterialFileEncryptor.Host/VaultFileSystem.cs', import.meta.url), 'utf8');
  assert.match(system, /info\.SetVolumeLabel\(volumeLabel\)/);
  assert.doesNotMatch(system, /SetVolumeLabel\("/);
});
