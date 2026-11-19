import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {bucketOf, filterCounts, nameMatcher, visibleDrives, listSummary, runningStrip, sizeOf, avatarLetter, FILTERS, SORTS} from '../src/renderer/features/storage-maintenance/auto-backup/list-model.js';
import {AUTO_BACKUP_COPY} from '../src/renderer/features/storage-maintenance/auto-backup/copy.js';

const drive = (patch = {}) => ({sessionId: 'id-' + (patch.name || 'x'), name: 'Work', enabled: true, phase: 'idle', dirty: false, lastBackup: '2026-11-17T09:00:00Z', repository: 'owner/store', visibility: 'public', tagCount: 10, snapshots: 4, progress: null, queuedBehind: null, lastError: null, ...patch});
const fleet = () => [
  drive({name: 'Studio', phase: 'backing-up', progress: {step: 'uploading', unit: 'parts', completedFiles: 22, totalFiles: 36, completedBytes: 62, totalBytes: 100, stepStartedAt: 0}}),
  drive({name: 'Photos', queuedBehind: 'Studio', lastBackup: '2026-11-16T22:10:00Z'}),
  drive({name: 'Taxes', phase: 'needs-attention', lastBackup: '2026-11-12T21:44:00Z', sizeBytes: 96}),
  drive({name: 'Music', lastBackup: '2026-11-17T03:00:00Z', sizeBytes: 1100}),
  drive({name: 'Archive', lastBackup: '2026-11-17T04:00:00Z', sizeBytes: 420}),
  drive({name: 'Old', enabled: false})
];

test('every drive falls into exactly one bucket', () => {
  assert.deepEqual(fleet().map(bucketOf), ['running', 'queued', 'attention', 'ok', 'ok', 'off']);
  assert.equal(bucketOf(drive({phase: 'unavailable'})), 'off');
  assert.equal(bucketOf(drive({phase: 'waiting-connection'})), 'attention');
  assert.equal(bucketOf(drive({lastBackup: null})), 'queued');
  assert.equal(bucketOf(drive({dirty: true})), 'queued');
});

test('chip counts are live and ignore the search text', () => {
  assert.deepEqual(filterCounts(fleet()), {all: 6, attention: 1, running: 1, queued: 1, ok: 2});
  assert.deepEqual(FILTERS, ['all', 'attention', 'running', 'queued', 'ok']);
});

test('each chip filters the list', () => {
  for (const [filter, names] of [['attention', ['Taxes']], ['running', ['Studio']], ['queued', ['Photos']], ['ok', ['Archive', 'Music']]])
    assert.deepEqual(visibleDrives(fleet(), {filter}).rows.map(row => row.name).sort(), names);
  assert.equal(visibleDrives(fleet(), {filter: 'all'}).rows.length, 6);
});

test('plain search matches the name without case and without special characters', () => {
  assert.deepEqual(visibleDrives(fleet(), {query: 'MU'}).rows.map(row => row.name), ['Music']);
  assert.deepEqual(visibleDrives([drive({name: 'a.b'}), drive({name: 'axb'})], {query: 'a.b'}).rows.map(row => row.name), ['a.b']);
  assert.equal(visibleDrives(fleet(), {query: 'zzz'}).rows.length, 0);
});

test('regular expression search works and an invalid pattern reports an error without throwing', () => {
  const ok = visibleDrives(fleet(), {query: '^(Stu|Pho)', regex: true});
  assert.deepEqual(ok.rows.map(row => row.name).sort(), ['Photos', 'Studio']); assert.equal(ok.error, false);
  let bad;
  assert.doesNotThrow(() => { bad = visibleDrives(fleet(), {query: '(unclosed', regex: true}); });
  assert.equal(bad.error, true); assert.equal(bad.rows.length, 0);
  assert.equal(nameMatcher('(unclosed', false).error, false, 'the same text is fine as plain search');
  assert.equal(nameMatcher('', true).test('anything'), true);
});

test('sorting: needs attention first, name, last backup and size', () => {
  assert.deepEqual(SORTS, ['attention', 'name', 'last', 'size']);
  const names = sort => visibleDrives(fleet(), {sort}).rows.map(row => row.name);
  assert.deepEqual(names('attention'), ['Taxes', 'Studio', 'Photos', 'Archive', 'Music', 'Old']);
  assert.deepEqual(names('name'), ['Archive', 'Music', 'Old', 'Photos', 'Studio', 'Taxes']);
  assert.deepEqual(names('last'), ['Old', 'Studio', 'Archive', 'Music', 'Photos', 'Taxes']);
  assert.deepEqual(names('size').slice(0, 3), ['Music', 'Archive', 'Taxes']);
});

test('summary figures come from real data and stay null when unknown', () => {
  const figures = listSummary(fleet());
  assert.equal(figures.drives, 6); assert.equal(figures.upToDate, 2); assert.equal(figures.storedBytes, 1616);
  assert.equal(figures.tagsUsed, 10, 'tags are counted once per repository'); assert.equal(figures.tagLimit, 1000);
  const none = listSummary([drive({repository: null, tagCount: null})]);
  assert.equal(none.storedBytes, null); assert.equal(none.tagsUsed, null);
  assert.equal(sizeOf(drive()), null); assert.equal(avatarLetter(drive({name: 'taxes'})), 'T');
});

test('the pinned strip shows only while a drive backs up, with its parts and percent', () => {
  assert.equal(runningStrip({drives: [drive()]}), null);
  assert.equal(runningStrip(null), null);
  const strip = runningStrip({drives: fleet()}, 60000);
  assert.equal(strip.name, 'Studio'); assert.equal(strip.step, 'uploading'); assert.equal(strip.done, 22); assert.equal(strip.total, 36); assert.equal(strip.percent, 61);
});

test('the page keeps every action, icon, aria state and Cantonese wording', async () => {
  const source = await fs.readFile(new URL('../src/renderer/features/storage-maintenance/hub-overview.js', import.meta.url), 'utf8');
  for (const id of ['autoBackupNow', 'autoBackupPrune', 'autoBackupSetDrive', 'autoBackupMove', 'autoBackupListOwn', 'onRestore']) assert.ok(source.includes(id), id);
  for (const marker of ["'aria-expanded'", "'aria-pressed'", "'contextmenu'", 'data-icon', "type: 'search'"]) assert.ok(source.includes(marker), marker);
  const keys = [...source.matchAll(/\bL\('((?:[^'\\]|\\.)+)'/g)].map(match => match[1].replace(/\\'/g, '\''));
  const labels = [...source.matchAll(/: '([A-Z][^']*)'/g)].map(match => match[1]);
  for (const key of [...keys, 'All', 'Running', 'Queued', 'Up to date', 'Needs attention first', 'Name', 'Size', 'Last backup', 'Discovering', 'Uploading', 'Verifying', 'parts', 'files', 'commits']) assert.ok(AUTO_BACKUP_COPY[key], `missing copy: ${key}`);
  assert.ok(labels.length > 0);
  for (const value of Object.values(AUTO_BACKUP_COPY)) assert.ok(!value.includes(String.fromCharCode(0x2014)));
});
