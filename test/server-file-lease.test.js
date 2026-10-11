import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
test('Windows cloud-compiled server lease verifier protects exact bytes and ancestors', {skip:process.platform!=='win32'||!process.env.SERVER_FILE_LEASE_VERIFIER_DLL||!process.env.SERVER_FILE_LEASE_DOTNET?'Cloud-compiled verifier DLL and verified .NET host paths are required.':false},()=>{
  const root=path.join(os.tmpdir(),`server-lease-verifier-${randomUUID()}`);
  const dll=process.env.SERVER_FILE_LEASE_VERIFIER_DLL,host=process.env.SERVER_FILE_LEASE_DOTNET;
  const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const sourceReceipt=JSON.parse(readFileSync(path.join(path.dirname(dll),'source-receipt.json'),'utf8'));
  assert.match(sourceReceipt.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(sourceReceipt.verifierDllSha256,digest(dll));
  const result=spawnSync(process.env.SERVER_FILE_LEASE_DOTNET,[process.env.SERVER_FILE_LEASE_VERIFIER_DLL,'--fixture-root',root],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/PASS: native server lease verifier/);
  const receipt=JSON.parse(readFileSync(path.join(root,'receipt.json'),'utf8'));assert.equal(receipt.status,'passed');assert.equal(receipt.checks.length,8);assert.equal(receipt.ipcIntegration,'pending');
  assert.equal(receipt.verifierDllSha256,sourceReceipt.verifierDllSha256);assert.equal(receipt.dotnetHostSha256,digest(host));
});
