import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAccessMutationHistory} from '../src/main/access-mutation-history.js';
import {createAccessIntegration} from '../src/main/access-integration.js';

const run = promisify(execFile);
const syntheticVerifier = {version: 2, purpose: 'password-verifier', iterations: 310000, salt: Buffer.alloc(16).toString('base64'), hash: Buffer.alloc(32).toString('base64')};

async function journalFixture(execute) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-longpath-'));
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

test('every operational Git call in the local mutation journal enables long paths so a deep profile folder cannot break it', async () => {
  const calls = [];
  const execute = async (file, args, options) => {
    if (args[0] === '--version') return {stdout: 'git version 2.56.0.windows.2\n'};
    calls.push(args);
    return run('git', args, {cwd: options.cwd, env: {...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'}});
  };
  const f = await journalFixture(execute);
  try {
    await f.history.record({version: 1, action: 'access-credential-created', target: 'profile', at: new Date().toISOString()});
    assert.ok(calls.length >= 4, 'init, add, commit and verification calls were expected');
    for (const args of calls) assert.ok(args.includes('core.longpaths=true'), 'Git call without long path support: ' + args.join(' '));
  } finally { await f.dispose(); }
});

test('a profile mutation that cannot be journaled names the failing stage and reason in its message', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-longpath-integration-'));
  const records = new Map(), versions = new Map();
  let serial = 0;
  const write = (key, value) => { if (value === null) records.delete(key); else records.set(key, structuredClone(value)); versions.set(key, String(++serial)); return String(serial); };
  const credentials = {
    get: async key => structuredClone(records.get(key) ?? null), set: async (key, value) => write(key, value), delete: async key => write(key, null), list: async () => [],
    readVersioned: async key => ({value: structuredClone(records.get(key) ?? null), revision: versions.get(key) ?? null}),
    compareAndSetVersioned: async (key, revision, value) => revision === (versions.get(key) ?? null) ? {updated: true, revision: write(key, value)} : {updated: false, revision: versions.get(key) ?? null},
  };
  const frame = {};
  const service = createAccessIntegration({
    dataDirectory: directory, toolsDirectory: path.join(directory, 'tools'), credentials, getMainFrame: () => frame, now: () => 100000,
    recordMutation: async () => { throw Object.assign(Error('Synthetic Git failure'), {stage: 'add', reason: '128'}); },
  });
  try {
    await assert.rejects(
      service.request(frame, 'credentialSet', {key: 'local-profile:v1', value: syntheticVerifier}),
      error => /mutation history is unavailable/.test(error.message) && /stage add/.test(error.message) && /reason 128/.test(error.message));
  } finally { service.close(); await fs.rm(directory, {recursive: true, force: true}); }
});
