import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

test('reassembly uses package-contained branding after maker temporary files are deleted',async()=>{
  const verify=source=>{
    assert.match(source,/--setupIcon/);
    assert.match(source,/\$squirrel = Copy-SquirrelBrandedVendor -Package \$corrected -Icon \$icon/);
    assert.match(source,/-Setup \$setup -Package \$corrected -Updater \$squirrel -SetupIcon \$icon -ReleaseIndex/);
    assert.doesNotMatch(source,/BrandedUpdater/);
  };
  const original=execFileSync('git',['show','d0b355419f38ddb16b968c799b24f29378bd5f16:scripts/repair-squirrel-compression.ps1'],{encoding:'utf8'});
  assert.throws(()=>verify(original),assert.AssertionError);
  verify(await fs.readFile('scripts/repair-squirrel-compression.ps1','utf8'));
  assert.doesNotMatch(await fs.readFile('scripts/build.ps1','utf8'),/BrandedUpdater/);
});

test('real updater resources survive lowercase package extraction without a standalone maker file',{skip:process.platform!=='win32'},async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'mfe-branding-test-'));
  t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
  const literal=value=>`'${value.replaceAll("'","''")}'`;
  const vendor=path.resolve(process.env.MFE_SQUIRREL_TEST_VENDOR||'node_modules/electron-winstaller/vendor');
  const script=path.join(temporary,'test.ps1');
  await fs.writeFile(script,`$ErrorActionPreference='Stop'
. ${literal(path.resolve('scripts/squirrel-file-hash.ps1'))}
. ${literal(path.resolve('scripts/squirrel-branding.ps1'))}
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$root=${literal(temporary)}
$vendor=${literal(vendor)}
$icon=${literal(path.resolve('assets/branding/app.ico'))}
$pristine=Join-Path $vendor 'Squirrel.exe'
$pristineHash=(Get-SquirrelFileHash -LiteralPath $pristine).Hash
$updater=Join-Path $root 'temporary-maker-updater.exe'
Copy-Item -LiteralPath $pristine -Destination $updater
& (Join-Path $vendor 'rcedit.exe') $updater --set-icon $icon
if($LASTEXITCODE -ne 0){throw 'FIXTURE_RESOURCE_EDIT_FAILED'}
Assert-SquirrelIconResources -Executable $updater -Icon $icon
$expected=(Get-SquirrelFileHash -LiteralPath $updater).Hash
function Package-Updater([string]$Name,[string[]]$Entries,[string]$Source){
 $file=Join-Path $root $Name
 $archive=[IO.Compression.ZipFile]::Open($file,[IO.Compression.ZipArchiveMode]::Create)
 try{foreach($entry in $Entries){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$Source,$entry)}}finally{$archive.Dispose()}
 return $file
}
$package=Package-Updater 'valid.zip' @('lib/net45/squirrel.exe') $updater
$duplicate=Package-Updater 'duplicate.zip' @('lib/net45/squirrel.exe','lib/net45/Squirrel.exe') $updater
$generic=Package-Updater 'generic.zip' @('lib/net45/squirrel.exe') $pristine
$missing=Package-Updater 'missing.zip' @('lib/net45/other.exe') $updater
# The maker deletes its whole temporary directory before the repair runs.
Remove-Item -LiteralPath $updater
if(Test-Path -LiteralPath $updater){throw 'FIXTURE_MAKER_FILE_REMAINED'}
$destination=Join-Path $root 'staged'
$result=Copy-SquirrelBrandedVendor -Package $package -Icon $icon -VendorDirectory $vendor -Destination $destination
if((Get-SquirrelFileHash -LiteralPath $result).Hash -ne $expected){throw 'WRONG_STAGED_UPDATER'}
Assert-SquirrelIconResources -Executable $result -Icon $icon
if((Get-SquirrelFileHash -LiteralPath $pristine).Hash -ne $pristineHash){throw 'VENDOR_MUTATED'}
if((Get-SquirrelFileHash -LiteralPath (Join-Path $destination '7z.exe')).Hash -ne (Get-SquirrelFileHash -LiteralPath (Join-Path $vendor '7z.exe')).Hash){throw 'TOOL_CHANGED'}
foreach($case in @(@{package=$generic;code='SQUIRREL_UPDATER_ICON_MISMATCH'},@{package=$duplicate;code='SQUIRREL_PACKAGE_UPDATER_REQUIRED'},@{package=$missing;code='SQUIRREL_PACKAGE_UPDATER_REQUIRED'})){
 $target=Join-Path $root ([Guid]::NewGuid().ToString('N'));$rejected=$false
 try{Copy-SquirrelBrandedVendor -Package $case.package -Icon $icon -VendorDirectory $vendor -Destination $target}catch{if($_.Exception.Message -ne $case.code){throw};$rejected=$true}
 if(!$rejected -or (Test-Path -LiteralPath $target)){throw 'INVALID_PACKAGE_NOT_REJECTED_BEFORE_STAGING'}
}
`);
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{stdio:'pipe'});
});
