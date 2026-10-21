#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

try {
  const [mode, remoteName, remoteLocation] = process.argv.slice(2);
  if (!['index', 'outgoing'].includes(mode) || (mode === 'outgoing' && (!remoteName || !remoteLocation))) throw new Error();
  const configured = process.env.PRIVATE_INSTRUCTIONS_SOURCE;
  const choices = [
    ...(configured ? [path.resolve(path.dirname(configured), '..', 'scripts', 'run-publication-language-local.mjs')] : []),
    path.join(homedir(), '.agents', 'skills', 'agent-global-memory', 'scripts', 'run-publication-language-local.mjs'),
  ];
  const runner = choices.find(file => existsSync(file));
  if (!runner) throw new Error();
  const args = [runner, '--root', process.cwd(), '--mode', mode];
  if (mode === 'outgoing') args.push('--remote-name', remoteName, '--remote-location', remoteLocation);
  const result = spawnSync(process.execPath, args, { input: mode === 'outgoing' ? readFileSync(0) : undefined, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  process.exitCode = result.error || result.signal || !Number.isInteger(result.status) ? 2 : result.status;
} catch {
  console.error('Complete local publication check is unavailable; transmission remains blocked.');
  process.exitCode = 2;
}
