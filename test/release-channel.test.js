import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { promoteDefaultRelease } from '../scripts/release-channel.mjs';

const source = 'a'.repeat(40);
test('task releases invoke no main or promotion provider', async () => {
  const result = await promoteDefaultRelease({ ref: 'refs/heads/task/example', source,
    readMain: () => assert.fail('unexpected main lookup'), promote: () => assert.fail('unexpected promotion') });
  assert.equal(result.promoted, false); assert.equal(result.reason, 'not-main-ref');
});
test('stale main completion preserves latest and exact current main promotes once', async () => {
  const calls = [];
  const run = main => promoteDefaultRelease({ ref: 'refs/heads/main', source,
    readMain: () => { calls.push('read'); return main; }, promote: () => { calls.push('promote'); } });
  assert.equal((await run('b'.repeat(40))).reason, 'superseded-main-source');
  assert.deepEqual(calls, ['read']); calls.length = 0;
  assert.equal((await run(source)).promoted, true); assert.deepEqual(calls, ['read', 'promote']);
});
test('invalid or unavailable main proof never invokes promotion', async () => {
  for (const readMain of [() => 'invalid', () => { throw new Error('offline'); }]) {
    await assert.rejects(promoteDefaultRelease({ ref: 'refs/heads/main', source, readMain, promote: () => assert.fail('unexpected promotion') }));
  }
});
test('publisher creates download-only releases and invokes channel consumer after download hashes', async () => {
  const source = await readFile(new URL('../.github/scripts/publish-preview.ps1', import.meta.url), 'utf8');
  assert.match(source, /'--latest=false'/); assert.doesNotMatch(source, /make_latest=legacy/);
  assert.doesNotMatch(source, /& node scripts\/release-channel.mjs/);
  assert.ok(source.indexOf('DOWNLOADED_ASSET_MISMATCH') < source.indexOf('promotion-input.json'));
  const promotion = await readFile(new URL('../.github/scripts/promote-release.ps1', import.meta.url), 'utf8');
  assert.ok(promotion.indexOf('PROMOTION_ASSET_HASH_MISMATCH') < promotion.indexOf('& node scripts/release-channel.mjs'));
  assert.match(promotion, /Assert \(\$LASTEXITCODE -eq 0\) 'RELEASE_CHANNEL_VERIFICATION_FAILED'/);
});

test('promotion alone serializes with a fixed repository group', async () => {
 const workflow=await readFile(new URL('../.github/workflows/windows.yml',import.meta.url),'utf8');
 const promotion=workflow.slice(workflow.indexOf('\n  promote:'));
 assert.match(promotion,/needs: windows\s+if: github.ref == 'refs\/heads\/main'/);
 assert.match(promotion,/concurrency:\s+group: default-release-promotion\s+cancel-in-progress: false/);
 assert.doesNotMatch(promotion,/Build application|Preserve compiled server lease verifier|Preserve dependency download diagnostics|node --test|npm test|build\.bat/);
 assert.match(workflow.slice(0,workflow.indexOf('\n  promote:')),/group: windows-release-/);
  assert.match(promotion, /bootstrap-promotion.ps1/);
  assert.match(promotion, /Record safe promotion result\s+if: always\(\)\s+continue-on-error: true/);
  assert.match(promotion, /Preserve promotion decision\s+if: always\(\)\s+continue-on-error: true/);
  assert.match(promotion, /retention-days: 14/);
});

test('actual PowerShell promotion script parses and rejects task refs before any provider', { skip: process.platform !== 'win32' }, t => {
  const command = `
    $tokens=$null; $errors=$null
    $file=Join-Path (Get-Location) '.github/scripts/promote-release.ps1'
    $null=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'PROMOTION_PARSE_FAILED' }
    $text=[IO.File]::ReadAllText($file).Replace('. "$PSScriptRoot/../../scripts/squirrel-file-hash.ps1"','. "./scripts/squirrel-file-hash.ps1"')
    function gh { throw 'UNEXPECTED_PROVIDER' }
    $env:GITHUB_REF='refs/heads/task/example'
    try { & ([scriptblock]::Create($text)); throw 'TASK_REF_ACCEPTED' }
    catch { if ($_.Exception.Message -ne 'PROMOTION_MAIN_ONLY') { throw }; 'TASK_REF_REJECTED_BEFORE_PROVIDER' }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (/running scripts is disabled/.test(result.stderr)) { t.skip('Host execution policy prevents the actual script dependency; admission execution unverified'); return; }
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /TASK_REF_REJECTED_BEFORE_PROVIDER/);
});

test('promotion command helper resolves the actual executable despite its case-insensitive function name', { skip: process.platform !== 'win32' }, () => {
  const command = `
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) '.github/scripts/promote-release.ps1'),[ref]$tokens,[ref]$errors)
    $function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Gh'},$true).Extent.Text
    function Assert([bool]$value,[string]$code) { if (!$value) { throw $code } }
    . ([scriptblock]::Create($function))
    $result=Gh -Arguments @('--version')
    if (($result -join ' ') -notmatch '^gh version ') { throw 'EXECUTABLE_NOT_OBSERVED' }
    if ((Get-Command gh).CommandType -ne 'Function') { throw 'NEGATIVE_RESOLUTION_NOT_OBSERVED' }
    if ((Get-Command gh.exe -CommandType Application).CommandType -ne 'Application') { throw 'APPLICATION_RESOLUTION_MISSING' }
    'ACTUAL_EXECUTABLE_RESOLVED_FUNCTION_COLLISION_PROVED'
  `;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/ACTUAL_EXECUTABLE_RESOLVED_FUNCTION_COLLISION_PROVED/);
});
