import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createAccessMutationHistory} from '../src/main/access-mutation-history.js';
import {anchorAccessPanel, promoteAccessPanelToTopLayer} from '../src/renderer/features/access/surface.js';

const run = promisify(execFile);

async function historyFixture(execute) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-reproof-'));
  const toolsDirectory = path.join(directory, 'tools');
  const exe = path.join(toolsDirectory, 'git', 'cmd', 'git.exe');
  const bytes = Buffer.from('Synthetic resolver fixture; the test executor runs Git separately');
  await fs.mkdir(path.dirname(exe), {recursive: true});
  await fs.writeFile(exe, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(toolsDirectory, 'forge-executables.json'), JSON.stringify({
    schemaVersion: 1,
    git: {relativePath: 'git/cmd/git.exe', version: '2.56.0.windows.2', sha256},
    gh: {relativePath: 'gh/bin/gh.exe', version: '2.102.0', sha256},
  }));
  const history = createAccessMutationHistory({dataDirectory: directory, toolsDirectory, execute});
  return {directory, history, dispose: async () => { history.close(); await fs.rm(directory, {recursive: true, force: true}); }};
}

test('every operational Git call in the local mutation journal trusts exactly its own directory', async () => {
  const calls = [];
  const execute = async (file, args, options) => {
    if (args[0] === '--version') return {stdout: 'git version 2.56.0.windows.2\n'};
    calls.push({args, cwd: options.cwd});
    return run('git', args, {cwd: options.cwd, env: {...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'}});
  };
  const f = await historyFixture(execute);
  try {
    await f.history.record({version: 1, action: 'access-credential-created', target: 'profile', at: new Date().toISOString()});
    assert.ok(calls.length >= 4, 'init, add, commit and verification calls were expected');
    for (const call of calls) {
      const trusted = call.args.filter(arg => arg.startsWith('safe.directory='));
      assert.deepEqual(trusted, ['safe.directory=' + call.cwd.replaceAll('\\', '/')], 'Call without the exact directory trust: ' + call.args.join(' '));
      assert.equal(call.args.includes('safe.directory=*'), false);
    }
  } finally { await f.dispose(); }
});

test('a failed journal call reports its stage and reason without replacing the original error', async () => {
  const original = Object.assign(new Error('Synthetic spawn denial'), {code: 'EPERM'});
  const execute = async (file, args) => {
    if (args[0] === '--version') return {stdout: 'git version 2.56.0.windows.2\n'};
    throw original;
  };
  const f = await historyFixture(execute);
  try {
    await assert.rejects(
      f.history.record({version: 1, action: 'access-credential-created', target: 'profile', at: new Date().toISOString()}),
      error => error === original && error.stage === 'init' && error.reason === 'EPERM');
  } finally { await f.dispose(); }
});

function fakePanel({popover = true} = {}) {
  const panel = {
    hidden: false,
    isConnected: true,
    style: {},
    attributes: new Map(),
    opened: false,
    ownerDocument: {defaultView: {innerWidth: 1180, innerHeight: 752, addEventListener() {}, removeEventListener() {}}},
    getBoundingClientRect: () => ({left: 12, top: 12, right: 652, bottom: 677, width: 640, height: 665}),
    setAttribute(name, value) { this.attributes.set(name, value); },
    matches(selector) { return selector === ':popover-open' && this.opened; },
  };
  if (popover) {
    panel.showPopover = function () { this.opened = true; };
    panel.hidePopover = function () { this.opened = false; };
  }
  return panel;
}

test('a floating access panel enters the top layer so no ancestor can crop its action row', () => {
  const panel = fakePanel();
  anchorAccessPanel(panel, null);
  assert.equal(panel.attributes.get('popover'), 'manual');
  assert.equal(panel.opened, true);
  assert.equal(panel.style.position, 'fixed');
});

test('top layer promotion follows the hidden attribute and tolerates a runtime without popovers', () => {
  const observers = [];
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} };
  try {
    const panel = fakePanel();
    promoteAccessPanelToTopLayer(panel);
    assert.equal(panel.opened, true);
    panel.hidden = true;
    observers[0].callback();
    assert.equal(panel.opened, false);
    panel.hidden = false;
    observers[0].callback();
    assert.equal(panel.opened, true);
    const plain = fakePanel({popover: false});
    assert.doesNotThrow(() => anchorAccessPanel(plain, null));
    assert.equal(plain.attributes.has('popover'), false);
  } finally { delete globalThis.MutationObserver; }
});

test('the lock creation action row is its own sticky container inside the scrolling panel', async () => {
  const script = await fs.readFile(new URL('../src/renderer/features/access/index.js', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../src/renderer/features/access/access.css', import.meta.url), 'utf8');
  assert.match(script, /className='access-panel-actions'/);
  assert.match(script, /button\(t\('access\.cancel','Cancel'\),cancelLockWizard,lockActions\)/);
  assert.match(script, /createLock=button\(t\('access\.save','Create lock'\),[\s\S]*?\},lockActions\);/);
  assert.match(css, /\.access-panel-actions\{[^}]*position:sticky/);
});
