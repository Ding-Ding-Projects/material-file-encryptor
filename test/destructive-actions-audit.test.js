import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditDestructiveActions, findDestructiveNames, DESTRUCTIVE_NAME} from '../scripts/audit-destructive-actions.mjs';
import {DESTRUCTIVE_ACTIONS, EXEMPT_ACTIONS, EXEMPT_IN_FILES, destructiveAction, localizedPair} from '../src/shared/destructive-actions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(root, file), 'utf8');
/** Audit the real tree but let one file read back different text, which is how a bypass would look. */
const auditWith = (file, transform) => auditDestructiveActions({read: name => name === file ? transform(read(name)) : read(name)});

test('the real tree has no destructive action that skips the two-key confirmation', async () => {
  assert.deepEqual(await auditDestructiveActions(), []);
});

test('the registry covers every surface and gives every entry an English and a Cantonese text', () => {
  const count = surface => DESTRUCTIVE_ACTIONS.filter(item => item.surfaces.includes(surface)).length;
  assert.ok(count('desktop') >= 30, 'desktop actions: ' + count('desktop'));
  assert.ok(count('extension') >= 20, 'extension actions: ' + count('extension'));
  assert.ok(count('site') >= 3, 'site actions: ' + count('site'));
  assert.equal(new Set(DESTRUCTIVE_ACTIONS.map(item => item.id)).size, DESTRUCTIVE_ACTIONS.length);
  for (const item of DESTRUCTIVE_ACTIONS) {
    assert.ok(existsSync(join(root, item.file)), item.id + ' source file exists');
    assert.equal(item.route, 'super-confirmation', item.id + ' uses the super confirmation');
    for (const pair of [item.title, item.affected]) {
      assert.equal(pair.length, 2);
      assert.ok(/[㐀-鿿]/.test(pair[1]), item.id + ' has Cantonese text');
      assert.ok(/[A-Za-z]/.test(pair[0]), item.id + ' has English text');
    }
  }
  assert.equal(destructiveAction('desktop.force-lock').title[0], 'Force lock the drive');
  assert.equal(destructiveAction('nothing.registered'), null);
});

test('registered copy is available in English, Cantonese and bilingual modes without changing the facts', () => {
  const [english, cantonese] = destructiveAction('desktop.empty-recycle-bin').title;
  assert.equal(localizedPair([english, cantonese], 'en'), english);
  assert.equal(localizedPair([english, cantonese], 'yue'), cantonese);
  assert.equal(localizedPair([english, cantonese], 'bilingual'), english + ' · ' + cantonese);
});

test('removing the confirmation from a handler is a finding', async () => {
  for (const [id, file] of [['desktop.force-lock', 'src/renderer/app.js'], ['desktop.ollama-delete-model', 'src/renderer/features/ollama/index.js'], ['desktop.server-stop', 'src/renderer/features/server-manager/targets-panel.js'], ['extension.disconnect', 'browser-extension/options.js'], ['extension.server-restart', 'browser-extension/servers.js'], ['site.clear-vocabulary', 'docs/site/site.js']]) {
    const findings = await auditWith(file, text => text.split(`'${id}'`).join(`'bypassed'`));
    assert.ok(findings.some(item => item.kind === 'unconfirmed' && item.message.startsWith(id + ':')), `${id} bypass is caught`);
  }
});

test('a planted bypass that keeps the id but moves it away from any confirmation call is a finding', async () => {
  const findings = await auditWith('src/renderer/app.js', text => '/* \'desktop.empty-recycle-bin\' */\n' + text.replace(/superConfirm\('desktop\.empty-recycle-bin'/g, "(true && ('desktop.empty-recycle-bin'").replace("const superConfirm=", "const unrelated=").replace(/\bsuperConfirm\(/g, 'noop('));
  assert.ok(findings.some(item => item.kind === 'unconfirmed' && item.message.startsWith('desktop.empty-recycle-bin:')));
});

test('a stale registry entry whose handler token disappeared is a finding', async () => {
  const findings = await auditWith('src/renderer/app.js', text => text.split('emptyRecycleBin').join('somethingElse'));
  assert.ok(findings.some(item => item.kind === 'unconfirmed' && /emptyRecycleBin/.test(item.message)));
});

test('a new destructive request without a registry entry is a finding', async () => {
  const planted = ["api.wipeEverything();", "await request('revokeAllAccess', {});", "if (method === 'uninstallDriver') return 1;", "case 'discardWork': break;", "ipcMain.handle('vault:overwriteDrive', () => 1);"];
  for (const line of planted) {
    const findings = await auditWith('src/renderer/app.js', text => text + '\n' + line + '\n');
    assert.ok(findings.some(item => item.kind === 'unregistered'), line + ' is caught');
  }
});

test('the name finder sees request, handler and channel shapes and ignores ordinary words', () => {
  assert.deepEqual([...findDestructiveNames("request('deleteThing',{}); api.stopAll(); case 'resetAll': ipcMain.handle('clearCache', f); render('cleared');")].sort(), ['clearCache', 'deleteThing', 'resetAll', 'stopAll']);
  assert.ok(DESTRUCTIVE_NAME.test('forceLock') && DESTRUCTIVE_NAME.test('emptyRecycleBin') && !DESTRUCTIVE_NAME.test('startServer'));
});

test('exemptions are written down with reasons a reviewer can disagree with', () => {
  for (const [name, reason] of Object.entries(EXEMPT_ACTIONS)) assert.ok(reason.length >= 24, name);
  for (const item of EXEMPT_IN_FILES) { assert.ok(existsSync(join(root, item.file)), item.file); assert.ok(item.reason.length >= 24, item.name); }
  assert.ok(!('forceLock' in EXEMPT_ACTIONS) && !('stopServer' in EXEMPT_ACTIONS) && !('restartServer' in EXEMPT_ACTIONS), 'force lock and server stop and restart can never be exempted');
});

test('the extension copy of its entries cannot drift from the shared registry', async () => {
  const changed = DESTRUCTIVE_ACTIONS.map(item => item.id === 'extension.clear-history' ? {...item, title: ['Clear all history now', item.title[1]]} : item);
  const findings = await auditDestructiveActions({registry: {DESTRUCTIVE_ACTIONS: changed, EXEMPT_ACTIONS, EXEMPT_IN_FILES}});
  assert.ok(findings.some(item => item.kind === 'drift' && /extension\.clear-history/.test(item.message)));
});

test('a malformed registry entry is reported', async () => {
  const broken = [...DESTRUCTIVE_ACTIONS, {id: 'desktop.force-lock', surfaces: ['desktop'], file: 'src/renderer/app.js', invokes: [], title: ['Only English'], affected: ['', ''], route: 'super-confirmation'}];
  const findings = await auditDestructiveActions({registry: {DESTRUCTIVE_ACTIONS: broken, EXEMPT_ACTIONS, EXEMPT_IN_FILES}});
  const messages = findings.filter(item => item.kind === 'registry').map(item => item.message).join('\n');
  assert.match(messages, /duplicate id desktop\.force-lock/);
  assert.match(messages, /title needs an English and a Cantonese text/);
  assert.match(messages, /affected needs an English and a Cantonese text/);
  assert.match(messages, /list the handler or request tokens/);
});

test('a bypass added to just one of several entry points is still a finding', async () => {
  const sites = destructiveAction('desktop.force-lock').sites;
  assert.equal(sites, 3, 'force lock has a button and two palette commands');
  const findings = await auditWith('src/renderer/app.js', text => text.replace("if(await superConfirm('desktop.force-lock'))return run(", 'if(true)return run('));
  assert.ok(findings.some(item => item.kind === 'unconfirmed' && item.message.startsWith('desktop.force-lock:') && /2 of 3/.test(item.message)), JSON.stringify(findings));
});