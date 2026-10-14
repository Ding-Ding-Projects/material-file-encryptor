import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const source = 'a'.repeat(40);
const file = new URL('../.github/scripts/promote-release.ps1', import.meta.url);
const script = await fs.readFile(file, 'utf8');

async function admission(plan, attempt = '2') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-promotion-admission-'));
  try {
    await fs.mkdir(path.join(directory, 'release-output'));
    await fs.writeFile(path.join(directory, 'release-output/promotion-input.json'), JSON.stringify(plan));
    const prefix = script.slice(0, script.indexOf('Assert (@($plan.assets).Count'))
      .replace(/^\. "\$PSScriptRoot\/\.\.\/\.\.\/scripts\/squirrel-file-hash.ps1"\r?\n/m, '');
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', prefix + '\nWrite-Output $tag'], {
      cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 15000,
      env: {...process.env, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: source,
        GITHUB_REPOSITORY: 'owner/example', GITHUB_RUN_ID: '1234', GITHUB_RUN_NUMBER: '472', GITHUB_RUN_ATTEMPT: attempt},
    });
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
}

test('promotion retry keeps the completed producer tag before any network or mutation', {skip: process.platform !== 'win32'}, async () => {
  const result = await admission({schemaVersion: 1, sourceCommit: source, tag: 'v1.472.1', releaseId: '77'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'v1.472.1');
});

test('promotion admission rejects a different run, future producer, malformed tag and source', {skip: process.platform !== 'win32'}, async () => {
  for (const patch of [{tag: 'v1.471.1'}, {tag: 'v1.472.3'}, {tag: 'v1.472.01'},
    {tag: 'v1.472.0'}, {tag: 'v1.472.1/extra'}, {sourceCommit: 'b'.repeat(40)}, {releaseId: '0'}]) {
    const result = await admission({schemaVersion: 1, sourceCommit: source, tag: 'v1.472.1', releaseId: '77', ...patch});
    assert.notEqual(result.status, 0, JSON.stringify(patch));
    assert.match(result.stderr, /PROMOTION_SOURCE_MISMATCH/);
  }
});

test('downloaded producer provenance must match run, attempt, source, tag and package', {skip: process.platform !== 'win32'}, () => {
  const sourcePath = file.pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll("'", "''");
  const command = `
    $ErrorActionPreference='Stop'
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile('${sourcePath}',[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'PARSE_FAILED'}
    foreach($name in @('Assert','Assert-PromotionProvenance')) {
      $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
      if(!$definition){throw 'MISSING_PRODUCTION_CHECK'}
      . ([scriptblock]::Create($definition.Extent.Text))
    }
    $valid=@{schemaVersion=1;sourceCommit='${source}';tag='v1.472.1';runId='1234';runAttempt='1';packageVersion='1.472.1'}
    Assert-PromotionProvenance $valid '${source}' 'v1.472.1' '1234'
    foreach($key in @('schemaVersion','sourceCommit','tag','runId','runAttempt','packageVersion')) {
      $changed=$valid.Clone();$changed[$key]='wrong';$rejected=$false
      try { Assert-PromotionProvenance $changed '${source}' 'v1.472.1' '1234' }
      catch { if($_.Exception.Message -ne 'PROMOTION_PROVENANCE_MISMATCH'){throw};$rejected=$true }
      if(!$rejected){throw 'MISMATCH_ACCEPTED'}
    }
    'PRODUCER_PROVENANCE_VERIFIED'
  `;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PRODUCER_PROVENANCE_VERIFIED/);
  assert.ok(script.indexOf('PROMOTION_ASSET_HASH_MISMATCH') < script.lastIndexOf('Assert-PromotionProvenance'));
  assert.ok(script.lastIndexOf('Assert-PromotionProvenance') < script.indexOf('$channelJson='));
});
