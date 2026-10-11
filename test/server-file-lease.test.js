import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
test('Windows cloud-compiled server lease verifier protects exact bytes and ancestors', {skip:process.platform!=='win32'||!process.env.SERVER_FILE_LEASE_VERIFIER?'Cloud-compiled verifier path is required.':false},()=>{
  const root=path.join(os.tmpdir(),`server-lease-verifier-${randomUUID()}`);
  const result=spawnSync(process.env.SERVER_FILE_LEASE_VERIFIER,['--fixture-root',root],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/PASS: native server lease verifier/);
  const receipt=JSON.parse(readFileSync(path.join(root,'receipt.json'),'utf8'));assert.equal(receipt.status,'passed');assert.equal(receipt.checks.length,8);assert.equal(receipt.ipcIntegration,'pending');
});
