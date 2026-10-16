import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createForgeToolResolver} from '../src/main/forge-transport.js';
import {createForgeToolResolver as createStartupResolver} from '../src/main/startup-photo-tools.js';
import {createAccessMutationHistory} from '../src/main/access-mutation-history.js';
import {createAccessHistory} from '../src/main/access-history.js';
import {placeAccessPanel} from '../src/renderer/features/access/surface.js';

const GIT_VERSION = 'git version 2.56.0.windows.2';

async function packagedLayout(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'access-wiring-'));
  t.after(() => fs.rm(base, {recursive: true, force: true}));
  const real = path.join(base, 'real-install', 'resources', 'tools');
  const gitFile = path.join(real, 'git', 'cmd', 'git.exe');
  await fs.mkdir(path.dirname(gitFile), {recursive: true});
  await fs.mkdir(path.join(real, 'gh', 'bin'), {recursive: true});
  const gitBytes = Buffer.from('synthetic git executable');
  const ghBytes = Buffer.from('synthetic gh executable');
  await fs.writeFile(gitFile, gitBytes);
  await fs.writeFile(path.join(real, 'gh', 'bin', 'gh.exe'), ghBytes);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(real, 'forge-executables.json'), JSON.stringify({
    schemaVersion: 1,
    git: {relativePath: 'git/cmd/git.exe', version: '2.56.0.windows.2', sha256: sha(gitBytes)},
    gh: {relativePath: 'gh/bin/gh.exe', version: '2.102.0', sha256: sha(ghBytes)}
  }));
  return {base, real, gitFile};
}

async function aliasOf(t, base, real) {
  // A directory junction stands for any root reached through an alias: a packaged-app file virtualization
  // layer, a short path, a subst drive, or a redirected profile folder.
  const alias = path.join(base, 'alias-tools');
  try { await fs.symlink(real, alias, 'junction'); } catch (error) { t.skip('directory junctions are unavailable: ' + error.code); return null; }
  return alias;
}

for (const [label, factory] of [['forge', createForgeToolResolver], ['startup photo', createStartupResolver]]) {
  test(`${label} tool resolver accepts a verified tool directory that is reached through an alias`, async t => {
    const {base, real, gitFile} = await packagedLayout(t);
    const alias = await aliasOf(t, base, real);
    if (!alias) return;
    assert.equal((await factory(real)('git')).toLowerCase(), gitFile.toLowerCase());
    assert.equal((await factory(alias)('git')).toLowerCase(), path.join(alias, 'git', 'cmd', 'git.exe').toLowerCase());
  });

  test(`${label} tool resolver still rejects a file or inner directory redirected elsewhere`, async t => {
    const {base, real} = await packagedLayout(t);
    const elsewhere = path.join(base, 'elsewhere');
    await fs.mkdir(path.join(elsewhere, 'cmd'), {recursive: true});
    await fs.copyFile(path.join(real, 'git', 'cmd', 'git.exe'), path.join(elsewhere, 'cmd', 'git.exe'));
    await fs.rm(path.join(real, 'git'), {recursive: true});
    try { await fs.symlink(elsewhere, path.join(real, 'git'), 'junction'); } catch (error) { t.skip('directory junctions are unavailable: ' + error.code); return; }
    await assert.rejects(factory(real)('git'), /unavailable or changed/);
  });

  test(`${label} tool resolver still rejects a replaced executable`, async t => {
    const {real, gitFile} = await packagedLayout(t);
    await fs.writeFile(gitFile, 'tampered');
    await assert.rejects(factory(real)('git'), /unavailable or changed/);
  });
}

test('the local mutation recorder works from a packaged-like layout reached through an alias', async t => {
  const {base, real} = await packagedLayout(t);
  const alias = await aliasOf(t, base, real);
  if (!alias) return;
  const calls = [];
  const execute = async (file, args) => {
    calls.push(args);
    if (args[0] === '--version') return {stdout: GIT_VERSION + '\n'};
    const sub = args.filter(arg => !arg.startsWith('-') && !arg.includes('=')).find(Boolean);
    if (args.includes('log')) return {stdout: calls.some(c => c.includes('commit')) ? 'a'.repeat(40) + '\n' : ''};
    if (args.includes('show')) return {stdout: await fs.readFile(path.join(base, 'data', 'access-mutations', args.at(-1).split(':')[1]), 'utf8')};
    assert.ok(sub);
    return {stdout: ''};
  };
  const history = createAccessMutationHistory({dataDirectory: path.join(base, 'data'), toolsDirectory: alias, execute});
  const result = await history.record({version: 1, action: 'access-credential-created', target: 'profile', at: new Date().toISOString()});
  assert.equal(result.recorded, true);
  assert.ok(calls.some(args => args.includes('init')));
  assert.ok(calls.some(args => args.includes('commit')));
  assert.equal((await history.list()).length, 1);
  history.close();
});

function memoryVault() {
  const data = new Map(), revisions = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); revisions.set(key, randomUUID()); },
    async delete(key) { data.delete(key); revisions.delete(key); },
    async list(prefix) { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    async readVersioned(key) { return {value: data.has(key) ? structuredClone(data.get(key)) : null, revision: revisions.get(key) || null}; },
    async compareAndSetVersioned(key, expected, replacement) {
      if ((revisions.get(key) || null) !== expected) return {updated: false, revision: revisions.get(key) || null};
      if (replacement === null) { data.delete(key); revisions.delete(key); return {updated: true, revision: null}; }
      data.set(key, structuredClone(replacement)); const revision = randomUUID(); revisions.set(key, revision); return {updated: true, revision};
    }
  };
}

test('the display name commits through local history and persists across a restart', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'access-name-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const vault = memoryVault(), gitCalls = [];
  const executeGit = async (name, args) => { gitCalls.push(args); return {stdout: ''}; };
  const open = () => createAccessHistory({dataDirectory: directory, credentials: vault, getActor: () => 'main-frame', executeGit});
  const first = open();
  await first.request('historySetup', {password: 'a bounded history password'});
  assert.equal(await first.request('displayNameSet', {value: 'Family vault'}), true);
  assert.deepEqual(await first.request('displayNameRead'), {value: 'Family vault'});
  assert.ok(gitCalls.some(args => args.includes('commit')));
  first.close();
  const second = open();
  assert.deepEqual(await second.request('displayNameRead'), {value: 'Family vault'});
  second.close();
});

test('access history reports a Git failure as the Git runtime being unavailable', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'access-nogit-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const history = createAccessHistory({dataDirectory: directory, credentials: memoryVault(), getActor: () => 'main-frame', executeGit: async () => { throw Error('spawn failed'); }});
  await assert.rejects(history.request('historySetup', {password: 'a bounded history password'}), /Local Git history is unavailable/);
  history.close();
});

const rect = (left, top, width = 40, height = 40) => ({left, top, right: left + width, bottom: top + height});
const fits = (placed, viewport, margin = 12) => placed.left >= margin && placed.top >= margin && placed.left + placed.width <= viewport.width - margin + 0.5 && placed.top + placed.maxHeight <= viewport.height - margin + 0.5;

test('access panel placement never leaves the viewport for any anchor corner or window size', () => {
  for (const viewport of [{width: 1280, height: 800}, {width: 853, height: 533}, {width: 640, height: 360}, {width: 360, height: 640}]) {
    for (const x of [0, viewport.width / 2, viewport.width - 40]) {
      for (const y of [0, viewport.height / 2, viewport.height - 40]) {
        for (const height of [0, 200, 500, 900]) {
          const placed = placeAccessPanel(rect(x, y), viewport, height);
          assert.ok(fits(placed, viewport), JSON.stringify({viewport, x, y, height, placed}));
          assert.ok(placed.maxHeight > 0 && placed.width > 0);
        }
      }
    }
  }
});

test('access panel placement opens below when it fits, above when only that fits, otherwise pins to the top', () => {
  const viewport = {width: 1000, height: 800};
  const below = placeAccessPanel(rect(100, 100), viewport, 300);
  assert.equal(below.top, 148);
  const above = placeAccessPanel(rect(100, 700), viewport, 300);
  assert.ok(above.top + 300 <= 700 - 8 + 1 && above.top >= 12);
  const pinned = placeAccessPanel(rect(100, 400), viewport, 780);
  assert.equal(pinned.top, 12);
  assert.equal(pinned.maxHeight, 776);
});

test('access panel placement without an origin starts at the top inset', () => {
  const placed = placeAccessPanel(null, {width: 500, height: 400}, 300);
  assert.deepEqual({left: placed.left, top: placed.top}, {left: 12, top: 12});
  assert.equal(placed.width, 476);
});
