import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

test('reassembly preserves setup branding and binds its embedded updater to the staged package bytes',async()=>{
  const verify=source=>{
    assert.match(source,/--setupIcon/);
    assert.match(source,/\$squirrel = Copy-SquirrelBrandedVendor -Package \$corrected -Updater \$BrandedUpdater/);
    assert.match(source,/-Setup \$setup -Package \$corrected -Updater \$squirrel -ReleaseIndex/);
  };
  const original=execFileSync('git',['show','a9d706f3212a9238f98f00d866346ae5d131d059:scripts/repair-squirrel-compression.ps1'],{encoding:'utf8'});
  assert.throws(()=>verify(original),assert.AssertionError);
  verify(await fs.readFile('scripts/repair-squirrel-compression.ps1','utf8'));
  assert.match(await fs.readFile('scripts/build.ps1','utf8'),/-BrandedUpdater 'out\/material-file-encryptor-win32-x64\/Squirrel\.exe'/);
});

test('staging rejects missing or mismatched package updaters and never changes pristine vendor bytes',{skip:process.platform!=='win32'},async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-branding-test-'));
  t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
  const literal=value=>`'${value.replaceAll("'","''")}'`;
  const script=path.join(temporary,'test.ps1');
  await fs.writeFile(script,`$ErrorActionPreference='Stop'
. ${literal(path.resolve('scripts/squirrel-file-hash.ps1'))}
. ${literal(path.resolve('scripts/squirrel-branding.ps1'))}
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$root=${literal(temporary)}
$vendor=Join-Path $root 'original-vendor'
$content=Join-Path $root 'content'
New-Item -ItemType Directory -Force $vendor,(Join-Path $content 'lib/net45') | Out-Null
[IO.File]::WriteAllText((Join-Path $vendor 'Squirrel.exe'),'original generic updater')
[IO.File]::WriteAllText((Join-Path $vendor '7z.exe'),'unchanged extraction tool')
$updater=Join-Path $root 'branded.exe'
[IO.File]::WriteAllText($updater,'synthetic branded updater')
Copy-Item -LiteralPath $updater -Destination (Join-Path $content 'lib/net45/Squirrel.exe')
$package=Join-Path $root 'valid.zip'
$archive=[IO.Compression.ZipFile]::Open($package,[IO.Compression.ZipArchiveMode]::Create)
try { $null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$updater,'lib/net45/Squirrel.exe') } finally { $archive.Dispose() }
$destination=Join-Path $root 'staged'
$result=Copy-SquirrelBrandedVendor -Package $package -Updater $updater -VendorDirectory $vendor -Destination $destination
if ([IO.File]::ReadAllText($result) -cne 'synthetic branded updater') { throw 'WRONG_STAGED_UPDATER' }
if ([IO.File]::ReadAllText((Join-Path $vendor 'Squirrel.exe')) -cne 'original generic updater') { throw 'VENDOR_MUTATED' }
if ([IO.File]::ReadAllText((Join-Path $destination '7z.exe')) -cne 'unchanged extraction tool') { throw 'TOOL_CHANGED' }
[IO.File]::WriteAllText($updater,'different updater')
$rejected=$false
try { Copy-SquirrelBrandedVendor -Package $package -Updater $updater -VendorDirectory $vendor -Destination (Join-Path $root 'rejected') } catch { if($_.Exception.Message -ne 'SQUIRREL_PACKAGE_UPDATER_MISMATCH'){throw};$rejected=$true }
if (!$rejected -or (Test-Path (Join-Path $root 'rejected'))) { throw 'MISMATCH_WAS_NOT_ATOMICALLY_REJECTED' }
Remove-Item -LiteralPath (Join-Path $content 'lib/net45/Squirrel.exe')
$missing=Join-Path $root 'missing.zip';[IO.Compression.ZipFile]::CreateFromDirectory($content,$missing)
$rejected=$false
try { Copy-SquirrelBrandedVendor -Package $missing -Updater $updater -VendorDirectory $vendor -Destination (Join-Path $root 'missing-stage') } catch { if($_.Exception.Message -ne 'SQUIRREL_PACKAGE_UPDATER_REQUIRED'){throw};$rejected=$true }
if (!$rejected) { throw 'MISSING_UPDATER_ACCEPTED' }
`);
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{stdio:'pipe'});
});
