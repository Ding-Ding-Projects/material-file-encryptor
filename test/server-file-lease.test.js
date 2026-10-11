import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
function admitVerifier(receipt,dllDigest,hostDigest,expected){
  for(const key of ['sourceCommit','leaseSourceSha256','verifierSourceSha256','verifierDllSha256','dotnetHostSha256']){
    assert.match(expected[key]??'',key==='sourceCommit'?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/,`Missing reviewed ${key}`);
    const actual=key==='dotnetHostSha256'?hostDigest:receipt[key];assert.equal(actual,expected[key],`Reviewed ${key} differs`);
  }
  assert.equal(dllDigest,expected.verifierDllSha256,'DLL bytes differ');
}
function runAdmittedVerifier(receipt,dllDigest,hostDigest,expected,launch){
  admitVerifier(receipt,dllDigest,hostDigest,expected);
  return launch();
}
test('verifier admission requires independently expected source and byte identities',()=>{
  const expected={sourceCommit:'a'.repeat(40),leaseSourceSha256:'b'.repeat(64),verifierSourceSha256:'c'.repeat(64),verifierDllSha256:'d'.repeat(64),dotnetHostSha256:'e'.repeat(64)};
  const receipt={...expected};delete receipt.dotnetHostSha256;
  let launches=0;const launch=()=>{launches++;return 'admitted';};
  assert.equal(runAdmittedVerifier(receipt,expected.verifierDllSha256,expected.dotnetHostSha256,expected,launch),'admitted');assert.equal(launches,1);launches=0;
  for(const key of Object.keys(expected)){
    assert.throws(()=>runAdmittedVerifier(receipt,expected.verifierDllSha256,expected.dotnetHostSha256,{...expected,[key]:undefined},launch));
    assert.throws(()=>runAdmittedVerifier(receipt,expected.verifierDllSha256,expected.dotnetHostSha256,{...expected,[key]:'f'.repeat(expected[key].length)},launch));
  }
  assert.throws(()=>runAdmittedVerifier({...receipt,sourceCommit:'f'.repeat(40)},expected.verifierDllSha256,expected.dotnetHostSha256,expected,launch));
  assert.throws(()=>runAdmittedVerifier(receipt,'f'.repeat(64),expected.dotnetHostSha256,expected,launch));assert.equal(launches,0);
});
test('production Windows PowerShell receipt serialization is directly readable JSON without BOM', {skip:process.platform!=='win32'},()=>{
  const writer=readFileSync('scripts/build.ps1','utf8').split(/\r?\n/).filter(line=>line.includes('[IO.File]::WriteAllText')&&line.includes('server-file-lease/source-receipt.json'));
  assert.equal(writer.length,1);
  const root=path.join(os.tmpdir(),`server-lease-receipt-${randomUUID()}`).replaceAll("'","''");
  const command=`$ErrorActionPreference='Stop';$root='${root}';New-Item -ItemType Directory (Join-Path $root 'out/verification/server-file-lease')|Out-Null;$leaseVerifierReceipt=@{schemaVersion=1;sourceCommit=('a'*40);verifierDllSha256=('b'*64)};${writer[0]};[Console]::Out.Write([IO.File]::ReadAllText((Join-Path $root 'out/verification/server-file-lease/source-receipt.json')))`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.schemaVersion,1);assert.equal(receipt.sourceCommit,'a'.repeat(40));assert.equal(receipt.verifierDllSha256,'b'.repeat(64));
  assert.throws(()=>JSON.parse('\uFEFF'+JSON.stringify(receipt)),SyntaxError,'BOM regression control must fail the actual JSON consumer');
});
test('Windows cloud-compiled server lease verifier protects exact bytes and ancestors', {skip:process.platform!=='win32'||!process.env.SERVER_FILE_LEASE_VERIFIER_DLL||!process.env.SERVER_FILE_LEASE_DOTNET?'Cloud-compiled verifier DLL and verified .NET host paths are required.':false},()=>{
  const root=path.join(os.tmpdir(),`server-lease-verifier-${randomUUID()}`);
  const dll=process.env.SERVER_FILE_LEASE_VERIFIER_DLL,host=process.env.SERVER_FILE_LEASE_DOTNET;
  const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const sourceReceipt=JSON.parse(readFileSync(path.join(path.dirname(dll),'source-receipt.json'),'utf8'));
  const expected={sourceCommit:process.env.SERVER_FILE_LEASE_EXPECTED_SOURCE_COMMIT,leaseSourceSha256:process.env.SERVER_FILE_LEASE_EXPECTED_LEASE_SOURCE_SHA256,verifierSourceSha256:process.env.SERVER_FILE_LEASE_EXPECTED_VERIFIER_SOURCE_SHA256,verifierDllSha256:process.env.SERVER_FILE_LEASE_EXPECTED_DLL_SHA256,dotnetHostSha256:process.env.SERVER_FILE_LEASE_EXPECTED_HOST_SHA256};
  const result=runAdmittedVerifier(sourceReceipt,digest(dll),digest(host),expected,()=>spawnSync(process.env.SERVER_FILE_LEASE_DOTNET,[process.env.SERVER_FILE_LEASE_VERIFIER_DLL,'--fixture-root',root],{encoding:'utf8',timeout:30000,windowsHide:true}));
  assert.equal(result.error,undefined);assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/PASS: native server lease verifier/);
  const receipt=JSON.parse(readFileSync(path.join(root,'receipt.json'),'utf8'));assert.equal(receipt.status,'passed');assert.equal(receipt.checks.length,8);assert.equal(receipt.ipcIntegration,'pending');
  assert.equal(receipt.verifierDllSha256,expected.verifierDllSha256);assert.equal(receipt.dotnetHostSha256,expected.dotnetHostSha256);
  admitVerifier(JSON.parse(readFileSync(path.join(path.dirname(dll),'source-receipt.json'),'utf8')),digest(dll),digest(host),expected);
});
