import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryFrom, formatClock, linkStateKey, settingsFromDraft, defaultSettings, formatBytes } from '../src/renderer/features/file-hosting/model.js';
import { linkQrMatrix } from '../src/renderer/features/file-hosting/qr.js';
import { HOSTING_COPY } from '../src/renderer/features/file-hosting/copy.js';
import { DESTRUCTIVE_ACTIONS } from '../src/shared/destructive-actions.js';
import { readFileSync } from 'node:fs';

test('expiry choices stay between one minute and one year', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0);
  assert.equal(expiryFrom('7d', '', now), now + 7 * 86400000);
  assert.equal(expiryFrom('custom', '2026-11-18T12:00:30Z', now), null, 'less than a minute away');
  assert.equal(expiryFrom('custom', '2028-01-01T00:00Z', now), null, 'more than a year away');
  assert.equal(expiryFrom('custom', 'not a date', now), null);
  assert.equal(expiryFrom('custom', '2026-11-25T18:00Z', now), Date.UTC(2026, 10, 25, 18, 0));
});

test('times are shown on a 24-hour clock and sizes in decimal units', () => {
  assert.match(formatClock(Date.UTC(2026, 10, 18, 19, 5), 'en'), /\d{2}:\d{2}/);
  assert.doesNotMatch(formatClock(Date.UTC(2026, 10, 18, 19, 5), 'en'), /[AP]M/i);
  assert.equal(formatBytes(4200000), '4.2 MB');
});

test('link states and draft checks', () => {
  assert.equal(linkStateKey({ state: 'ended', endedReason: 'limit' }), 'linkUsedUp');
  assert.equal(linkStateKey({ state: 'ended', endedReason: 'expired' }), 'linkExpired');
  assert.equal(linkStateKey({ state: 'missing', endedReason: null }), 'linkMissing');
  const draft = defaultSettings();
  assert.equal(settingsFromDraft(draft, 3), null);
  assert.match(settingsFromDraft({ ...draft, target: 'ssh', ssh: { host: '-x', user: 'u', port: 22 } }, 0), /SSH host/);
  assert.match(settingsFromDraft({ ...draft, port: 80 }, 1), /Web port/);
  assert.match(settingsFromDraft({ ...draft, tunnel: 'named', publicUrl: 'http://a.example.com' }, 2), /https/);
});

test('a QR code is drawn only for a download link', () => {
  const matrix = linkQrMatrix('https://files.example.com/d/AAAAAAAAAAAAAAAAAAAAAA#' + 'K'.repeat(43));
  assert.ok(matrix.length >= 25 && matrix.every(row => row.length === matrix.length));
  assert.throws(() => linkQrMatrix('javascript:alert(1)'));
  assert.throws(() => linkQrMatrix('https://x.example/' + 'a'.repeat(2000)));
});

test('every copy pair is bilingual and destructive actions are registered with a confirmation in the dialog', () => {
  for (const [key, pair] of Object.entries(HOSTING_COPY)) assert.ok(Array.isArray(pair) && pair.length === 2 && pair.every(text => typeof text === 'string' && text.trim()), key);
  const dialog = readFileSync(new URL('../src/renderer/features/file-hosting/dialog.js', import.meta.url), 'utf8');
  const ids = DESTRUCTIVE_ACTIONS.filter(entry => entry.file === 'src/renderer/features/file-hosting/dialog.js').map(entry => entry.id).sort();
  assert.deepEqual(ids, ['desktop.file-hosting-end-link', 'desktop.file-hosting-remove', 'desktop.file-hosting-restart', 'desktop.file-hosting-stop']);
  for (const id of ids) assert.ok(dialog.includes(`confirmDestructiveAction(document.body, '${id}'`), id);
});
