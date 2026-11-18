import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog } from '../src/shared/surface/new-tab-catalog-model.js';

const app = readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
const commandsSource = app.slice(app.indexOf('function openBackupPage()'), app.indexOf('function workspaceCommands()'));
const workspace = app.slice(app.indexOf('function workspaceCommands()'), app.indexOf('function refreshPaletteInventory()'));

test('the palette and New tab list every backup, sharing and Docker Hub drive command', () => {
  for (const [id, label] of [['storage:backup-all', 'Back up all now'], ['storage:docker-hub-backup', 'Docker Hub backup'], ['settings:backup', 'Backup settings']]) {
    assert.match(commandsSource, new RegExp(`id:'${id}'[^}]*label:\\{en:'${label}',yue:'[^']+'\\}`), id);
  }
  assert.match(workspace, /\.\.\.backupCommands\(\)/);
  for (const label of ['New Docker Hub drive', 'Open a drive from Docker Hub', 'Receive a shared file…', 'Shared files']) assert.ok(workspace.includes(`'${label}'`), label);
  assert.match(commandsSource, /overview\.backUpAll\(\)/);
});

test('the backup commands appear in the New tab catalog under the right group', () => {
  const run = () => {};
  const catalog = buildCatalog({ labels: new Map(), commands: [
    { id: 'storage:backup-all', kind: 'tool', label: { en: 'Back up all now', yue: '立即全部備份' }, run },
    { id: 'storage:docker-hub-backup', kind: 'tool', label: { en: 'Docker Hub backup', yue: 'Docker Hub 備份' }, run },
    { id: 'settings:backup', kind: 'setting', label: { en: 'Backup settings', yue: '備份設定' }, run },
  ] });
  const find = label => catalog.find(entry => entry.label.en === label);
  assert.equal(find('Back up all now')?.kind, 'tool');
  assert.equal(find('Docker Hub backup')?.kind, 'tool');
  assert.equal(find('Backup settings')?.kind, 'setting');
});
